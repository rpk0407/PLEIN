// GET /api/stations?cp=69003&fuel=gazole&tank=50
// The three cheapest stations for a postcode, with the average, cheapest and dearest price of
// the stations in the area, from the official feed. "À jour ou rien": only prices a station
// declared in the last 72 hours count, read from that fuel's own update field. A price is set
// aside as a typo only if it is both more than 0,25 €/L under the area average and under the
// national floor (see nationalFloor in _feed.js). Everything left out is counted in the answer
// (staleCount, outlierCount), never dropped silently. If the postcode keeps fewer than three
// stations, the search widens to its département (first two digits; three for overseas).
// `tank` only scales `saving`; it never changes what is asked of the feed.
import {
  ENDPOINT_TIMEOUT_MS, FIELDS, FRESH_HOURS, OUTLIER_GAP, SEARCH_DEADLINE_MS, STATION_FIELDS,
  coordinates, floorClause, freshClause, isFresh, nationalFloor, queryRecords, saneClause, send, sendFeedError,
  toEuros, unitScale,
} from './_feed.js';

const NB = ' '; // non-breaking space

function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, 'http://local').searchParams);
}

function relative(updated) {
  const t = Date.parse(updated);
  if (!Number.isFinite(t)) return '';
  const hours = Math.round((Date.now() - t) / 3600000);
  if (hours < 1) return 'mis à jour il y a moins d’une heure';
  if (hours < 48) return `mis à jour il y a ${hours}${NB}h`;
  return `mis à jour il y a ${Math.round(hours / 24)}${NB}j`;
}

/** Postcode prefix of the département: 13001 → "13", 97400 → "974". */
export function departementPrefix(cp) {
  return /^9[78]/.test(cp) ? cp.slice(0, 3) : cp.slice(0, 2);
}

/** Count, average, cheapest and dearest price over the stations matching `where`. */
async function areaStats(where, field, opts) {
  const data = await queryRecords({
    select: `count(${field}) as count, avg(${field}) as average, min(${field}) as min, max(${field}) as max`,
    where,
    limit: '1',
  }, opts);
  const row = data?.results?.[0] || {};
  return {
    count: Number(row.count) || 0,
    average: toEuros(row.average),
    min: toEuros(row.min),
    max: toEuros(row.max),
    scale: unitScale(row.average),
  };
}

async function countRows(where, field, opts) {
  const data = await queryRecords({ select: `count(${field}) as count`, where, limit: '1' }, opts);
  return Number(data?.results?.[0]?.count) || 0;
}

/**
 * One area, read in the order the page promises it: the fresh prices of the stations with a sane
 * price, then, among those, the typos set aside. A price counts as a typo only if it is under both
 * the area average minus OUTLIER_GAP and the national floor; with no national floor, none is set
 * aside. The average that sets the first line includes the suspect price itself; the final
 * figures do not. Stale prices are counted later, only for the area that ends up answering.
 */
async function readArea(areaWhere, fuel, opts) {
  const { price: field, updated } = FIELDS[fuel];
  const sane = `${areaWhere} and ${saneClause(field)}`;
  const fresh = `${sane} and ${freshClause(updated)}`;
  const [first, national] = await Promise.all([areaStats(fresh, field, opts), nationalFloor(fuel, opts)]);
  let where = fresh;
  let stats = first;
  let outlierCount = 0;
  if (first.average != null && national != null) {
    const floor = Math.min(first.average - OUTLIER_GAP, national);
    if (first.min != null && first.min < floor) {
      where = `${fresh} and ${floorClause(field, floor, first.scale)}`;
      stats = await areaStats(where, field, opts);
      outlierCount = Math.max(0, first.count - stats.count);
    }
  }
  return { sane, where, stats, freshCount: first.count, outlierCount, national };
}

async function cheapest(where, field, updated, opts) {
  const s = STATION_FIELDS;
  const data = await queryRecords({
    select: [s.id, s.postcode, s.city, s.address, s.geo, field, updated].join(','),
    where,
    order_by: `${field} asc`,
    limit: '3',
  }, opts);
  return data?.results || [];
}

/** 1,5 → "1,500": prices are printed with three decimals everywhere on the page. */
function freuros(x) {
  return x.toFixed(3).replace('.', ',');
}

/** What was left out and why, in French, ready to print under the results. */
function freshnessNote({ staleCount, outlierCount, nationalFloor: floor }) {
  const plural = (n) => (n > 1 ? 's' : '');
  const parts = [`Prix mis à jour il y a moins de ${FRESH_HOURS}${NB}h.`];
  if (staleCount > 0) parts.push(`${staleCount} station${plural(staleCount)} écartée${plural(staleCount)} (prix plus ancien).`);
  if (outlierCount > 0) {
    parts.push(`${outlierCount} prix écarté${plural(outlierCount)} (plus de ${String(OUTLIER_GAP).replace('.', ',')}${NB}€/L sous la moyenne de la zone et sous le plancher national de ${freuros(floor)}${NB}€/L).`);
  }
  return parts.join(' ');
}

export default async function handler(req, res) {
  const q = query(req);
  const cp = String(q.cp || '');
  const fuel = String(q.fuel || 'gazole');
  const tank = Math.min(120, Math.max(10, Number(q.tank) || 50));
  if (!/^\d{5}$/.test(cp)) return send(res, 400, { error: 'invalid_postcode' });
  if (!FIELDS[fuel]) return send(res, 400, { error: 'invalid_fuel' });

  const { price: field, updated } = FIELDS[fuel];
  const opts = { deadline: Date.now() + SEARCH_DEADLINE_MS, timeoutMs: ENDPOINT_TIMEOUT_MS };
  try {
    let area = 'postcode';
    let read = await readArea(`${STATION_FIELDS.postcode} = "${cp}"`, fuel, opts);
    if (read.stats.count < 3) {
      area = 'departement';
      read = await readArea(`startswith(${STATION_FIELDS.postcode}, "${departementPrefix(cp)}")`, fuel, opts);
    }
    const { stats, freshCount, outlierCount, national } = read;
    const answers = stats.count > 0 && stats.average != null;
    // the list and the count of older prices do not depend on each other: ask together
    const [rows, declared] = await Promise.all([
      answers ? cheapest(read.where, field, updated, opts) : [],
      countRows(read.sane, field, opts),
    ]);
    const counts = { freshHours: FRESH_HOURS, freshCount, staleCount: Math.max(0, declared - freshCount), outlierCount, nationalFloor: national };
    if (!answers) {
      return send(res, 404, { error: 'no_stations', cp, fuel, ...counts, note: freshnessNote(counts) }, 300);
    }

    const now = Date.now();
    const stations = rows
      .filter((r) => isFresh(r[updated], now)) // safety net behind the filter clause
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
    if (stations.length === 0) {
      return send(res, 404, { error: 'no_stations', cp, fuel, ...counts, note: freshnessNote(counts) }, 300);
    }

    send(res, 200, {
      cp,
      fuel,
      tank,
      area,
      count: stats.count, // stations behind average, min, max and spread: fresh, minus the outliers
      average: Math.round(stats.average * 1000) / 1000,
      min: stats.min,
      max: stats.max,
      spread: Math.round((stats.max - stats.min) * 1000) / 1000,
      ...counts,
      note: freshnessNote(counts),
      stations,
      source: 'prix-carburants.gouv.fr · data.economie.gouv.fr (Licence Ouverte)',
    }, 600);
  } catch (error) {
    sendFeedError(res, error);
  }
}
