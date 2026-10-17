// The Saturday purchase order ("le trésorier"). Reads, computes, prints. It builds no transaction
// and calls nothing that signs or sends: the founders run every step by hand in the multisig.
//
//   node scripts/plein.mjs --reservoir 3412.00            (the balance of the réservoir, in USDC)
//   node scripts/plein.mjs --from-chain                    (reads it with api/chain.js)
//   options: --markdown (default) | --json, --slices 12, --max-impact <pct>, --min-slice 20,
//            --mint <m> (testing on another coin), --at <ISO>, --out out, --no-write, --no-quotes,
//            --allow-unclaimed, --carried-aid / --carried-buyback / --carried-team <amount>,
//            --hour-cap | --hour <amount> (docs/moteur.md section 4, option A'),
//            --tickets <dir> (or PLEIN_TICKETS_DIR), --no-previous-ticket, --force-carried
//
// What it prints: the week's split (public/js/formula.js on the frozen official price), the
// slices (18:00, 18:05 ... 18:55 Paris; equal in cents, the last takes the remainder), a Jupiter
// quote per slice and one for the whole, the impact checks, and the checklist for the multisig. It
// also writes out/plein-NNN-draft.json, the ticket draft the founders fill with the signatures.
//
// The split is made on the WEEK'S FEES, never on the balance. Money that an earlier week left in
// the réservoir (aid not yet paid out, buyback not yet bought, team not yet paid) is read from the
// last published ticket (public/tickets/) and taken off the balance first, so it is never split a
// second time: "food aid = 10 %, fixed" stays true. When the last ticket is missing, or a carried
// amount is set by hand above what the ticket leaves, the order stops instead of guessing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { splitWeek } from '../public/js/formula.js';
import { NON_CANONICAL, feeRow } from '../public/js/fees.js';
import { isSolanaAddress } from '../public/js/mint.js';
import { typo } from '../public/js/typo.js';
import { PLEIN_WINDOW_MS, nextPleinAt, paris, pleinInProgress } from '../public/js/clock.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export const SLICES = 12;
export const MAX_SLICES = 48; // the most a ticket may list; the site must show as many (public/js/readings.js)
export const WINDOW_SECONDS = 55 * 60; // first slice at 18:00, last at 18:55
export const WEEK_MS = 7 * 24 * 3600 * 1000;

// Tier 2: Jupiter's free quote endpoint, answering without a key on 17 October 2026. Jupiter may
// retire it for a keyed one: JUPITER_QUOTE_URL and JUPITER_API_KEY (a GitHub secret) override.
export const QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
export const UNITS = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
};
export const PLEIN_DECIMALS = 6; // Tier 2: pump.fun mints with 6 decimals; confirm on Solscan after launch

// Judgment calls, not facts; the founders can override them on the command line.
//  - A slice should not move the price by more than the pool's own fee: the limit is the smaller of
//    1 % and 0.8 × f, f being the pool's total fee per side (sliceLimitPct). A sandwich around a
//    slice pays only when the slice is bigger than about f × x (docs/moteur.md section 4), and every
//    slice is visible as a Squads proposal minutes before it runs.
//  - 100 bps slippage cap per swap, in line with that threshold.
//  - 20 USDC minimum per slice: a swap pays network and priority fees of some cents (Tier 2), so
//    below this the fixed cost starts to weigh about 1 % on the slice. Not set for SOL.
export const DEFAULT_MAX_IMPACT_PCT = 1; // the ceiling of the per-slice limit, at a pool fee of 1.25 % and above
export const DEFAULT_SLIPPAGE_BPS = 100;
export const DEFAULT_MIN_SLICE = { USDC: 20 };

// The hour as a whole (docs/moteur.md section 4). Slicing does not lower the lift of the hour: on
// one pool, twelve slices end at the same price as one buy. A trader who buys before 18:00 and sells
// after 19:00 gains once the hour's buy is above about the pool's own fee rate times its quote-side
// depth, so the hour is capped at H = min(B, 0.8 × f × x). Tier 3: the model, not a measurement.
export const HOUR_CAP_FACTOR = 0.8;
// When the fee tier was not read, assume the cheapest pool (0.30 %: above 20 M$, or another pool
// with depth). Too low a guess only makes the cap smaller; too high a guess lets a front-runner in.
export const DEFAULT_POOL_FEE_PCT = NON_CANONICAL.total;
// Jupiter's route labels for the pump.fun curve and the canonical PumpSwap pool. Any other label in
// a quote means another venue holds depth, and moteur section 4, rule 1, sets f = 0.30 %. Tier 2:
// the labels as seen on Jupiter's quote API, to confirm on the first real quote. A pool of the coin
// that is not the canonical one carries the same label, so the order cannot tell it from the real one.
export const CANONICAL_ROUTE = /^pump(\.?fun)?( ?amm| ?swap)?$/i;
// Above this progress the hour could complete the curve in the middle of the plein and move trading
// to a new, thin pool: H = 0 (moteur section 4, rule 1).
export const CURVE_HOLD_PCT = 90;
export const CURVE_TOKENS = 793_100_000; // Tier 2: tokens for sale on a pump.fun curve, from its Global account (moteur A3)

const round4 = (x) => Math.round(x * 1e4) / 1e4;
/** The price impact (%) a single slice may have: the smaller of 1 % and 0.8 × the pool fee. */
export const sliceLimitPct = (feePct) => round4(Math.min(DEFAULT_MAX_IMPACT_PCT, HOUR_CAP_FACTOR * feePct));
/**
 * The price impact (%) of the whole hour above which a trader who buys before 18:00 and sells after
 * 19:00 starts to profit: f / (1 − f)², the break-even H/x of moteur section 4 (1.23 % at a fee of
 * 1.20 %, 0.56 % at 0.55 %, 0.30 % at 0.30 %).
 */
export const hourLimitPct = (feePct) => round4((100 * (feePct / 100)) / (1 - feePct / 100) ** 2);

// Money in the creator vault is "dust" below the first figure, "accrued since the claim" up to the
// second (the larger of a fixed floor and a share of the réservoir: fees build up with every trade
// between the 17:50 claim and the 17:52 read, so a live Saturday is never exactly zero), and a claim
// that was not made above it. Judgment calls, not facts.
const DUST = { USDC: 0.01, SOL: 0.0005 };
const UNCLAIMED_FLOOR = { USDC: 1, SOL: 0.01 };
const UNCLAIMED_SHARE = 0.01;

// Quoting must not outlast the 17:52 job. Overall budget, and one request's.
export const DEFAULT_QUOTE_DEADLINE_MS = 120 * 1000;
export const DEFAULT_QUOTE_TIMEOUT_MS = 10 * 1000;

export function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(join(root, 'public/config.js'), 'utf8'), sandbox);
  return sandbox.window.PLEIN_CONFIG;
}
export function loadLive() {
  return JSON.parse(readFileSync(join(root, 'public/live.json'), 'utf8'));
}

const z2 = (n) => String(n).padStart(2, '0');

/** An instant as Paris wall-clock ISO 8601 with its offset: 2026-10-24T18:00:00+02:00. */
export function parisIso(ms) {
  const p = paris(ms);
  const offMin = Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
  const abs = Math.abs(offMin);
  return `${p.y}-${z2(p.m)}-${z2(p.d)}T${z2(p.h)}:${z2(p.min)}:${z2(p.s)}${offMin < 0 ? '-' : '+'}${z2(Math.floor(abs / 60))}:${z2(abs % 60)}`;
}

/** True for exactly a Saturday at 18:00:00 Paris time. */
export function isPleinInstant(ms) {
  if (!Number.isFinite(ms)) return false;
  const p = paris(ms);
  return p.dow === 6 && p.h === 18 && p.min === 0 && p.s === 0;
}

/**
 * The plein an order is for when no --at is given: the one under way (a run at 18:05 is for
 * tonight's plein, not next week's), otherwise the next, never before the first.
 */
export function defaultPleinAt(now, firstPleinMs) {
  const running = pleinInProgress(now, firstPleinMs);
  if (running) return running.start;
  const next = nextPleinAt(now);
  return Number.isFinite(firstPleinMs) ? Math.max(next, firstPleinMs) : next;
}

/**
 * An amount in cents, floored: 3412, "3412.00" and "3 412,00" all give 341200. Flooring means the
 * plan never spends more than the balance holds; the sub-cent dust stays in the réservoir.
 */
export function toCents(value) {
  const text = typeof value === 'number'
    ? (Number.isFinite(value) ? value.toFixed(6) : '')
    : String(value).replace(/[\s  ]/g, '').replace(',', '.');
  const m = /^(\d{1,12})(?:\.(\d{0,6}))?$/.exec(text);
  if (!m) throw new RangeError(`not an amount: ${value}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0').slice(0, 2));
}

/** The buyback in `count` slices, in cents: equal, and the last one takes the remainder. */
export function splitSlices(totalCents, count) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new RangeError('total must be a non-negative number of cents');
  if (!Number.isInteger(count) || count < 1 || count > MAX_SLICES) throw new RangeError(`slices must be 1 to ${MAX_SLICES}`);
  if (totalCents === 0) return [];
  if (count > totalCents) throw new RangeError('more slices than cents');
  const base = Math.floor(totalCents / count);
  const out = Array(count).fill(base);
  out[count - 1] += totalCents - base * count;
  return out;
}

/** When each slice starts (ms): first at the plein, last 55 minutes later, evenly spaced. */
export function sliceTimes(atMs, count) {
  return Array.from({ length: count }, (_, i) => atMs + (count === 1 ? 0 : Math.round((i * WINDOW_SECONDS) / (count - 1))) * 1000);
}

// --- what earlier weeks left in the réservoir ---------------------------------------------------

const toCentsExact = (x) => Math.round(Number(x ?? 0) * 100);

/**
 * What a published ticket leaves in the réservoir, in cents: the aid share and the team share when
 * their transfer is null, plus the buyback it did not make (`unspent`). Money that was carried into
 * that ticket and not paid out stays carried.
 */
export function heldOver(ticket) {
  const carried = ticket?.carried ?? {};
  return {
    aid: ticket?.aidTransfer ? 0 : toCentsExact(ticket?.aid) + toCentsExact(carried.aid),
    buyback: toCentsExact(ticket?.unspent),
    team: ticket?.teamTransfer ? 0 : toCentsExact(ticket?.team) + toCentsExact(carried.team),
  };
}

/**
 * What a ticket says the réservoir had to pay out or spend on its Saturday, in cents: the aid and
 * team transfers (this week's share plus what was carried for them) and the buyback actually
 * bought (the week's buyback plus the carried one, less `unspent`). scripts/verify-ticket.mjs
 * compares these with the chain: a transfer of this week's share alone would leave the carried
 * part in the réservoir, to be split a second time next week.
 */
export function dueOf(ticket) {
  const carried = ticket?.carried ?? {};
  return {
    aid: toCentsExact(ticket?.aid) + toCentsExact(carried.aid),
    team: toCentsExact(ticket?.team) + toCentsExact(carried.team),
    bought: toCentsExact(ticket?.buyback) + toCentsExact(carried.buyback) - toCentsExact(ticket?.unspent),
  };
}

/** Every published ticket, oldest first, read from public/tickets/index.json. Throws on a file it cannot read. */
export function readPublishedTickets(dir = join(root, 'public/tickets')) {
  const indexFile = join(dir, 'index.json');
  if (!existsSync(indexFile)) return [];
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));
  if (!Array.isArray(index?.tickets)) throw new Error('public/tickets/index.json has no "tickets" list');
  return index.tickets.map((entry) => {
    const file = join(dir, basename(String(entry?.path ?? '')));
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`cannot read the published ticket ${entry?.path}: ${e.message} (the order cannot know what it left in the réservoir)`);
    }
  }).sort((a, b) => a.n - b.n);
}

/** { aid, buyback, team } in cents carried into plein `n` from the last earlier ticket, and where from. */
export function carriedFor(published, n) {
  const earlier = published.filter((t) => Number.isInteger(t?.n) && t.n < n);
  const prev = earlier.length ? earlier[earlier.length - 1] : null;
  if (!prev) return { aid: 0, buyback: 0, team: 0, from: null };
  return { ...heldOver(prev), from: prev.n };
}

// --- Jupiter quotes -------------------------------------------------------------------------------

const uiAmount = (raw, decimals) => Number(raw) / 10 ** decimals;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rejects with a TimeoutError after `ms`, even when `promise` ignores its abort signal. */
function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseQuote(body, { amountRaw, outputMint, outDecimals }) {
  if (body.error || body.errorCode) return { ok: false, reason: String(body.errorCode || body.error) };
  if (typeof body.outAmount !== 'string' || !/^\d+$/.test(body.outAmount) || BigInt(body.outAmount) === 0n) {
    return { ok: false, reason: 'the quote has no output amount' };
  }
  if (String(body.inAmount) !== String(amountRaw) || body.outputMint !== outputMint) {
    return { ok: false, reason: 'the quote answers another swap than the one asked' };
  }
  const impact = Number(body.priceImpactPct);
  if (!Number.isFinite(impact) || impact < 0) return { ok: false, reason: 'the quote has no readable price impact' };
  const routes = [...new Set((body.routePlan ?? []).map((leg) => leg?.swapInfo?.label).filter((s) => typeof s === 'string' && s))];
  const min = typeof body.otherAmountThreshold === 'string' && /^\d+$/.test(body.otherAmountThreshold)
    ? uiAmount(body.otherAmountThreshold, outDecimals) : null;
  return {
    ok: true,
    quote: {
      out: uiAmount(body.outAmount, outDecimals),
      minOut: min,
      // priceImpactPct is a fraction (0.0291 = 2.91 %): checked on 17 October 2026 by comparing a
      // 50 million USDC quote with a 100 USDC one. Tier 2: Jupiter could change it.
      impactPct: Math.round(impact * 100 * 1e4) / 1e4,
      routes,
    },
  };
}

/**
 * How long to wait before the next call, from the rate-limit headers the free endpoint sends
 * (observed 17 October 2026: five calls per window of about ten seconds; Tier 2). The reset time is
 * compared with the server's own Date header, because this machine's clock may be off.
 */
function waitFromHeaders(res) {
  const get = (k) => res.headers?.get?.(k) ?? null;
  const remaining = get('x-ratelimit-remaining');
  const reset = Number(get('x-ratelimit-reset'));
  if (remaining === null || Number(remaining) > 0 || !Number.isFinite(reset) || reset <= 0) return 0;
  const serverNow = Date.parse(get('date') ?? '');
  const wait = reset * 1000 - (Number.isFinite(serverNow) ? serverNow : Date.now()) + 200;
  return Math.min(15000, Math.max(0, wait));
}

/**
 * One Jupiter quote. Never throws: { ok: true, quote, waitMs } or { ok: false, reason, waitMs }.
 * `deadlineAt` (an instant of `clock`) ends the retries; each request also times out on its own,
 * even if the fetch implementation ignores the abort signal.
 */
export async function fetchQuote({
  inputMint, outputMint, amountRaw, slippageBps = DEFAULT_SLIPPAGE_BPS, outDecimals = PLEIN_DECIMALS,
  fetchImpl = globalThis.fetch, url, apiKey, timeoutMs = DEFAULT_QUOTE_TIMEOUT_MS, retries = 2, sleep = defaultSleep,
  clock = Date.now, deadlineAt = Infinity,
}) {
  const endpoint = new URL(url || process.env.JUPITER_QUOTE_URL || QUOTE_URL);
  endpoint.search = new URLSearchParams({ inputMint, outputMint, amount: String(amountRaw), slippageBps: String(slippageBps) }).toString();
  const key = apiKey ?? process.env.JUPITER_API_KEY;
  const headers = { accept: 'application/json', ...(key ? { 'x-api-key': key } : {}) };
  let reason = 'no answer';
  let waitMs = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const budget = Math.min(timeoutMs, deadlineAt - clock());
    if (budget <= 0) { reason = attempt === 0 ? 'timeout' : reason; break; }
    const controller = new AbortController();
    try {
      const { res, body } = await withTimeout((async () => {
        const r = await fetchImpl(endpoint, { headers, signal: controller.signal });
        return { res: r, body: await r.json().catch(() => null) };
      })(), budget, () => controller.abort());
      waitMs = waitFromHeaders(res);
      if (res.ok && body) return { ...parseQuote(body, { amountRaw, outputMint, outDecimals }), waitMs };
      reason = `HTTP ${res.status}${body && (body.errorCode || body.error) ? `: ${body.errorCode || body.error}` : ''}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      reason = e?.name === 'TimeoutError' ? 'timeout' : `network: ${e?.message ?? e}`;
    }
    if (attempt < retries) {
      const pause = Math.max(1000 * (attempt + 1), waitMs);
      if (clock() + pause >= deadlineAt) break;
      await sleep(pause);
    }
  }
  return { ok: false, reason, waitMs };
}

// --- the chain -----------------------------------------------------------------------------------

/** One reading from api/chain.js (loaded lazily: it is read-only but needs the network). */
async function loadReading({ live, mint }) {
  let mod;
  try {
    mod = await import('../api/chain.js');
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes('chain.js')) {
      throw new Error('--from-chain needs api/chain.js, which is not in the tree yet; pass --reservoir <amount> instead');
    }
    throw e;
  }
  if (typeof mod.takeReading !== 'function') throw new Error('api/chain.js does not export takeReading(); pass --reservoir <amount> instead');
  return mod.takeReading({ live, rpcUrl: process.env.SOLANA_RPC_URL, mint });
}

/** The réservoir balance, the unclaimed fees and the curve state, from the chain reading (`take` replaces the real reader in tests). */
async function readChain({ live, mint, unit, take = loadReading }) {
  const reading = await take({ live, mint });
  const r = reading?.reservoir;
  const amount = unit === 'SOL' ? r?.sol : r?.usdc;
  if (amount === null || amount === undefined) {
    const why = (reading?.errors ?? []).join('; ')
      || (addr(live, 'reservoir') ? 'no reason given' : 'no réservoir wallet in public/live.json yet');
    throw new Error(`the chain reading has no réservoir balance (${why}); pass --reservoir <amount>`);
  }
  const vault = reading.creatorVault;
  return {
    amount,
    asOf: reading.asOf ?? null,
    unclaimed: vault && Number.isFinite(Number(vault.unclaimed)) ? { amount: Number(vault.unclaimed), unit: vault.unit ?? unit } : null,
    curve: reading.curve ?? null,
    marketCapUsd: reading.market?.marketCapUsd ?? null,
    warnings: [],
  };
}

/** Curve state alone, for an order given with --reservoir. Never throws: a failure is a warning. */
async function readCurve({ live, mint, take = loadReading }) {
  try {
    const reading = await take({ live, mint });
    return { curve: reading.curve ?? null, marketCapUsd: reading.market?.marketCapUsd ?? null, asOf: reading.asOf ?? null };
  } catch (e) {
    return { curve: null, marketCapUsd: null, asOf: null, error: e.message };
  }
}

// --- impact: the hour as a whole, then each slice --------------------------------------------------

/**
 * How deep the pool's quote side is (USDC), from quotes already taken. On a constant-product pool a
 * buy of s returns tokens at (x + s)⁻¹ per unit, so with r = (outB/B) / (outS/s) the depth is
 * x = (r × B − s) / (1 − r). The second estimate is the whole buy's own price impact, B (1 − i) / i.
 * Both are rough (routes mix pools, quotes are seconds apart); the hour check uses the smaller.
 */
export function estimateDepth({ slice, whole }) {
  const found = { ratio: null, impact: null };
  if (slice?.out > 0 && whole?.out > 0 && whole.spent > slice.spent && slice.spent > 0) {
    const r = (whole.out / whole.spent) / (slice.out / slice.spent);
    if (r > 0 && r < 1) {
      const x = (r * whole.spent - slice.spent) / (1 - r);
      if (Number.isFinite(x) && x > 0) found.ratio = x;
    }
  }
  const i = Number(whole?.impactPct) / 100;
  if (i > 0 && i < 1 && whole.spent > 0) found.impact = (whole.spent * (1 - i)) / i;
  return found;
}

const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The hour check of docs/moteur.md section 4 on the quotes in hand. `whole` and `slice` are
 * { spent, out, impactPct } in UI units. Returns null when there is no whole-buyback quote.
 * H = min(B, 0.8 × f × x) is what the hour could carry; R = B − H is what the rule leaves for later
 * (the next Saturday under option A', the weekdays under option B). The check only measures:
 * buildOrder applies H when the founders ask for it (--hour-cap).
 * The whole buy is "too big" when it is above the cap, or when its price impact is above the
 * front-run break-even of the pool's own fee, f / (1 − f)² (hourLimitPct).
 */
export function hourCheck({ buyback, slice, whole, poolFeePct, feeSource }) {
  if (!whole || !(whole.out > 0)) return null;
  const depth = estimateDepth({ slice, whole });
  const found = [depth.ratio, depth.impact].filter((v) => Number.isFinite(v));
  const x = found.length ? Math.min(...found) : null;
  const cap = x === null ? null : floor2(HOUR_CAP_FACTOR * (poolFeePct / 100) * x);
  const hour = cap === null ? buyback : Math.min(buyback, cap);
  const impactLimitPct = hourLimitPct(poolFeePct);
  const capped = (cap !== null && cap < buyback) || whole.impactPct > impactLimitPct;
  return {
    buyback,
    depthRatio: depth.ratio === null ? null : Math.round(depth.ratio),
    depthImpact: depth.impact === null ? null : Math.round(depth.impact),
    depth: x === null ? null : Math.round(x),
    bOverXPct: x === null ? null : Math.round((buyback / x) * 1000) / 10,
    liftPct: x === null ? null : Math.round(((1 + buyback / x) ** 2 - 1) * 1000) / 10,
    wholeImpactPct: whole.impactPct,
    impactLimitPct,
    poolFeePct,
    feeSource,
    cap,
    hour: round2(hour),
    rest: round2(buyback - hour),
    capped,
  };
}

/**
 * The advice on the order, in priority order:
 *  - hold: the curve is above 90 % or the buyback would complete it; the hour could move trading to
 *    a thin new pool in the middle of the plein (moteur section 4: H = 0). With `applied` (the order
 *    was built with --hour-cap) the hour is already 0 and the whole buyback is in `unspent`;
 *  - hour-capped / hour-set: the order applies a cap (--hour-cap) or an hour chosen by hand (--hour);
 *  - hour-cap-needed: the whole hour is too big for the pool and nothing was applied. More slices do
 *    not help, so none is advised; run again with --hour-cap if the fiche says the hour is capped;
 *  - fewer-slices: a slice would be under the minimum, fixed network costs weigh too much;
 *  - smaller-slices: a slice moves the price more than `maxImpactPct` (sandwich risk). The new
 *    impact is estimated by scaling linearly with size, a fair approximation for small trades and
 *    nothing more (Tier 3);
 *  - unquoted, hour-unchecked: not enough quotes to say; ok only when the slices and the hour pass.
 * Every finding is kept in `reason`; `action` and `slices` follow the first. `applied` is
 * { mode: 'cap' | 'given', hour, rest, buyback, why } in UI units, or null.
 */
export function recommend({
  count, buybackCents, minSliceCents, maxImpactPct, worstImpactPct, hour = null, curve = null, applied = null,
}) {
  if (count === 0 && !applied) return { action: 'none', reason: 'Nothing to buy this week.' };
  const found = [];
  const add = (action, reason, slices) => found.push(slices === undefined ? { action, reason } : { action, reason, slices });

  if (curve && curve.complete === false && (curve.progressPct > CURVE_HOLD_PCT || curve.completesWithWhole)) {
    add('hold', `The bonding curve is at ${curve.progressPct} % and ${curve.completesWithWhole ? 'this buyback would take it to 100 %' : `above ${CURVE_HOLD_PCT} % the hour could complete it`}: trading would move to a new, thin pool in the middle of the plein (docs/moteur.md section 4 sets the hour to 0 here). ${applied?.mode === 'cap'
      ? 'Applied (--hour-cap): nothing is bought this Saturday and the whole buyback is written in `unspent`, carried to next week and never split again.'
      : 'Not applied by this script (run with --hour-cap to apply it); the founders decide whether to hold the buyback (write it in `unspent`: it is carried to next week, never split again) or to go on knowingly.'}`);
  }
  if (applied?.mode === 'cap') {
    add('hour-capped', `The hour is capped (--hour-cap): ${money(applied.hour)} of the ${money(applied.buyback)} to buy are bought between 18:00 and 19:00, and ${money(applied.rest)} is written in \`unspent\`, carried to the next Saturday and never split again. ${applied.why}`);
  } else if (applied?.mode === 'given') {
    add('hour-set', `The hour is set by hand (--hour): ${money(applied.hour)} of the ${money(applied.buyback)} to buy are bought between 18:00 and 19:00, and ${money(applied.rest)} is written in \`unspent\`, carried to the next Saturday and never split again. ${applied.why}`);
  } else if (hour?.capped) {
    const lift = hour.liftPct === null ? '' : `, which lifts the price about ${hour.liftPct} % (B/x ${hour.bOverXPct} %)`;
    add('hour-cap-needed', `The hour is too big for the pool: ${money(hour.buyback)} bought between 18:00 and 19:00 against a quote-side depth of about ${hour.depth === null ? 'n/a' : money(hour.depth, 0)}${lift}; the whole buyback quotes a ${hour.wholeImpactPct} % impact, where a trader who buys before 18:00 and sells after 19:00 starts to profit above ${hour.impactLimitPct} % (f / (1 − f)² at a pool fee of ${hour.poolFeePct} %). More slices do not lower this: twelve slices end at the same price as one buy (docs/moteur.md section 4). The cap there is H = min(B, ${HOUR_CAP_FACTOR} × f × x) = ${money(hour.hour)} for the hour, with f = ${hour.poolFeePct} % (${hour.feeSource}), and the rest ${money(hour.rest)} carried to the next Saturday (option A', in \`unspent\`) or bought during the week (option B, not built). The cap is not applied by this script. Run it again with --hour-cap only if the fiche says the hour is capped (moteur option A'); otherwise the hour is bought as the fiche says and the founders accept the lift knowingly, or announce the cap like a formula change with four weeks' notice (the lawyer may say less).`);
  }
  if (minSliceCents && count > 1 && Math.floor(buybackCents / count) < minSliceCents) {
    const fewer = Math.max(1, Math.min(count, Math.floor(buybackCents / minSliceCents)));
    add('fewer-slices', `A slice would be under ${(minSliceCents / 100).toFixed(2)}: fixed network costs weigh too much. Run ${fewer} slice${fewer > 1 ? 's' : ''} (--slices ${fewer}) and say so in the ticket notes.`, fewer);
  } else if (worstImpactPct !== null && worstImpactPct > maxImpactPct && (!hour?.capped || applied)) {
    const needed = Math.ceil((count * worstImpactPct) / maxImpactPct);
    const slices = Math.min(MAX_SLICES, needed);
    const estimate = Math.round(((worstImpactPct * count) / slices) * 100) / 100;
    add('smaller-slices', `The worst slice moves the price ${worstImpactPct} %, above ${maxImpactPct} %. Smaller slices: --slices ${slices} (about ${Math.round(WINDOW_SECONDS / (slices - 1))} s apart, estimated impact ${estimate} % each).`
      + (needed > MAX_SLICES ? ` Still above the threshold at ${MAX_SLICES} slices: the founders decide; the published rate is not cut silently, and the ticket must say what was done.` : ''), slices);
  }
  if (!found.length) {
    if (worstImpactPct === null) {
      add('unquoted', 'No quote, so no impact check: look at the price impact in Jupiter before each swap and stop above the threshold. The hour as a whole could not be checked either.');
    } else if (!hour && count > 1) {
      add('hour-unchecked', `The slices are within the ${maxImpactPct} % threshold (worst ${worstImpactPct} %), but the whole-buyback quote is missing, so the lift of the hour could not be checked: look at the price impact of the total in Jupiter before 18:00.`);
    } else {
      add('ok', `Worst slice impact ${worstImpactPct} % is within the ${maxImpactPct} % threshold${hour ? `, and the hour (${hour.wholeImpactPct} % against ${hour.impactLimitPct}, B/x ${hour.bOverXPct ?? 'n/a'} %) is within the cap` : ''}.`);
    }
  }
  const [first, ...others] = found;
  const out = { action: first.action, reason: [first.reason, ...others.map((o) => o.reason)].join(' ') };
  if (first.slices !== undefined) out.slices = first.slices;
  else if (others.find((o) => o.slices !== undefined)) out.slices = others.find((o) => o.slices !== undefined).slices;
  return out;
}

// --- the order -------------------------------------------------------------------------------------

const addr = (live, key) => (isSolanaAddress(live?.wallets?.[key]) ? live.wallets[key] : null);
const money = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const hhmm = (ms) => { const p = paris(ms); return `${z2(p.h)}:${z2(p.min)}`; };
const fr2 = (n) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * How much of the fees still in the creator vault matters, against the réservoir balance read:
 * 'none' (not read), 'dust' (nothing to say), 'accrued' (trades since the claim: next week's fees)
 * or 'material' (the claim was clearly not made). The vault grows with every trade, so any live
 * Saturday has a few cents in it at 17:52. `limit` is the amount above which it is material.
 */
export function unclaimedLevel(unclaimed, balance, unit) {
  if (!unclaimed) return { level: 'none', limit: null };
  const amount = Number(unclaimed.amount);
  const u = unclaimed.unit ?? unit;
  if (!(amount > (DUST[u] ?? 0.01))) return { level: 'dust', limit: null };
  const share = u === unit ? UNCLAIMED_SHARE * balance : 0;
  const limit = Math.max(UNCLAIMED_FLOOR[u] ?? 1, share);
  return { level: amount > limit ? 'material' : 'accrued', limit };
}

/**
 * The pool fee f that the caps use, and where it comes from. A route outside the pump.fun curve or
 * pool in any quote means another venue holds depth: f = 0.30 % (moteur section 4, rule 1). Never a
 * guess upwards: when nothing is known the lowest fee is assumed, which only makes the caps tighter.
 */
export function resolveFee({ given, routes = [], curveRead = null, marketCapUsd = null, unit }) {
  if (given !== undefined) return { pct: given, source: 'given', nonCanonical: [] };
  const nonCanonical = routes.filter((label) => !CANONICAL_ROUTE.test(label));
  if (nonCanonical.length) {
    return {
      pct: NON_CANONICAL.total,
      source: `a quote routes through ${nonCanonical.join(', ')}, not the pump.fun curve or pool alone: another pool or DEX may hold depth, so f = ${NON_CANONICAL.total} % (docs/moteur.md section 4, rule 1)`,
      nonCanonical,
    };
  }
  const row = curveRead ? feeRow({ complete: curveRead.complete === true, marketCap: marketCapUsd ?? undefined, quote: unit }) : null;
  if (row) return { pct: row.total, source: curveRead.complete ? 'pool tier at the market cap read, fees.js' : 'bonding curve, fees.js', nonCanonical: [] };
  return { pct: DEFAULT_POOL_FEE_PCT, source: `assumed ${DEFAULT_POOL_FEE_PCT} %, the lowest pool fee, because the fee tier in force was not read`, nonCanonical: [] };
}

function buildChecklist(o, live) {
  const where = (key) => addr(live, key) ?? (key === 'team'
    ? '[team wallet not set in live.json: publish `wallets.team` before the first plein, or nobody can check where the team\'s money went]'
    : `[${key} wallet not set in live.json]`);
  const carriedTotal = o.carried.aid + o.carried.buyback + o.carried.team;
  const steps = [
    { time: '17:45', text: `Price frozen. Check that \`official\` in public/config.js is the latest weekly national diesel average from the ministry (DGEC): ${o.diesel.price} €/L, "${o.diesel.week}", merged on main. This order uses it: rate ${o.split.ratePct} %.` },
    { time: 'before 17:50', text: `Claim the week's creator fees to the creator wallet (${where('creator')}) and move them into the réservoir (${where('reservoir')}). The claim path is Tier 2: try it once with a small amount beforehand. Write the claim signature in the draft (\`claim.sig\`), or set \`claim\` to null if there was none. An order computed before the claim splits too little: re-run it after.` },
    { time: '17:50', text: `Check the réservoir balance (\`npm run releve\`) against ${money(o.reservoir)} ${o.unit} in this order: ${money(o.fees)} of this week's fees${carriedTotal > 0 ? ` plus ${money(carriedTotal)} carried from earlier weeks (aid ${money(o.carried.aid)}, buyback ${money(o.carried.buyback)}, team ${money(o.carried.team)}${o.carriedFrom ? `, from ticket #${o.carriedFrom}` : ''})` : ' and nothing carried from earlier weeks'}. If it differs, stop and find out why before anything moves; then re-run \`npm run plein -- --reservoir <balance>\`: never edit the figures of an order by hand.` },
  ];
  if (o.slices.length) {
    const first = o.slices[0];
    const capped = o.carryOut > 0
      ? ` This order buys ${money(o.hourBuy)} of the ${money(o.toBuy)} to buy (${o.applied?.mode === 'given' ? '--hour' : '--hour-cap'}); the ${money(o.carryOut)} left is already written in the draft's \`unspent\` and carried to the next Saturday.`
      : '';
    steps.push({
      time: `${hhmm(Date.parse(first.at))} to ${hhmm(Date.parse(o.slices.at(-1).at))}`,
      text: `${o.slices.length} swaps from the réservoir, ${o.unit} to $PLEIN${o.mint ? ` (${o.mint})` : ''}, one per row of the table above, slippage cap ${o.params.slippageBps / 100} %.${capped} Before each one, compare Jupiter's price impact with the threshold (${o.params.maxImpactPct} %); above it, stop and ask the other founder. After each swap, copy its signature and the $PLEIN received (from the transaction on Solscan) into the draft: \`slices[i].sig\`, \`slices[i].bought\`. If you stop before the last swap (impact too high, Jupiter or Solana down), write the ${o.unit} not spent in \`unspent\` and say why in \`notes\` and delete the slices not made: it is carried into next week's buyback and never split again.`,
    });
    steps.push({ time: '19:00', text: `Burn: burn all the $PLEIN received this week (the sum of the \`bought\` values), nothing less, with the SPL burn instruction from the account that holds them. Write the signature and the exact amount in \`burn\`; a ticket that burns less than it bought does not print.` });
  } else if (o.toBuy > 0) {
    steps.push({ time: '18:00', text: `Nothing is bought this Saturday (${o.applied?.mode === 'cap' ? '--hour-cap sets the hour to 0' : '--hour 0'}): the whole ${money(o.toBuy)} ${o.unit} is written in the draft's \`unspent\` and carried to the next Saturday, never split again. No swap, no burn: \`burn\` is null. The ticket still prints, with its notes.` });
  } else {
    steps.push({ time: '18:00', text: 'There is nothing to buy this week: no swap, no burn. Set `burn` to null and add a note; the ticket still prints.' });
  }
  const aidDue = o.split.aid + o.carried.aid;
  if (aidDue > 0) {
    steps.push({ time: 'after the burn', text: `Food aid: transfer ${money(aidDue)} ${o.unit} (this week's ${money(o.split.aid)}${o.carried.aid > 0 ? ` plus ${money(o.carried.aid)} carried` : ''}) to the aid wallet (${where('aid')}) and write the signature in \`aidTransfer\`. The whole sum, carried part included: \`npm run verify:ticket\` expects it, and what stays behind would be split again next week. Until the partner agreement is signed, that wallet is an escrow the two founders control, published in live.json: moving the aid there every Saturday keeps the réservoir to one week's money. If it stays in the réservoir instead, set \`aidTransfer\` to null and add a note: the ticket shows it as held, and the next order takes it off the balance before splitting.` });
  }
  const teamDue = o.split.team + o.carried.team;
  if (teamDue > 0 && o.teamWaits) {
    steps.push({ time: 'after the burn', text: `Team: do NOT pay yet. The unspent buyback (${money(o.carryOut)} ${o.unit}) is larger than one week's buyback (${money(o.split.buyback)}), so the team's ${money(teamDue)} waits in the réservoir (docs/moteur.md section 4, rule 6). \`teamTransfer\` is null in the draft; keep the note that says so. The next order takes it off the balance before splitting.` });
  } else if (teamDue > 0) {
    steps.push({ time: 'after the burn', text: `Team, last: only once every slice is done or the remainder is written in \`unspent\`. Move ${money(teamDue)} ${o.unit} (this week's ${money(o.split.team)}${o.carried.team > 0 ? ` plus ${money(o.carried.team)} carried` : ''}) to the team wallet (${where('team')}) and write the signature in \`teamTransfer\`. The whole sum, carried part included: \`npm run verify:ticket\` checks it against the team wallet. While the unspent remainder is larger than one week's buyback, the team waits (docs/moteur.md section 4, rule 6): set \`teamTransfer\` to null and add a note; the next order takes it off the balance before splitting.` });
  }
  steps.push({ time: '19:05', text: `Ticket: fill the draft (out/${o.files.draft}), run \`npm run ticket -- out/${o.files.draft}\`, then add \`--write\`, open the pull request, the other founder approves, publish the PNG and the link on X and Telegram.` });
  return steps;
}

const CARRY_KEYS = ['aid', 'buyback', 'team'];

/** The order for one Saturday. Pure apart from the Jupiter quotes (and the chain with `fromChain`). */
export async function buildOrder(opts = {}) {
  const config = opts.config ?? loadConfig();
  const live = opts.live ?? loadLive();
  const now = opts.now ?? Date.now();
  const warnings = [];

  const unit = opts.unit ?? config.launchpad?.quote ?? 'USDC';
  const U = UNITS[unit];
  if (!U) throw new RangeError(`unknown quote asset: ${unit}`);
  const price = Number(config.official?.gazole);
  if (!(price > 0)) throw new RangeError('config.js has no official diesel price');
  if (opts.hourCap && opts.hour !== undefined) throw new Error('give --hour-cap or --hour, not both');

  // when
  const firstMs = Date.parse(config.firstPleinAt);
  let atMs;
  if (opts.at !== undefined) {
    atMs = Date.parse(opts.at);
    if (!isPleinInstant(atMs)) throw new RangeError('--at must be a Saturday at 18:00 Paris time, e.g. 2026-10-24T18:00:00+02:00');
  } else {
    atMs = defaultPleinAt(now, firstMs);
  }
  if (now >= atMs + PLEIN_WINDOW_MS) warnings.push('This plein time is already past.');
  else if (now >= atMs) warnings.push('The plein is under way (it started at 18:00): slices timed before now are late.');
  else if (atMs - now > 36 * 3600 * 1000) warnings.push('The plein is more than a day away: the balance and the price can still change; run the order again on Saturday.');
  const n = Number.isFinite(firstMs) ? Math.max(1, Math.round((atMs - firstMs) / WEEK_MS) + 1) : 1;

  // mint: from live.json, only once the station is open, unless overridden for a test
  let mint = null;
  let quoteSkip = null;
  if (opts.mint) {
    if (!isSolanaAddress(opts.mint)) throw new RangeError('--mint is not a Solana address');
    mint = opts.mint;
    warnings.push(`Mint overridden (${mint}): this is not the official contract, and the amounts out are read with ${PLEIN_DECIMALS} decimals as on pump.fun.`);
  } else if (live.contract && !isSolanaAddress(live.contract)) {
    throw new RangeError('public/live.json holds a contract that is not a Solana address');
  } else if (!live.contract) {
    quoteSkip = 'No contract in public/live.json yet.';
  } else if (now < Date.parse(config.launchAt)) {
    quoteSkip = 'The station opens later (launchAt in config.js): no quotes before the launch.';
  } else {
    mint = live.contract;
  }
  if (opts.noQuotes) quoteSkip = 'Quotes switched off (--no-quotes).';
  const quoting = mint !== null && !quoteSkip;
  if (opts.hourCap && !quoting) {
    throw new Error(`--hour-cap reads the depth of the pool from Jupiter quotes, and there are none (${quoteSkip}); give the hour by hand with --hour <amount>`);
  }

  // the balance of the réservoir, and what the chain says about the curve
  let balanceCents;
  let source;
  let chain = null;
  if (opts.fromChain && opts.reservoir !== undefined) throw new Error('give --reservoir or --from-chain, not both');
  if (opts.fromChain) {
    const r = await (opts.readChain ?? readChain)({ live, mint: opts.mint ?? (live.contract || null), unit, take: opts.takeReading });
    balanceCents = toCents(r.amount);
    source = { kind: 'chain', asOf: r.asOf ?? null };
    chain = { curve: r.curve ?? null, marketCapUsd: r.marketCapUsd ?? null };
    warnings.push(...(r.warnings ?? []));
    const unclaimed = r.unclaimed;
    const { level, limit } = unclaimedLevel(unclaimed, balanceCents / 100, unit);
    const what = `The creator vault holds ${unclaimed?.amount} ${unclaimed?.unit ?? unit} of fees`;
    if (level === 'material') {
      if (!opts.allowUnclaimed) {
        throw new Error(`${what} that are not claimed yet: claim them first, because an order computed before the claim splits too little (or pass --allow-unclaimed to see the order anyway)`);
      }
      warnings.push(`${what} that are not claimed yet: claim first, or this week's split is computed on too little.`);
    } else if (level === 'accrued') {
      warnings.push(`${what} that built up after the claim (trades since 17:50, under the ${money(limit)} ${unclaimed.unit ?? unit} that would mean a missed claim): they are next week's fees and are not in this order.`);
    }
  } else if (opts.reservoir !== undefined) {
    balanceCents = toCents(opts.reservoir);
    source = { kind: 'given', asOf: null };
  } else {
    throw new Error('give --reservoir <amount> or --from-chain');
  }
  if (quoting && !chain) {
    const c = await (opts.readCurve ?? readCurve)({ live, mint: opts.mint ?? (live.contract || null), take: opts.takeReading });
    if (c) chain = { curve: c.curve ?? null, marketCapUsd: c.marketCapUsd ?? null };
    if (c?.error) warnings.push(`The curve state could not be read (${c.error}): the 90 % rule of docs/moteur.md section 4 is not checked.`);
  }

  // what earlier weeks left in the réservoir comes off before the split
  const published = opts.tickets ?? readPublishedTickets(opts.ticketsDir);
  if (published.some((t) => t.n === n)) warnings.push(`Plein #${n} already has a published ticket: this order is a rehearsal, and \`npm run ticket -- --write\` will refuse it.`);
  const prior = carriedFor(published, n);
  const stated = CARRY_KEYS.filter((key) => opts.carried?.[key] !== undefined);
  // a figure exists when the week before has its ticket (or there is no week before)
  const figureExists = n === 1 || prior.from === n - 1;
  if (!figureExists) {
    const last = prior.from === null ? 'no ticket is published before it' : `the last published is #${prior.from}`;
    if (!opts.noPreviousTicket && stated.length === 0) {
      throw new Error(`no ticket is published for plein #${n - 1} (${last}): whatever that week left in the réservoir (aid or team not paid out, buyback not made) would be counted as this week's fees and split a second time, which breaks "food aid = 10 %, fixed". Publish ticket #${n - 1} first (merge its pull request) and run the order again. To see the order anyway: state what that week left with --carried-aid / --carried-buyback / --carried-team, or pass --no-previous-ticket if it left nothing`);
    }
    warnings.push(`No ticket is published for plein #${n - 1} (${last}): this order takes the carried amounts as stated (${stated.length ? 'by hand' : 'none'}), and ticket #${n} will be refused until ticket #${n - 1} is published.`);
  }
  const carriedCents = { aid: prior.aid, buyback: prior.buyback, team: prior.team };
  for (const key of stated) {
    const cents = toCents(opts.carried[key]);
    const from = n === 1 ? 'no earlier ticket' : `ticket #${prior.from}`;
    if (figureExists && cents > prior[key]) {
      if (!opts.forceCarried) {
        throw new Error(`--carried-${key} ${money(cents / 100)} is above the ${money(prior[key] / 100)} that ${from} leaves in the réservoir. Carried money can only go down (a payout made after that ticket): a higher figure would take money out of the split twice. If the published ticket is wrong, correct it in a pull request first; to see the order anyway, pass --force-carried (\`npm run ticket\` will still refuse the ticket)`);
      }
      warnings.push(`FORCED: carried ${key} set to ${money(cents / 100)} ${unit}, above the ${money(prior[key] / 100)} that ${from} leaves. \`npm run ticket\` will refuse a ticket that carries more than the record shows.`);
    } else if (figureExists && cents < prior[key]) {
      warnings.push(`Carried ${key} set by hand to ${money(cents / 100)} ${unit}, below the ${money(prior[key] / 100)} that ${from} leaves: the ticket must list the payout in \`adjustments\` (key, amount, signature of the transaction) or \`npm run ticket\` refuses it.`);
    } else if (figureExists) {
      warnings.push(`Carried ${key} set by hand to ${money(cents / 100)} ${unit}, as ${from} leaves it.`);
    } else {
      warnings.push(`Carried ${key} stated by hand: ${money(cents / 100)} ${unit}.`);
    }
    carriedCents[key] = cents;
  }
  const carriedTotalCents = carriedCents.aid + carriedCents.buyback + carriedCents.team;
  const feesCents = balanceCents - carriedTotalCents;
  if (feesCents < 0) {
    throw new Error(`the réservoir holds ${money(balanceCents / 100)} ${unit}, less than the ${money(carriedTotalCents / 100)} that earlier weeks left in it (aid ${money(carriedCents.aid / 100)}, buyback ${money(carriedCents.buyback / 100)}, team ${money(carriedCents.team / 100)}): find out why before anything moves (a transfer the last ticket does not show?), or set the carried amounts by hand`);
  }

  const split = splitWeek(feesCents / 100, price);
  const buybackCents = Math.round(split.buyback * 100);
  const toBuyCents = buybackCents + carriedCents.buyback;
  const slippageBps = opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const minSlice = opts.minSlice ?? DEFAULT_MIN_SLICE[unit] ?? null;
  const requested = opts.slices ?? SLICES;
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_SLICES) throw new RangeError(`--slices must be 1 to ${MAX_SLICES}`);

  // the hour: all of it by default; --hour sets it by hand, --hour-cap lets the quotes' depth set it
  let hourCents = toBuyCents;
  let givenHourCents = null;
  if (opts.hour !== undefined) {
    givenHourCents = toCents(opts.hour);
    if (givenHourCents > toBuyCents) throw new RangeError(`--hour ${money(givenHourCents / 100)} is more than the ${money(toBuyCents / 100)} to buy this week`);
    hourCents = givenHourCents;
  }
  const sliceSet = (cents) => {
    const count = cents === 0 ? 0 : Math.min(requested, cents);
    const spend = splitSlices(cents, count || 1).slice(0, count);
    const times = sliceTimes(atMs, count);
    return { count, spend, slices: spend.map((c, i) => ({ i: i + 1, at: parisIso(times[i]), spent: c / 100, quote: null, quoteNote: null })) };
  };
  let set = sliceSet(hourCents);

  // quotes, within a deadline: the order must not arrive after the plein has started
  let whole = null;
  const routeLabels = new Set();
  const quotes = { status: 'skipped', note: quoteSkip, endpoint: process.env.JUPITER_QUOTE_URL || QUOTE_URL };
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();
  const deadlineMs = opts.quoteDeadlineMs ?? DEFAULT_QUOTE_DEADLINE_MS;
  const perRequestMs = opts.quoteTimeoutMs ?? DEFAULT_QUOTE_TIMEOUT_MS;
  const left = () => deadlineMs - (clock() - startedAt);
  let timeoutsInARow = 0;
  let abandoned = null;
  let asked = 0;
  let wait = 0;
  // The free endpoint allows about five calls per ten seconds and says so in its headers: wait
  // out the window when it is used up, a short pause otherwise.
  const pause = opts.pauseMs ?? 250;
  const nap = opts.sleep ?? defaultSleep;
  const outOfTime = () => abandoned ?? (left() <= 0 ? 'deadline' : null);
  const ask = async (cents) => {
    if (asked > 0) await nap(Math.max(pause, wait));
    asked += 1;
    const r = await fetchQuote({
      inputMint: U.mint, outputMint: mint, amountRaw: BigInt(cents) * 10n ** BigInt(U.decimals - 2), slippageBps,
      fetchImpl: opts.fetchImpl, sleep: opts.sleep, retries: opts.retries ?? 2,
      timeoutMs: Math.max(1, Math.min(perRequestMs, left())), clock, deadlineAt: startedAt + deadlineMs,
    });
    wait = r.waitMs ?? 0;
    timeoutsInARow = !r.ok && r.reason === 'timeout' ? timeoutsInARow + 1 : 0;
    if (timeoutsInARow >= 2) abandoned = 'two quotes in a row timed out';
    if (r.ok) r.quote.routes.forEach((label) => routeLabels.add(label));
    return r;
  };
  /** One quote per slice of `s`; returns how many failed. */
  const quoteSlices = async (s) => {
    let failed = 0;
    for (const [i, slice] of s.slices.entries()) {
      if (outOfTime()) { slice.quoteNote = `not quoted: ${outOfTime()}`; failed += 1; continue; }
      const r = await ask(s.spend[i]);
      if (r.ok) slice.quote = r.quote; else { slice.quoteNote = r.reason; failed += 1; }
    }
    return failed;
  };
  const summarize = (s, failed) => {
    quotes.status = failed === 0 ? 'ok' : failed === s.count ? 'unavailable' : 'partial';
    quotes.note = failed ? `${failed} of ${s.count} quotes failed: ${s.slices.filter((x) => x.quoteNote).map((x) => `#${x.i} ${x.quoteNote}`).join('; ')}.` : null;
  };
  if (set.count > 0 && quoting) {
    const failed = await quoteSlices(set);
    if (set.count > 1 || hourCents < toBuyCents) {
      if (outOfTime()) {
        whole = { unavailable: `not quoted: ${outOfTime()}` };
      } else {
        const r = await ask(toBuyCents);
        whole = r.ok ? r.quote : { unavailable: r.reason };
      }
    } else if (set.slices[0]?.quote) {
      whole = set.slices[0].quote; // one slice is the whole buyback
    }
    summarize(set, failed);
  }

  // the curve, and the pool's fee for the caps
  const curveRead = chain?.curve ?? null;
  const sample = set.slices.find((s) => s.quote);
  let curve = null;
  if (curveRead) {
    const remaining = ((100 - curveRead.progressPct) / 100) * CURVE_TOKENS;
    curve = {
      progressPct: curveRead.progressPct,
      complete: curveRead.complete === true,
      completesWithWhole: !curveRead.complete && whole?.out > 0 && remaining > 0 ? whole.out >= remaining : false,
    };
  } else if (quoting) {
    warnings.push('The curve state was not read: the rule that holds the hour above 90 % progress (docs/moteur.md section 4) is not checked.');
  }
  const fee = resolveFee({
    given: opts.poolFeePct, routes: [...routeLabels], curveRead, marketCapUsd: chain?.marketCapUsd ?? null, unit,
  });
  if (fee.nonCanonical.length) {
    warnings.push(`A quote routes through ${fee.nonCanonical.join(', ')}, not the pump.fun curve or pool alone: another venue may hold depth, so the pool fee is taken as ${fee.pct} % and the caps are tighter. Check the route in Jupiter before each swap (and a swap through another pool brings the station nothing in creator fees).`);
  }
  let hour = quoting && toBuyCents > 0 && whole?.out > 0 && sample
    ? hourCheck({
      buyback: toBuyCents / 100,
      slice: { spent: sample.spent, out: sample.quote.out },
      whole: { spent: toBuyCents / 100, out: whole.out, impactPct: whole.impactPct },
      poolFeePct: fee.pct,
      feeSource: fee.source,
    })
    : null;

  // apply the hour: --hour-cap (H = min(B, 0.8 × f × x), or 0 on the curve rule) or --hour <amount>
  let applied = null;
  if (opts.hourCap && toBuyCents > 0) {
    const hold = curve && curve.complete === false && (curve.progressPct > CURVE_HOLD_PCT || curve.completesWithWhole);
    let capCents;
    let why;
    if (hold) {
      capCents = 0;
      why = 'The curve rule sets the hour to 0 (docs/moteur.md section 4, rule 1).';
    } else if (!hour || hour.cap === null) {
      capCents = 0;
      why = 'The depth of the pool could not be read from the quotes, so the rule sets the hour to 0 (docs/moteur.md section 4, rule 1): run again, or choose the hour with --hour <amount>.';
      warnings.push('--hour-cap: the depth of the pool could not be read from the quotes, so the hour is 0 and the whole buyback goes in `unspent`. Run the order again, or choose the hour with --hour <amount>.');
    } else {
      capCents = Math.min(toBuyCents, Math.round(hour.cap * 100));
      why = `H = min(B, ${HOUR_CAP_FACTOR} × f × x), with a quote-side depth x of about ${money(hour.depth, 0)} and f = ${hour.poolFeePct} % (${hour.feeSource}).`;
    }
    if (capCents < toBuyCents) {
      hourCents = capCents;
      applied = { mode: 'cap', hour: capCents / 100, rest: (toBuyCents - capCents) / 100, buyback: toBuyCents / 100, why };
    } else {
      warnings.push(`--hour-cap: the cap is not below the ${money(toBuyCents / 100)} to buy, so the whole buyback is bought in the hour.`);
    }
  } else if (givenHourCents !== null && givenHourCents < toBuyCents) {
    const cap = hour?.cap ?? null;
    applied = {
      mode: 'given',
      hour: givenHourCents / 100,
      rest: (toBuyCents - givenHourCents) / 100,
      buyback: toBuyCents / 100,
      why: cap === null ? 'The cap could not be worked out from the quotes, so the hour is not checked against it.'
        : givenHourCents / 100 > cap ? `This is above the cap of ${money(cap)} (H = min(B, ${HOUR_CAP_FACTOR} × f × x)): the hour can be front-run.`
          : `This is within the cap of ${money(cap)} (H = min(B, ${HOUR_CAP_FACTOR} × f × x)).`,
    };
  }
  // the cap applied: the slices are rebuilt from H, and quoted again at their new size
  if (applied?.mode === 'cap') {
    set = sliceSet(hourCents);
    if (set.count > 0) summarize(set, await quoteSlices(set));
    else { quotes.status = 'skipped'; quotes.note = 'Nothing is bought this Saturday.'; }
  }
  if (hour && applied) hour = { ...hour, hour: applied.hour, rest: applied.rest, applied: applied.mode };

  const slices = set.slices;
  const count = set.count;
  const impacts = slices.filter((s) => s.quote).map((s) => s.quote.impactPct);
  const worst = impacts.length ? Math.max(...impacts) : null;
  const maxImpactPct = opts.maxImpactPct ?? sliceLimitPct(fee.pct);

  const recommendation = recommend({
    count,
    buybackCents: hourCents,
    minSliceCents: minSlice ? Math.round(minSlice * 100) : null,
    maxImpactPct,
    worstImpactPct: worst,
    hour,
    curve,
    applied,
  });
  if (quotes.status === 'partial') recommendation.reason += ' Some quotes are missing: the check covers only the others.';

  // what is not bought this Saturday is carried; the team waits while that is more than a week's buyback
  const carryOutCents = toBuyCents - hourCents;
  const teamDueCents = Math.round(split.team * 100) + carriedCents.team;
  const teamWaits = carryOutCents > buybackCents && teamDueCents > 0;
  if (teamDueCents > 0 && !addr(live, 'team')) {
    warnings.push('No team wallet is published in public/live.json (`wallets.team`): the team\'s payout cannot be checked against the chain. Publish it, and say so on the fiche, before the first plein.');
  }
  const notes = [];
  if (applied && carryOutCents > 0) {
    notes.push(typo(applied.mode === 'cap'
      ? `Rachat plafonné pour l’heure : ${fr2(applied.hour)} ${unit} achetés samedi, ${fr2(applied.rest)} ${unit} reportés au samedi suivant, hors partage.`
      : `Rachat limité à ${fr2(applied.hour)} ${unit} pour l’heure ; ${fr2(applied.rest)} ${unit} reportés au samedi suivant, hors partage.`));
  }
  if (teamWaits) notes.push(typo('Part de l’équipe gardée au réservoir tant que le reliquat dépasse un rachat hebdomadaire.'));

  const pad = String(n).padStart(3, '0');
  const draft = {
    n,
    at: parisIso(atMs),
    diesel: { price, week: config.official.weekLabel, source: config.official.source },
    unit,
    reservoir: balanceCents / 100,
    fees: feesCents / 100,
    carried: { aid: carriedCents.aid / 100, buyback: carriedCents.buyback / 100, team: carriedCents.team / 100 },
    ratePct: split.ratePct,
    buyback: split.buyback,
    aid: split.aid,
    team: split.team,
    slices: slices.map((s) => ({ sig: null, spent: s.spent, bought: null })),
    unspent: carryOutCents / 100,
    burn: count > 0 ? { sig: null, amount: null } : null,
    aidTransfer: split.aid + carriedCents.aid / 100 > 0 ? { sig: null } : null,
    teamTransfer: teamDueCents > 0 && !teamWaits ? { sig: null } : null,
    claim: { sig: null },
    notes,
  };

  const order = {
    version: 3,
    generatedAt: new Date(now).toISOString(),
    n,
    at: draft.at,
    unit,
    diesel: draft.diesel,
    reservoir: draft.reservoir,
    reservoirSource: source,
    fees: draft.fees,
    carried: draft.carried,
    carriedFrom: prior.from,
    toBuy: toBuyCents / 100,
    hourBuy: hourCents / 100,
    carryOut: carryOutCents / 100,
    teamWaits,
    split,
    mint,
    params: { slices: count, maxImpactPct, slippageBps, minSlice, hourCap: opts.hourCap === true, hour: givenHourCents === null ? null : givenHourCents / 100 },
    poolFee: { pct: fee.pct, source: fee.source, routes: [...routeLabels] },
    quotes,
    slices,
    whole,
    worstImpactPct: worst,
    hour,
    applied,
    curve,
    recommendation,
    warnings,
    files: { json: `plein-${pad}.json`, markdown: `plein-${pad}.md`, draft: `plein-${pad}-draft.json` },
    draft,
  };
  order.checklist = buildChecklist(order, live);
  return order;
}

/** The order as Markdown, for the GitHub job summary and the founders' Telegram ops chat. */
export function renderMarkdown(o) {
  const L = [];
  const p = paris(Date.parse(o.at));
  const carriedTotal = o.carried.aid + o.carried.buyback + o.carried.team;
  L.push(`# Plein #${o.n} · Saturday ${z2(p.d)}/${z2(p.m)}/${p.y} 18:00 Paris`);
  L.push('');
  L.push('Purchase order. Nothing here is signed or sent: the founders run each step by hand in the multisig.');
  L.push('');
  L.push(`- Diesel ${o.diesel.price} €/L (${o.diesel.source}) gives a buyback rate of **${o.split.ratePct} %**.`);
  L.push(`- Réservoir: **${money(o.reservoir)} ${o.unit}**${o.reservoirSource.kind === 'chain' ? ` (chain reading of ${o.reservoirSource.asOf ?? 'unknown time'})` : ' (given)'}.`);
  if (carriedTotal > 0) {
    L.push(`- Carried from earlier weeks${o.carriedFrom ? ` (ticket #${o.carriedFrom})` : ''}: aid ${money(o.carried.aid)} · buyback ${money(o.carried.buyback)} · team ${money(o.carried.team)}. These are not split again. **This week's fees: ${money(o.fees)} ${o.unit}.**`);
  } else {
    L.push(`- Nothing carried from earlier weeks: this week's fees are the whole balance.`);
  }
  L.push(`- Split of the fees: buyback and burn **${money(o.split.buyback)}** · food aid **${money(o.split.aid)}** · team **${money(o.split.team)}** ${o.unit}.`);
  L.push(`- To buy this Saturday: **${money(o.toBuy)} ${o.unit}**${o.carried.buyback > 0 ? ` (the week's buyback plus ${money(o.carried.buyback)} unspent from before)` : ''}.`);
  if (o.carryOut > 0) L.push(`- Bought in the hour: **${money(o.hourBuy)} ${o.unit}**; **${money(o.carryOut)}** goes in \`unspent\`, carried to the next Saturday and never split again${o.teamWaits ? ' (the team\'s share waits: rule 6)' : ''}.`);
  L.push(`- Contract: ${o.mint ?? 'none yet'}.`);
  L.push('');
  if (o.slices.length) {
    L.push(`## ${o.slices.length} slices`);
    L.push('');
    L.push(`| # | Paris | Spend (${o.unit}) | $PLEIN expected | Impact | Route |`);
    L.push('| ---: | --- | ---: | ---: | ---: | --- |');
    for (const s of o.slices) {
      const q = s.quote;
      L.push(`| ${s.i} | ${s.at.slice(11, 16)} | ${money(s.spent)} | ${q ? money(q.out, 2) : '-'} | ${q ? `${q.impactPct} %` : '-'} | ${q ? (q.routes.join(', ') || '-') : (s.quoteNote ?? '-')} |`);
    }
    L.push('');
    if (o.quotes.status === 'skipped') L.push(`No quotes: ${o.quotes.note}`);
    else if (o.quotes.note) L.push(`Quotes: ${o.quotes.note}`);
    L.push('Quotes are indicative and taken now, each against the same pool state: they ignore the effect of the slices before them and of other traders.');
    if (o.whole?.impactPct !== undefined && (o.slices.length > 1 || o.carryOut > 0)) L.push(`All ${money(o.toBuy)} ${o.unit} in one swap would move the price ${o.whole.impactPct} %.`);
    else if (o.whole?.unavailable) L.push(`Whole-buyback quote unavailable: ${o.whole.unavailable}.`);
    L.push('');
  }
  L.push(`## Impact check (threshold ${o.params.maxImpactPct} % per slice, ${hourLimitPct(o.poolFee.pct)} % for the hour, pool fee ${o.poolFee.pct} %)`);
  L.push('');
  L.push(`**${o.recommendation.action}**: ${o.recommendation.reason}`);
  L.push('');
  L.push(`Pool fee f = ${o.poolFee.pct} % (${o.poolFee.source}); the limits above follow it: a slice may move the price by min(1 %, ${HOUR_CAP_FACTOR} × f), the hour by f / (1 − f)².`);
  if (o.hour) {
    L.push('');
    L.push(`Hour (docs/moteur.md section 4): B = ${money(o.hour.buyback)} ${o.unit} to buy; quote-side depth of the pool about ${o.hour.depth === null ? 'n/a' : money(o.hour.depth, 0)} (${o.hour.depthRatio === null ? 'n/a' : money(o.hour.depthRatio, 0)} from the price of a slice against the whole, ${o.hour.depthImpact === null ? 'n/a' : money(o.hour.depthImpact, 0)} from the whole's impact; the smaller counts); B/x ${o.hour.bOverXPct ?? 'n/a'} %; price lift if all of B were bought in the hour about ${o.hour.liftPct ?? 'n/a'} %; pool fee f ${o.hour.poolFeePct} % (${o.hour.feeSource}); H = min(B, ${HOUR_CAP_FACTOR} × f × x) = ${money(o.hour.hour)}, rest ${money(o.hour.rest)}. Slicing the hour does not lower its lift.`);
  }
  if (o.curve) {
    L.push('');
    L.push(`Bonding curve: ${o.curve.complete ? 'migrated to the pool' : `${o.curve.progressPct} % sold${o.curve.completesWithWhole ? ', and this buyback would complete it' : ''}`}.`);
  }
  L.push('');
  L.push('## Checklist');
  L.push('');
  for (const s of o.checklist) L.push(`- [ ] **${s.time}** ${s.text}`);
  if (o.warnings.length) {
    L.push('');
    L.push('## Warnings');
    L.push('');
    for (const w of o.warnings) L.push(`- ${w}`);
  }
  L.push('');
  L.push(`Ticket draft: \`${o.files.draft}\`. Fill the signatures, then \`npm run ticket\`.`);
  return L.join('\n');
}

/** Writes the order (JSON and Markdown) and the ticket draft into `dir`. Returns the paths. */
export function writeOrder(order, dir) {
  mkdirSync(dir, { recursive: true });
  const paths = {
    json: join(dir, order.files.json), markdown: join(dir, order.files.markdown), draft: join(dir, order.files.draft),
  };
  writeFileSync(paths.json, `${JSON.stringify(order, null, 2)}\n`);
  writeFileSync(paths.markdown, `${renderMarkdown(order)}\n`);
  writeFileSync(paths.draft, `${JSON.stringify(order.draft, null, 2)}\n`);
  return paths;
}

const FLAGS_WITH_VALUE = new Set(['reservoir', 'mint', 'slices', 'max-impact', 'min-slice', 'at', 'out', 'tickets', 'hour', 'carried-aid', 'carried-buyback', 'carried-team']);
const BOOLEAN_FLAGS = new Set(['from-chain', 'markdown', 'json', 'no-write', 'no-quotes', 'allow-unclaimed', 'hour-cap', 'no-previous-ticket', 'force-carried', 'help']);

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`);
    const name = a.slice(2);
    if (BOOLEAN_FLAGS.has(name)) args[name] = true;
    else if (FLAGS_WITH_VALUE.has(name)) {
      if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
      args[name] = argv[++i];
    } else throw new Error(`unknown option: --${name}`);
  }
  return args;
}

const HELP = `usage: node scripts/plein.mjs (--reservoir <amount> | --from-chain) [--markdown | --json]
  --reservoir <amt>  the balance of the réservoir (this week's fees plus what earlier weeks left)
  --from-chain       read the balance on Solana; refuses while the creator vault holds a material amount of unclaimed fees
  --allow-unclaimed  with --from-chain, show the order anyway (it splits too little)
  --slices <n>       number of slices, 1 to ${MAX_SLICES} (default ${SLICES})
  --max-impact <pct> price impact per slice that triggers a warning (default: the smaller of ${DEFAULT_MAX_IMPACT_PCT} and 0.8 x the pool fee)
  --hour-cap         buy only H = min(B, 0.8 x f x x) in the hour, from the depth the quotes show; the rest goes in unspent
                     (docs/moteur.md section 4, option A'; use it only if the fiche says the hour is capped)
  --hour <amt>       buy this much in the hour; the rest goes in unspent
  --min-slice <amt>  smallest worthwhile slice (default ${DEFAULT_MIN_SLICE.USDC} USDC)
  --mint <address>   quote another coin, for tests only
  --at <ISO>         the plein time, Saturday 18:00 Paris (default: the plein under way, else the next)
  --carried-aid | --carried-buyback | --carried-team <amt>
                     lower what the last published ticket says earlier weeks left (a payout made since); a higher
                     figure is refused unless --force-carried
  --no-previous-ticket   plein n > 1 with no ticket n-1 published: see the order anyway (it left nothing)
  --tickets <dir>    where the published tickets are read (default public/tickets; or PLEIN_TICKETS_DIR)
  --out <dir>        where the files go (default out)
  --no-write, --no-quotes
Reads and computes only: nothing is signed or sent.`;

export async function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (e) { console.error(`${e.message}\n\n${HELP}`); return 1; }
  if (args.help) { console.log(HELP); return 0; }
  try {
    const num = (v, label) => { const x = Number(v); if (!Number.isFinite(x)) throw new RangeError(`${label} must be a number`); return x; };
    const carried = {};
    for (const key of ['aid', 'buyback', 'team']) if (args[`carried-${key}`] !== undefined) carried[key] = args[`carried-${key}`];
    const order = await buildOrder({
      reservoir: args.reservoir,
      fromChain: args['from-chain'],
      allowUnclaimed: args['allow-unclaimed'],
      carried,
      forceCarried: args['force-carried'],
      noPreviousTicket: args['no-previous-ticket'],
      hourCap: args['hour-cap'],
      hour: args.hour,
      ticketsDir: args.tickets ?? (process.env.PLEIN_TICKETS_DIR || undefined),
      mint: args.mint,
      at: args.at,
      slices: args.slices !== undefined ? num(args.slices, '--slices') : undefined,
      maxImpactPct: args['max-impact'] !== undefined ? num(args['max-impact'], '--max-impact') : undefined,
      minSlice: args['min-slice'] !== undefined ? num(args['min-slice'], '--min-slice') : undefined,
      noQuotes: args['no-quotes'],
    });
    if (!args['no-write']) {
      const paths = writeOrder(order, args.out ?? join(root, 'out'));
      console.error(`written: ${Object.values(paths).join(', ')}`);
    }
    console.log(args.json ? JSON.stringify(order, null, 2) : renderMarkdown(order));
    return 0;
  } catch (e) {
    console.error(`plein: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
