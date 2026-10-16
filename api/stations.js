// GET /api/stations?cp=69003&fuel=gazole&tank=50
// The three cheapest stations for a postcode, the local average and the spread, from the
// official feed. If a postcode has fewer than three stations, the search widens to its
// département (same first two digits).
import { FIELDS, SANE_MAX, SANE_MIN, STATION_FIELDS, coordinates, queryRecords, send, toEuros } from './_feed.js';

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

async function fetchArea(where, field, updated) {
  const s = STATION_FIELDS;
  const data = await queryRecords({
    select: [s.id, s.postcode, s.city, s.address, s.geo, field, updated].join(','),
    where: `${where} and ${field} >= ${SANE_MIN} and ${field} <= ${SANE_MAX}`,
    order_by: `${field} asc`,
    limit: '100',
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
    let rows = await fetchArea(`${STATION_FIELDS.postcode} = "${cp}"`, field, updated);
    let area = 'postcode';
    if (rows.length < 3) {
      rows = await fetchArea(`startswith(${STATION_FIELDS.postcode}, "${cp.slice(0, 2)}")`, field, updated);
      area = 'departement';
    }
    const priced = rows
      .map((r) => ({ r, price: toEuros(r[field]) }))
      .filter((x) => x.price != null)
      .sort((a, b) => a.price - b.price);
    if (priced.length === 0) return send(res, 404, { error: 'no_stations', cp, fuel }, 300);

    const prices = priced.map((x) => x.price);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    const max = prices[prices.length - 1];
    const stations = priced.slice(0, 3).map(({ r, price }) => {
      const { lat, lon } = coordinates(r);
      return {
        id: r[STATION_FIELDS.id],
        address: r[STATION_FIELDS.address] || '',
        city: r[STATION_FIELDS.city] || '',
        postcode: r[STATION_FIELDS.postcode] || '',
        price: Math.round(price * 1000) / 1000,
        saving: Math.round((average - price) * tank * 100) / 100,
        updatedAt: r[updated] || null,
        updatedLabel: relative(r[updated]),
        lat,
        lon,
      };
    });
    send(res, 200, {
      cp,
      fuel,
      tank,
      area,
      count: prices.length,
      average: Math.round(average * 1000) / 1000,
      max,
      spread: Math.round((max - prices[0]) * 1000) / 1000,
      stations,
      source: 'prix-carburants.gouv.fr · data.economie.gouv.fr (Licence Ouverte)',
    }, 600);
  } catch (error) {
    send(res, 502, { error: 'feed_unavailable', detail: String(error.message || error) });
  }
}
