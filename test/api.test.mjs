// The two endpoints, run against a stand-in for the official feed (the real one is probed in CI
// by scripts/check-feed.mjs). The stand-in holds station rows and answers the `where`, `select`,
// `order_by` and `limit` the endpoints send, so these tests check what comes back for a given set
// of stations: the arithmetic, the 72-hour freshness, the typo filter (area average AND national
// floor), the département fallback, the response cache, the timeouts and the 429 handling.
import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import diesel from '../api/diesel.js';
import stations from '../api/stations.js';
import {
  ENDPOINT_TIMEOUT_MS, FIELDS, FLOOR_MIN_SAMPLE, FRESH_HOURS, SEARCH_DEADLINE_MS,
  clearFeedCache, floorClause, freshClause, isFresh, nationalFloor, queryRecords, underClause,
} from '../api/_feed.js';

const realFetch = globalThis.fetch;
beforeEach(() => clearFeedCache());
afterEach(() => { globalThis.fetch = realFetch; clearFeedCache(); });

const HOUR = 3600000;
const NB = ' ';
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; };
  return res;
}

/**
 * A station row as the feed has it. `gazole` and `e10` are prices (null = does not sell it);
 * the ages say how many hours ago that price was declared.
 */
function station(id, { cp = '13001', gazole = null, gazoleAge = 2, e10 = null, e10Age = 2, sp98 = null, sp98Age = 2 } = {}) {
  return {
    id, cp, ville: 'Marseille', adresse: `${id} rue de la Pompe`, geom: { lat: 43.3, lon: 5.4 },
    [FIELDS.gazole.price]: gazole, [FIELDS.gazole.updated]: gazole == null ? null : ago(gazoleAge),
    [FIELDS.e10.price]: e10, [FIELDS.e10.updated]: e10 == null ? null : ago(e10Age),
    [FIELDS.sp98.price]: sp98, [FIELDS.sp98.updated]: sp98 == null ? null : ago(sp98Age),
  };
}

/** `n` prices spread evenly from `lo` to `hi`, in the unit the caller writes them in. */
function spread(n, lo, hi) {
  return Array.from({ length: n }, (_, i) => Math.round((lo + ((hi - lo) * i) / (n - 1)) * 1e6) / 1e6);
}

/**
 * Stations in another département, so that national figures (the price floor) rest on a sample
 * as large as the real feed's, whatever the area under test holds. One price per station.
 */
function elsewhere(prices, fuel = 'gazole') {
  return prices.map((p, i) => station(`n${fuel}${i}`, { cp: '75011', [fuel]: p }));
}

/**
 * Does one row satisfy a `where` clause? Only the clause shapes api/ sends are understood; anything
 * else (a renamed function, a clause the feed would refuse) throws, which fails the test loudly.
 */
function matches(where, row) {
  const now = Date.now();
  const js = where
    .replace(/now\(hours=(-?\d+)\)/g, (_, h) => String(now + Number(h) * HOUR))
    .replace(/startswith\((\w+), "([^"]*)"\)/g, (_, f, v) => `String(row.${f}).startsWith(${JSON.stringify(v)})`)
    .replace(/(\w+) = "([^"]*)"/g, (_, f, v) => `(row.${f} === ${JSON.stringify(v)})`)
    .replace(/(\w+_maj)/g, (_, f) => `Date.parse(row.${f})`)
    .replace(/(\w+_prix)/g, (_, f) => `row.${f}`)
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||');
  return new Function('row', `return ${js};`)(row);
}

/** What the feed answers for one request over `rows`: an aggregate row, or the ordered rows. */
function answer(rows, { select, where = 'true', order_by: orderBy, limit }) {
  const hit = rows.filter((row) => matches(where, row));
  if (/\b(count|avg|min|max|percentile)\(/.test(select)) {
    if (hit.length === 0) return { total_count: 0, results: [] }; // the feed sends no row for an empty set
    const out = {};
    for (const [, field, p, as] of select.matchAll(/percentile\((\w+), (\d+)\) as (\w+)/g)) {
      const sorted = hit.map((r) => r[field]).filter((v) => v != null).sort((a, b) => a - b);
      const rank = ((sorted.length - 1) * Number(p)) / 100; // linear interpolation between ranks
      const lo = Math.floor(rank);
      out[as] = sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (rank - lo);
    }
    for (const [, fn, field, as] of select.matchAll(/(count|avg|min|max)\((\w+)\) as (\w+)/g)) {
      const values = hit.map((r) => r[field]).filter((v) => v != null);
      out[as] = fn === 'count' ? values.length
        : fn === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length
          : fn === 'min' ? Math.min(...values) : Math.max(...values);
    }
    return { total_count: 1, results: [out] };
  }
  const [by, dir] = (orderBy || '').split(' ');
  const sorted = by ? [...hit].sort((a, b) => (a[by] - b[by]) * (dir === 'desc' ? -1 : 1)) : hit;
  return { total_count: hit.length, results: sorted.slice(0, Number(limit) || 100) };
}

/** Stand in for the feed with `rows`; returns the requests it received. */
function stubFeed(rows) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const params = Object.fromEntries(new URL(url).searchParams);
    calls.push(params);
    return { ok: true, status: 200, json: async () => answer(rows, params) };
  };
  return calls;
}

async function ask(query) {
  const res = fakeRes();
  await stations({ query }, res);
  return { res, body: JSON.parse(res.body) };
}

// ------------------------------------------------------------------ the clauses themselves

test('the freshness clause is built from the fuel own update field, 72 hours back', () => {
  assert.equal(FRESH_HOURS, 72);
  assert.equal(freshClause('gazole_maj'), '(gazole_maj >= now(hours=-72) and gazole_maj <= now(hours=24))');
  assert.match(freshClause('e10_maj'), /^\(e10_maj >= now\(hours=-72\)/);
});

test('isFresh: inside 72 hours yes, older no, no date no, a date days ahead no', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const at = (hours) => new Date(now + hours * HOUR).toISOString();
  assert.equal(isFresh(at(-71), now), true);
  assert.equal(isFresh(at(-73), now), false);
  assert.equal(isFresh(at(0.25), now), true); // the feed stamps up to a quarter hour ahead
  assert.equal(isFresh(at(30), now), false);
  for (const bad of [null, undefined, '', 'hier']) assert.equal(isFresh(bad, now), false);
});

test('the price floor is cut down to a thousandth and written in the feed unit', () => {
  assert.equal(floorClause('gazole_prix', 1.765, 1), 'gazole_prix >= 1.765');
  assert.equal(floorClause('gazole_prix', 1.7659, 1), 'gazole_prix >= 1.765');
  assert.equal(floorClause('gazole_prix', 1.765, 1000), 'gazole_prix >= 1765');
  assert.equal(underClause('gazole_prix', 1.7659, 1), 'gazole_prix < 1.765'); // the exact complement
  assert.equal(underClause('gazole_prix', 1.765, 1000), 'gazole_prix < 1765');
});

test('the endpoints cap each feed request and the whole search under the page\'s own 10 s', () => {
  assert.ok(ENDPOINT_TIMEOUT_MS <= 3000);
  assert.ok(SEARCH_DEADLINE_MS < 10000);
});

// ------------------------------------------------------------------ /api/stations

test('a postcode with enough fresh stations is answered on its own, spread over all of them', async () => {
  const prices = [2.20, 2.21, 2.25, 2.28, 2.30, 2.30, 2.31, 2.33, 2.35, 2.36, 2.38, 2.50];
  const calls = stubFeed(prices.map((p, i) => station(`s${i}`, { gazole: p })));
  const { res, body } = await ask({ cp: '13001', fuel: 'gazole', tank: '50' });
  assert.equal(res.statusCode, 200);
  assert.equal(body.area, 'postcode');
  assert.equal(body.count, 12);
  assert.equal(body.average, 2.314);
  assert.equal(body.spread, 0.3); // dearest minus cheapest of all 12, not of the three shown
  assert.equal(body.stations.length, 3);
  assert.deepEqual(body.stations.map((s) => s.price), [2.2, 2.21, 2.25]);
  assert.equal(body.stations[0].saving, 5.71); // (2.3142 − 2.20) × 50 L
  assert.equal(body.stations[0].updatedLabel, `mis à jour il y a 2${NB}h`);
  assert.equal(body.freshHours, 72);
  assert.deepEqual([body.freshCount, body.staleCount, body.outlierCount], [12, 0, 0]);
  assert.equal(body.note, `Prix mis à jour il y a moins de 72${NB}h.`);
  assert.match(calls[0].where, /cp = "13001"/);
  assert.equal(body.nationalFloor, null); // 12 stations are too few to read a national floor from
  assert.equal(calls.length, 4); // fresh prices summed up, national floor, three cheapest, all prices counted
});

test('a stale cheaper station is skipped, left out of the figures, and counted', async () => {
  const calls = stubFeed([
    station('stale', { gazole: 2.0, gazoleAge: 100 }), // cheapest, but declared 100 hours ago
    station('a', { gazole: 2.20 }), station('b', { gazole: 2.25 }),
    station('c', { gazole: 2.30 }), station('d', { gazole: 2.35 }),
  ]);
  const { res, body } = await ask({ cp: '13001', fuel: 'gazole', tank: '50' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.stations.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(body.min, 2.2);
  assert.equal(body.average, 2.275); // the stale 2.00 is not in it
  assert.deepEqual([body.freshCount, body.staleCount, body.outlierCount, body.count], [4, 1, 0, 4]);
  assert.match(body.note, /1 station écartée \(prix plus ancien\)\./);
  const aged = (c) => c.where.includes('gazole_maj >= now(hours=-72)');
  assert.ok(calls.filter((c) => c.select.includes('avg(')).every(aged), 'the figures are computed on fresh prices only');
  assert.ok(calls.filter((c) => c.order_by).every(aged), 'the station list itself is filtered by age');
  assert.ok(calls.some((c) => !aged(c)), 'the old prices are still counted, to say how many were left out');
});

test('each fuel is judged by its own update field, never the diesel one', async () => {
  const rows = [
    station('a', { gazole: 2.10, e10: 1.80, e10Age: 120 }), // diesel fresh, petrol price old
    station('b', { gazole: 2.30, e10: 2.10 }),
    station('c', { gazole: 2.32, e10: 2.12 }),
    station('d', { gazole: 2.34, e10: 2.14 }),
    station('e', { e10: 2.11 }), // sells petrol only: it has no diesel date at all
  ];
  stubFeed(rows);
  const fuelDiesel = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(fuelDiesel.body.stations[0].id, 'a'); // its diesel price is fresh, whatever its petrol price
  assert.equal(fuelDiesel.body.staleCount, 0);

  const calls = stubFeed(rows);
  const petrol = await ask({ cp: '13001', fuel: 'e10' });
  assert.deepEqual(petrol.body.stations.map((s) => s.id), ['b', 'e', 'c']); // 'a' is out: its e10 price is old
  assert.deepEqual([petrol.body.freshCount, petrol.body.staleCount], [4, 1]);
  assert.ok(calls.some((c) => c.where.includes('e10_maj')));
  assert.ok(calls.every((c) => !c.where.includes('gazole')));
});

test('no query hard-codes a fuel: every fuel is filtered on its own fields only', async () => {
  for (const fuel of Object.keys(FIELDS)) {
    const calls = stubFeed([2.20, 2.25, 2.30, 2.35].map((p, i) => station(`s${i}`, { gazole: p, e10: p - 0.2, sp98: p - 0.1 })));
    const { res } = await ask({ cp: '13001', fuel });
    assert.equal(res.statusCode, 200);
    const others = Object.entries(FIELDS).filter(([name]) => name !== fuel).flatMap(([, f]) => [f.price, f.updated]);
    assert.ok(calls.length > 0);
    assert.ok(calls.some((c) => c.where.includes(FIELDS[fuel].updated)), `${fuel}: no request filters on ${FIELDS[fuel].updated}`);
    for (const c of calls) {
      assert.ok(c.where.includes(FIELDS[fuel].price), `${fuel}: ${c.where}`);
      for (const other of others) {
        assert.ok(!c.where.includes(other), `${fuel} query mentions ${other}`);
        assert.ok(!c.select.includes(other), `${fuel} query selects ${other}`);
      }
    }
    assert.ok(calls.some((x) => x.order_by), `${fuel}: the station list was never requested`);
    for (const c of calls.filter((x) => x.order_by)) {
      assert.ok(c.select.includes(FIELDS[fuel].updated), `${fuel}: the station list does not select ${FIELDS[fuel].updated}`);
    }
  }
});

test('a price far under the area average and under the national floor is skipped and counted, a merely cheap one is kept', async () => {
  stubFeed([
    station('typo', { gazole: 1.29 }), // 0.72 under the average
    station('cheap', { gazole: 2.00 }), // 0.16 under the corrected average: a real bargain
    station('a', { gazole: 2.20 }), station('b', { gazole: 2.20 }),
    station('c', { gazole: 2.20 }), station('d', { gazole: 2.20 }),
    ...elsewhere(spread(250, 2.20, 2.40)), // the rest of France: the national floor sits near 2,15
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole', tank: '50' });
  assert.equal(body.outlierCount, 1);
  assert.deepEqual([body.freshCount, body.count], [6, 5]);
  assert.ok(body.nationalFloor > 2.1 && body.nationalFloor < 2.2, `floor ${body.nationalFloor}`);
  assert.ok(!body.stations.some((s) => s.id === 'typo'));
  assert.equal(body.stations[0].id, 'cheap');
  assert.equal(body.min, 2); // the typo is not the minimum
  assert.equal(body.average, 2.16); // nor does it drag the average down
  assert.equal(body.stations[0].saving, 8); // (2.16 − 2.00) × 50 L
  assert.ok(body.note.includes(`1 prix écarté (plus de 0,25${NB}€/L sous la moyenne de la zone et sous le plancher national de 2,`), body.note);
  assert.ok(new RegExp(`de 2,\\d{3}${NB}€/L\\)\\.$`).test(body.note), body.note);
});

test('a real cheap price is kept when dear neighbours pull the average up (75016 diesel on 17 October)', async () => {
  stubFeed([
    station('c1', { cp: '75016', gazole: 2.25 }), station('c2', { cp: '75016', gazole: 2.25 }),
    station('d1', { cp: '75016', gazole: 2.649 }), station('d2', { cp: '75016', gazole: 2.669 }),
    station('d3', { cp: '75016', gazole: 2.699 }),
    ...elsewhere(spread(250, 2.25, 2.80)), // nothing nationally under 2,25: the floor is 2,20
  ]);
  const { body } = await ask({ cp: '75016', fuel: 'gazole' });
  // the area average is 2,503, so 2,25 is 0,25 under it, but it is not under the national floor
  assert.equal(body.outlierCount, 0);
  assert.ok(body.nationalFloor > 2.19 && body.nationalFloor < 2.21, `floor ${body.nationalFloor}`);
  assert.deepEqual(body.stations.slice(0, 2).map((s) => s.price), [2.25, 2.25]);
  assert.equal(body.min, 2.25);
  assert.doesNotMatch(body.note, /prix écarté/);
});

test('a chain-wide 1,99 price is kept: it is common nationally, so the floor is under it', async () => {
  stubFeed([
    station('c1', { cp: '33000', sp98: 1.99 }), station('c2', { cp: '33000', sp98: 1.99 }),
    ...[2.6, 2.62, 2.64, 2.66].map((p, i) => station(`d${i}`, { cp: '33000', sp98: p })),
    ...elsewhere([...Array(30).fill(1.99), ...Array(230).fill(2.30)], 'sp98'), // a chain sells at 1,99 everywhere
  ]);
  const { body } = await ask({ cp: '33000', fuel: 'sp98' });
  assert.equal(body.nationalFloor, 1.94);
  assert.equal(body.outlierCount, 0);
  assert.deepEqual(body.stations.slice(0, 2).map((s) => s.price), [1.99, 1.99]);
  assert.equal(body.min, 1.99);
});

test('a lone price nobody charges is dropped even when the area average is high', async () => {
  stubFeed([
    station('lone', { gazole: 1.381 }),
    ...[2.25, 2.30, 2.35, 2.40].map((p, i) => station(`s${i}`, { gazole: p })),
    ...elsewhere(Array(250).fill(2.30)),
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(body.nationalFloor, 2.25);
  assert.equal(body.outlierCount, 1);
  assert.ok(!body.stations.some((s) => s.id === 'lone'));
  assert.equal(body.min, 2.25);
  assert.ok(body.note.includes(`plancher national de 2,250${NB}€/L`), body.note);
});

test('without a readable national floor no price is set aside, and the answer says so', async () => {
  const calls = stubFeed([
    station('typo', { cp: '13001', gazole: 1.20 }), station('a', { cp: '13001', gazole: 2.20 }),
    station('b', { cp: '13001', gazole: 2.22 }), station('c', { cp: '13001', gazole: 2.24 }),
    ...elsewhere(spread(250, 2.20, 2.40)),
  ]);
  const inner = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (new URL(url).searchParams.get('select').includes('percentile(')) return { ok: false, status: 400, json: async () => ({}) };
    return inner(url);
  };
  const { res, body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(res.statusCode, 200);
  assert.equal(body.nationalFloor, null);
  assert.equal(body.outlierCount, 0);
  assert.equal(body.stations[0].id, 'typo'); // not hidden, not guessed at
  assert.ok(calls.every((c) => !c.select.includes('percentile(')), 'the refused floor query never reached the stand-in');
});

test('a floor query that failed is not retried by the next visitor for a minute', async () => {
  stubFeed([2.20, 2.22, 2.24, 2.26].map((p, i) => station(`s${i}`, { gazole: p })));
  const inner = globalThis.fetch;
  let floorQueries = 0;
  globalThis.fetch = async (url) => {
    if (new URL(url).searchParams.get('select').includes('percentile(')) {
      floorQueries += 1;
      return { ok: false, status: 400, json: async () => ({}) };
    }
    return inner(url);
  };
  await ask({ cp: '13001', fuel: 'gazole' });
  await ask({ cp: '13001', fuel: 'gazole', tank: '60' });
  await ask({ cp: '13002', fuel: 'gazole' });
  assert.equal(floorQueries, 1);
});

test('the typo floor is written in thousandths when the feed publishes thousandths', async () => {
  const calls = stubFeed([
    ...[2200, 2210, 2220, 2230, 2240, 1290].map((p, i) => station(`s${i}`, { gazole: p })),
    ...elsewhere(spread(250, 2200, 2400).map(Math.round)),
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(body.outlierCount, 1);
  assert.equal(body.average, 2.22);
  assert.equal(body.stations[0].price, 2.2);
  assert.ok(body.nationalFloor > 2.1 && body.nationalFloor < 2.2, `floor ${body.nationalFloor}`);
  assert.ok(calls.some((c) => c.where.includes('gazole_prix >= 1815')), calls.map((c) => c.where).join('\n'));
});

test('nationalFloor: the first percentile minus 0,05, in euros, and null on a thin sample or a failure', async () => {
  stubFeed(elsewhere(spread(FLOOR_MIN_SAMPLE, 2.30, 2.60)));
  const floor = await nationalFloor('gazole');
  assert.ok(floor > 2.24 && floor < 2.26, `floor ${floor}`); // 1st percentile of 2,30..2,60, minus 0,05
  stubFeed(elsewhere(spread(FLOOR_MIN_SAMPLE - 1, 2.30, 2.60)));
  assert.equal(await nationalFloor('gazole'), null);
  stubFeed(elsewhere(spread(FLOOR_MIN_SAMPLE, 2300, 2600).map(Math.round)));
  const fromThousandths = await nationalFloor('gazole'); // thousandths come back as euros
  assert.ok(Math.abs(fromThousandths - floor) < 0.002, `${fromThousandths} vs ${floor}`);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await nationalFloor('e10'), null);
});

test('a postcode with fewer than three stations widens to its département', async () => {
  const calls = stubFeed([
    station('a', { cp: '13001', gazole: 2.20 }),
    station('b', { cp: '13100', gazole: 2.19 }), station('c', { cp: '13090', gazole: 2.31 }),
    station('d', { cp: '13090', gazole: 2.32 }), station('e', { cp: '13090', gazole: 2.33 }),
    station('f', { cp: '69003', gazole: 1.95 }), // another département, never counted
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole', tank: '40' });
  assert.equal(body.area, 'departement');
  assert.ok(calls.some((c) => /startswith\(cp, "13"\)/.test(c.where)));
  assert.deepEqual(body.stations.map((s) => s.id), ['b', 'a', 'c']);
  assert.equal(body.count, 5);
});

test('the widening also runs when the fresh stations are too few, even if the postcode lists more', async () => {
  stubFeed([
    station('a', { cp: '13001', gazole: 2.20 }), station('b', { cp: '13001', gazole: 2.25 }),
    station('x', { cp: '13001', gazole: 2.00, gazoleAge: 100 }), // three more in the postcode,
    station('y', { cp: '13001', gazole: 2.01, gazoleAge: 100 }), // all declared days ago
    station('z', { cp: '13001', gazole: 2.02, gazoleAge: 100 }),
    ...[2.30, 2.31, 2.32, 2.33, 2.34, 2.35].map((p, i) => station(`d${i}`, { cp: '13100', gazole: p })),
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(body.area, 'departement'); // 5 listed in 13001, only 2 fresh
  assert.deepEqual([body.freshCount, body.staleCount, body.count], [8, 3, 8]);
  assert.equal(body.stations[0].id, 'a');
  assert.ok(!body.stations.some((s) => ['x', 'y', 'z'].includes(s.id)));
});

test('the widening runs when outliers leave fewer than three stations', async () => {
  stubFeed([
    station('a', { cp: '13001', gazole: 2.20 }), station('b', { cp: '13001', gazole: 2.22 }),
    station('typo', { cp: '13001', gazole: 1.20 }),
    ...[2.30, 2.31, 2.32, 2.33, 2.34, 2.35].map((p, i) => station(`d${i}`, { cp: '13100', gazole: p })),
    ...elsewhere(spread(250, 2.20, 2.40)), // a national sample, so the typo can be told from a bargain
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(body.area, 'departement'); // 3 fresh in the postcode, 2 once the typo is set aside
  assert.equal(body.stations[0].id, 'a');
  assert.ok(!body.stations.some((s) => s.id === 'typo'));
});

test('when everything in reach is old the answer is a 404 that says how many were left out', async () => {
  stubFeed([2.1, 2.2, 2.3, 2.4].map((p, i) => station(`s${i}`, { gazole: p, gazoleAge: 100 })));
  const { res, body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(res.statusCode, 404);
  assert.equal(body.error, 'no_stations');
  assert.deepEqual([body.freshCount, body.staleCount, body.outlierCount], [0, 4, 0]);
  assert.match(body.note, /4 stations écartées/);
});

test('a row the feed lets through is still refused when it is not fresh', async () => {
  const old = station('old', { gazole: 2.0, gazoleAge: 120 });
  const fine = station('fine', { gazole: 2.2 });
  globalThis.fetch = async (url) => {
    const p = Object.fromEntries(new URL(url).searchParams);
    const results = p.select.startsWith('count(')
      ? [{ count: 5, average: 2.3, min: 2.2, max: 2.4 }]
      : [old, fine];
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.deepEqual(body.stations.map((s) => s.id), ['fine']);
});

test('overseas postcodes widen to their three-digit département', async () => {
  const calls = stubFeed([]);
  const { res } = await ask({ cp: '97400', fuel: 'gazole' });
  assert.equal(res.statusCode, 404);
  assert.ok(calls.some((c) => /startswith\(cp, "974"\)/.test(c.where)));
});

test('bad input is refused before the feed is called', async () => {
  const calls = stubFeed([]);
  for (const query of [{ cp: '1300' }, { cp: '13001"; drop' }, { cp: '13001', fuel: 'kerosene' }]) {
    const { res } = await ask(query);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test('a feed that refuses the request is a 502, never an unfiltered answer', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error_code: 'InvalidWhere' }) });
  const { res, body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(res.statusCode, 502);
  assert.equal(body.error, 'feed_unavailable');
  assert.equal(body.stations, undefined);
});

// ------------------------------------------------------------------ /api/diesel

test('the national averages come back in euros, from prices published in thousandths', async () => {
  stubFeed([2340, 2352, 2347].map((p, i) => station(`s${i}`, { gazole: p })));
  const res = fakeRes();
  await diesel({ query: {} }, res);
  assert.equal(JSON.parse(res.body).live.gazole, 2.346);
});

test('the national average ignores stale prices, fuel by fuel, and says how many it left out', async () => {
  stubFeed([
    station('r1', { gazole: 2.0, e10: 2.0 }),
    station('r2', { gazole: 2.2, e10: 2.2 }),
    station('r3', { gazole: 2.1, e10: 1.0, e10Age: 200 }), // diesel fresh, petrol price old
    station('r4', { gazole: 1.0, gazoleAge: 200, e10: 2.4 }), // petrol fresh, diesel price old
    station('r5', { gazole: 1.1, gazoleAge: 200 }),
  ]);
  const res = fakeRes();
  await diesel({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  const { live } = JSON.parse(res.body);
  assert.equal(live.gazole, 2.1); // (2.0 + 2.2 + 2.1) / 3, not dragged to 1.68 by the old ones
  assert.equal(live.e10, 2.2); // (2.0 + 2.2 + 2.4) / 3
  assert.equal(live.stations, 3);
  assert.equal(live.staleCount, 2);
  assert.equal(live.freshHours, 72);
});

test('the ticker and the search agree: the same stations count as current', async () => {
  stubFeed([
    station('a', { gazole: 2.20 }), station('b', { gazole: 2.30 }), station('c', { gazole: 2.40 }),
    station('old', { gazole: 1.50, gazoleAge: 100 }),
  ]);
  const res = fakeRes();
  await diesel({ query: {} }, res);
  const { live } = JSON.parse(res.body);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(live.stations, body.freshCount);
  assert.equal(live.staleCount, body.staleCount);
  assert.equal(live.gazole, body.average);
});

test('with no fresh diesel price at all the endpoint fails, so the ticker keeps the official figure', async () => {
  stubFeed([station('a', { gazole: 2.2, gazoleAge: 200 })]);
  const res = fakeRes();
  await diesel({ query: {} }, res);
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).detail, /no fresh diesel average/);
});

test('a feed failure is a 502', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const down = fakeRes();
  await diesel({ query: {} }, down);
  assert.equal(down.statusCode, 502);
});

// ------------------------------------------------------------------ quota, cache, timeouts

test('a tank-size click costs the feed nothing: the answers are reused, only the saving changes', async () => {
  const calls = stubFeed([2.20, 2.25, 2.30, 2.35, 2.40].map((p, i) => station(`s${i}`, { gazole: p })));
  const small = await ask({ cp: '13001', fuel: 'gazole', tank: '40' });
  const asked = calls.length;
  assert.ok(asked > 0 && asked <= 4, `${asked} requests for a postcode search`);
  const big = await ask({ cp: '13001', fuel: 'gazole', tank: '80' });
  assert.equal(calls.length, asked, 'the second search reached the feed');
  assert.equal(big.body.stations[0].saving, small.body.stations[0].saving * 2);
  assert.equal(big.body.average, small.body.average);
});

test('a search that widens to the département stays within seven feed requests', async () => {
  const calls = stubFeed([
    station('a', { cp: '13001', gazole: 2.20 }),
    ...[2.30, 2.31, 2.32, 2.33, 2.34, 2.35].map((p, i) => station(`d${i}`, { cp: '13100', gazole: p })),
    station('typo', { cp: '13100', gazole: 1.10 }),
    ...elsewhere(spread(250, 2.20, 2.40)),
  ]);
  const { body } = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(body.area, 'departement');
  assert.equal(body.outlierCount, 1);
  assert.ok(calls.length <= 7, `${calls.length} requests`);
  const floor = calls.filter((c) => c.select.includes('percentile('));
  assert.equal(floor.length, 1, 'the national floor is asked once, not once per area');
});

test('the old prices are counted once, for the area that answers, not for the postcode that was widened', async () => {
  const calls = stubFeed([
    station('a', { cp: '13001', gazole: 2.20 }),
    ...[2.30, 2.31, 2.32, 2.33].map((p, i) => station(`d${i}`, { cp: '13100', gazole: p })),
  ]);
  await ask({ cp: '13001', fuel: 'gazole' });
  const counts = calls.filter((c) => /^count\(\w+\) as count$/.test(c.select));
  assert.equal(counts.length, 1);
  assert.match(counts[0].where, /startswith\(cp, "13"\)/);
});

test('a failed request is not remembered: the next visitor asks the feed again', async () => {
  const rows = [2.20, 2.25, 2.30, 2.35].map((p, i) => station(`s${i}`, { gazole: p }));
  const inner = stubFeed(rows) && globalThis.fetch;
  let down = true;
  globalThis.fetch = async (url) => (down ? { ok: false, status: 503, json: async () => ({}) } : inner(url));
  const first = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(first.res.statusCode, 502);
  down = false;
  const second = await ask({ cp: '13001', fuel: 'gazole' });
  assert.equal(second.res.statusCode, 200);
});

test('answers are reused for five minutes and not after', async () => {
  const realNow = Date.now;
  let clock = Date.parse('2026-10-17T10:00:00Z');
  Date.now = () => clock;
  try {
    const calls = stubFeed([2.20, 2.25, 2.30].map((p, i) => station(`s${i}`, { gazole: p })));
    const ask1 = () => queryRecords({ select: 'count(gazole_prix) as count', limit: '1' });
    await ask1();
    await ask1();
    assert.equal(calls.length, 1);
    clock += 299000;
    await ask1();
    assert.equal(calls.length, 1);
    clock += 2000;
    await ask1();
    assert.equal(calls.length, 2);
  } finally {
    Date.now = realNow;
  }
});

test('a cached answer is never served to another fetch implementation', async () => {
  stubFeed([station('a', { gazole: 2.2 })]);
  const p = { select: 'count(gazole_prix) as count', limit: '1' };
  assert.equal((await queryRecords(p)).results[0].count, 1);
  stubFeed([station('a', { gazole: 2.2 }), station('b', { gazole: 2.3 })]);
  assert.equal((await queryRecords(p)).results[0].count, 2);
});

test('a request that hangs is cut at its own timeout, and at the search deadline', async () => {
  let started = 0;
  globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    started += 1;
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const t0 = Date.now();
  await assert.rejects(queryRecords({ limit: '1' }, { timeoutMs: 30 }), (e) => e.status === 0 && /did not answer within 30 ms/.test(e.message));
  assert.ok(Date.now() - t0 < 1000);
  // the whole search has 20 ms left, whatever a single request may take
  await assert.rejects(queryRecords({ limit: '2' }, { timeoutMs: 5000, deadline: Date.now() + 20 }), /did not answer within \d+ ms/);
  // and when the deadline has passed no request is made at all
  const before = started;
  await assert.rejects(queryRecords({ limit: '3' }, { deadline: Date.now() - 1 }), /ran out of time/);
  assert.equal(started, before);
});

test('when the feed answers 429 the quota is spent: a 503 the edge may keep for a minute', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error_code: 'TooManyRequests' }) });
  const s = fakeRes();
  await stations({ query: { cp: '13001', fuel: 'gazole' } }, s);
  assert.equal(s.statusCode, 503);
  assert.equal(JSON.parse(s.body).error, 'feed_rate_limited');
  assert.equal(s.headers['retry-after'], '60');
  assert.match(s.headers['cache-control'], /^public, s-maxage=60, stale-while-revalidate=0$/);

  const d = fakeRes();
  await diesel({ query: {} }, d);
  assert.equal(d.statusCode, 503);
  assert.equal(JSON.parse(d.body).error, 'feed_rate_limited');
  assert.match(d.headers['cache-control'], /s-maxage=60/);
});

test('other feed failures stay a 502 that nothing keeps', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const s = fakeRes();
  await stations({ query: { cp: '13001', fuel: 'gazole' } }, s);
  assert.equal(s.statusCode, 502);
  assert.equal(s.headers['cache-control'], 'no-store');
  assert.equal(s.headers['retry-after'], undefined);
});
