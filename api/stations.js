// GET /api/stations?cp=69003&fuel=gazole&tank=50
// The three cheapest stations for a postcode, with the average, cheapest and dearest price of
// every station in the area, from the official feed. If a postcode has fewer than three
// stations, the search widens to its département (first two digits; three for overseas).
import { FIELDS, STATION_FIELDS, coordinates, queryRecords, saneClause, send, toEuros } from './_feed.js';

function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

function relative(updated) {
  const t = Date.parse(updated);
  if (!Number.isFinite(t)) return '';
  const hours = Math.round((Date.now() - t) / 3600000);
  if (hours < 1) return 'mis à jour il y a moins d’une heure';
  if (hours < 48) return `mis à jour il y a ${hours} h`;
  return `mis à jour il y a ${Math.round(hours / 24)} j`;
}

/** Postcode prefix of the département: 13001 → "13", 97400 → "974". */
export function departementPrefix(cp) {
  return /^9[78]/.test(cp) ? cp.slice(0, 3) : cp.slice(0, 2);
}

/** Count, average, cheapest and dearest price over every station in the area. */
async function areaStats(where, field) {
  const data = await queryRecords({
    select: `count(${field}) as count, avg(${field}) as average, min(${field}) as min, max(${field}) as max`,
    where: `${where} and ${saneClause(field)}`,
    limit: '1',
  });
  const row = data?.results?.[0] || {};
  return {
    count: Number(row.count) || 0,
    average: toEuros(row.average),
    min: toEuros(row.min),
    max: toEuros(row.max),
  };
}

async function cheapest(where, field, updated) {
  const s = STATION_FIELDS;
  const data = await queryRecords({
    select: [s.id, s.postcode, s.city, s.address, s.geo, field, updated].join(','),
    where: `${where} and ${saneClause(field)}`,
    order_by: `${field} asc`,
    limit: '3',
  });
  return data?.results || [];
}

export default async function handler(req, res) {
  const q = query(req);
  const cp = String(q.cp || '');
  const fuel = String(q.fuel || 'gazole');
  const tank = Math.min(120, Math.max(10, Number(q.tank) || 50));
  if (!/^\d{5}$/.test(cp)) return send(res, 400, { error: 'invalid_postcode' });
  if (!FIELDS[fuel]) return send(res, 400, { error: 'invalid_fuel' });

  const { price: field, updated } = FIELDS[fuel];
  try {
    let area = 'postcode';
    let where = `${STATION_FIELDS.postcode} = "${cp}"`;
    let stats = await areaStats(where, field);
    if (stats.count < 3) {
      area = 'departement';
      where = `startswith(${STATION_FIELDS.postcode}, "${departementPrefix(cp)}")`;
      stats = await areaStats(where, field);
    }
    if (stats.count === 0 || stats.average == null) return send(res, 404, { error: 'no_stations', cp, fuel }, 300);

    const rows = await cheapest(where, field, updated);
    const stations = rows
      .map((r) => ({ r, price: toEuros(r[field]) }))
      .filter((x) => x.price != null)
      .map(({ r, price }) => {
        const { lat, lon } = coordinates(r);
        return {
          id: r[STATION_FIELDS.id],
          address: r[STATION_FIELDS.address] || '',
          city: r[STATION_FIELDS.city] || '',
          postcode: r[STATION_FIELDS.postcode] || '',
          price: Math.round(price * 1000) / 1000,
          saving: Math.round((stats.average - price) * tank * 100) / 100,
          updatedAt: r[updated] || null,
          updatedLabel: relative(r[updated]),
          lat,
          lon,
        };
      });
    if (stations.length === 0) return send(res, 404, { error: 'no_stations', cp, fuel }, 300);

    send(res, 200, {
      cp,
      fuel,
      tank,
      area,
      count: stats.count,
      average: Math.round(stats.average * 1000) / 1000,
      min: stats.min,
      max: stats.max,
      spread: Math.round((stats.max - stats.min) * 1000) / 1000,
      stations,
      source: 'prix-carburants.gouv.fr · data.economie.gouv.fr (Licence Ouverte)',
    }, 600);
  } catch (error) {
    send(res, 502, { error: 'feed_unavailable', detail: String(error.message || error) });
  }
}
