// Checks that the official fuel feed still answers with the fields api/ relies on.
//   npm run check:feed            (exit code 1 if anything the site needs is missing)
// Also runs in CI (.github/workflows/ci.yml) on every change to api/.
import { FIELDS, STATION_FIELDS, queryRecords } from '../api/_feed.js';
import diesel from '../api/diesel.js';
import stations from '../api/stations.js';

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; };
  return res;
}

let failed = false;
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`); };
const ok = (msg) => console.log(`✓ ${msg}`);

const sample = await queryRecords({ limit: '2' });
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

const r1 = fakeRes();
await diesel({ url: '/api/diesel', query: {} }, r1);
if (r1.statusCode !== 200) fail(`/api/diesel → ${r1.statusCode} ${r1.body}`);
else {
  const live = JSON.parse(r1.body).live;
  if (!(live.gazole > 1 && live.gazole < 4)) fail(`diesel average looks wrong: ${live.gazole}`);
  else ok(`/api/diesel → gazole ${live.gazole} €/L over ${live.stations} stations`);
}

for (const cp of ['75011', '13001', '69003']) {
  const r = fakeRes();
  await stations({ url: `/api/stations?cp=${cp}&fuel=gazole&tank=50`, query: { cp, fuel: 'gazole', tank: '50' } }, r);
  if (r.statusCode !== 200) fail(`/api/stations ${cp} → ${r.statusCode} ${r.body}`);
  else {
    const j = JSON.parse(r.body);
    ok(`/api/stations ${cp} → ${j.count} stations (${j.area}), cheapest ${j.stations[0].price} € at ${j.stations[0].address}, ${j.stations[0].city}`);
  }
}

process.exit(failed ? 1 : 0);
