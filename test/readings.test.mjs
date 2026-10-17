// What the page reads from /api/chain and from the ticket files: cleaned, never invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SLICES, carriedTotal, chainLights, hasReading, heldForNextPlein, heldOver, isTxId, readChain, readTicket, readTicketIndex, solscanTx,
} from '../public/js/readings.js';
import { MAX_SLICES as PLEIN_MAX_SLICES, heldOver as pleinHeldOver } from '../scripts/plein.mjs';
import { normalizeTicket } from '../scripts/ticket.mjs';

const MINT = 'So11111111111111111111111111111111111111112'; // wrapped SOL: a public, well-formed address used as a placeholder
const OTHER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TX = '1'.repeat(87); // shaped like a transaction id, built at run time so no such text sits in the repo

const full = () => ({
  asOf: '2026-10-17T13:31:05.000Z',
  mint: MINT,
  token: { supply: 999123456.1, decimals: 6, burned: 876543.876544, mintAuthority: null, freezeAuthority: null },
  curve: { address: OTHER, progressPct: 63.2, complete: false },
  reservoir: { address: OTHER, usdc: 1234.56, sol: 0.12 },
  creatorVault: { unclaimed: 12.34, unit: 'USDC' },
  holders: { top10Pct: 21.4, excluded: 'x' },
  market: { source: 'dexscreener', priceUsd: 0.0000812, marketCapUsd: 81200, volume24hUsd: 154000, pairUrl: 'https://dexscreener.com/solana/x' },
  errors: [],
});

const NOTHING = {
  asOf: null, mint: null, reservoirUsdc: null, unclaimedUsdc: null, burned: null, volume24hUsd: null, marketCapUsd: null, priceUsd: null,
  progressPct: null, complete: null, mintAuthority: null, freezeAuthority: null, top10Pct: null,
};

test('a full reading is flattened to numbers, booleans and authority states', () => {
  assert.deepEqual(readChain(full()), {
    asOf: '2026-10-17T13:31:05.000Z',
    mint: MINT,
    reservoirUsdc: 1234.56,
    unclaimedUsdc: 12.34,
    burned: 876543.876544,
    volume24hUsd: 154000,
    marketCapUsd: 81200,
    priceUsd: 0.0000812,
    progressPct: 63.2,
    complete: false,
    mintAuthority: 'revoked',
    freezeAuthority: 'revoked',
    top10Pct: 21.4,
  });
});

test('before the opening every block is null and stays null', () => {
  const r = readChain({ asOf: '2026-10-17T13:00:00.000Z', mint: null, token: null, curve: null, reservoir: null, holders: null, market: null, errors: [] });
  assert.deepEqual(r, { ...NOTHING, asOf: '2026-10-17T13:00:00.000Z' });
  assert.deepEqual(chainLights(r), {});
});

test('anything that is not what the shape promises becomes null', () => {
  assert.equal(readChain(null), null);
  assert.equal(readChain([]), null);
  assert.equal(readChain('x'), null);
  const bad = readChain({
    asOf: 'hier',
    mint: 'not-an-address',
    token: { burned: '12', mintAuthority: 'nope', freezeAuthority: undefined },
    curve: { progressPct: 'half', complete: 'yes' },
    reservoir: { usdc: -5 },
    holders: { top10Pct: 140 },
    market: { volume24hUsd: Infinity, marketCapUsd: null },
  });
  assert.deepEqual(bad, NOTHING);
  assert.equal(readChain({ curve: { progressPct: 140, complete: false } }).progressPct, 100, 'a progress over 100 is capped');
  assert.equal(readChain({ curve: { progressPct: -3, complete: false } }).progressPct, 0);
  assert.equal(readChain({ reservoir: { usdc: 0 } }).reservoirUsdc, 0, 'zero is a reading, not a gap');
  assert.equal(readChain({ token: { mintAuthority: OTHER } }).mintAuthority, 'active');
  assert.equal(readChain({ token: { supply: 1 } }).mintAuthority, null, 'a missing field is not "revoked"');
});

test('the unclaimed fees count only in USDC, and a missing vault is a gap, not a zero', () => {
  assert.equal(readChain(full()).unclaimedUsdc, 12.34);
  assert.equal(readChain({ creatorVault: { unclaimed: 0, unit: 'USDC' } }).unclaimedUsdc, 0, 'zero is a reading');
  assert.equal(readChain({ creatorVault: { unclaimed: 0.4, unit: 'SOL' } }).unclaimedUsdc, null, 'SOL is not USDC');
  assert.equal(readChain({ creatorVault: { unclaimed: -1, unit: 'USDC' } }).unclaimedUsdc, null);
  assert.equal(readChain({ creatorVault: { unclaimed: '5', unit: 'USDC' } }).unclaimedUsdc, null);
  assert.equal(readChain({ creatorVault: null }).unclaimedUsdc, null);
  assert.equal(readChain({}).unclaimedUsdc, null);
  assert.equal(readChain({ market: { priceUsd: 'x' } }).priceUsd, null);
  assert.equal(hasReading(readChain({ mint: MINT, creatorVault: { unclaimed: 3, unit: 'USDC' } })), true);
});

test('a reading counts only if something was actually read', () => {
  assert.equal(hasReading(null), false);
  assert.equal(hasReading(readChain(full())), true);
  assert.equal(hasReading(readChain({ asOf: '2026-10-17T13:00:00.000Z', mint: MINT, token: null, curve: null, reservoir: null, holders: null, market: null, errors: ['rpc down'] })), false);
  assert.equal(hasReading(readChain({ mint: MINT, reservoir: { usdc: 0 } })), true, 'zero is a reading');
  assert.equal(hasReading(readChain({ mint: MINT, curve: { complete: false } })), true);
});

test('the lights follow the rules in docs/interfaces.md', () => {
  const lights = chainLights(readChain(full()));
  assert.deepEqual(lights.mint, { state: 'ok', label: 'Création révoquée', detail: 'relevé sur la chaîne' });
  assert.deepEqual(lights.freeze, { state: 'ok', label: 'Gel révoqué', detail: 'relevé sur la chaîne' });
  assert.equal(lights.top10.state, 'ok');
  assert.equal(lights.top10.label, 'Top 10 des wallets : 21,4 %');
  assert.deepEqual(Object.keys(lights).sort(), ['freeze', 'mint', 'top10']);
});

test('a light states a fact only when it is ok, and an unread fact sets no light', () => {
  const data = full();
  data.token.mintAuthority = OTHER;
  data.token.freezeAuthority = OTHER;
  data.holders.top10Pct = 41.2;
  const lights = chainLights(readChain(data));
  assert.equal(lights.mint.state, 'warn');
  assert.equal(lights.mint.label, 'Autorité de création');
  assert.equal(lights.freeze.state, 'warn');
  assert.equal(lights.freeze.label, 'Autorité de gel');
  assert.equal(lights.top10.state, 'warn');
  assert.equal(lights.top10.label, 'Top 10 des wallets : 41,2 %');
  // the limit itself is still ok: the rule is "30 or less"
  data.holders.top10Pct = 30;
  assert.equal(chainLights(readChain(data)).top10.state, 'ok');
  data.holders.top10Pct = 30.1;
  assert.equal(chainLights(readChain(data)).top10.state, 'warn');
  data.token = null;
  data.holders = null;
  assert.deepEqual(chainLights(readChain(data)), {});
});

test('ticket index: valid entries, oldest first, nothing that could point elsewhere', () => {
  assert.deepEqual(readTicketIndex(undefined), []);
  assert.deepEqual(readTicketIndex({}), []);
  assert.deepEqual(readTicketIndex({ tickets: [] }), []);
  assert.deepEqual(readTicketIndex({ tickets: 'x' }), []);
  const list = readTicketIndex({
    tickets: [
      { n: 2, date: '2026-10-31', path: '/tickets/plein-002.json' },
      { n: 1, date: '2026-10-24', path: '/tickets/plein-001.json' },
      { n: 1, date: '2026-10-24', path: '/tickets/plein-001-bis.json' }, // same number twice: the first one counts
      { n: 3, date: '2026-11-07', path: 'https://evil.example/x.json' },
      { n: 4, date: '2026-11-14', path: '/tickets/../api/chain.json' },
      { n: 5, date: 'demain', path: '/tickets/plein-005.json' },
      { n: 0, date: '2026-11-21', path: '/tickets/plein-000.json' },
      { n: '6', date: '2026-11-28', path: '/tickets/plein-006.json' },
      null,
    ],
  });
  assert.deepEqual(list, [
    { n: 1, date: '2026-10-24', path: '/tickets/plein-001.json' },
    { n: 2, date: '2026-10-31', path: '/tickets/plein-002.json' },
  ]);
});

test('a ticket file is cleaned; transaction ids are shape-checked and linked to Solscan', () => {
  const t = readTicket({
    n: 1,
    at: '2026-10-24T18:00:00+02:00',
    diesel: { price: 2.3283, week: '9 oct.', source: 'x' },
    unit: 'USDC',
    reservoir: 3412,
    ratePct: 46.6,
    buyback: 1590,
    aid: 341.2,
    team: 1480.8,
    slices: [{ sig: TX, spent: 132.5, bought: 1234567.1 }, { sig: 'short', spent: 1, bought: 1 }, null],
    burn: { sig: TX, amount: 14814814.12 },
    aidTransfer: null,
    claim: { sig: TX },
    notes: ['Frais réclamés le 23 octobre.', 42, '<b>x</b>'],
  });
  assert.equal(t.n, 1);
  assert.equal(t.at, Date.parse('2026-10-24T16:00:00Z'));
  assert.equal(t.price, 2.3283);
  assert.equal(t.unit, 'USDC');
  assert.equal(t.burned, 14814814.12);
  assert.deepEqual(t.slices, [{ id: TX }, { id: null }]);
  assert.deepEqual(t.burn, { id: TX });
  assert.equal(t.aidTransfer, null);
  assert.deepEqual(t.claim, { id: TX });
  assert.deepEqual(t.notes, ['Frais réclamés le 23 octobre.', '<b>x</b>']);
  assert.equal(solscanTx(TX), `https://solscan.io/tx/${TX}`);
  assert.equal(solscanTx('short'), null);
  assert.equal(solscanTx('javascript:alert(1)'), null);
  assert.equal(solscanTx(`${TX}/../x`), null);
  assert.equal(isTxId('0'.repeat(87)), false, '0 is not in the base58 alphabet');
});

test('a ticket with gaps shows gaps, and one without a number is refused', () => {
  assert.equal(readTicket(null), null);
  assert.equal(readTicket({}), null);
  assert.equal(readTicket({ n: 0 }), null);
  assert.equal(readTicket({ n: 1.5 }), null);
  const t = readTicket({ n: 3, at: 'bientôt', diesel: {}, unit: 'usdc', reservoir: -1, ratePct: null, buyback: '12', slices: 'x', notes: 'x' });
  assert.deepEqual(t, {
    n: 3, at: null, price: null, unit: null, reservoir: null, fees: null, carried: null, ratePct: null, buyback: null, aid: null, team: null,
    unspent: null, burned: null, sliceCount: 0, slices: [], burn: null, aidTransfer: null, teamTransfer: null, claim: null, notes: [],
  });
  assert.equal(readTicket({ n: 2, reservoir: 0 }).reservoir, 0, 'an empty réservoir is a real zero');
});

// ---------------------------------------------------------------- the ticket as the printer writes it

// A week-2 ticket: 441,20 carried in (aid 341,20 and buyback 100,00), 89,99 of the buyback unspent,
// the aid share held again, the team paid. Shape: normalizeTicket() in scripts/ticket.mjs.
const week2 = () => normalizeTicket({
  n: 2,
  at: '2026-10-31T18:00:00+01:00',
  diesel: { price: 2.3283, week: '23 oct.', source: 'Relevé hebdomadaire officiel' },
  unit: 'USDC',
  reservoir: 3853.2,
  fees: 3412,
  carried: { aid: 341.2, buyback: 100, team: 0 },
  ratePct: 46.6,
  buyback: 1589.99,
  aid: 341.2,
  team: 1480.81,
  slices: [{ sig: TX, spent: 1600, bought: 2000000.5 }],
  unspent: 89.99,
  burn: { sig: TX, amount: 2000000.5 },
  aidTransfer: null,
  teamTransfer: { sig: TX },
  claim: { sig: TX },
  notes: ['Rachat arrêté à la 11e tranche.'],
});

test('the page reads every field the printer writes, so no line on the PNG is missing on the site', () => {
  const raw = week2();
  const t = readTicket(raw);
  assert.equal(t.reservoir, 3853.2);
  assert.equal(t.fees, 3412);
  assert.deepEqual(t.carried, { aid: 341.2, buyback: 100, team: 0 });
  assert.equal(t.buyback, 1589.99);
  assert.equal(t.unspent, 89.99);
  assert.deepEqual(t.teamTransfer, { id: TX });
  assert.equal(t.aidTransfer, null, 'a held share has no transfer');
  assert.deepEqual(t.slices, [{ id: TX }]);
  // every key the printer writes has a counterpart in what the page keeps
  const keep = { diesel: 'price' };
  for (const key of Object.keys(raw)) assert.ok((keep[key] ?? key) in t, `${key} is read by the page`);
  assert.equal(carriedTotal(t.carried), 441.2);
});

test('carried amounts add up to the cent, and one unreadable amount makes the total unknown', () => {
  assert.equal(carriedTotal({ aid: 0.1, buyback: 0.2, team: 0 }), 0.3, 'no floating-point drift');
  assert.equal(carriedTotal({ aid: 0, buyback: 0, team: 0 }), 0);
  assert.equal(carriedTotal({ aid: 1, buyback: null, team: 0 }), null);
  assert.equal(carriedTotal(null), null);
  assert.deepEqual(readTicket({ n: 2, carried: { aid: -1, buyback: '5', team: 3 } }).carried, { aid: null, buyback: null, team: 3 });
  assert.equal(readTicket({ n: 2, carried: [1, 2, 3] }).carried, null);
  assert.equal(readTicket({ n: 2, carried: 'x' }).carried, null);
});

test('up to 48 slices are listed, as many as the printer and the order allow, and the count stays true', () => {
  assert.equal(MAX_SLICES, 48);
  assert.equal(MAX_SLICES, PLEIN_MAX_SLICES, 'the page lists as many slices as scripts/plein.mjs and scripts/ticket.mjs accept');
  const many = (count) => Array.from({ length: count }, () => ({ sig: TX, spent: 1, bought: 1 }));
  const full = readTicket({ n: 1, slices: many(48) });
  assert.equal(full.slices.length, 48);
  assert.equal(full.sliceCount, 48);
  const over = readTicket({ n: 1, slices: many(60) });
  assert.equal(over.slices.length, 48, 'the list is cut at the cap');
  assert.equal(over.sliceCount, 60, 'but the page still knows the real count and never labels it "i/48"');
});

test("what a ticket leaves in the réservoir is what scripts/plein.mjs says it leaves", () => {
  const sig = { sig: TX };
  const cases = [
    { name: 'nothing left', t: { aid: 341.2, team: 1480.81, carried: { aid: 0, buyback: 0, team: 0 }, unspent: 0, aidTransfer: sig, teamTransfer: sig } },
    { name: 'aid held', t: { aid: 341.2, team: 1480.81, carried: { aid: 0, buyback: 0, team: 0 }, unspent: 0, aidTransfer: null, teamTransfer: sig } },
    { name: 'aid held for the second week', t: { aid: 341.2, team: 1480.81, carried: { aid: 341.2, buyback: 0, team: 0 }, unspent: 0, aidTransfer: null, teamTransfer: sig } },
    { name: 'team waits, carried team too', t: { aid: 10.1, team: 20.2, carried: { aid: 0.3, buyback: 0, team: 40.4 }, unspent: 0, aidTransfer: sig, teamTransfer: null } },
    { name: 'unspent buyback', t: { aid: 341.2, team: 1480.81, carried: { aid: 0, buyback: 100, team: 0 }, unspent: 89.99, aidTransfer: sig, teamTransfer: sig } },
    { name: 'everything held', t: { aid: 0.07, team: 0.29, carried: { aid: 0.1, buyback: 0.2, team: 0.3 }, unspent: 0.7, aidTransfer: null, teamTransfer: null } },
  ];
  for (const { name, t } of cases) {
    const theirs = pleinHeldOver(t); // cents
    const mine = heldOver(readTicket({ n: 2, ...t }));
    assert.deepEqual(
      { aid: Math.round(mine.aid * 100), buyback: Math.round(mine.buyback * 100), team: Math.round(mine.team * 100) },
      theirs,
      name,
    );
  }
  assert.deepEqual(heldOver(readTicket(week2())), { aid: 682.4, buyback: 89.99, team: 0 });
});

test('a ticket that does not say what it left is unknown, not zero', () => {
  assert.equal(heldOver(null), null);
  // old shape, no carried block: the held share cannot be added up
  assert.equal(heldOver(readTicket({ n: 1, aid: 10, team: 20, unspent: 0, aidTransfer: null, teamTransfer: null })), null);
  // no unspent field: the buyback left over is unknown
  assert.equal(heldOver(readTicket({ n: 1, aid: 10, team: 20, carried: { aid: 0, buyback: 0, team: 0 }, aidTransfer: null, teamTransfer: null })), null);
  // both shares were paid out, so the missing carried block does not matter
  assert.deepEqual(
    heldOver(readTicket({ n: 1, aid: 10, team: 20, unspent: 0, aidTransfer: { sig: TX }, teamTransfer: { sig: TX } })),
    { aid: 0, buyback: 0, team: 0 },
  );
});

test('the planned buyback needs to know what the last plein left: before plein #1 nothing, afterwards the last ticket', () => {
  const lastPlein = Date.parse('2026-10-31T18:00:00+01:00');
  const week1Ticket = readTicket({ ...week2(), n: 1, at: '2026-10-24T18:00:00+02:00' });
  const week2Ticket = readTicket(week2());
  // no plein has run: nothing is carried, even if the tickets were not read
  assert.deepEqual(heldForNextPlein({ lastPlein: null }), { held: { aid: 0, buyback: 0, team: 0 }, reason: 'none', from: null });
  assert.equal(heldForNextPlein({}).reason, 'none');
  // a plein has run
  assert.deepEqual(heldForNextPlein({ lastPlein, indexRead: false }), { held: null, reason: 'loading', from: null });
  assert.deepEqual(heldForNextPlein({ lastPlein, indexRead: true, latest: null }), { held: null, reason: 'missing', from: null });
  assert.deepEqual(heldForNextPlein({ lastPlein, indexRead: true, latest: week1Ticket }), { held: null, reason: 'pending', from: 1 });
  assert.deepEqual(heldForNextPlein({ lastPlein, indexRead: true, latest: week2Ticket }), {
    held: { aid: 682.4, buyback: 89.99, team: 0 }, reason: 'ticket', from: 2,
  });
  assert.equal(heldForNextPlein({ lastPlein, indexRead: true, latest: { ...week2Ticket, at: null } }).reason, 'unreadable');
  assert.equal(heldForNextPlein({ lastPlein, indexRead: true, latest: { ...week2Ticket, unspent: null } }).reason, 'unreadable');
});
