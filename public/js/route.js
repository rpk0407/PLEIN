// The pump tests itself before it opens. When a visitor presses "Faire le plein", the page asks
// Jupiter for a quote of 10 USDC into the official mint. A route means the swap widget has something
// to offer. Jupiter saying there is no route means the pump shows its plate (a link to the coin's
// pump.fun page) instead of a widget that cannot trade. Not being able to ask (rate limit, timeout,
// network, a reply that is not a quote) is no evidence either way: the widget is set up all the same,
// under a line that says the route was not checked. Nothing here touches a wallet: it is one GET of
// public quote data, read in the browser, and a few sentences built from what comes back.
//
// Tier 2: the quote endpoint is Jupiter's free one, answering without a key on 17 October 2026
// (CORS open to any origin, errors included; a USDC pump.fun curve coin was routed through "Pump.fun"
// that morning). Jupiter may retire it; `jupiter.quoteUrl` in config.js overrides, on a Jupiter host.
import { frenchWhen } from './clock.js';
import { NON_CANONICAL_NOTE, pumpFeeClause } from './fees.js';
import { isSolanaAddress } from './mint.js';

export const DEFAULT_QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
/** The size of the test swap: 10 USDC (six decimals), a 1 % slippage cap. */
export const TEST_USDC = 10;
export const TEST_AMOUNT_RAW = '10000000';
export const SLIPPAGE_BPS = 100;
/** One request is cut after 6 s; a pump that finds no route asks again every 60 s while it is open. */
export const TIMEOUT_MS = 6000;
export const RETRY_MS = 60000;
/** Never ask twice within 10 s: the free endpoint allows about five calls per ten seconds (Tier 2). */
export const MIN_GAP_MS = 10000;

/**
 * Jupiter's labels for the pump.fun curve and for the coin's canonical PumpSwap pool. Any other label
 * in a route means another venue holds the trade, and the station is paid nothing on it. The same
 * pattern as CANONICAL_ROUTE in scripts/plein.mjs (a test pins the two). Tier 2: "Pump.fun" is the
 * label seen on 17 October 2026 for a curve coin; the pool's label is to confirm on the first one.
 */
export const CANONICAL_ROUTE = /^pump(\.?fun)?( ?amm| ?swap)?$/i;

/**
 * What Jupiter answers, with a 400, when it has no route for the pair. Only these codes (and an empty
 * quote) say "no route": any other error, whatever its status, is Jupiter changing or refusing the
 * request (a parameter, a key, a retired endpoint), which says nothing about the coin.
 */
export const NO_ROUTE_CODES = ['COULD_NOT_FIND_ANY_ROUTE', 'TOKEN_NOT_TRADABLE', 'NO_ROUTES_FOUND'];

/**
 * The quote endpoint to use: the config override if it is an https address on a Jupiter host, else the
 * default. A typo in config.js therefore cannot send the contract to another host.
 */
export function quoteEndpoint(override) {
  if (typeof override !== 'string' || override === '') return DEFAULT_QUOTE_URL;
  try {
    const url = new URL(override);
    const jupiter = url.hostname === 'jup.ag' || url.hostname.endsWith('.jup.ag');
    return url.protocol === 'https:' && jupiter && !url.username && !url.password ? `${url.origin}${url.pathname}` : DEFAULT_QUOTE_URL;
  } catch {
    return DEFAULT_QUOTE_URL;
  }
}

/** The request: 10 USDC into the mint. Throws RangeError for a mint that is not a Solana address. */
export function buildQuoteUrl({ endpoint = DEFAULT_QUOTE_URL, inputMint, outputMint, amountRaw = TEST_AMOUNT_RAW, slippageBps = SLIPPAGE_BPS }) {
  if (!isSolanaAddress(inputMint) || !isSolanaAddress(outputMint)) throw new RangeError('both mints must be Solana addresses');
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ inputMint, outputMint, amount: String(amountRaw), slippageBps: String(slippageBps) }).toString();
  return url.toString();
}

/** A route label as the page may print it: printable, short, never empty. */
const cleanLabel = (label) => (typeof label === 'string' ? label.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 32) : '');

/**
 * Reads one answer of the quote endpoint. `status` is the HTTP status, `body` the parsed JSON (or
 * null when the body was not JSON). Returns one of:
 *   { state: 'route', labels, canonical }   Jupiter has a route; `canonical` is true when every
 *                                           venue is pump.fun's curve or pool, false when another
 *                                           one is in it, null when the labels were not given
 *   { state: 'none', reason }               Jupiter said it has no route for the pair: one of
 *                                           NO_ROUTE_CODES, or a quote of exactly nothing
 *   { state: 'unreachable', reason }        no usable answer (rate limit, server error, any other
 *                                           error, a reply that is not the swap asked for): the
 *                                           route is neither confirmed nor denied
 * Never throws and never guesses: "no route" needs Jupiter's own word for it, because the pump prints
 * it as a fact about a third party's service.
 */
export function readQuote(status, body, { outputMint, inputMint, amountRaw = TEST_AMOUNT_RAW } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { state: 'unreachable', reason: `HTTP ${status}` };
  const code = typeof body.errorCode === 'string' ? body.errorCode : typeof body.error === 'string' ? body.error : '';
  if (code) {
    if (status !== 429 && NO_ROUTE_CODES.includes(code)) return { state: 'none', reason: code };
    return { state: 'unreachable', reason: `HTTP ${status}` };
  }
  if (status !== 200) return { state: 'unreachable', reason: `HTTP ${status}` };
  if (typeof body.outAmount !== 'string' || !/^\d+$/.test(body.outAmount)) return { state: 'unreachable', reason: 'the reply has no quote amount' };
  if (BigInt(body.outAmount) === 0n) return { state: 'none', reason: 'empty quote' };
  if (String(body.inAmount) !== String(amountRaw) || body.outputMint !== outputMint || (inputMint && body.inputMint !== inputMint)) {
    return { state: 'unreachable', reason: 'the reply is not the swap asked for' };
  }
  const plan = Array.isArray(body.routePlan) ? body.routePlan : [];
  const labels = [...new Set(plan.map((leg) => cleanLabel(leg?.swapInfo?.label)).filter(Boolean))].slice(0, 4);
  const canonical = labels.length ? labels.every((label) => CANONICAL_ROUTE.test(label)) : null;
  return { state: 'route', labels, canonical };
}

/**
 * One self-test: ask for the quote and say what came back. Never throws. `fetchImpl` is injected so
 * the tests run on recorded answers; the request carries only an Accept header, so a browser sends
 * it without a CORS preflight. Resolves to { state, labels | reason, canonical?, at }.
 */
export async function testRoute({
  outputMint, inputMint, endpoint = DEFAULT_QUOTE_URL, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, now = Date.now,
}) {
  const at = now();
  let url;
  try {
    url = buildQuoteUrl({ endpoint, inputMint, outputMint });
  } catch {
    return { state: 'unreachable', reason: 'no valid mint to ask about', at };
  }
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })); // first, so the abort below cannot win the race
      controller.abort();
    }, timeoutMs);
  });
  const ask = (async () => {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  })();
  try {
    const { status, body } = await Promise.race([ask, deadline]);
    return { ...readQuote(status, body, { outputMint, inputMint }), at };
  } catch (error) {
    return { state: 'unreachable', reason: error?.name === 'TimeoutError' ? 'timeout' : 'network', at };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which pump.fun venue would hold the trade: true for the migrated pool, false for the curve, null
 * when it cannot be said. The chain reading (`complete`) says it; so do Jupiter's labels, where
 * exactly "Pump.fun" is the curve and a label with Amm or Swap in it is the pool. With no chain
 * reading the labels decide; where the two disagree, or neither says, the answer is null.
 */
const CURVE_LABEL = /^pump\.?fun$/i;
const POOL_LABEL = /amm|swap/i;
function venueMigrated(labels, complete) {
  const byLabels = labels.length && labels.every((label) => CURVE_LABEL.test(label)) ? false
    : labels.length && labels.every((label) => POOL_LABEL.test(label)) ? true : null;
  if (complete !== true && complete !== false) return byLabels;
  return byLabels === null || byLabels === complete ? complete : null;
}

/**
 * The line under the swap widget: what Jupiter proposed, when, and what that means for the station's
 * share, with the fee figures from fees.js. "d'après pump.fun" stays until the first ticket shows the
 * fees on-chain (`attributed`). A route through another pool says so, in the words fees.js keeps for
 * it. The curve and pool figures differ, so they are printed only when venueMigrated knows which one
 * applies; a route whose labels are unknown, or whose venue is unclear, stops after the route.
 * `complete` is the curve state (true: migrated, false: on the curve, null: not read).
 */
export function routeLine({ labels = [], canonical = null, complete = null, attributed = true, at } = {}) {
  const hm = Number.isFinite(at) ? ` à ${frenchWhen(at).hm}` : '';
  const via = labels.length ? ` : ${labels.join(' + ')}` : '';
  const head = `Jupiter proposait${hm}, pour ${TEST_USDC} USDC, la route${via}.`;
  if (canonical === true) {
    const migrated = venueMigrated(labels, complete);
    return migrated === null ? head : `${head} Frais de pump.fun : ${pumpFeeClause(migrated)}${attributed ? ' (d’après pump.fun)' : ''}.`;
  }
  if (canonical === false) return `${head} ${NON_CANONICAL_NOTE}`;
  return head;
}

/**
 * The lead of the waiting plate: Jupiter said there is no route, or there is one but the swap widget's
 * own script did not load. `unreachable` (nobody could say) leads the line under the widget, not the
 * plate: see pumpStateFor.
 */
export const PLATE_LEAD = {
  none: 'Jupiter ne dessert pas encore $PLEIN.',
  unreachable: 'La route de Jupiter n’a pas pu être vérifiée.',
  widget: 'Le module d’échange de Jupiter n’a pas pu se charger.',
};

/** The line under the widget when the route could not be checked (it points to the coin's own page). */
export const UNVERIFIED_NOTE = `${PLATE_LEAD.unreachable} Si l’échange ne s’affiche pas, passe par la page pump.fun du jeton.`;

/**
 * What the pump shows for one test result. The widget is taken away on evidence only: a route
 * ('route') or an unreadable answer ('unverified') sets it up, since the plugin's own form says what
 * it finds; only Jupiter saying "no route" ('none'), or the widget's script failing, shows the plate
 * ('waiting'). Doubt must not cost the station its one call to action: at an opening, a rate limit
 * shared by every visitor behind one mobile address would read as "no route" for all of them.
 */
export function pumpStateFor(resultState) {
  if (resultState === 'route') return 'route';
  if (resultState === 'unreachable') return 'unverified';
  return 'waiting';
}
