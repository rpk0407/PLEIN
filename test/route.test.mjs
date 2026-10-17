// The pump's self-test (public/js/route.js), offline. The answers below were recorded from Jupiter's
// free quote endpoint (lite-api.jup.ag/swap/v1/quote, 10 USDC in) on Saturday 17 October 2026, about
// 09:30 Paris, with one long field of no interest dropped (mostReliableAmmsQuoteReport):
//   curve        a USDC-quoted pump.fun coin still on its curve (a third party's, not $PLEIN)
//   other        USDC to wrapped SOL, routed through two other venues
//   notTradable  an address that is not a coin
// Every other case is built from those by hand and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_ROUTE, DEFAULT_QUOTE_URL, MIN_GAP_MS, NO_ROUTE_CODES, PLATE_LEAD, RETRY_MS, TEST_AMOUNT_RAW, TIMEOUT_MS, UNVERIFIED_NOTE,
  buildQuoteUrl, pumpStateFor, quoteEndpoint, readQuote, routeLine, testRoute,
} from '../public/js/route.js';
import { CANONICAL_ROUTE as PLEIN_CANONICAL_ROUTE } from '../scripts/plein.mjs';
import { NBSP, typo } from '../public/js/typo.js';

const RECORDED = {
  "curve": {
    "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "inAmount": "10000000",
    "outputMint": "9rzrvz9UZjZma5fDNpa5nVefPD5URqmBzdbhZ9w5pump",
    "outAmount": "620930129998",
    "otherAmountThreshold": "614720828699",
    "swapMode": "ExactIn",
    "slippageBps": 100,
    "platformFee": null,
    "priceImpactPct": "0.0120182661378231006718035343",
    "routePlan": [
      {
        "swapInfo": {
          "ammKey": "7XHb85msCbUXBHu8LGWzRZUdMtAwKAYjnwpkW29ndE55",
          "label": "Pump.fun",
          "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "outputMint": "9rzrvz9UZjZma5fDNpa5nVefPD5URqmBzdbhZ9w5pump",
          "inAmount": "10000000",
          "outAmount": "620930129998",
          "updateContextSlot": "457954742"
        },
        "percent": 100,
        "bps": null
      }
    ],
    "contextSlot": 457954769,
    "timeTaken": 0.000067178,
    "swapUsdValue": "9.995878024295910",
    "longtailMarketQuoteReport": null,
    "useIncurredSlippageForQuoting": null,
    "useRewards": null,
    "otherRoutePlans": null,
    "loadedLongtailToken": false,
    "instructionVersion": null,
    "transactionVersion": 0
  },
  "other": {
    "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "inAmount": "10000000",
    "outputMint": "So11111111111111111111111111111111111111112",
    "outAmount": "95207326",
    "otherAmountThreshold": "94255253",
    "swapMode": "ExactIn",
    "slippageBps": 100,
    "platformFee": null,
    "priceImpactPct": "0.0000070156069836273856790763",
    "routePlan": [
      {
        "swapInfo": {
          "ammKey": "8sjV1AqBFvFuADBCQHhotaRq5DFFYSjjg1jMyVWMqXvZ",
          "label": "Manifest",
          "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "outputMint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
          "inAmount": "10000000",
          "outAmount": "10012856",
          "updateContextSlot": "457954381"
        },
        "percent": 100,
        "bps": null
      },
      {
        "swapInfo": {
          "ammKey": "22HUWiJaTNph96KQTKZVy2wg8KzfCems5nyW7E5H5J6w",
          "label": "PancakeSwap",
          "inputMint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
          "outputMint": "So11111111111111111111111111111111111111112",
          "inAmount": "10012856",
          "outAmount": "95207326",
          "updateContextSlot": "457954381"
        },
        "percent": 100,
        "bps": null
      }
    ],
    "contextSlot": 457954393,
    "timeTaken": 0.001367283,
    "swapUsdValue": "9.9957085931085382360918",
    "longtailMarketQuoteReport": null,
    "useIncurredSlippageForQuoting": null,
    "useRewards": null,
    "otherRoutePlans": null,
    "loadedLongtailToken": false,
    "instructionVersion": null,
    "transactionVersion": 0
  },
  "notTradable": {
    "error": "The token TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA is not tradable",
    "errorCode": "TOKEN_NOT_TRADABLE"
  }
};

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CURVE_MINT = RECORDED.curve.outputMint;
const show = (s) => s.replaceAll(NBSP, '~');

test('the test swap is 10 USDC with a 1 % slippage cap, a 6 s deadline and a minute between tries', () => {
  assert.equal(TEST_AMOUNT_RAW, '10000000');
  assert.equal(TIMEOUT_MS, 6000);
  assert.equal(RETRY_MS, 60000);
  assert.ok(MIN_GAP_MS >= 10000 && MIN_GAP_MS < RETRY_MS, 'the free endpoint allows about five calls per ten seconds');
  const url = new URL(buildQuoteUrl({ inputMint: USDC, outputMint: CURVE_MINT }));
  assert.equal(`${url.origin}${url.pathname}`, DEFAULT_QUOTE_URL);
  assert.deepEqual(Object.fromEntries(url.searchParams), { inputMint: USDC, outputMint: CURVE_MINT, amount: '10000000', slippageBps: '100' });
});

test('a mint that is not an address never reaches the request', () => {
  assert.throws(() => buildQuoteUrl({ inputMint: USDC, outputMint: '' }), RangeError);
  assert.throws(() => buildQuoteUrl({ inputMint: USDC, outputMint: 'publié ici samedi' }), RangeError);
  assert.throws(() => buildQuoteUrl({ inputMint: 'x', outputMint: CURVE_MINT }), RangeError);
});

test('the endpoint override is taken only on a Jupiter host over https', () => {
  assert.equal(quoteEndpoint(undefined), DEFAULT_QUOTE_URL);
  assert.equal(quoteEndpoint(''), DEFAULT_QUOTE_URL);
  assert.equal(quoteEndpoint('https://api.jup.ag/swap/v1/quote'), 'https://api.jup.ag/swap/v1/quote');
  assert.equal(quoteEndpoint('https://lite-api.jup.ag/swap/v1/quote?inputMint=x#y'), 'https://lite-api.jup.ag/swap/v1/quote', 'its own query is dropped');
  for (const bad of ['http://lite-api.jup.ag/swap/v1/quote', 'https://jup.ag.evil.example/quote', 'https://evil-jup.ag/quote',
    'https://user:pass@lite-api.jup.ag/quote', 'not a url', 42, null, {}]) {
    assert.equal(quoteEndpoint(bad), DEFAULT_QUOTE_URL, String(bad));
  }
});

test('recorded: a curve coin is routed through pump.fun alone', () => {
  const r = readQuote(200, RECORDED.curve, { outputMint: CURVE_MINT, inputMint: USDC });
  assert.deepEqual(r, { state: 'route', labels: ['Pump.fun'], canonical: true });
});

test('recorded: a route through other venues is a route, but not the station\'s', () => {
  const r = readQuote(200, RECORDED.other, { outputMint: RECORDED.other.outputMint, inputMint: USDC });
  assert.deepEqual(r, { state: 'route', labels: ['Manifest', 'PancakeSwap'], canonical: false });
});

test('recorded: an address that is not a coin has no route', () => {
  const r = readQuote(400, RECORDED.notTradable, { outputMint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' });
  assert.deepEqual(r, { state: 'none', reason: 'TOKEN_NOT_TRADABLE' });
});

test('built by hand: "no route" needs Jupiter\'s own word for it', () => {
  const asked = { outputMint: CURVE_MINT, inputMint: USDC };
  // Jupiter's codes for a pair with no path, each as the recorded answer has them
  for (const errorCode of NO_ROUTE_CODES) {
    assert.deepEqual(readQuote(400, { error: 'No path for this pair', errorCode }, asked), { state: 'none', reason: errorCode }, errorCode);
  }
  assert.equal(readQuote(400, { error: 'Could not find any route', errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, asked).state, 'none');
  // the code alone, in the error field, is the same word
  assert.equal(readQuote(400, { error: 'COULD_NOT_FIND_ANY_ROUTE' }, asked).state, 'none');
  // a quote of exactly nothing is no route
  assert.deepEqual(readQuote(200, { ...RECORDED.curve, outAmount: '0' }, asked), { state: 'none', reason: 'empty quote' });
  // any other error is Jupiter changing or refusing the request, which says nothing about the coin:
  // a bad parameter, a key now required, a missing path, an unknown code
  assert.deepEqual(readQuote(400, { error: 'Invalid amount' }, asked), { state: 'unreachable', reason: 'HTTP 400' });
  assert.deepEqual(readQuote(400, { error: 'Query parameter amount cannot be parsed', errorCode: 'INVALID_REQUEST' }, asked), { state: 'unreachable', reason: 'HTTP 400' });
  assert.deepEqual(readQuote(401, { error: 'Unauthorized' }, asked), { state: 'unreachable', reason: 'HTTP 401' });
  assert.deepEqual(readQuote(403, { error: 'Forbidden' }, asked), { state: 'unreachable', reason: 'HTTP 403' });
  assert.deepEqual(readQuote(404, { error: 'Not found', errorCode: 'NOT_FOUND' }, asked), { state: 'unreachable', reason: 'HTTP 404' });
  assert.deepEqual(readQuote(404, { message: 'Not found' }, asked), { state: 'unreachable', reason: 'HTTP 404' });
  assert.deepEqual(readQuote(410, { error: 'This endpoint has been retired' }, asked), { state: 'unreachable', reason: 'HTTP 410' });
  // a quote with no amount, or an amount that is not a number, is not Jupiter saying "nothing": it is not a quote
  assert.equal(readQuote(200, { ...RECORDED.curve, outAmount: 'lots' }, asked).state, 'unreachable');
  assert.equal(readQuote(200, { ...RECORDED.curve, outAmount: undefined }, asked).state, 'unreachable');
  assert.equal(readQuote(200, {}, asked).state, 'unreachable');
  // rate limit and server trouble: not an answer about the route, even with a no-route code in the body
  assert.equal(readQuote(429, { error: 'Too many requests', errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, asked).state, 'unreachable');
  assert.deepEqual(readQuote(429, { error: 'Too many requests', errorCode: 'RATE_LIMITED' }, asked), { state: 'unreachable', reason: 'HTTP 429' });
  assert.deepEqual(readQuote(429, null, asked), { state: 'unreachable', reason: 'HTTP 429' });
  assert.deepEqual(readQuote(502, null, asked), { state: 'unreachable', reason: 'HTTP 502' });
  assert.deepEqual(readQuote(500, { error: 'boom' }, asked), { state: 'unreachable', reason: 'HTTP 500' });
  for (const body of [undefined, null, 'x', 7, [], [RECORDED.curve]]) assert.equal(readQuote(200, body, asked).state, 'unreachable');
  assert.equal(readQuote(204, RECORDED.curve, asked).state, 'unreachable', 'only a 200 carries a quote');
});

test('a reply that is not the swap asked for is not a route', () => {
  const asked = { outputMint: CURVE_MINT, inputMint: USDC };
  assert.equal(readQuote(200, RECORDED.curve, { ...asked, outputMint: RECORDED.other.outputMint }).state, 'unreachable', 'another coin');
  assert.equal(readQuote(200, { ...RECORDED.curve, inAmount: '1000000' }, asked).state, 'unreachable', 'another amount');
  assert.equal(readQuote(200, RECORDED.curve, { ...asked, inputMint: RECORDED.other.outputMint }).state, 'unreachable', 'another input');
});

test('labels are cleaned, capped and never trusted for markup', () => {
  const plan = (...labels) => ({ ...RECORDED.curve, routePlan: labels.map((label) => ({ swapInfo: { label }, percent: 100 })) });
  const asked = { outputMint: CURVE_MINT };
  assert.deepEqual(readQuote(200, plan(), asked), { state: 'route', labels: [], canonical: null }, 'no labels: a route, no claim about fees');
  assert.deepEqual(readQuote(200, { ...RECORDED.curve, routePlan: 'x' }, asked), { state: 'route', labels: [], canonical: null });
  assert.deepEqual(readQuote(200, plan('Pump.fun', 'Pump.fun'), asked).labels, ['Pump.fun'], 'duplicates collapse');
  assert.deepEqual(readQuote(200, plan(null, 7, '', '  ', 'Orca'), asked).labels, ['Orca']);
  assert.equal(readQuote(200, plan('Pump.fun\u0000\u001B[31m'), asked).labels[0], 'Pump.fun[31m', 'control characters are dropped');
  assert.equal(readQuote(200, plan('x'.repeat(100)), asked).labels[0].length, 32);
  assert.equal(readQuote(200, plan('a', 'b', 'c', 'd', 'e', 'f'), asked).labels.length, 4);
  // a label that mimics pump.fun inside a longer one is another venue
  assert.equal(readQuote(200, plan('Pump.fun Clone'), asked).canonical, false);
  assert.equal(readQuote(200, plan('Pump.fun', 'Raydium'), asked).canonical, false, 'one other venue is enough');
});

test('the canonical labels are the ones scripts/plein.mjs counts for the station', () => {
  assert.equal(CANONICAL_ROUTE.source, PLEIN_CANONICAL_ROUTE.source);
  assert.equal(CANONICAL_ROUTE.flags, PLEIN_CANONICAL_ROUTE.flags);
  for (const yes of ['Pump.fun', 'Pump.fun Amm', 'PumpSwap', 'Pump', 'pumpfun', 'Pump.fun AMM']) assert.ok(CANONICAL_ROUTE.test(yes), yes);
  for (const no of ['Raydium', 'Orca (Whirlpools)', 'Meteora DLMM', 'Pump.fun Clone', 'Pumpkin', '']) assert.ok(!CANONICAL_ROUTE.test(no), no);
});

// ---------------------------------------------------------------- the request, on a stubbed fetch

const reply = (status, body) => ({ status, json: async () => (body instanceof Error ? Promise.reject(body) : body) });
const sample = { outputMint: CURVE_MINT, inputMint: USDC, now: () => 1_000 };

test('testRoute asks once, with an Accept header and nothing else, and reads the answer', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([String(url), init]); return reply(200, RECORDED.curve); };
  const r = await testRoute({ ...sample, fetchImpl });
  assert.deepEqual(r, { state: 'route', labels: ['Pump.fun'], canonical: true, at: 1_000 });
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.ok(url.startsWith(`${DEFAULT_QUOTE_URL}?`));
  assert.deepEqual(Object.keys(init.headers), ['accept'], 'a CORS-safelisted header only: no preflight');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.method, undefined, 'a GET');
});

test('testRoute turns no route, a rate limit, a broken body and a dead network into states, never a throw', async () => {
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => reply(400, RECORDED.notTradable) }),
    { state: 'none', reason: 'TOKEN_NOT_TRADABLE', at: 1_000 });
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => reply(429, null) }), { state: 'unreachable', reason: 'HTTP 429', at: 1_000 });
  // a refusal or a vanished endpoint is "could not check", never "no route"
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => reply(403, { error: 'Forbidden' }) }), { state: 'unreachable', reason: 'HTTP 403', at: 1_000 });
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => reply(404, { error: 'Not found' }) }), { state: 'unreachable', reason: 'HTTP 404', at: 1_000 });
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => reply(200, new SyntaxError('Unexpected token <')) }),
    { state: 'unreachable', reason: 'HTTP 200', at: 1_000 });
  assert.deepEqual(await testRoute({ ...sample, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    { state: 'unreachable', reason: 'network', at: 1_000 }); // what a CORS refusal looks like to the page too
  assert.deepEqual(await testRoute({ ...sample, outputMint: '', fetchImpl: async () => assert.fail('no request for a bad mint') }),
    { state: 'unreachable', reason: 'no valid mint to ask about', at: 1_000 });
});

test('testRoute cuts a stalled request at its deadline and aborts it', async () => {
  let signal;
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    signal = init.signal;
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const started = Date.now();
  const r = await testRoute({ ...sample, fetchImpl, timeoutMs: 30 });
  assert.deepEqual(r, { state: 'unreachable', reason: 'timeout', at: 1_000 });
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 2000);
  // a fetch that ignores the signal is cut all the same
  const stuck = await testRoute({ ...sample, fetchImpl: () => new Promise(() => {}), timeoutMs: 30 });
  assert.equal(stuck.reason, 'timeout');
});

test('the override endpoint is the one asked', async () => {
  let asked;
  await testRoute({ ...sample, endpoint: quoteEndpoint('https://api.jup.ag/swap/v1/quote'), fetchImpl: async (url) => { asked = String(url); return reply(200, RECORDED.curve); } });
  assert.ok(asked.startsWith('https://api.jup.ag/swap/v1/quote?'));
});

// ---------------------------------------------------------------- what the pump says

const at = Date.parse('2026-10-17T15:42:00+02:00');

test('the route line: a curve route says what pump.fun takes, attributed to pump.fun until the first ticket', () => {
  const line = routeLine({ labels: ['Pump.fun'], canonical: true, complete: false, attributed: true, at });
  assert.equal(show(typo(line)),
    'Jupiter proposait à 15:42, pour 10~USDC, la route~: Pump.fun. Frais de pump.fun~: 1,25~% sur la courbe, dont 0,30~% pour la station (d’après pump.fun).');
  const after = routeLine({ labels: ['Pump.fun'], canonical: true, complete: false, attributed: false, at });
  assert.ok(!after.includes('d’après'), 'once a ticket has shown the fees, the attribution goes');
  assert.ok(after.endsWith('pour la station.'));
});

test('the route line: a migrated pool follows its tier, the curve figures are not repeated', () => {
  const line = routeLine({ labels: ['Pump.fun Amm'], canonical: true, complete: true, at });
  assert.ok(line.includes('ceux de la pool PumpSwap, selon son palier'));
  assert.ok(!/1,25/.test(line));
});

test('the route line with no chain reading: the labels say which venue, never the curve by default', () => {
  const none = (labels) => routeLine({ labels, canonical: true, complete: null, at });
  const head = (labels) => `Jupiter proposait à 15:42, pour 10 USDC, la route : ${labels.join(' + ')}.`;
  // exactly "Pump.fun" is the curve
  const curve = none(['Pump.fun']);
  assert.ok(curve.includes('1,25') && curve.includes('sur la courbe') && curve.includes('d’après pump.fun'), curve);
  assert.ok(none(['pumpfun']).includes('sur la courbe'));
  // an Amm or Swap label is the pool: the curve's 1,25 % must not be printed for it
  for (const labels of [['Pump.fun Amm'], ['PumpSwap'], ['Pump.fun AMM']]) {
    const pool = none(labels);
    assert.ok(pool.includes('ceux de la pool PumpSwap, selon son palier'), pool);
    assert.ok(!/1,25|sur la courbe/.test(pool), pool);
  }
  // mixed or unclear labels: the route and nothing about fees
  for (const labels of [['Pump.fun', 'Pump.fun Amm'], ['Pump'], ['Pump.fun', 'PumpSwap']]) {
    assert.equal(none(labels), head(labels), labels.join(' + '));
  }
  // the chain reading, when there is one, settles a label that does not say (but not against a label that does)
  assert.ok(routeLine({ labels: ['Pump'], canonical: true, complete: true, at }).includes('pool PumpSwap'));
  assert.ok(routeLine({ labels: ['Pump'], canonical: true, complete: false, at }).includes('sur la courbe'));
  assert.equal(routeLine({ labels: ['Pump.fun'], canonical: true, complete: true, at }), head(['Pump.fun']), 'the reading says migrated, the label says curve: no figure');
  assert.equal(routeLine({ labels: ['Pump.fun Amm'], canonical: true, complete: false, at }), head(['Pump.fun Amm']), 'the reading says curve, the label says pool: no figure');
});

test('the route line: another venue says the station is paid nothing; unknown labels claim nothing', () => {
  const other = routeLine({ labels: ['Raydium', 'Orca'], canonical: false, complete: false, at });
  assert.equal(other, 'Jupiter proposait à 15:42, pour 10 USDC, la route : Raydium + Orca. Un échange passé par une autre pool (pool PumpSwap non officielle, autre DEX) ne rapporte rien à la station.');
  const unknown = routeLine({ labels: [], canonical: null, at });
  assert.equal(unknown, 'Jupiter proposait à 15:42, pour 10 USDC, la route.');
  assert.equal(routeLine({ labels: ['Pump.fun'], canonical: true, complete: false }).startsWith('Jupiter proposait, pour 10 USDC'), true, 'no time, no invented time');
});

test('the plate leads tell apart "no route" from "could not check"', () => {
  assert.equal(PLATE_LEAD.none, 'Jupiter ne dessert pas encore $PLEIN.');
  assert.ok(PLATE_LEAD.unreachable.includes('pas pu être vérifiée'));
  for (const lead of Object.values(PLATE_LEAD)) assert.equal(typo(lead), lead, 'already typeset: nothing to move');
});

test('the pump takes the widget away on evidence only: a doubt sets it up, with a line that says so', () => {
  // Jupiter's route sets the widget up; its word that there is none shows the plate
  assert.equal(pumpStateFor('route'), 'route');
  assert.equal(pumpStateFor('none'), 'waiting');
  // not being able to ask (rate limit shared behind one mobile address, timeout, network, a refusal) is no evidence
  assert.equal(pumpStateFor('unreachable'), 'unverified');
  // the widget's own script failing is the plate too (app.js sets that one itself)
  assert.equal(pumpStateFor('widget'), 'waiting');
  assert.equal(pumpStateFor(undefined), 'waiting');
  // end to end, from the answers: a 429 and a 403 keep the widget, a recorded "not tradable" shows the plate
  const asked = { outputMint: CURVE_MINT, inputMint: USDC };
  assert.equal(pumpStateFor(readQuote(429, { error: 'Too many requests' }, asked).state), 'unverified');
  assert.equal(pumpStateFor(readQuote(403, { error: 'Forbidden' }, asked).state), 'unverified');
  assert.equal(pumpStateFor(readQuote(400, RECORDED.notTradable, asked).state), 'waiting');
  assert.equal(pumpStateFor(readQuote(200, RECORDED.curve, asked).state), 'route');
  // the line under the widget says the route was not checked, claims no route and no fee, and points to the coin's page
  assert.equal(UNVERIFIED_NOTE, 'La route de Jupiter n’a pas pu être vérifiée. Si l’échange ne s’affiche pas, passe par la page pump.fun du jeton.');
  assert.ok(UNVERIFIED_NOTE.startsWith(PLATE_LEAD.unreachable));
  assert.ok(!/proposait|dessert|%/.test(UNVERIFIED_NOTE), 'it says nothing Jupiter did not say');
  assert.equal(typo(UNVERIFIED_NOTE), UNVERIFIED_NOTE, 'already typeset: nothing to move');
});
