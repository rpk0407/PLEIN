// Checks that the official fuel feed still answers with the fields api/ relies on, still accepts
// the freshness clause ("updated in the last 72 hours") and the percentile() the typo rule reads
// its national floor from, and that the typo rule leaves the cheapest real prices alone.
//   npm run check:feed            (exit code 1 if anything the site needs is missing)
// Also runs in CI (.github/workflows/ci.yml) on every change to api/.
import {
  FIELDS, FRESH_HOURS, STATION_FIELDS, freshClause, isFresh, nationalFloor, queryRecords, saneClause, toEuros,
  underClause, unitScale,
} from '../api/_feed.js';
import diesel from '../api/diesel.js';
import stations, { departementPrefix } from '../api/stations.js';

// Most prices the typo rule may ever set aside, as a share of a fuel's fresh prices nationally.
// The rule only touches prices under the national floor, which sits under the 1st percentile.
const MAX_DROP_SHARE = 0.005;

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; };
  return res;
}

let failed = false;
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`); };
const ok = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => console.log(`! ${msg}`);

// Probes ask the feed itself, never the endpoints' five-minute response cache.
const direct = { ttlMs: 0 };
const count = async (field, where) => Number((await queryRecords({ select: `count(${field}) as count`, where, limit: '1' }, direct))?.results?.[0]?.count) || 0;

const sample = await queryRecords({ limit: '2' }, direct);
const record = sample?.results?.[0];
if (!record) {
  fail('the feed returned no records');
} else {
  console.log('fields in one record:', Object.keys(record).sort().join(', '));
  const needed = [...Object.values(STATION_FIELDS), ...Object.values(FIELDS).flatMap((f) => [f.price, f.updated])];
  const missing = needed.filter((k) => !(k in record));
  if (missing.length) fail(`missing fields: ${missing.join(', ')}`);
  else ok('every field the site reads is present');
  console.log('sample:', JSON.stringify(Object.fromEntries(needed.map((k) => [k, record[k]]))));
}

// The freshness clause must be accepted, select something, and bite: a clause the feed ignored
// would let prices of any age through while the endpoints claim they are recent.
for (const [fuel, f] of Object.entries(FIELDS)) {
  try {
    const sane = saneClause(f.price);
    const [all, fresh] = await Promise.all([count(f.price, sane), count(f.price, `${sane} and ${freshClause(f.updated)}`)]);
    const stale = all - fresh;
    if (fresh <= 0) fail(`${fuel}: no price updated in the last ${FRESH_HOURS} h (${f.updated}); the clause or the field is wrong`);
    else if (fresh > all) fail(`${fuel}: ${fresh} fresh prices out of ${all}; the clause does not filter`);
    else if (stale === 0) warn(`${fuel}: every one of ${all} prices is fresh; the clause may no longer bite, check by hand`);
    else ok(`${fuel}: the feed accepts "${freshClause(f.updated)}" → ${fresh} of ${all} prices fresh, ${stale} older (${Math.round((stale / all) * 100)} %)`);
  } catch (error) {
    fail(`${fuel}: the feed refused the freshness clause: ${error.message}`);
  }
}

// The typo rule sets a price aside only if it is under the area average minus 0,25 AND under the
// national floor, so nationally it can never touch more prices than sit under that floor. If the
// floor cannot be read, the endpoints skip the typo check, which this must report, not hide.
for (const [fuel, f] of Object.entries(FIELDS)) {
  try {
    const floor = await nationalFloor(fuel);
    if (floor == null) {
      fail(`${fuel}: the national price floor cannot be read (percentile() refused, or too few fresh prices); the typo check would be skipped`);
      continue;
    }
    const base = `${saneClause(f.price)} and ${freshClause(f.updated)}`;
    const top = (await queryRecords({ select: `max(${f.price}) as max`, where: base, limit: '1' }, direct))?.results?.[0]?.max;
    const [fresh, under] = await Promise.all([count(f.price, base), count(f.price, `${base} and ${underClause(f.price, floor, unitScale(top))}`)]);
    const share = fresh ? under / fresh : 0;
    const line = `${fuel}: national floor ${floor.toFixed(3)} €/L, ${under} of ${fresh} fresh prices under it (${(share * 100).toFixed(2)} %)`;
    if (share > MAX_DROP_SHARE) fail(`${line}; the typo rule could set aside more than ${MAX_DROP_SHARE * 100} % of the prices`);
    else ok(line);
  } catch (error) {
    fail(`${fuel}: could not check the national floor: ${error.message}`);
  }
}

const r1 = fakeRes();
await diesel({ url: '/api/diesel', query: {} }, r1);
if (r1.statusCode !== 200) fail(`/api/diesel → ${r1.statusCode} ${r1.body}`);
else {
  const live = JSON.parse(r1.body).live;
  if (!(live.gazole > 1 && live.gazole < 4)) fail(`diesel average looks wrong: ${live.gazole}`);
  else if (!Number.isInteger(live.staleCount) || live.freshHours !== FRESH_HOURS) fail(`/api/diesel does not report its freshness: ${JSON.stringify(live)}`);
  else ok(`/api/diesel → gazole ${live.gazole} €/L over ${live.stations} fresh stations (${live.staleCount} older left out)`);
}

// Searches that must work: the three the site has always probed, and the ones where the first
// version of the typo rule hid real cheap prices (17 October 2026: 75016 and 28300 diesel, 33000
// and 13001 SP98, 67000 E10). For each, the cheapest fresh price in the area must be the one
// shown, unless it was set aside, and then it must be under the national floor.
const searches = [
  ['75011', 'gazole'], ['13001', 'gazole'], ['69003', 'gazole'],
  ['75016', 'gazole'], ['28300', 'gazole'], ['33000', 'sp98'], ['13001', 'sp98'], ['67000', 'e10'],
];
for (const [cp, fuel] of searches) {
  const r = fakeRes();
  await stations({ url: `/api/stations?cp=${cp}&fuel=${fuel}&tank=50`, query: { cp, fuel, tank: '50' } }, r);
  const label = `/api/stations ${cp} ${fuel}`;
  if (r.statusCode !== 200) { fail(`${label} → ${r.statusCode} ${r.body}`); continue; }
  const j = JSON.parse(r.body);
  const counts = [j.freshCount, j.staleCount, j.outlierCount];
  const old = j.stations.filter((s) => !isFresh(s.updatedAt));
  if (!counts.every(Number.isInteger)) { fail(`${label} does not report freshCount, staleCount and outlierCount`); continue; }
  if (old.length) { fail(`${label} returned ${old.length} station(s) not updated in the last ${FRESH_HOURS} h`); continue; }
  try {
    const f = FIELDS[fuel];
    const area = j.area === 'postcode' ? `${STATION_FIELDS.postcode} = "${cp}"` : `startswith(${STATION_FIELDS.postcode}, "${departementPrefix(cp)}")`;
    const raw = toEuros((await queryRecords({
      select: `min(${f.price}) as min`, where: `${area} and ${saneClause(f.price)} and ${freshClause(f.updated)}`, limit: '1',
    }, direct))?.results?.[0]?.min);
    if (j.outlierCount === 0 && Math.abs(raw - j.min) > 0.0005) fail(`${label}: the cheapest fresh price in the area is ${raw}, the answer says ${j.min}`);
    else if (j.outlierCount > 0 && !(raw < j.nationalFloor)) fail(`${label}: set aside ${j.outlierCount} price(s) but the cheapest, ${raw}, is not under the national floor ${j.nationalFloor}`);
    else ok(`${label} → ${j.count} stations (${j.area}; ${j.freshCount} fresh, ${j.staleCount} older and ${j.outlierCount} typo left out), cheapest ${j.stations[0].price} € at ${j.stations[0].address}, ${j.stations[0].city}`);
  } catch (error) {
    fail(`${label}: could not compare with the raw minimum: ${error.message}`);
  }
}

process.exit(failed ? 1 : 0);
