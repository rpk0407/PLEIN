// The loyalty card: pure logic, offline. A stamp per kind per ISO week, ten fill the card, a full
// card wins nothing, and a broken or missing storage never breaks the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS, STORAGE_KEY, addStamp, cardTaken, cardView, createKeeper, discardCard, emptyCard, isFull, parseCard, readCard, writeCard,
} from '../public/js/carte.js';

const at = (iso) => Date.parse(iso);
const WEEKS = [ // ten different Saturdays 18:30 in Paris, ISO weeks 43 to 52 and then 2027
  '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21',
  '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26',
].map((d) => at(`${d}T18:30:00+0${d < '2026-10-25' ? 2 : 1}:00`));

test('one stamp per kind per ISO week', () => {
  let card = emptyCard();
  let r = addStamp(card, 'monplein', at('2026-10-20T10:00:00+02:00')); // Tuesday of W43
  assert.equal(r.status, 'added');
  card = r.card;
  r = addStamp(card, 'monplein', at('2026-10-25T22:00:00+01:00')); // Sunday night, same ISO week
  assert.equal(r.status, 'duplicate');
  assert.deepEqual(r.card.stamps, [{ kind: 'monplein', week: '2026-W43' }]);
  r = addStamp(card, 'totem', at('2026-10-25T22:00:00+01:00')); // another kind, same week
  assert.equal(r.status, 'added');
  r = addStamp(card, 'monplein', at('2026-10-26T08:00:00+01:00')); // Monday: a new ISO week
  assert.equal(r.status, 'added');
  assert.equal(r.card.stamps.length, 2);
});

test('the week turns over Monday 00:00 in Paris, not in UTC', () => {
  const card = addStamp(emptyCard(), 'plein', at('2026-10-24T18:30:00+02:00')).card; // W43
  assert.equal(addStamp(card, 'plein', at('2026-10-25T23:30:00Z')).status, 'added'); // Monday 00:30 Paris = W44
  assert.equal(addStamp(card, 'plein', at('2026-10-25T21:30:00Z')).status, 'duplicate'); // Sunday 22:30 Paris = W43
});

test('input is validated and never mutated', () => {
  const card = emptyCard();
  assert.equal(addStamp(card, 'achat', at('2026-10-24T18:30:00+02:00')).status, 'invalid');
  assert.equal(addStamp(card, 'plein', NaN).status, 'invalid');
  addStamp(card, 'plein', at('2026-10-24T18:30:00+02:00'));
  assert.deepEqual(card, { v: 1, stamps: [], full: 0 });
});

test('ten stamps fill the card; a full card takes nothing more that week and counts once', () => {
  let card = emptyCard();
  WEEKS.slice(0, 9).forEach((t, i) => {
    const r = addStamp(card, 'plein', t);
    assert.equal(r.status, 'added', `stamp ${i + 1}`);
    card = r.card;
  });
  assert.equal(isFull(card), false);
  assert.equal(card.full, 0);
  const r = addStamp(card, 'plein', WEEKS[9]);
  card = r.card;
  assert.equal(card.stamps.length, SLOTS);
  assert.equal(isFull(card), true);
  assert.equal(card.full, 1);
  // same week, another kind: the card is full, nothing is taken, nothing changes
  const again = addStamp(card, 'totem', WEEKS[9]);
  assert.equal(again.status, 'full');
  assert.equal(again.card.stamps.length, SLOTS);
  assert.equal(again.card.full, 1);
  // an earlier week cannot reopen it either
  assert.equal(addStamp(card, 'totem', WEEKS[0]).status, 'full');
  // a later week starts a new card and keeps the count of the filled ones
  const next = addStamp(card, 'totem', at('2027-01-05T10:00:00+01:00'));
  assert.equal(next.status, 'added');
  assert.deepEqual(next.card, { v: 1, stamps: [{ kind: 'totem', week: '2027-W01' }], full: 1 });
});

test('the same week cannot be stamped twice by rolling the card over', () => {
  let card = emptyCard();
  WEEKS.forEach((t) => { card = addStamp(card, 'plein', t).card; });
  const nextWeek = at('2027-01-05T10:00:00+01:00');
  card = addStamp(card, 'totem', nextWeek).card; // new card
  assert.equal(addStamp(card, 'totem', nextWeek).status, 'duplicate');
  assert.equal(card.full, 1);
});

test('what the page shows', () => {
  let card = addStamp(emptyCard(), 'monplein', at('2026-10-20T10:00:00+02:00')).card;
  card = addStamp(card, 'totem', at('2026-10-21T10:00:00+02:00')).card;
  const view = cardView(card, at('2026-10-22T10:00:00+02:00'));
  assert.equal(view.count, 2);
  assert.equal(view.slots, 10);
  assert.equal(view.full, false);
  assert.deepEqual(view.thisWeek, { plein: false, monplein: true, totem: true, ticket: false });
  assert.equal(cardView(card, at('2026-10-27T10:00:00+01:00')).thisWeek.monplein, false); // next week
});

test('stored data is cleaned, not trusted', () => {
  assert.deepEqual(parseCard('not json'), emptyCard());
  assert.deepEqual(parseCard(null), emptyCard());
  assert.deepEqual(parseCard({ v: 2, stamps: [] }), emptyCard());
  assert.deepEqual(parseCard({ v: 1, stamps: 'x' }), emptyCard());
  const messy = parseCard(JSON.stringify({
    v: 1,
    full: -4,
    stamps: [
      { kind: 'plein', week: '2026-W43' },
      { kind: 'plein', week: '2026-W43' },            // duplicate
      { kind: 'achat', week: '2026-W43' },            // unknown kind
      { kind: 'totem', week: 'yesterday' },           // bad week
      { kind: 'ticket', week: '<img src=x>' },        // markup is not a week
      null,
      { kind: 'monplein', week: '2026-W44', extra: 1 },
    ],
  }));
  assert.deepEqual(messy, { v: 1, stamps: [{ kind: 'plein', week: '2026-W43' }, { kind: 'monplein', week: '2026-W44' }], full: 0 });
  const huge = parseCard({ v: 1, full: 1, stamps: Array.from({ length: 30 }, (_, i) => ({ kind: 'plein', week: `2026-W${String(i + 1).padStart(2, '0')}` })) });
  assert.equal(huge.stamps.length, SLOTS);
  assert.equal(huge.full, 1);
});

test('storage that is missing, blocked or full never throws', () => {
  assert.equal(readCard(null), null);
  assert.equal(writeCard(null, emptyCard()), false);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(readCard(blocked), null);
  assert.equal(writeCard(blocked, emptyCard()), false);
  const mem = new Map();
  const ok = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(readCard(ok), emptyCard()); // nothing stored yet: an empty card, not null
  const card = addStamp(emptyCard(), 'totem', at('2026-10-20T10:00:00+02:00')).card;
  assert.equal(writeCard(ok, card), true);
  assert.deepEqual(JSON.parse(mem.get(STORAGE_KEY)), card);
  assert.deepEqual(readCard(ok), card);
  mem.set(STORAGE_KEY, '{broken');
  assert.deepEqual(readCard(ok), emptyCard());
});

// A storage that remembers every write, so "nothing written before the visitor asks" can be checked.
function recordingStorage(initial = {}) {
  const mem = new Map(Object.entries(initial));
  const writes = [];
  return {
    mem,
    writes,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { writes.push(['set', k]); mem.set(k, v); },
    removeItem: (k) => { writes.push(['remove', k]); mem.delete(k); },
  };
}

test('taken or not: the key is the visitor\'s choice, and reading it writes nothing', () => {
  const s = recordingStorage();
  assert.equal(cardTaken(s), false);
  assert.equal(cardTaken(null), false);
  assert.equal(cardTaken({ getItem() { throw new Error('SecurityError'); } }), false);
  assert.deepEqual(s.writes, []);
  writeCard(s, emptyCard());
  assert.equal(cardTaken(s), true, 'an empty card that was taken counts as taken');
  assert.equal(discardCard(s), true);
  assert.equal(cardTaken(s), false);
  assert.equal(discardCard(null), false);
  assert.equal(discardCard({ removeItem() { throw new Error('SecurityError'); } }), false);
});

test('stamps stay in memory until the visitor takes the card; the click is the first write', () => {
  const s = recordingStorage();
  const keeper = createKeeper(s);
  assert.equal(keeper.taken, false);
  // a Mon Plein search, a PNG export, a Solscan click, a Saturday on the page: all stamp, none writes
  assert.equal(keeper.stamp('plein', at('2026-10-24T18:30:00+02:00')), 'added');
  assert.equal(keeper.stamp('monplein', at('2026-10-24T18:31:00+02:00')), 'added');
  assert.equal(keeper.stamp('monplein', at('2026-10-24T18:32:00+02:00')), 'duplicate');
  assert.equal(keeper.card.stamps.length, 2, 'the visit still sees its stamps');
  assert.deepEqual(s.writes, [], 'nothing was written to the browser');
  assert.equal(s.mem.size, 0);
  // the card is taken: the stamps so far are written, and so is each new one
  assert.equal(keeper.take(), true);
  assert.equal(keeper.taken, true);
  assert.deepEqual(s.writes, [['set', STORAGE_KEY]]);
  assert.equal(JSON.parse(s.mem.get(STORAGE_KEY)).stamps.length, 2);
  assert.equal(keeper.stamp('totem', at('2026-10-24T18:40:00+02:00')), 'added');
  assert.equal(JSON.parse(s.mem.get(STORAGE_KEY)).stamps.length, 3);
  assert.equal(keeper.take(), true, 'taking it twice changes nothing');
  assert.equal(s.writes.length, 2);
  // a later visit finds the card taken and loads it
  const back = createKeeper(s);
  assert.equal(back.taken, true);
  assert.equal(back.card.stamps.length, 3);
});

test('throwing the card away removes the key, and a stamp after that does not bring it back', () => {
  const s = recordingStorage();
  const keeper = createKeeper(s);
  keeper.stamp('totem', at('2026-10-24T18:30:00+02:00'));
  keeper.take();
  assert.equal(keeper.discard(), true);
  assert.equal(keeper.taken, false);
  assert.equal(s.mem.has(STORAGE_KEY), false);
  assert.deepEqual(keeper.card, emptyCard());
  assert.equal(keeper.stamp('totem', at('2026-10-24T18:31:00+02:00')), 'added');
  assert.equal(s.mem.has(STORAGE_KEY), false, 'a new stamp stays in memory');
  // another tab threw it away while this one still believed it was taken
  const shared = recordingStorage();
  const one = createKeeper(shared);
  one.take();
  const two = createKeeper(shared);
  assert.equal(two.taken, true);
  one.discard();
  assert.equal(two.stamp('plein', at('2026-10-24T18:30:00+02:00')), 'added');
  assert.equal(two.taken, false);
  assert.equal(shared.mem.has(STORAGE_KEY), false, 'the second tab does not resurrect the card');
});

test('a browser that refuses storage never breaks the card: it lives for the visit', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('SecurityError'); } };
  for (const storage of [null, blocked]) {
    const keeper = createKeeper(storage);
    assert.equal(keeper.stamp('totem', at('2026-10-24T18:30:00+02:00')), 'added');
    assert.equal(keeper.take(), false, 'the card could not be kept');
    assert.equal(keeper.taken, false);
    assert.equal(keeper.card.stamps.length, 1, 'the stamp is still there for this visit');
    assert.equal(keeper.discard(), false);
  }
});

test('an old card written by an earlier version of the page is taken as it is', () => {
  const old = { v: 1, stamps: [{ kind: 'plein', week: '2026-W43' }], full: 0 };
  const s = recordingStorage({ [STORAGE_KEY]: JSON.stringify(old) });
  const keeper = createKeeper(s);
  assert.equal(keeper.taken, true);
  assert.deepEqual(keeper.card, old);
});
