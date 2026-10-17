// pump.fun's fee schedule as the site quotes it. If pump.fun changes its page, change
// public/js/fees.js and the copy in public/index.html together; these tests catch the half-done job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CURVE, JUPITER_FEE_NEW_TOKEN_PCT, JUPITER_FEE_PCT, NON_CANONICAL, NON_CANONICAL_NOTE, PLATFORM_FEE_PCT, SOL_TIERS, USDC_TIERS, bandLabel,
  feeRow, formatCap, formatPct, protocolFeePct, pumpFeeClause, scaleSentence, stationFeePct, weekFees, weekPlan,
} from '../public/js/fees.js';
import { splitWeek } from '../public/js/formula.js';

const milli = (x) => Math.round(x * 1000);
const NB = ' ';

for (const [name, tiers] of [
  ['USDC', USDC_TIERS],
  ['SOL', SOL_TIERS],
]) {
  test(`${name} tiers: contiguous, every row sums to its total, the creator share never rises after the 0.95 band`, () => {
    assert.equal(tiers[0].from, 0);
    assert.equal(tiers.at(-1).to, Infinity);
    tiers.forEach((row, i) => {
      if (i > 0) assert.equal(row.from, tiers[i - 1].to, `row ${i} starts where row ${i - 1} ends`);
      assert.ok(row.to > row.from, `row ${i} is not empty`);
      assert.equal(milli(row.creator) + milli(row.protocol) + milli(row.lp), milli(row.total), `row ${i} sums to its total`);
    });
    assert.equal(milli(tiers[0].total), 1250);
    assert.equal(milli(tiers[1].creator), 950, 'the second row is the 0.95 band');
    for (let i = 2; i < tiers.length; i += 1) {
      assert.ok(tiers[i].creator <= tiers[i - 1].creator, `row ${i} does not pay the creator more than row ${i - 1}`);
    }
    assert.ok(tiers.every((row) => row.creator <= 0.95));
    // past the first row, protocol and LP are always 0.050 and 0.200
    for (const row of tiers.slice(1)) {
      assert.equal(milli(row.protocol), 50);
      assert.equal(milli(row.lp), 200);
    }
    assert.equal(milli(tiers.at(-1).creator), 50);
    assert.equal(milli(tiers.at(-1).total), 300);
  });
}

test('USDC schedule: spot checks against the published page', () => {
  assert.equal(USDC_TIERS.length, 25);
  const row = (usd) => feeRow({ complete: true, marketCap: usd, quote: 'USDC' });
  assert.equal(row(100000).creator, 0.95);
  assert.equal(row(100000).total, 1.2);
  assert.equal(row(400000).creator, 0.9);
  assert.equal(row(1500000).creator, 0.75);
  assert.equal(row(10500000).creator, 0.3);
  assert.equal(row(10500000).total, 0.55);
  assert.equal(row(11500000).creator, 0.28);
  assert.equal(row(19500000).creator, 0.08);
  assert.equal(row(19500000).total, 0.33);
  assert.equal(row(25000000).creator, 0.05);
  assert.equal(row(25000000).total, 0.3);
});

test('SOL schedule: spot checks against the published page', () => {
  assert.equal(SOL_TIERS.length, 25);
  const row = (sol) => feeRow({ complete: true, marketCap: sol, quote: 'SOL' });
  assert.equal(row(100).creator, 0.3);
  assert.equal(row(1000).creator, 0.95);
  assert.equal(row(5000).creator, 0.75);
  assert.equal(row(54030).creator, 0.275);
  assert.equal(row(70000).creator, 0.2);
  assert.equal(row(100000).creator, 0.05);
});

test('a market cap on a boundary belongs to the upper row', () => {
  const usd = (n) => stationFeePct({ complete: true, marketCap: n, quote: 'USDC' });
  assert.equal(usd(58999.99), 0.3);
  assert.equal(usd(59000), 0.95);
  assert.equal(usd(299999.99), 0.95);
  assert.equal(usd(300000), 0.9);
  assert.equal(usd(19999999), 0.08);
  assert.equal(usd(20000000), 0.05);
  const sol = (n) => stationFeePct({ complete: true, marketCap: n, quote: 'SOL' });
  assert.equal(sol(419.99), 0.3);
  assert.equal(sol(420), 0.95);
  assert.equal(sol(98240), 0.05);
  for (const tiers of [USDC_TIERS, SOL_TIERS]) {
    const quote = tiers === USDC_TIERS ? 'USDC' : 'SOL';
    tiers.forEach((row, i) => {
      assert.equal(feeRow({ complete: true, marketCap: row.from, quote }).tier, i, `${quote} row ${i} starts at its own from`);
    });
  }
});

test('on the curve the curve schedule applies; the 0-59 000 row belongs to the migrated pool only', () => {
  assert.equal(stationFeePct({ complete: false, marketCap: 30000, quote: 'USDC' }), 0.3);
  assert.equal(protocolFeePct({ complete: false, marketCap: 30000, quote: 'USDC' }), 0.95, 'curve: pump.fun keeps 0.95');
  assert.equal(protocolFeePct({ complete: true, marketCap: 30000, quote: 'USDC' }), 0.93, 'migrated: the canonical row');
  assert.deepEqual(feeRow({ complete: false }), { ...CURVE, tier: null });
  assert.equal(milli(CURVE.creator) + milli(CURVE.protocol) + milli(CURVE.lp), milli(CURVE.total));
  assert.equal(CURVE.total, 1.25);
  assert.equal(milli(NON_CANONICAL.creator) + milli(NON_CANONICAL.protocol) + milli(NON_CANONICAL.lp), milli(NON_CANONICAL.total));
  assert.equal(NON_CANONICAL.creator, 0);
  assert.equal(PLATFORM_FEE_PCT, 0.45);
});

test('what is not known is null, never a guess', () => {
  assert.equal(stationFeePct(), null);
  assert.equal(stationFeePct({}), null); // curve state not read
  assert.equal(stationFeePct({ complete: null, marketCap: 100000, quote: 'USDC' }), null);
  assert.equal(stationFeePct({ complete: true, quote: 'USDC' }), null); // migrated, market cap not read
  assert.equal(stationFeePct({ complete: true, marketCap: null, quote: 'USDC' }), null);
  assert.equal(stationFeePct({ complete: true, marketCap: '100000', quote: 'USDC' }), null);
  assert.equal(stationFeePct({ complete: true, marketCap: NaN, quote: 'USDC' }), null);
  assert.equal(stationFeePct({ complete: true, marketCap: -5, quote: 'USDC' }), null);
  assert.equal(stationFeePct({ complete: true, marketCap: 100000, quote: 'EUR' }), null);
  assert.equal(stationFeePct({ complete: true, marketCap: 100000 }), null);
  assert.equal(protocolFeePct({ complete: true, quote: 'USDC' }), null);
});

test('wording helpers: French numbers, no-break spaces, nothing rounded away', () => {
  assert.equal(formatCap(59000, 'USDC'), `59${NB}k$`);
  assert.equal(formatCap(300000, 'USDC'), `300${NB}k$`);
  assert.equal(formatCap(1500000, 'USDC'), `1,5${NB}M$`);
  assert.equal(formatCap(20000000, 'USDC'), `20${NB}M$`);
  assert.equal(formatCap(420, 'USDC'), `420${NB}$`);
  assert.match(formatCap(1470, 'SOL'), /^1\s470 SOL$/);
  assert.equal(formatPct(0.95), `0,95${NB}%`);
  assert.equal(formatPct(0.3), `0,30${NB}%`);
  assert.equal(formatPct(0.275), `0,275${NB}%`, '0,275 is not rounded to 0,28');
  assert.equal(formatPct(1.25), `1,25${NB}%`);
  assert.equal(bandLabel(USDC_TIERS[1], 'USDC'), `59${NB}k$ à 300${NB}k$`);
  assert.equal(bandLabel(USDC_TIERS.at(-1), 'USDC'), `au-delà de 20${NB}M$`);
});

test('the scale sentence starts at the opening row: a small migrated pool pays the station 0,30 %, not the peak', () => {
  assert.equal(
    scaleSentence('USDC'),
    `0,30${NB}% sous 59${NB}k$, 0,95${NB}% de 59${NB}k$ à 300${NB}k$, puis moins par paliers, jusqu’à 0,05${NB}% au-delà de 20${NB}M$`,
  );
  assert.match(
    scaleSentence('SOL'),
    /^0,30 % sous 420 SOL, 0,95 % de 420 SOL à 1\s470 SOL, puis moins par paliers, jusqu’à 0,05 % au-delà de 98\s240 SOL$/,
  );
  assert.ok(!/^0,95/.test(scaleSentence('USDC')), 'the sentence does not open on the peak rate');
});

test('the scale sentence in the page is the one the code writes, so the printed copy and the rewrite agree', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/&nbsp;/g, NB);
  const printed = [...html.matchAll(/<span data-bind="feeScale">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.equal(printed.length, 2, 'the lane and the FAQ both carry it');
  for (const text of printed) assert.equal(text, scaleSentence('USDC'));
  const label = html.match(/aria-label="Part de la station par palier de capitalisation : ([^"]+)" data-fee-scale/);
  assert.ok(label, 'the scale chart carries its label');
  // the printed label uses plain spaces; the code rewrites it with no-break ones
  assert.equal(label[1].replace(/ /g, ' '), scaleSentence('USDC').replace(/ /g, ' '), 'the chart label says the same as the sentence');
});

test('the page quotes the schedule it is built on, and nothing from the old launchpad', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  for (const fact of ['1,25 %', '0,95 %', '0,30 %', '0,45 %', '300 k$', '20 M$', '0,05 %', '59 k$']) {
    assert.ok(text.includes(fact), `the page says ${fact}`);
  }
  assert.ok(!/anti-?snip|snipe/i.test(html), 'pump.fun has no anti-sniper fee, so the page has no such line');
  assert.ok(!/Jupiter Studio/i.test(html), 'the coin does not launch on Jupiter Studio');
  assert.ok(!/0,5 %/.test(text), 'the old 0,5 % Jupiter / 0,5 % station split is gone');
  assert.ok(!/nothing leaves|sans les deux signatures|deux signatures/i.test(html), 'no "both signatures" claim about the fees');
  assert.ok(!/0,95 % jusqu’à/.test(text), 'the old scale sentence, which skipped the opening row, is gone');
});

test("Jupiter charges its own fee on the page's pump, and the page says so wherever it speaks of fees", () => {
  assert.equal(JUPITER_FEE_NEW_TOKEN_PCT, 0.5);
  assert.equal(JUPITER_FEE_PCT, 0.1);
  const plain = (file) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const text = plain('../public/index.html');
  const spaced = (pct) => formatPct(pct).replace(NB, ' ');
  const figures = `${spaced(JUPITER_FEE_NEW_TOKEN_PCT)} sur un jeton de moins de 24 h, puis ${spaced(JUPITER_FEE_PCT)}`;
  assert.equal(text.split(figures).length - 1, 3, `the pump note, the péage and the FAQ each carry "${figures}"`);
  assert.equal(text.split('d’après Jupiter').length - 1, 3, 'the figure is attributed to Jupiter (Tier 2) each time');
  assert.ok(!/comme la pompe de cette page/.test(text), 'the pump is not presented as a way around fees');
  assert.ok(/La pompe de cette page passe par Jupiter, qui prélève ses propres frais/.test(text));
  const pump = text.match(/Le site n’ajoute aucun frais[^)]*\)[^.]*\./)?.[0] ?? '';
  assert.ok(/ceux de Jupiter/.test(pump), 'the pump note lists Jupiter next to pump.fun and Solana');
  assert.ok(/ceux du réseau Solana/.test(pump));
  const fiche = plain('../public/fiche-plein.html');
  assert.ok(fiche.includes(`ceux de Jupiter (d’après Jupiter : ${spaced(JUPITER_FEE_NEW_TOKEN_PCT)} sur un jeton de moins de 24 h, puis ${spaced(JUPITER_FEE_PCT)})`), 'the fiche names it too');
});

test("the week's fees: the gauge counts the multisig and the creator vault, and the plan needs both", () => {
  const both = weekFees({ reservoir: 120, unclaimed: 30.5 });
  assert.equal(both.total, 150.5);
  assert.equal(both.complete, true);
  assert.equal(both.label, 'Réservoir + frais à réclamer');
  assert.equal(both.note, `dont 30,50${NB}USDC pas encore réclamés`);
  // zero is a reading
  const zero = weekFees({ reservoir: 0, unclaimed: 0 });
  assert.equal(zero.total, 0);
  assert.equal(zero.complete, true);
  // the week's fees sit in the vault until the claim: a reservoir of 0 with 80 waiting is not an empty week
  assert.equal(weekFees({ reservoir: 0, unclaimed: 80 }).total, 80);
  // one side unread: no plan, and the label says which side is missing
  const onlyReservoir = weekFees({ reservoir: 120, unclaimed: null });
  assert.equal(onlyReservoir.total, 120);
  assert.equal(onlyReservoir.complete, false);
  assert.equal(onlyReservoir.label, 'Réservoir (multisig)');
  assert.match(onlyReservoir.note, /pas relevés$/);
  const onlyVault = weekFees({ reservoir: null, unclaimed: 7 });
  assert.equal(onlyVault.total, 7);
  assert.equal(onlyVault.complete, false);
  assert.match(onlyVault.label, /wallet créateur/);
  assert.match(onlyVault.note, /pas relevé$/);
  // nothing read: a dash, never a zero
  assert.deepEqual(weekFees(), { total: null, complete: false, label: 'Réservoir · frais de la semaine', note: '' });
  assert.equal(weekFees({ reservoir: NaN, unclaimed: -1 }).total, null);
  assert.equal(weekFees({ reservoir: '5', unclaimed: undefined }).total, null);
});

test('the week plan splits the fees alone and buys the carried buyback on top', () => {
  const ZERO = { aid: 0, buyback: 0, team: 0 };
  const price = 2.3283;
  // plein #1: nothing is carried, so the whole balance is the week's fees
  const first = weekPlan({ total: 3412, complete: true, held: ZERO, price });
  assert.deepEqual(first, { fees: 3412, heldTotal: 0, heldBuyback: 0, planned: splitWeek(3412, price).buyback, reason: 'ok' });
  assert.equal(first.planned, 1589.99);
  // a later week: 441,20 left in the réservoir (aid 341,20 held, 100 of buyback unspent)
  const second = weekPlan({ total: 3853.2, complete: true, held: { aid: 341.2, buyback: 100, team: 0 }, price });
  assert.equal(second.fees, 3412);
  assert.equal(second.heldTotal, 441.2);
  assert.equal(second.heldBuyback, 100);
  assert.equal(second.planned, 1689.99, "the week's 1 589,99 plus the 100 carried");
  assert.notEqual(second.planned, Math.round(3853.2 * 0.466), 'not the whole balance times the rate, which would count the held aid as fees');
  // the balance is exactly what was held: no fees, only the carried buyback
  const flat = weekPlan({ total: 441.2, complete: true, held: { aid: 341.2, buyback: 100, team: 0 }, price });
  assert.equal(flat.fees, 0);
  assert.equal(flat.planned, 100);
  // cents, not floating point
  assert.equal(weekPlan({ total: 0.3, complete: true, held: { aid: 0.1, buyback: 0.2, team: 0 }, price }).fees, 0);
});

test('the week plan is a dash, never a guess, when something is not known', () => {
  const ZERO = { aid: 0, buyback: 0, team: 0 };
  const price = 2.3283;
  const none = (reason) => ({ fees: null, heldTotal: null, heldBuyback: null, planned: null, reason });
  assert.deepEqual(weekPlan({ total: 100, complete: false, held: ZERO, price }), none('unread'), 'a side of the balance is unread');
  assert.deepEqual(weekPlan({ total: null, complete: true, held: ZERO, price }), none('unread'));
  assert.deepEqual(weekPlan({ total: -1, complete: true, held: ZERO, price }), none('unread'));
  assert.deepEqual(weekPlan(), none('unread'));
  assert.deepEqual(weekPlan({ total: 100, complete: true, held: null, price }), none('held-unknown'), 'the last ticket cannot be read');
  assert.deepEqual(weekPlan({ total: 100, complete: true, price }), none('held-unknown'), 'omitting what is held is not saying it is zero');
  assert.deepEqual(weekPlan({ total: 100, complete: true, held: { aid: NaN, buyback: 0, team: 0 }, price }), none('held-unknown'));
  assert.deepEqual(weekPlan({ total: 300, complete: true, held: { aid: 341.2, buyback: 0, team: 0 }, price }), none('below-held'), 'less in the réservoir than the ticket says was left');
  assert.deepEqual(weekPlan({ total: 100, complete: true, held: ZERO }), none('no-price'));
  assert.deepEqual(weekPlan({ total: 100, complete: true, held: ZERO, price: 0 }), none('no-price'));
});

test('the dashboard and the purchase order agree on the week: scripts/plein.mjs is the reference', async () => {
  const { buildOrder } = await import('../scripts/plein.mjs');
  const { heldOver, readTicket } = await import('../public/js/readings.js');
  const config = {
    launchAt: '2026-10-17T15:30:00+02:00', firstPleinAt: '2026-10-24T18:00:00+02:00', launchpad: { quote: 'USDC' },
    official: { gazole: 2.3283, weekLabel: '9 oct.', source: 'Relevé hebdomadaire officiel du 9 octobre 2026' },
  };
  // week 1 held the aid and the team share back and left 100 of the buyback unspent
  const raw = { n: 1, aid: 341.2, team: 1463.75, carried: { aid: 0, buyback: 0, team: 0 }, unspent: 100, aidTransfer: null, teamTransfer: null };
  const order = await buildOrder({
    config, live: { contract: '', wallets: {} }, now: Date.parse('2026-10-31T15:55:00+01:00'), reservoir: 6000, noQuotes: true, tickets: [raw],
  });
  const held = heldOver(readTicket({ ...raw, at: '2026-10-24T18:00:00+02:00' }));
  const plan = weekPlan({ total: 6000, complete: true, held, price: config.official.gazole });
  assert.equal(plan.fees, order.fees);
  assert.equal(plan.planned, Math.round((order.split.buyback + order.carried.buyback) * 100) / 100);
  assert.equal(plan.heldTotal, Math.round((order.carried.aid + order.carried.buyback + order.carried.team) * 100) / 100);
});

test('the station is not paid by every route: the page says so, and the pump note follows the curve state', () => {
  assert.equal(NON_CANONICAL.creator, 0, 'a non-canonical pool pays the station nothing');
  const text = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/&nbsp;/g, NB).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.equal(text.split(NON_CANONICAL_NOTE).length - 1, 2, 'the fee lane and the FAQ each carry the sentence');
  assert.ok(text.includes('Selon la route choisie par Jupiter, un échange peut ne rien rapporter à la station.'), 'and so does the pump note');
  // the pump note: curve figures on the curve (and before anything is read), the tier and the route once migrated
  assert.equal(pumpFeeClause(false), `1,25${NB}% sur la courbe, dont 0,30${NB}% pour la station`);
  assert.equal(pumpFeeClause(null), pumpFeeClause(false));
  assert.equal(pumpFeeClause(undefined), pumpFeeClause(false));
  assert.equal(pumpFeeClause(true), 'ceux de la pool PumpSwap, selon son palier et la route choisie par Jupiter');
  assert.ok(!pumpFeeClause(true).includes('1,25'), 'the curve figure is not repeated for a migrated pool');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/&nbsp;/g, NB);
  assert.equal(html.match(/<span data-bind="pumpFeeClause">([^<]+)<\/span>/)[1], pumpFeeClause(false), 'the printed default is the curve wording');
});
