import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buybackPct, buybackTenths, fillCost, frNumber, splitWeek, teamPct } from '../public/js/formula.js';

test('buyback rate is 20 × the diesel price, rounded to 0.1 point', () => {
  assert.equal(buybackPct(2.3283), 46.6); // official survey of 9 Oct 2026
  assert.equal(teamPct(2.3283), 43.4);
  assert.equal(buybackPct(2.356), 47.1); // official survey of 2 Oct 2026
  assert.equal(buybackPct(2.2), 44);
  assert.equal(buybackPct(2.346), 46.9);
});

test('exact halves round up, never down by float error', () => {
  assert.equal(buybackPct(2.1725), 43.5); // 20 × 2.1725 = 43.45 → 43.5 (float arithmetic gives 43.4)
  assert.equal(buybackPct(2.3225), 46.5);
  assert.equal(buybackPct(2.3425), 46.9);
});

test('every four-decimal price from 1.5000 to 3.2000 matches integer arithmetic', () => {
  for (let k = 15000; k <= 32000; k += 1) {
    const expected = Math.min(600, Math.max(300, Math.floor((20 * k + 500) / 1000)));
    assert.equal(buybackTenths(k / 10000), expected, `price ${k / 10000}`);
    assert.equal(teamPct(k / 10000), (900 - expected) / 10, `team at ${k / 10000}`);
  }
});

test('a fill-up costs price × litres, to the cent', () => {
  assert.equal(fillCost(2.3283, 50), 116.42); // 116.415 rounds up
  assert.equal(fillCost(2.346, 50), 117.3);
  assert.equal(fillCost(1.5, 40), 60);
});

test('the rate never leaves the 30–60 % band', () => {
  assert.equal(buybackPct(1.2), 30);
  assert.equal(buybackPct(1.5), 30);
  assert.equal(buybackPct(3), 60);
  assert.equal(buybackPct(3.4), 60);
});

test('when diesel rises, the team share is what shrinks', () => {
  assert.equal(teamPct(1.5), 60);
  assert.equal(teamPct(2.356), 42.9);
  assert.equal(teamPct(3), 30);
});

test('the weekly split matches the example ticket and adds back to the total', () => {
  const s = splitWeek(3412, 2.356);
  assert.deepEqual(s, { ratePct: 47.1, teamPct: 42.9, buyback: 1607.05, aid: 341.2, team: 1463.75, total: 3412 });
  assert.equal(Math.round((s.buyback + s.aid + s.team) * 100), 341200);
});

test('an empty week still prints a ticket', () => {
  assert.deepEqual(splitWeek(0, 2.356), { ratePct: 47.1, teamPct: 42.9, buyback: 0, aid: 0, team: 0, total: 0 });
});

test('bad inputs are refused instead of guessed', () => {
  assert.throws(() => buybackPct(0), RangeError);
  assert.throws(() => buybackPct('abc'), RangeError);
  assert.throws(() => splitWeek(-1, 2.3), RangeError);
});

test('French number formatting', () => {
  assert.equal(frNumber(2.356, 3), '2,356');
  assert.equal(frNumber(3412, 2).replace(/\s/g, ' '), '3 412,00');
});
