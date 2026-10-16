// Shared access to the official French fuel-price feed (prix-carburants.gouv.fr, published as
// open data on data.economie.gouv.fr). Files starting with "_" are not deployed as endpoints.
//
// Field names follow the "flux instantané v2" dataset. They are checked by scripts/check-feed.mjs
// and the CI workflow; if the ministry renames a field, fix FIELDS here and nowhere else.

export const DATASET = 'prix-des-carburants-en-france-flux-instantane-v2';
export const RECORDS_URL = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;

export const FIELDS = {
  gazole: { price: 'gazole_prix', updated: 'gazole_maj' },
  e10: { price: 'e10_prix', updated: 'e10_maj' },
  sp98: { price: 'sp98_prix', updated: 'sp98_maj' },
};
export const STATION_FIELDS = { id: 'id', postcode: 'cp', city: 'ville', address: 'adresse', geo: 'geom' };

// Prices outside this band are typos in station declarations; they would skew any average.
export const SANE_MIN = 1;
export const SANE_MAX = 4;

/**
 * Filter clause keeping plausible prices only, whichever unit the feed uses this year:
 * €/L (2.356) or thousandths (2356). Without the second branch, a switch to thousandths
 * would silently filter out every station.
 */
export function saneClause(field) {
  return `((${field} >= ${SANE_MIN} and ${field} <= ${SANE_MAX}) or (${field} >= ${SANE_MIN * 1000} and ${field} <= ${SANE_MAX * 1000}))`;
}

/** The feed has published prices both in €/L (2.356) and in thousandths (2356). */
export function toEuros(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 10 ? n / 1000 : n;
}

export async function queryRecords(params, { timeoutMs = 8000 } = {}) {
  const url = `${RECORDS_URL}?${new URLSearchParams(params)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`feed answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Latitude and longitude from the geo field, whatever shape the feed uses. */
export function coordinates(record) {
  const g = record[STATION_FIELDS.geo];
  if (g && typeof g === 'object') {
    if ('lat' in g && 'lon' in g) return { lat: Number(g.lat), lon: Number(g.lon) };
    if (Array.isArray(g.coordinates)) return { lat: Number(g.coordinates[1]), lon: Number(g.coordinates[0]) };
  }
  if (record.latitude && record.longitude) {
    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    // the historical feed stores degrees × 100 000
    return Math.abs(lat) > 90 ? { lat: lat / 100000, lon: lon / 100000 } : { lat, lon };
  }
  return { lat: null, lon: null };
}

/** Minimal response helpers so handlers run the same on Vercel and in scripts/dev.mjs. */
export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0
    ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`
    : 'no-store');
  res.end(JSON.stringify(body));
}
