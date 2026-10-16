// The two endpoints, run against a stubbed official feed (the real one is probed in CI by
// scripts/check-feed.mjs). Checks the arithmetic and the département fallback, not the feed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import diesel from '../api/diesel.js';
import stations from '../api/stations.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; };
  return res;
}
/** Stub the feed: `answer(params)` returns the JSON body for one request. */
function stubFeed(answer) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const params = Object.fromEntries(new URL(url).searchParams);
    calls.push(params);
    return { ok: true, status: 200, json: async () => answer(params) };
  };
  return calls;
}
const station = (id, price, cp = '13001') => ({
  id, cp, ville: 'Marseille', adresse: `${id} rue de la Pompe`, gazole_prix: price,
  gazole_maj: new Date(Date.now() - 2 * 3600000).toISOString(), geom: { lat: 43.3, lon: 5.4 },
});

test('a postcode with enough stations is answered on its own, spread over every station', async () => {
  const calls = stubFeed((p) => (p.select.startsWith('count(')
    ? { results: [{ count: 12, average: 2.3, min: 2.2, max: 2.5 }] }
    : { results: [station('a', 2.2), station('b', 2.21), station('c', 2.25)] }));
  const res = fakeRes();
  await stations({ query: { cp: '13001', fuel: 'gazole', tank: '50' } }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.area, 'postcode');
  assert.equal(body.count, 12);
  assert.equal(body.spread, 0.3); // dearest minus cheapest of all 12, not of the three shown
  assert.equal(body.stations.length, 3);
  assert.equal(body.stations[0].saving, 5); // (2.30 − 2.20) × 50 L
  assert.match(calls[0].where, /cp = "13001"/);
  assert.equal(calls.length, 2);
});

test('too few stations in a postcode widens the search to the département', async () => {
  const calls = stubFeed((p) => {
    if (p.select.startsWith('count(')) {
      return { results: [p.where.includes('startswith') ? { count: 240, average: 2.33, min: 2.19, max: 2.61 } : { count: 1, average: 2.4, min: 2.4, max: 2.4 }] };
    }
    return { results: [station('a', 2.19, '13100'), station('b', 2.2, '13090')] };
  });
  const res = fakeRes();
  await stations({ query: { cp: '13001', fuel: 'gazole', tank: '40' } }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.area, 'departement');
  assert.match(calls[1].where, /startswith\(cp, "13"\)/);
  assert.equal(body.spread, 0.42);
  assert.equal(body.stations.length, 2);
});

test('overseas postcodes widen to their three-digit département', async () => {
  const calls = stubFeed((p) => (p.select.startsWith('count(')
    ? { results: [{ count: 0 }] }
    : { results: [] }));
  const res = fakeRes();
  await stations({ query: { cp: '97400', fuel: 'gazole' } }, res);
  assert.equal(res.statusCode, 404);
  assert.match(calls[1].where, /startswith\(cp, "974"\)/);
});

test('prices published in thousandths are read as euros', async () => {
  stubFeed((p) => (p.select.startsWith('count(')
    ? { results: [{ count: 4, average: 2300, min: 2200, max: 2400 }] }
    : { results: [station('a', 2200)] }));
  const res = fakeRes();
  await stations({ query: { cp: '13001', fuel: 'gazole' } }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.stations[0].price, 2.2);
  assert.equal(body.spread, 0.2);
});

test('bad input is refused before the feed is called', async () => {
  const calls = stubFeed(() => ({ results: [] }));
  for (const query of [{ cp: '1300' }, { cp: '13001"; drop' }, { cp: '13001', fuel: 'kerosene' }]) {
    const res = fakeRes();
    await stations({ query }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test('the national averages come back in euros, and a feed failure is a 502', async () => {
  stubFeed(() => ({ results: [{ average: 2346.4, stations: 9000 }] }));
  const ok = fakeRes();
  await diesel({ query: {} }, ok);
  assert.equal(JSON.parse(ok.body).live.gazole, 2.346);

  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const down = fakeRes();
  await diesel({ query: {} }, down);
  assert.equal(down.statusCode, 502);
});
