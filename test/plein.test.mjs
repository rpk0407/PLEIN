// The Saturday purchase order: split and slice arithmetic to the cent, money carried from earlier
// weeks, Jupiter quotes on a stub, the impact and hour rules (limits that follow the pool's fee, the
// cap on the hour), and the pre-launch and failure paths.
// No network, no clock, no folder of the repository: every test passes its own config, live.json,
// `now`, published tickets, curve reader, chain reader and fetch. The command-line tests run the
// script in a child process with --at and --tickets on an empty temporary folder, so they depend on
// neither the clock nor the tickets published in public/tickets/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitWeek } from '../public/js/formula.js';
import {
  CANONICAL_ROUTE, CURVE_HOLD_PCT, DEFAULT_MAX_IMPACT_PCT, DEFAULT_POOL_FEE_PCT, MAX_SLICES, QUOTE_URL, UNITS, buildOrder, carriedFor,
  defaultPleinAt, dueOf, estimateDepth, fetchQuote, heldOver, hourCheck, hourLimitPct, isPleinInstant, parseArgs, parisIso,
  readPublishedTickets, recommend, renderMarkdown, resolveFee, sliceLimitPct, sliceTimes, splitSlices, toCents,
  unclaimedLevel, writeOrder,
} from '../scripts/plein.mjs';
import { validateTicket } from '../scripts/ticket.mjs';

const script = fileURLToPath(new URL('../scripts/plein.mjs', import.meta.url));
const FAKE_MINT = '11111111111111111111111111111111'; // the system program: a visibly fake placeholder
const FIRST_PLEIN = '2026-10-24T18:00:00+02:00';
const SECOND_PLEIN = '2026-10-31T18:00:00+01:00';
const config = {
  launchAt: '2026-10-17T15:30:00+02:00',
  firstPleinAt: FIRST_PLEIN,
  launchpad: { name: 'pump.fun', quote: 'USDC', coinUrl: 'https://pump.fun/coin/' },
  official: { gazole: 2.356, weekLabel: '2 oct.', source: 'Relevé hebdomadaire officiel du 2 octobre 2026' },
};
// Public program addresses stand in for wallets: well-formed, visibly not anyone's.
const WALLETS = {
  creator: '11111111111111111111111111111111',
  reservoir: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  aid: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  team: 'ComputeBudget111111111111111111111111111111',
  founder1: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  founder2: 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
};
const live = { contract: FAKE_MINT, wallets: WALLETS };
const SATURDAY_AFTERNOON = Date.parse('2026-10-24T15:55:00+02:00');
const SECOND_AFTERNOON = Date.parse('2026-10-31T15:55:00+01:00');
const noSleep = async () => {};
const noCurve = async () => ({ curve: null, marketCapUsd: null, asOf: null });
const curveOf = (curve, marketCapUsd = null) => async () => ({ curve, marketCapUsd, asOf: null });

/**
 * A Jupiter that answers every quote with `impactPct` and a rate of 100 $PLEIN per USDC, through
 * the pump.fun AMM unless `routes` says otherwise.
 */
function stubJupiter({ impactPct = 0.4, fail = null, routes = ['Pump.fun Amm'] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(new URL(url));
    if (fail && fail(calls.length)) return { ok: false, status: 429, json: async () => ({ error: 'rate limited' }) };
    const q = new URL(url).searchParams;
    const inAmount = q.get('amount');
    const outAmount = String(BigInt(inAmount) * 100n); // 6 decimals both sides
    return {
      ok: true,
      status: 200,
      json: async () => ({
        inputMint: q.get('inputMint'), inAmount, outputMint: q.get('outputMint'), outAmount,
        otherAmountThreshold: String((BigInt(outAmount) * 99n) / 100n),
        priceImpactPct: String(impactPct / 100),
        routePlan: routes.flatMap((label) => [{ swapInfo: { label } }, { swapInfo: { label } }]),
      }),
    };
  };
  return { fetchImpl, calls };
}
// By default no published tickets and a curve at 40 % (the bonding curve's own fee, 1.25 %): the
// order never reads the repository's tickets or the network, whatever the founders have published
// since. Tests of an unread curve say so with `readCurve: noCurve`.
const midCurve = curveOf({ progressPct: 40, complete: false });
const orderOf = (extra = {}) => buildOrder({
  config, live, now: SATURDAY_AFTERNOON, reservoir: 3412, sleep: noSleep, pauseMs: 0, tickets: [], readCurve: midCurve, ...extra,
});

/** What plein #1 leaves behind when the aid and team shares stay in the réservoir and 100 USDC is not bought. */
const heldBackTicket = { n: 1, aid: 341.2, team: 1463.75, unspent: 100, carried: { aid: 0, buyback: 0, team: 0 }, aidTransfer: null, teamTransfer: null };
const HELD = { aid: 341.2, buyback: 100, team: 1463.75 };

test('amounts parse to whole cents, floored, in the shapes people paste', () => {
  assert.equal(toCents(3412), 341200);
  assert.equal(toCents('3412.00'), 341200);
  assert.equal(toCents('3 412,00'), 341200);
  assert.equal(toCents('3 412,00'), 341200); // narrow no-break space, as French number formatting writes it
  assert.equal(toCents('3 412,00'), 341200);
  assert.equal(toCents('3 412,5'), 341250);
  assert.equal(toCents(3412.009999), 341200); // floor: never plan to spend more than the balance holds
  assert.equal(toCents('0'), 0);
  for (const bad of ['', 'abc', '-5', '1e3', '1.2.3', '12,345,678', NaN, Infinity, -1]) assert.throws(() => toCents(bad), RangeError, String(bad));
});

test('the buyback splits into slices equal in cents, the last taking the remainder', () => {
  const buybackCents = Math.round(splitWeek(3412, 2.356).buyback * 100);
  assert.equal(buybackCents, 160705);
  const slices = splitSlices(buybackCents, 12);
  assert.equal(slices.length, 12);
  assert.deepEqual(slices.slice(0, 11), Array(11).fill(13392));
  assert.equal(slices[11], 13393);
  assert.equal(slices.reduce((a, b) => a + b, 0), buybackCents);
  assert.deepEqual(splitSlices(1200, 12), Array(12).fill(100));
  assert.deepEqual(splitSlices(0, 12), []);
  assert.deepEqual(splitSlices(5, 1), [5]);
  for (const total of [1, 11, 12, 13, 99, 160705, 999999]) {
    const count = Math.min(12, total);
    const parts = splitSlices(total, count);
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `total ${total}`);
    assert.ok(parts.every((c) => c >= 1), `no empty slice for ${total}`);
  }
  assert.throws(() => splitSlices(5, 12), RangeError);
  assert.throws(() => splitSlices(100, 0), RangeError);
  assert.throws(() => splitSlices(100, MAX_SLICES + 1), RangeError);
  assert.throws(() => splitSlices(-1, 2), RangeError);
});

test('twelve slices start at 18:00, 18:05 ... 18:55 Paris, on either side of the clock change', () => {
  const summer = Date.parse(FIRST_PLEIN);
  const winter = Date.parse(SECOND_PLEIN);
  for (const [start, offset] of [[summer, '+02:00'], [winter, '+01:00']]) {
    const times = sliceTimes(start, 12).map(parisIso);
    const day = parisIso(start).slice(0, 10);
    assert.equal(times[0], `${day}T18:00:00${offset}`);
    assert.equal(times[1], `${day}T18:05:00${offset}`);
    assert.equal(times[11], `${day}T18:55:00${offset}`);
  }
  assert.deepEqual(sliceTimes(summer, 1), [summer]);
  const odd = sliceTimes(summer, 24);
  assert.equal(odd[23] - odd[0], 55 * 60 * 1000);
});

test('only a Saturday at 18:00 Paris is a plein, and the order is for the plein under way or the next', () => {
  assert.equal(isPleinInstant(Date.parse(FIRST_PLEIN)), true);
  assert.equal(isPleinInstant(Date.parse(SECOND_PLEIN)), true);
  assert.equal(isPleinInstant(Date.parse('2026-10-24T18:00:00+01:00')), false); // wrong offset is another instant
  assert.equal(isPleinInstant(Date.parse('2026-10-25T18:00:00+01:00')), false); // a Sunday
  assert.equal(isPleinInstant(Date.parse('2026-10-24T18:05:00+02:00')), false);
  assert.equal(isPleinInstant(NaN), false);
  assert.equal(parisIso(Date.parse('2026-10-24T16:00:00Z')), FIRST_PLEIN);
  const first = Date.parse(FIRST_PLEIN);
  assert.equal(defaultPleinAt(Date.parse('2026-10-17T01:00:00+02:00'), first), first, 'never before the first plein');
  assert.equal(defaultPleinAt(Date.parse('2026-10-24T18:05:00+02:00'), first), first, 'a run at 18:05 is for tonight');
  assert.equal(defaultPleinAt(Date.parse('2026-10-24T19:30:00+02:00'), first), Date.parse(SECOND_PLEIN));
});

test('the example week: 3 412,00 at 2,356 gives the published split and 12 exact slices', async () => {
  const quotes = stubJupiter();
  const order = await orderOf({ fetchImpl: quotes.fetchImpl });
  assert.equal(order.n, 1);
  assert.equal(order.at, FIRST_PLEIN);
  assert.deepEqual(order.split, splitWeek(3412, 2.356));
  assert.deepEqual([order.split.buyback, order.split.aid, order.split.team, order.split.ratePct], [1607.05, 341.2, 1463.75, 47.1]);
  assert.equal(order.slices.length, 12);
  assert.deepEqual(order.slices.map((s) => s.at.slice(11, 16)), ['18:00', '18:05', '18:10', '18:15', '18:20', '18:25', '18:30', '18:35', '18:40', '18:45', '18:50', '18:55']);
  assert.equal(order.slices[0].spent, 133.92);
  assert.equal(order.slices[11].spent, 133.93);
  assert.equal(order.slices.reduce((a, s) => a + Math.round(s.spent * 100), 0), 160705);
  assert.equal(order.toBuy, 1607.05);
  assert.deepEqual(order.carried, { aid: 0, buyback: 0, team: 0 });
  assert.equal(order.fees, 3412);
  assert.match(renderMarkdown(order), /Plein #1/);
});

test('the same amount in different shapes gives the same order; the sub-cent dust stays behind', async () => {
  const a = await orderOf({ reservoir: '3 412,009', noQuotes: true });
  const b = await orderOf({ reservoir: 3412, noQuotes: true });
  assert.equal(a.reservoir, 3412);
  assert.deepEqual(a.split, b.split);
});

test('one Jupiter quote per slice plus one for the whole, asking the right swap', async () => {
  const quotes = stubJupiter({ impactPct: 0.4 });
  const order = await orderOf({ fetchImpl: quotes.fetchImpl });
  assert.equal(quotes.calls.length, 13);
  const first = quotes.calls[0];
  assert.equal(first.origin + first.pathname, QUOTE_URL);
  assert.equal(first.searchParams.get('inputMint'), UNITS.USDC.mint);
  assert.equal(first.searchParams.get('outputMint'), FAKE_MINT);
  assert.equal(first.searchParams.get('amount'), String(13392 * 10000)); // 133.92 USDC at 6 decimals
  assert.equal(first.searchParams.get('slippageBps'), '100');
  assert.equal(quotes.calls[11].searchParams.get('amount'), String(13393 * 10000));
  assert.equal(quotes.calls[12].searchParams.get('amount'), String(160705 * 10000));
  assert.equal(order.quotes.status, 'ok');
  const q = order.slices[0].quote;
  assert.equal(q.out, 13392 * 10000 * 100 / 1e6);
  assert.equal(q.impactPct, 0.4);
  assert.deepEqual(q.routes, ['Pump.fun Amm']); // each route label once
  assert.equal(q.minOut, q.out * 0.99);
  assert.equal(order.whole.impactPct, 0.4);
  assert.equal(order.worstImpactPct, 0.4);
  assert.equal(order.recommendation.action, 'ok');
  assert.equal(order.hour.capped, false);
});

test('when the whole hour would move the pool too much, the advice is a cap on the hour, not more slices', async () => {
  const order = await orderOf({ fetchImpl: stubJupiter({ impactPct: 2.4 }).fetchImpl });
  assert.equal(DEFAULT_MAX_IMPACT_PCT, 1);
  assert.equal(order.recommendation.action, 'hour-cap-needed');
  assert.equal(order.recommendation.slices, undefined, 'more slices would not lower the lift of the hour');
  assert.match(order.recommendation.reason, /twelve slices end at the same price as one buy/);
  assert.match(order.recommendation.reason, /not applied by this script|is not applied by this script/);
  assert.equal(order.hour.capped, true);
  assert.equal(order.hour.wholeImpactPct, 2.4);
  const depth = (1607.05 * (1 - 0.024)) / 0.024; // B (1 - i) / i, the depth the whole's own impact implies
  assert.equal(order.hour.depth, Math.round(depth));
  assert.ok(Math.abs(order.hour.cap - 0.8 * 0.0125 * depth) < 0.01, `cap ${order.hour.cap}`);
  assert.equal(order.hour.hour, order.hour.cap);
  assert.ok(Math.abs(order.hour.rest - (1607.05 - order.hour.cap)) < 0.011);
  assert.equal(order.hour.poolFeePct, 1.25, "the curve's own fee");
  assert.equal(order.hour.impactLimitPct, hourLimitPct(1.25));
  assert.match(order.recommendation.reason, /Run it again with --hour-cap only if the fiche says the hour is capped/);
  // the published split and the slices are untouched by the advice
  assert.equal(order.split.buyback, 1607.05);
  assert.equal(order.slices.length, 12);
});

test('a slice above 1 % with no whole-buyback quote to judge the hour by gets a smaller-slices recommendation', async () => {
  const quotes = stubJupiter({ impactPct: 2.4, fail: (call) => call >= 13 });
  const order = await orderOf({ fetchImpl: quotes.fetchImpl });
  assert.equal(order.quotes.status, 'ok');
  assert.equal(order.whole.unavailable, 'HTTP 429: rate limited');
  assert.equal(order.hour, null);
  assert.equal(order.recommendation.action, 'smaller-slices');
  assert.equal(order.recommendation.slices, Math.ceil((12 * 2.4) / 1)); // 29
  assert.match(order.recommendation.reason, /--slices 29/);
  assert.equal(order.slices.length, 12, 'the advice does not change the order');
});

test('smaller slices stop at the cap and say the founders decide', () => {
  const r = recommend({ count: 12, buybackCents: 160705, minSliceCents: 2000, maxImpactPct: 1, worstImpactPct: 9 });
  assert.equal(r.action, 'smaller-slices');
  assert.equal(r.slices, MAX_SLICES);
  assert.match(r.reason, /founders decide/);
  assert.match(r.reason, /not cut silently/);
});

test('the advice, in priority order: nothing, hold, hour cap, fewer slices, smaller slices, then what could not be checked', () => {
  const base = { count: 12, buybackCents: 160705, minSliceCents: 2000, maxImpactPct: 1, worstImpactPct: 0.4 };
  assert.equal(recommend({ ...base, count: 0 }).action, 'none');
  assert.equal(recommend(base).action, 'hour-unchecked');
  assert.equal(recommend({ ...base, worstImpactPct: null }).action, 'unquoted');
  assert.equal(recommend({ ...base, count: 1, buybackCents: 5000 }).action, 'ok');
  const hour = { buyback: 1607.05, capped: false, wholeImpactPct: 0.5, impactLimitPct: 1.2293, bOverXPct: 1.2, liftPct: 2.4, depth: 130000, cap: 1500, hour: 1500, rest: 107.05, poolFeePct: 1.2, feeSource: 'test' };
  assert.equal(recommend({ ...base, hour }).action, 'ok');
  const capped = { ...hour, capped: true };
  assert.equal(recommend({ ...base, hour: capped }).action, 'hour-cap-needed');
  // too small a slice beats a slice that moves the price; the hour cap beats both
  const small = recommend({ ...base, buybackCents: 3000, worstImpactPct: 5 });
  assert.equal(small.action, 'fewer-slices');
  assert.equal(small.slices, 1);
  assert.equal(recommend({ ...base, hour: capped, buybackCents: 3000 }).action, 'hour-cap-needed');
  // the curve rule is first, and the other findings stay in the reason
  const hold = recommend({ ...base, hour: capped, curve: { complete: false, progressPct: CURVE_HOLD_PCT + 5, completesWithWhole: false } });
  assert.equal(hold.action, 'hold');
  assert.match(hold.reason, /The bonding curve is at 95 %/);
  assert.match(hold.reason, /The hour is too big for the pool/);
  assert.equal(recommend({ ...base, curve: { complete: true, progressPct: 100, completesWithWhole: false } }).action, 'hour-unchecked');
  assert.equal(recommend({ ...base, curve: { complete: false, progressPct: CURVE_HOLD_PCT, completesWithWhole: false } }).action, 'hour-unchecked', 'exactly 90 % is not above it');
});

test('the depth of the pool is read from a slice against the whole, and from the whole\'s own impact', () => {
  // a constant-product pool with 8 000 USDC on the quote side and 100 $PLEIN per USDC at the start
  const x = 8000;
  const out = (s) => (100 * s * x) / (x + s);
  const slice = { spent: 100, out: out(100) };
  const whole = { spent: 1000, out: out(1000), impactPct: (1 - out(1000) / (100 * 1000)) * 100 };
  const depth = estimateDepth({ slice, whole });
  assert.ok(Math.abs(depth.ratio - x) < 1, `ratio ${depth.ratio}`);
  assert.ok(Math.abs(depth.impact - x) < 1, `impact ${depth.impact}`);
  // the hour check keeps the smaller reading and applies H = min(B, 0.8 f x)
  const check = hourCheck({ buyback: 1000, slice, whole, poolFeePct: 1.2, feeSource: 'test' });
  assert.equal(check.depth, 8000);
  assert.equal(check.cap, 76.8); // 0.8 × 0.012 × 8 000
  assert.equal(check.hour, 76.8);
  assert.equal(check.rest, 923.2);
  assert.equal(check.capped, true);
  assert.equal(check.bOverXPct, 12.5);
  assert.equal(check.liftPct, 26.6); // (1 + 1/8)² - 1
  // a small buy in a deep pool is not capped
  const deep = hourCheck({ buyback: 100, slice: null, whole: { spent: 100, out: 9990, impactPct: 0.1 }, poolFeePct: 1.2, feeSource: 'test' });
  assert.equal(deep.capped, false);
  assert.equal(deep.hour, 100);
  assert.equal(deep.rest, 0);
  assert.ok(deep.impactLimitPct > deep.wholeImpactPct);
  // no whole quote, no check; no usable depth, no cap
  assert.equal(hourCheck({ buyback: 100, slice, whole: null, poolFeePct: 1.2, feeSource: 'test' }), null);
  const blind = hourCheck({ buyback: 100, slice: null, whole: { spent: 100, out: 100, impactPct: 0 }, poolFeePct: 1.2, feeSource: 'test' });
  assert.equal(blind.depth, null);
  assert.equal(blind.cap, null);
  assert.equal(blind.hour, 100);
});

test('a dust buyback gets fewer slices instead of twelve tiny swaps', async () => {
  const order = await orderOf({ reservoir: 100, noQuotes: true });
  assert.equal(order.split.buyback, 47.1);
  assert.equal(order.recommendation.action, 'fewer-slices');
  assert.equal(order.recommendation.slices, 2); // 47.10 / 20 USDC
  const one = await orderOf({ reservoir: 10, noQuotes: true });
  assert.equal(one.recommendation.slices, 1);
  const asked = await orderOf({ reservoir: 100, slices: 2, noQuotes: true });
  assert.equal(asked.slices.length, 2);
  assert.deepEqual(asked.slices.map((s) => s.spent), [23.55, 23.55]);
  assert.equal(asked.recommendation.action, 'unquoted');
});

test('a week with nothing to buy still gets an order, and a valid draft', async () => {
  const order = await orderOf({ reservoir: 0, fetchImpl: () => { throw new Error('no quote needed'); } });
  assert.deepEqual(order.slices, []);
  assert.equal(order.recommendation.action, 'none');
  assert.equal(order.draft.burn, null);
  assert.equal(order.draft.aidTransfer, null);
  assert.equal(order.draft.teamTransfer, null);
  const r = validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false });
  assert.deepEqual(r.errors, []);
  assert.match(order.checklist.map((s) => s.text).join(' '), /nothing to buy this week/);
});

test('the draft is consistent with the rule, and lists exactly what the founders still fill', async () => {
  const order = await orderOf({ noQuotes: true });
  const r = validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.missing.length, 12 * 2 + 2 + 3); // slice sigs and bought, burn sig and amount, aid, team and claim
  assert.equal(validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN }).ok, false); // not printable yet
  assert.deepEqual(order.draft.diesel, { price: 2.356, week: '2 oct.', source: config.official.source });
  assert.deepEqual([order.draft.reservoir, order.draft.fees, order.draft.unspent], [3412, 3412, 0]);
});

test('money an earlier week left in the réservoir comes off before the split and is never split twice', async () => {
  assert.deepEqual(heldOver(heldBackTicket), { aid: 34120, buyback: 10000, team: 146375 });
  const order = await orderOf({ now: SECOND_AFTERNOON, reservoir: 5316.95, tickets: [heldBackTicket], noQuotes: true });
  assert.equal(order.n, 2);
  assert.equal(order.carriedFrom, 1);
  assert.deepEqual(order.carried, HELD);
  assert.equal(order.reservoir, 5316.95);
  assert.equal(order.fees, 3412, 'the split is made on the week\'s fees, not on the balance');
  assert.deepEqual(order.split, splitWeek(3412, 2.356));
  assert.equal(order.toBuy, 1707.05, 'the week\'s buyback plus the 100 not bought before');
  assert.equal(order.slices.length, 12);
  assert.equal(order.slices[0].spent, 142.25);
  assert.equal(order.slices[11].spent, 142.3);
  assert.equal(order.slices.reduce((a, s) => a + Math.round(s.spent * 100), 0), 170705);
  const aid = order.checklist.find((s) => /Food aid/.test(s.text)).text;
  assert.match(aid, /transfer 682\.40 USDC \(this week's 341\.20 plus 341\.20 carried\)/);
  const team = order.checklist.find((s) => /^Team, last/.test(s.text)).text;
  assert.match(team, /Move 2,927\.50 USDC/);
  const md = renderMarkdown(order);
  assert.match(md, /Carried from earlier weeks \(ticket #1\): aid 341\.20 · buyback 100\.00 · team 1,463\.75\. These are not split again\. \*\*This week's fees: 3,412\.00 USDC\.\*\*/);
  assert.deepEqual([order.draft.carried, order.draft.fees, order.draft.reservoir], [HELD, 3412, 5316.95]);
  assert.deepEqual(order.draft.aidTransfer, { sig: null });
  assert.deepEqual(order.draft.teamTransfer, { sig: null });
  const r = validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false, published: [{ ...heldBackTicket }] });
  assert.deepEqual(r.errors, []);
});

test('what a published ticket leaves in the réservoir: unpaid shares and unspent buyback, and what it itself carried', () => {
  const paid = { n: 1, aid: 341.2, team: 1463.75, unspent: 0, aidTransfer: { sig: 'x' }, teamTransfer: { sig: 'y' } };
  assert.deepEqual(heldOver(paid), { aid: 0, buyback: 0, team: 0 });
  assert.deepEqual(heldOver({ ...paid, aidTransfer: null }), { aid: 34120, buyback: 0, team: 0 });
  assert.deepEqual(heldOver({ ...paid, teamTransfer: null, unspent: 12.34 }), { aid: 0, buyback: 1234, team: 146375 });
  // money carried into a ticket and not paid out stays carried
  assert.deepEqual(heldOver({ ...paid, aidTransfer: null, carried: { aid: 100, buyback: 0, team: 0 } }), { aid: 44120, buyback: 0, team: 0 });
  assert.deepEqual(heldOver(null), { aid: 0, buyback: 0, team: 0 });
  // the last earlier ticket decides; none gives zeros
  const tickets = [{ ...paid, n: 1 }, { ...paid, n: 2, aidTransfer: null }, { ...paid, n: 4 }];
  assert.deepEqual(carriedFor(tickets, 3), { aid: 34120, buyback: 0, team: 0, from: 2 });
  assert.deepEqual(carriedFor(tickets, 1), { aid: 0, buyback: 0, team: 0, from: null });
  assert.equal(carriedFor(tickets, 9).from, 4);
});

test('a balance below what earlier weeks left is refused', async () => {
  await assert.rejects(
    orderOf({ now: SECOND_AFTERNOON, reservoir: 1000, tickets: [heldBackTicket], noQuotes: true }),
    /holds 1,000\.00 USDC, less than the 1,904\.95 that earlier weeks left in it/,
  );
});

test('a plein with no ticket for the week before is refused: its leftovers would be split a second time', async () => {
  const gaps = [
    [SECOND_AFTERNOON, [], /no ticket is published for plein #1 \(no ticket is published before it\).*Publish ticket #1 first/s],
    [Date.parse('2026-11-07T15:55:00+01:00'), [heldBackTicket], /no ticket is published for plein #2 \(the last published is #1\)/],
  ];
  for (const [now, tickets, message] of gaps) {
    await assert.rejects(orderOf({ now, reservoir: 5316.95, tickets, noQuotes: true }), message);
  }
  // to see the order anyway: say that nothing was left, or state what was
  const none = await orderOf({ now: SECOND_AFTERNOON, reservoir: 3412, tickets: [], noQuotes: true, noPreviousTicket: true });
  assert.equal(none.n, 2);
  assert.equal(none.carriedFrom, null);
  assert.match(none.warnings.join(' '), /No ticket is published for plein #1.*ticket #2 will be refused until ticket #1 is published/);
  const stated = await orderOf({ now: SECOND_AFTERNOON, reservoir: 3512, tickets: [], carried: { buyback: '100' }, noQuotes: true });
  assert.deepEqual(stated.carried, { aid: 0, buyback: 100, team: 0 });
  assert.equal(stated.fees, 3412);
  assert.match(stated.warnings.join(' '), /Carried buyback stated by hand: 100\.00 USDC/);
  // the first plein has no week before; a rehearsal on a plein that already has its ticket is flagged
  assert.equal((await orderOf({ noQuotes: true })).n, 1);
  const rehearsal = await orderOf({ tickets: [{ ...heldBackTicket, n: 1, aidTransfer: { sig: 'x' }, teamTransfer: { sig: 'y' }, unspent: 0 }], noQuotes: true });
  assert.match(rehearsal.warnings.join(' '), /Plein #1 already has a published ticket: this order is a rehearsal/);
});

test('carried money set by hand can go down (a payout since), never up, unless forced', async () => {
  const args = { now: SECOND_AFTERNOON, reservoir: 5316.95, tickets: [heldBackTicket], noQuotes: true };
  // the ticket leaves aid 341.20: 0 means it was paid out since
  const lower = await orderOf({ ...args, reservoir: 4975.75, carried: { aid: '0' } });
  assert.deepEqual(lower.carried, { aid: 0, buyback: 100, team: 1463.75 });
  assert.match(lower.warnings.join(' '), /Carried aid set by hand to 0\.00 USDC, below the 341\.20 that ticket #1 leaves: the ticket must list the payout in `adjustments`/);
  const same = await orderOf({ ...args, carried: { aid: '341.20' } });
  assert.match(same.warnings.join(' '), /Carried aid set by hand to 341\.20 USDC, as ticket #1 leaves it/);
  // a higher figure takes money out of the split twice
  await assert.rejects(orderOf({ ...args, carried: { team: '2463.75' } }), /--carried-team 2,463\.75 is above the 1,463\.75 that ticket #1 leaves.*can only go down/);
  const forced = await orderOf({ ...args, carried: { team: '2463.75' }, forceCarried: true });
  assert.deepEqual(forced.carried.team, 2463.75);
  assert.match(forced.warnings.join(' '), /FORCED: carried team set to 2,463\.75 USDC, above the 1,463\.75 that ticket #1 leaves/);
  // before the first plein nothing can have been carried
  await assert.rejects(orderOf({ reservoir: 3512, carried: { buyback: '100' }, noQuotes: true }), /--carried-buyback 100\.00 is above the 0\.00 that no earlier ticket leaves/);
});

test('published tickets are read from the index, oldest first, and an unreadable one stops the order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-published-'));
  try {
    assert.deepEqual(readPublishedTickets(dir), [], 'no index, no tickets');
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ tickets: [
      { n: 2, date: '2026-10-31', path: '/tickets/plein-002.json' }, { n: 1, date: '2026-10-24', path: '/tickets/plein-001.json' },
    ] }));
    writeFileSync(join(dir, 'plein-001.json'), JSON.stringify({ n: 1 }));
    writeFileSync(join(dir, 'plein-002.json'), JSON.stringify({ n: 2 }));
    assert.deepEqual(readPublishedTickets(dir).map((t) => t.n), [1, 2]);
    writeFileSync(join(dir, 'plein-002.json'), '{ not json');
    assert.throws(() => readPublishedTickets(dir), /cannot read the published ticket \/tickets\/plein-002\.json/);
    // an index entry cannot point outside the folder
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ tickets: [{ n: 1, date: '2026-10-24', path: '/tickets/../../package.json' }] }));
    assert.throws(() => readPublishedTickets(dir), /cannot read the published ticket/);
    writeFileSync(join(dir, 'index.json'), '{"nope": []}');
    assert.throws(() => readPublishedTickets(dir), /no "tickets" list/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('before the opening, or with no contract, no quote is asked', async () => {
  const never = () => { throw new Error('the network must not be touched'); };
  const early = await orderOf({ now: Date.parse('2026-10-17T01:00:00+02:00'), fetchImpl: never });
  assert.equal(early.quotes.status, 'skipped');
  assert.match(early.quotes.note, /opens later/);
  assert.equal(early.mint, null);
  assert.equal(early.at, FIRST_PLEIN); // the first plein is a week after the opening, not that evening
  assert.ok(early.slices.every((s) => s.quote === null));
  const empty = await orderOf({ live: { ...live, contract: '' }, fetchImpl: never });
  assert.equal(empty.quotes.status, 'skipped');
  assert.match(empty.quotes.note, /No contract/);
  assert.equal(empty.recommendation.action, 'unquoted');
  await assert.rejects(orderOf({ live: { ...live, contract: 'not-an-address' }, fetchImpl: never }), /not a Solana address/);
});

test('a quote that keeps failing is reported, one that fails once is retried, and neither stops the order', async () => {
  const slept = [];
  const quotes = stubJupiter({ fail: (call) => call >= 3 && call <= 5 }); // the third slice fails on all three attempts
  const order = await orderOf({ fetchImpl: quotes.fetchImpl, sleep: async (ms) => { slept.push(ms); } });
  assert.equal(order.quotes.status, 'partial');
  assert.equal(order.slices[2].quote, null);
  assert.match(order.slices[2].quoteNote, /429/);
  assert.match(order.quotes.note, /1 of 12 quotes failed/);
  assert.ok(order.slices.filter((s) => s.quote).length === 11);
  assert.ok(slept.includes(1000), 'waited before the retry');
  assert.match(order.recommendation.reason, /missing/);
  const ok = stubJupiter({ fail: (call) => call === 1 }); // fails once, then answers
  const retried = await orderOf({ fetchImpl: ok.fetchImpl });
  assert.equal(retried.quotes.status, 'ok');
});

test("when the endpoint says its window is used up, the next quote waits for the reset by the server's clock", async () => {
  const serverNow = Date.parse('2026-10-24T15:55:00Z');
  const headers = (remaining) => ({ get: (k) => ({ 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(serverNow / 1000 + 8), date: new Date(serverNow).toUTCString() })[k] ?? null });
  const quotes = stubJupiter();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const res = await quotes.fetchImpl(url);
    return { ...res, headers: headers(calls % 5 === 0 ? 0 : 3) }; // every fifth answer says: used up
  };
  const waits = [];
  await orderOf({ fetchImpl, pauseMs: 250, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(calls, 13);
  assert.equal(waits.filter((ms) => ms === 8200).length, 2, 'waited out the window after the 5th and 10th calls');
  assert.equal(waits.filter((ms) => ms === 250).length, 10);
});

test('quoting gives up on a deadline, and after two timeouts in a row, so the order is never late', async () => {
  // a quote that never answers: two timeouts, then the rest are not asked
  let asked = 0;
  const hung = await orderOf({ fetchImpl: () => { asked += 1; return new Promise(() => {}); }, quoteTimeoutMs: 20, retries: 0 });
  assert.equal(asked, 2, 'no third attempt after two timeouts in a row');
  assert.equal(hung.quotes.status, 'unavailable');
  assert.equal(hung.slices[0].quoteNote, 'timeout');
  assert.equal(hung.slices[2].quoteNote, 'not quoted: two quotes in a row timed out');
  assert.match(hung.whole.unavailable, /two quotes in a row timed out/);
  assert.equal(hung.recommendation.action, 'unquoted');
  assert.equal(hung.slices.length, 12, 'the order itself is complete');
  // a clock that moves a minute per answer: the 120 s budget is gone after two quotes
  let now = 0;
  const stub = stubJupiter();
  const slow = await orderOf({
    clock: () => now,
    fetchImpl: async (url) => { now += 60000; return stub.fetchImpl(url); },
    quoteDeadlineMs: 120000,
  });
  assert.equal(stub.calls.length, 2);
  assert.equal(slow.quotes.status, 'partial');
  assert.equal(slow.slices[1].quote !== null, true);
  assert.equal(slow.slices[2].quoteNote, 'not quoted: deadline');
  assert.equal(slow.whole.unavailable, 'not quoted: deadline');
  assert.match(slow.recommendation.reason, /Some quotes are missing/);
});

test('a custom endpoint and key come from the options, and the key goes in the header only', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    return { ok: true, status: 200, json: async () => ({ inAmount: '1000000', outputMint: FAKE_MINT, outAmount: '5000', priceImpactPct: '0', routePlan: [] }) };
  };
  const r = await fetchQuote({
    inputMint: UNITS.USDC.mint, outputMint: FAKE_MINT, amountRaw: 1000000n, fetchImpl, url: 'https://quote.example/v1/quote', apiKey: 'test-value',
  });
  assert.equal(r.ok, true);
  assert.match(seen[0].url, /^https:\/\/quote\.example\/v1\/quote\?inputMint=/);
  assert.equal(seen[0].headers['x-api-key'], 'test-value');
  assert.ok(!seen[0].url.includes('test-value'));
});

test('fetchQuote never throws and refuses an answer to another question', async () => {
  const base = { inputMint: UNITS.USDC.mint, outputMint: FAKE_MINT, amountRaw: 1000000n, sleep: noSleep };
  const answer = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
  const good = { inAmount: '1000000', outputMint: FAKE_MINT, outAmount: '5000', priceImpactPct: '0.01', routePlan: [] };
  assert.equal((await fetchQuote({ ...base, fetchImpl: answer(good) })).ok, true);
  const bad = async (body, status) => (await fetchQuote({ ...base, fetchImpl: answer(body, status) }));
  assert.match((await bad({ ...good, inAmount: '2000000' })).reason, /another swap/);
  assert.match((await bad({ ...good, outputMint: UNITS.SOL.mint })).reason, /another swap/);
  assert.match((await bad({ ...good, outAmount: '0' })).reason, /no output/);
  assert.match((await bad({ ...good, priceImpactPct: 'x' })).reason, /impact/);
  assert.match((await bad({ error: 'Could not find any route', errorCode: 'COULD_NOT_FIND_ANY_ROUTE' }, 400)).reason, /HTTP 400: COULD_NOT_FIND_ANY_ROUTE/);
  assert.match((await fetchQuote({ ...base, fetchImpl: async () => { throw new Error('boom'); }, retries: 0 })).reason, /network: boom/);
  assert.match((await fetchQuote({ ...base, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }) })).reason, /HTTP 200|no answer/);
});

test('the reservoir can come from the chain reading, floored to the cent, with its warnings', async () => {
  const order = await orderOf({
    reservoir: undefined,
    fromChain: true,
    noQuotes: true,
    readChain: async ({ unit }) => ({ amount: unit === 'USDC' ? 3412.009 : 0, asOf: '2026-10-24T15:50:00.000Z', warnings: ['creator vault not empty'] }),
  });
  assert.equal(order.reservoir, 3412);
  assert.deepEqual(order.reservoirSource, { kind: 'chain', asOf: '2026-10-24T15:50:00.000Z' });
  assert.deepEqual(order.warnings, ['creator vault not empty']);
  await assert.rejects(orderOf({ fromChain: true, readChain: async () => ({ amount: 1 }) }), /not both/);
  await assert.rejects(orderOf({ reservoir: undefined }), /--reservoir/);
});

test('fees still in the creator vault: a missed claim stops an order read from the chain; trades since the claim do not', async () => {
  const read = (unclaimed, amount = 3412) => async () => ({ amount, asOf: null, unclaimed });
  const args = { reservoir: undefined, fromChain: true, noQuotes: true };
  // 12.34 USDC is 0.36 % of the réservoir: fees built up after the 17:50 claim, which are next week's
  const accrued = await orderOf({ ...args, readChain: read({ amount: 12.34, unit: 'USDC' }) });
  assert.match(accrued.warnings.join(' '), /holds 12\.34 USDC of fees that built up after the claim \(trades since 17:50, under the 34\.12 USDC that would mean a missed claim\): they are next week's fees and are not in this order/);
  assert.equal(accrued.fees, 3412, 'those fees are not in this week\'s split');
  assert.equal(accrued.split.buyback, 1607.05);
  // the bar is a share of the réservoir, never below 1 USDC: on a small réservoir, a dollar passes and two do not
  assert.equal((await orderOf({ ...args, readChain: read({ amount: 0.9, unit: 'USDC' }, 50) })).warnings.length, 1);
  await assert.rejects(orderOf({ ...args, readChain: read({ amount: 2, unit: 'USDC' }, 50) }), /holds 2 USDC of fees that are not claimed yet: claim them first/);
  // a missed claim: well over 1 % of the réservoir
  await assert.rejects(orderOf({ ...args, readChain: read({ amount: 40, unit: 'USDC' }) }), /holds 40 USDC of fees that are not claimed yet: claim them first, because an order computed before the claim splits too little/);
  const shown = await orderOf({ ...args, allowUnclaimed: true, readChain: read({ amount: 40, unit: 'USDC' }) });
  assert.match(shown.warnings.join(' '), /40 USDC of fees that are not claimed yet: claim first/);
  // a few cents are dust; nothing read is nothing said
  const dust = await orderOf({ ...args, readChain: read({ amount: 0.004, unit: 'USDC' }) });
  assert.deepEqual(dust.warnings, []);
  assert.deepEqual((await orderOf({ ...args, readChain: read(null) })).warnings, []);
  // a vault counted in another asset than the order's has no share of the balance to compare with
  await assert.rejects(orderOf({ ...args, readChain: read({ amount: 0.02, unit: 'SOL' }) }), /holds 0\.02 SOL of fees that are not claimed yet/);
  assert.deepEqual(unclaimedLevel({ amount: 12.34, unit: 'USDC' }, 3412, 'USDC'), { level: 'accrued', limit: 34.12 });
  assert.deepEqual(unclaimedLevel({ amount: 34.13, unit: 'USDC' }, 3412, 'USDC'), { level: 'material', limit: 34.12 });
  assert.deepEqual(unclaimedLevel({ amount: 1.01, unit: 'USDC' }, 0, 'USDC'), { level: 'material', limit: 1 });
  assert.deepEqual(unclaimedLevel({ amount: 0.01, unit: 'USDC' }, 0, 'USDC'), { level: 'dust', limit: null });
  assert.deepEqual(unclaimedLevel(null, 0, 'USDC'), { level: 'none', limit: null });
});

test('the chain reader, with nothing to read, says what is missing and asks for --reservoir (the reading is stubbed)', async () => {
  let asked = null;
  const take = async (args) => { asked = args; return { asOf: null, reservoir: null, errors: [] }; };
  await assert.rejects(
    buildOrder({ config, live: { contract: '', wallets: {} }, now: SATURDAY_AFTERNOON, tickets: [], fromChain: true, noQuotes: true, takeReading: take }),
    /no réservoir wallet in public\/live\.json yet.*--reservoir <amount>/,
  );
  assert.deepEqual(Object.keys(asked).sort(), ['live', 'mint'], 'the reader gets the live.json and the mint, nothing else');
  const why = async () => ({ asOf: null, reservoir: null, errors: ['reservoir: rate limited'] });
  await assert.rejects(orderOf({ reservoir: undefined, fromChain: true, noQuotes: true, takeReading: why }), /no réservoir balance \(reservoir: rate limited\)/);
  const reading = async () => ({
    asOf: '2026-10-24T15:52:00.000Z', reservoir: { address: WALLETS.reservoir, usdc: 3412.009, sol: 0.1 }, creatorVault: { unclaimed: 0.5, unit: 'USDC' },
    curve: { address: 'x', progressPct: 40, complete: false }, market: { marketCapUsd: 50000 },
  });
  const via = await orderOf({ reservoir: undefined, fromChain: true, noQuotes: true, takeReading: reading });
  assert.equal(via.reservoir, 3412);
  assert.deepEqual(via.curve, { progressPct: 40, complete: false, completesWithWhole: false });
  assert.match(via.warnings.join(' '), /0\.5 USDC of fees that built up after the claim/);
});

test('the bonding curve above 90 %, or one this buyback would complete, holds the hour', async () => {
  const quotes = () => stubJupiter({ impactPct: 0.4 }).fetchImpl;
  const high = await orderOf({ fetchImpl: quotes(), readCurve: curveOf({ progressPct: 95, complete: false }) });
  assert.deepEqual(high.curve, { progressPct: 95, complete: false, completesWithWhole: false });
  assert.equal(high.recommendation.action, 'hold');
  assert.match(high.recommendation.reason, /above 90 % the hour could complete it/);
  // 0.02 % of the curve's 793 100 000 tokens is 158 620; the whole buy returns 160 705 at the stub's rate
  const edge = await orderOf({ fetchImpl: quotes(), readCurve: curveOf({ progressPct: 99.98, complete: false }) });
  assert.equal(edge.curve.completesWithWhole, true);
  assert.match(edge.recommendation.reason, /this buyback would take it to 100 %/);
  const low = await orderOf({ fetchImpl: quotes(), readCurve: curveOf({ progressPct: 40, complete: false }) });
  assert.equal(low.recommendation.action, 'ok');
  assert.equal(low.hour.poolFeePct, 1.25, 'the curve\'s own fee');
  assert.equal(low.hour.feeSource, 'bonding curve, fees.js');
  // after migration the fee follows the pool's tier at the market cap read
  const pool = await orderOf({ fetchImpl: quotes(), readCurve: curveOf({ progressPct: 100, complete: true }, 150000) });
  assert.equal(pool.curve.completesWithWhole, false);
  assert.equal(pool.recommendation.action, 'ok');
  assert.equal(pool.hour.poolFeePct, 1.2);
  assert.match(pool.hour.feeSource, /pool tier at the market cap read/);
  // a curve that cannot be read is a warning, not a guess
  const blind = await orderOf({ fetchImpl: quotes(), readCurve: async () => ({ curve: null, marketCapUsd: null, error: 'rpc down' }) });
  assert.match(blind.warnings.join(' '), /The curve state could not be read \(rpc down\)/);
  assert.equal(blind.curve, null);
  const unread = await orderOf({ fetchImpl: quotes(), readCurve: noCurve });
  assert.match(unread.warnings.join(' '), /The curve state was not read/);
  assert.equal(unread.hour.poolFeePct, DEFAULT_POOL_FEE_PCT, 'the lowest fee is assumed, never a higher one');
  assert.match(unread.hour.feeSource, /^assumed 0.3 %, the lowest pool fee/);
  // the chain reading of --from-chain carries the curve too, without a second read
  const viaChain = await orderOf({
    reservoir: undefined, fromChain: true, fetchImpl: quotes(), readCurve: () => { throw new Error('read twice'); },
    readChain: async () => ({ amount: 3412, curve: { progressPct: 95, complete: false }, marketCapUsd: null }),
  });
  assert.equal(viaChain.recommendation.action, 'hold');
});

test('bad inputs are refused instead of guessed', async () => {
  await assert.rejects(orderOf({ reservoir: 'abc' }), RangeError);
  await assert.rejects(orderOf({ slices: 0 }), RangeError);
  await assert.rejects(orderOf({ slices: MAX_SLICES + 1 }), RangeError);
  await assert.rejects(orderOf({ at: '2026-10-24T18:05:00+02:00' }), /Saturday at 18:00/);
  await assert.rejects(orderOf({ mint: 'nope' }), /not a Solana address/);
  await assert.rejects(orderOf({ unit: 'EUR' }), /unknown quote asset/);
  await assert.rejects(buildOrder({ config: { ...config, official: {} }, live, reservoir: 1, tickets: [] }), /official diesel price/);
});

test('a mint override is allowed for tests but flagged as not official', async () => {
  const order = await orderOf({ mint: UNITS.USDC.mint, noQuotes: true });
  assert.equal(order.mint, UNITS.USDC.mint);
  assert.match(order.warnings.join(' '), /not the official contract/);
});

test('the second plein is #2 and carries the winter offset', async () => {
  const paid = { n: 1, aid: 341.2, team: 1463.75, unspent: 0, carried: { aid: 0, buyback: 0, team: 0 }, aidTransfer: { sig: 'x' }, teamTransfer: { sig: 'y' } };
  const order = await orderOf({ now: Date.parse('2026-10-26T10:00:00+01:00'), noQuotes: true, tickets: [paid] });
  assert.equal(order.n, 2);
  assert.equal(order.at, SECOND_PLEIN);
  assert.deepEqual(validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false }).errors, []);
});

test('the order is plain JSON, and the markdown carries the figures and the checklist', async () => {
  const order = await orderOf({ fetchImpl: stubJupiter().fetchImpl });
  assert.deepEqual(JSON.parse(JSON.stringify(order)), order);
  const md = renderMarkdown(order);
  for (const part of ['3,412.00 USDC', '1,607.05', '341.20', '1,463.75', '47.1 %', '| 12 | 18:55 | 133.93 |', 'Checklist', 'SPL burn instruction', 'Impact check']) {
    assert.ok(md.includes(part), `markdown has "${part}"`);
  }
  assert.equal((md.match(/- \[ \]/g) ?? []).length, order.checklist.length);
  assert.match(md, /Nothing carried from earlier weeks/);
  const times = order.checklist.map((s) => s.time);
  assert.deepEqual(times.slice(0, 4), ['17:45', 'before 17:50', '17:50', '18:00 to 18:55']);
  assert.equal(times.at(-1), '19:05');
});

test('the order and its draft are written to a folder, under names the ticket step expects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-out-'));
  try {
    const order = await orderOf({ noQuotes: true });
    const paths = writeOrder(order, join(dir, 'nested', 'out'));
    assert.deepEqual(Object.keys(paths), ['json', 'markdown', 'draft']);
    assert.ok(paths.json.endsWith('plein-001.json') && paths.markdown.endsWith('plein-001.md') && paths.draft.endsWith('plein-001-draft.json'));
    assert.deepEqual(JSON.parse(readFileSync(paths.draft, 'utf8')), order.draft);
    assert.deepEqual(JSON.parse(readFileSync(paths.json, 'utf8')).split, order.split);
    assert.match(readFileSync(paths.markdown, 'utf8'), /^# Plein #1/);
    assert.match(order.checklist.at(-1).text, /out\/plein-001-draft\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the limits follow the pool fee: the front-run break-even for the hour, the fee itself for a slice', () => {
  const fees = [1.25, 1.2, 1.0, 0.55, 0.3];
  assert.deepEqual(fees.map(sliceLimitPct), [1, 0.96, 0.8, 0.44, 0.24], 'min(1 %, 0.8 f)');
  assert.deepEqual(fees.map(hourLimitPct), [1.2818, 1.2293, 1.0203, 0.5561, 0.3018], 'f / (1 - f)^2, the table of docs/moteur.md section 4');
  assert.equal(DEFAULT_POOL_FEE_PCT, 0.3, 'when nothing was read, the lowest fee: caps only get tighter');
  assert.deepEqual(resolveFee({ unit: 'USDC' }), { pct: 0.3, source: 'assumed 0.3 %, the lowest pool fee, because the fee tier in force was not read', nonCanonical: [] });
  assert.equal(resolveFee({ given: 0.9, routes: ['Whirlpool'], unit: 'USDC' }).pct, 0.9, 'a fee given by hand wins');
  assert.equal(resolveFee({ routes: ['Pump.fun'], curveRead: { complete: false }, unit: 'USDC' }).pct, 1.25);
  assert.equal(resolveFee({ routes: ['Pump.fun Amm'], curveRead: { complete: true }, marketCapUsd: 10_500_000, unit: 'USDC' }).pct, 0.55);
  assert.equal(resolveFee({ routes: ['Pump.fun Amm'], curveRead: { complete: true }, marketCapUsd: 25_000_000, unit: 'USDC' }).pct, 0.3);
  assert.equal(resolveFee({ routes: ['Pump.fun Amm'], curveRead: { complete: true }, unit: 'USDC' }).pct, 0.3, 'a migrated pool whose market cap was not read');
  for (const label of ['Pump.fun', 'Pump.fun Amm', 'pump.fun amm', 'PumpFun', 'PumpSwap']) assert.ok(CANONICAL_ROUTE.test(label), label);
  for (const label of ['Whirlpool', 'Raydium CLMM', 'Meteora DLMM', 'Pump.fun Amm 2']) assert.ok(!CANONICAL_ROUTE.test(label), label);
});

test('each tier of the pool judges the same quotes by its own fee', async () => {
  const quotes = () => stubJupiter({ impactPct: 0.5 }).fetchImpl;
  const at = (marketCapUsd) => orderOf({ fetchImpl: quotes(), readCurve: curveOf({ progressPct: 100, complete: true }, marketCapUsd) });
  const mid = await at(150000); // 1.20 %: the quote's 0.5 % is within both limits
  assert.deepEqual([mid.poolFee.pct, mid.params.maxImpactPct, mid.hour.impactLimitPct], [1.2, 0.96, 1.2293]);
  assert.equal(mid.recommendation.action, 'ok');
  const rich = await at(10_500_000); // 0.55 %
  assert.deepEqual([rich.poolFee.pct, rich.params.maxImpactPct, rich.hour.impactLimitPct], [0.55, 0.44, 0.5561]);
  assert.equal(rich.recommendation.action, 'hour-cap-needed', 'the same hour, now above what the cheaper pool can carry');
  assert.match(rich.recommendation.reason, /starts to profit above 0\.5561 %/);
  const top = await at(25_000_000); // 0.30 %
  assert.deepEqual([top.poolFee.pct, top.params.maxImpactPct, top.hour.impactLimitPct], [0.3, 0.24, 0.3018]);
  assert.equal(top.recommendation.action, 'hour-cap-needed');
  // a limit given by hand replaces the per-slice one only
  const hand = await orderOf({ fetchImpl: quotes(), maxImpactPct: 0.7 });
  assert.deepEqual([hand.params.maxImpactPct, hand.hour.impactLimitPct], [0.7, 1.2818]);
});

test('a quote through another venue than the pump.fun curve or pool sets the fee to 0.30 % and says so', async () => {
  const stub = stubJupiter({ impactPct: 0.4, routes: ['Pump.fun Amm', 'Whirlpool'] });
  const order = await orderOf({ fetchImpl: stub.fetchImpl }); // the curve at 40 % would give 1.25 %
  assert.equal(order.poolFee.pct, 0.3);
  assert.deepEqual(order.poolFee.routes, ['Pump.fun Amm', 'Whirlpool']);
  assert.equal(order.params.maxImpactPct, 0.24);
  assert.match(order.hour.feeSource, /a quote routes through Whirlpool.*another pool or DEX may hold depth.*rule 1/);
  assert.match(order.warnings.join(' '), /A quote routes through Whirlpool, not the pump\.fun curve or pool alone/);
  // an order with only the canonical venue has no such warning
  const clean = await orderOf({ fetchImpl: stubJupiter().fetchImpl });
  assert.deepEqual(clean.poolFee.routes, ['Pump.fun Amm']);
  assert.ok(!clean.warnings.join(' ').includes('routes through'));
});

/** A constant-product pool with `x` USDC on the quote side, 100 $PLEIN per USDC at the start, and the true price impact. */
function stubPool({ x = 8000, routes = ['Pump.fun Amm'] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams;
    calls.push(q);
    const spent = Number(q.get('amount')) / 1e6;
    const out = (100 * spent * x) / (x + spent);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        inputMint: q.get('inputMint'), inAmount: q.get('amount'), outputMint: q.get('outputMint'), outAmount: String(Math.floor(out * 1e6)),
        otherAmountThreshold: String(Math.floor(out * 0.99 * 1e6)), priceImpactPct: String(spent / (x + spent)),
        routePlan: routes.map((label) => ({ swapInfo: { label } })),
      }),
    };
  };
  return { fetchImpl, calls };
}
const centsOf = (slices) => slices.reduce((a, s) => a + Math.round(s.spent * 100), 0);

test('--hour-cap buys only H = min(B, 0.8 f x) in the hour, quotes the new slices, and puts the rest in unspent', async () => {
  const pool = stubPool({ x: 8000 });
  const order = await orderOf({ fetchImpl: pool.fetchImpl, hourCap: true, minSlice: 0 });
  assert.equal(order.hour.poolFeePct, 1.25, 'the curve at 40 %');
  const cap = order.hour.cap;
  assert.ok(Math.abs(cap - 0.8 * 0.0125 * 8000) < 0.1, `cap ${cap} against 80`);
  assert.equal(order.applied.mode, 'cap');
  assert.equal(order.toBuy, 1607.05);
  assert.equal(order.hourBuy, cap);
  assert.equal(order.carryOut, Math.round((1607.05 - cap) * 100) / 100);
  assert.equal(order.hour.hour, cap);
  assert.equal(order.hour.applied, 'cap');
  assert.equal(order.slices.length, 12, 'twelve slices, now of H');
  assert.equal(centsOf(order.slices), Math.round(cap * 100));
  assert.ok(order.slices.every((s) => s.quote), 'the slices are quoted again at their new size');
  assert.equal(order.worstImpactPct, Math.max(...order.slices.map((s) => s.quote.impactPct)));
  // 12 quotes of B/12, the whole B, then 12 of H/12
  assert.equal(pool.calls.length, 25);
  assert.equal(pool.calls[0].get('amount'), String(13392 * 10000));
  assert.equal(pool.calls[12].get('amount'), String(160705 * 10000));
  assert.equal(pool.calls[13].get('amount'), String(Math.round(order.slices[0].spent * 100) * 10000));
  assert.equal(order.recommendation.action, 'hour-capped');
  assert.match(order.recommendation.reason, /is written in `unspent`, carried to the next Saturday and never split again/);
  assert.equal(order.params.hourCap, true);
  // the draft carries the rest and a French note; the team is not held back (the rest is below a week's buyback)
  assert.equal(order.draft.unspent, order.carryOut);
  assert.equal(centsOf(order.draft.slices), Math.round(cap * 100));
  assert.equal(order.draft.notes.length, 1);
  // French typography: a no-break space before the colon and between a number and its unit, a narrow one in the thousands
  assert.match(order.draft.notes[0], /^Rachat plafonné pour l’heure : (79|80),\d\d USDC achetés samedi, 1 52\d,\d\d USDC reportés au samedi suivant, hors partage\.$/);
  assert.deepEqual(order.draft.teamTransfer, { sig: null });
  assert.equal(order.teamWaits, false);
  const r = validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false });
  assert.deepEqual(r.errors, []);
  assert.match(order.checklist.find((s) => /swaps from the réservoir/.test(s.text)).text, /This order buys .* of the 1,607\.05 to buy \(--hour-cap\); the 1,52\d\.\d\d left is already written in the draft's `unspent`/);
  assert.match(renderMarkdown(order), /Bought in the hour: \*\*[\d.,]+ USDC\*\*; \*\*1,52\d\.\d\d\*\* goes in `unspent`/);
  // without the option the same pool gets the same advice but the whole hour
  const plain = await orderOf({ fetchImpl: stubPool({ x: 8000 }).fetchImpl, minSlice: 0 });
  assert.equal(plain.recommendation.action, 'hour-cap-needed');
  assert.equal(plain.applied, null);
  assert.equal(plain.hourBuy, 1607.05);
  assert.equal(plain.draft.unspent, 0);
  assert.deepEqual(plain.draft.notes, []);
  // a pool deep enough for the whole buyback is not capped, and the option says so
  const deep = await orderOf({ fetchImpl: stubPool({ x: 4_000_000 }).fetchImpl, hourCap: true });
  assert.equal(deep.applied, null);
  assert.match(deep.warnings.join(' '), /--hour-cap: the cap is not below the 1,607\.05 to buy/);
  assert.equal(deep.slices.length, 12);
});

test('--hour-cap on a curve above 90 %, or with no readable depth, sets the hour to 0 (rule 1)', async () => {
  const held = await orderOf({ fetchImpl: stubPool().fetchImpl, hourCap: true, readCurve: curveOf({ progressPct: 95, complete: false }) });
  assert.equal(held.applied.mode, 'cap');
  assert.deepEqual([held.hourBuy, held.carryOut, held.slices.length], [0, 1607.05, 0]);
  assert.equal(held.recommendation.action, 'hold');
  assert.match(held.recommendation.reason, /Applied \(--hour-cap\): nothing is bought this Saturday and the whole buyback is written in `unspent`/);
  assert.equal(held.draft.burn, null);
  assert.deepEqual(held.draft.slices, []);
  assert.equal(held.draft.unspent, 1607.05);
  assert.match(held.checklist.find((s) => s.time === '18:00').text, /Nothing is bought this Saturday \(--hour-cap sets the hour to 0\)/);
  assert.deepEqual(validateTicket(held.draft, { firstPleinAt: FIRST_PLEIN, complete: false }).errors, []);
  // no quote of the whole buyback, so no depth to read
  const flat = await orderOf({ fetchImpl: stubJupiter({ fail: (call) => call >= 13 }).fetchImpl, hourCap: true });
  assert.equal(flat.hour, null);
  assert.equal(flat.hourBuy, 0);
  assert.match(flat.warnings.join(' '), /--hour-cap: the depth of the pool could not be read from the quotes, so the hour is 0/);
  assert.match(flat.recommendation.reason, /the rule sets the hour to 0/);
});

test('--hour sets the hour by hand, says whether it is above the cap, and refuses what it cannot do', async () => {
  const pool = stubPool({ x: 8000 });
  const order = await orderOf({ fetchImpl: pool.fetchImpl, hour: '500', minSlice: 0 });
  assert.equal(order.applied.mode, 'given');
  assert.deepEqual([order.hourBuy, order.carryOut, order.params.hour], [500, 1107.05, 500]);
  assert.equal(centsOf(order.slices), 50000);
  assert.equal(pool.calls.length, 13, 'twelve slices of H and the whole B, to judge the depth');
  assert.equal(pool.calls[12].get('amount'), String(160705 * 10000));
  assert.equal(order.recommendation.action, 'hour-set');
  assert.match(order.applied.why, /This is above the cap of (79|80)\.\d\d.*the hour can be front-run/);
  assert.equal(order.draft.notes[0], 'Rachat limité à 500,00 USDC pour l’heure ; 1 107,05 USDC reportés au samedi suivant, hors partage.');
  const within = await orderOf({ fetchImpl: stubPool({ x: 8000 }).fetchImpl, hour: '50', minSlice: 0 });
  assert.match(within.applied.why, /This is within the cap of/);
  // 0 buys nothing; the whole is the default and changes nothing
  const zero = await orderOf({ hour: '0', noQuotes: true });
  assert.deepEqual([zero.slices.length, zero.carryOut, zero.draft.burn], [0, 1607.05, null]);
  const all = await orderOf({ hour: '1607.05', noQuotes: true });
  assert.equal(all.applied, null);
  assert.equal(all.slices.length, 12);
  await assert.rejects(orderOf({ hour: '2000', noQuotes: true }), /--hour 2,000\.00 is more than the 1,607\.05 to buy this week/);
  await assert.rejects(orderOf({ hour: '500', hourCap: true }), /--hour-cap or --hour, not both/);
  await assert.rejects(orderOf({ hourCap: true, noQuotes: true }), /--hour-cap reads the depth of the pool from Jupiter quotes, and there are none \(Quotes switched off/);
  await assert.rejects(orderOf({ hour: 'abc', noQuotes: true }), RangeError);
});

test('a carried-over buyback larger than one week\'s holds the team back (rule 6), in the draft and in the checklist', async () => {
  const ticket1 = { n: 1, aid: 341.2, team: 1463.75, buyback: 1607.05, unspent: 2000, carried: { aid: 0, buyback: 0, team: 0 }, aidTransfer: { sig: 'x' }, teamTransfer: { sig: 'y' } };
  const order = await orderOf({ now: SECOND_AFTERNOON, reservoir: 5412, tickets: [ticket1], hour: '0', noQuotes: true });
  assert.deepEqual(order.carried, { aid: 0, buyback: 2000, team: 0 });
  assert.equal(order.toBuy, 3607.05);
  assert.deepEqual([order.hourBuy, order.carryOut, order.teamWaits], [0, 3607.05, true]);
  assert.equal(order.draft.teamTransfer, null);
  assert.equal(order.draft.unspent, 3607.05);
  assert.equal(order.draft.notes.length, 2);
  assert.match(order.draft.notes[1], /^Part de l’équipe gardée au réservoir tant que le reliquat dépasse un rachat hebdomadaire\.$/);
  const team = order.checklist.find((s) => /^Team/.test(s.text)).text;
  assert.match(team, /^Team: do NOT pay yet\. The unspent buyback \(3,607\.05 USDC\) is larger than one week's buyback \(1,607\.05\), so the team's 1,463\.75 waits/);
  const r = validateTicket(order.draft, { firstPleinAt: FIRST_PLEIN, complete: false, published: [{ ...ticket1, at: FIRST_PLEIN }] });
  assert.deepEqual(r.errors, []);
  // the same week with a small carry pays the team as usual
  const small = await orderOf({ now: SECOND_AFTERNOON, reservoir: 5412, tickets: [ticket1], hour: '2200', noQuotes: true });
  assert.equal(small.teamWaits, false);
  assert.deepEqual(small.draft.teamTransfer, { sig: null });
  assert.match(small.checklist.find((s) => /^Team/.test(s.text)).text, /^Team, last: only once every slice is done/);
});

test('what a ticket had to pay out: the aid and team transfers with their carried part, and the buyback actually made', () => {
  const t = { aid: 341.2, team: 1463.75, buyback: 1607.05, unspent: 50, carried: { aid: 341.2, buyback: 100, team: 1463.75 } };
  assert.deepEqual(dueOf(t), { aid: 68240, team: 292750, bought: 165705 });
  assert.deepEqual(dueOf({ aid: 10, team: 20, buyback: 5, unspent: 0 }), { aid: 1000, team: 2000, bought: 500 }, 'no carried block is zeros');
  assert.deepEqual(dueOf(null), { aid: 0, team: 0, bought: 0 });
});

test('command line: parses its options and fails on bad input with a non-zero exit', () => {
  assert.deepEqual(parseArgs(['--reservoir', '3412', '--json', '--no-quotes']), { reservoir: '3412', json: true, 'no-quotes': true });
  assert.deepEqual(
    parseArgs(['--from-chain', '--allow-unclaimed', '--carried-aid', '341.20', '--slices', '24', '--max-impact', '0.5', '--out', 'x']),
    { 'from-chain': true, 'allow-unclaimed': true, 'carried-aid': '341.20', slices: '24', 'max-impact': '0.5', out: 'x' },
  );
  assert.deepEqual(
    parseArgs(['--hour-cap', '--no-previous-ticket', '--force-carried', '--tickets', 't', '--hour', '50']),
    { 'hour-cap': true, 'no-previous-ticket': true, 'force-carried': true, tickets: 't', hour: '50' },
  );
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['--reservoir']), /needs a value/);
  assert.throws(() => parseArgs(['stray']), /unexpected/);
  // every run is pinned to a plein (--at) and to an empty folder of published tickets, so it reads
  // neither the clock nor what the founders have published since
  const dir = mkdtempSync(join(tmpdir(), 'plein-cli-'));
  const tickets = join(dir, 'tickets');
  mkdirSync(tickets);
  try {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, PLEIN_TICKETS_DIR: '' } });
    const base = ['--no-quotes', '--at', FIRST_PLEIN, '--tickets', tickets];
    const ok = run('--reservoir', '3412', ...base, '--no-write', '--json');
    assert.equal(ok.status, 0, ok.stderr);
    const order = JSON.parse(ok.stdout);
    assert.equal(order.n, 1);
    assert.equal(order.split.ratePct, splitWeek(3412, order.diesel.price).ratePct);
    assert.equal(run('--reservoir', 'abc', ...base, '--no-write').status, 1);
    assert.equal(run(...base, '--no-write').status, 1);
    assert.equal(run('--bogus').status, 1);
    assert.equal(run('--help').status, 0);
    const md = run('--reservoir', '3412', ...base, '--no-write');
    assert.equal(md.status, 0);
    assert.match(md.stdout, /^# Plein #1/);
    const written = run('--reservoir', '3412', ...base, '--out', dir);
    assert.equal(written.status, 0, written.stderr);
    assert.equal(existsSync(join(dir, 'plein-001-draft.json')), true);
    assert.equal(existsSync(join(dir, 'plein-001.md')), true);
    // the hour: both options together, or the cap without quotes, are refused with a reason
    const both = run('--reservoir', '3412', ...base, '--no-write', '--hour-cap', '--hour', '50');
    assert.equal(both.status, 1);
    assert.match(both.stderr, /--hour-cap or --hour, not both/);
    const blind = run('--reservoir', '3412', ...base, '--no-write', '--hour-cap');
    assert.equal(blind.status, 1);
    assert.match(blind.stderr, /--hour-cap reads the depth of the pool from Jupiter quotes/);
    const given = run('--reservoir', '3412', ...base, '--no-write', '--hour', '500', '--json');
    assert.equal(given.status, 0, given.stderr);
    assert.equal(JSON.parse(given.stdout).carryOut, 1089.99);
    // a plein with no ticket for the week before is refused, through --tickets and through the environment
    const second = ['--reservoir', '3412', '--no-quotes', '--no-write', '--at', SECOND_PLEIN];
    const missing = run(...second, '--tickets', tickets);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /no ticket is published for plein #1/);
    const viaEnv = spawnSync(process.execPath, [script, ...second], { encoding: 'utf8', env: { ...process.env, PLEIN_TICKETS_DIR: tickets } });
    assert.equal(viaEnv.status, 1);
    assert.match(viaEnv.stderr, /no ticket is published for plein #1/);
    assert.equal(run(...second, '--tickets', tickets, '--no-previous-ticket').status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
