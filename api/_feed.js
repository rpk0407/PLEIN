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

/** 1000 when a raw feed value is in thousandths, else 1: the unit toEuros() assumes. */
export function unitScale(value) {
  return Number(value) > 10 ? 1000 : 1;
}

// Freshness ("Mon Plein, à jour ou rien"): a station's price counts only if its own update
// field for that fuel says it was declared in the last 72 hours. 35 % of diesel prices in the
// feed were older than that on 17 October 2026 (check:feed prints the live share).
export const FRESH_HOURS = 72;
// A date a little ahead of now is clock skew (the feed stamps up to 15 minutes ahead). A date
// days ahead is a typo and proves nothing about the price, so it is not fresh either.
export const FUTURE_TOLERANCE_HOURS = 24;
// A price is set aside as a typo, and counted, only when it is BOTH more than this many €/L under
// the area average AND under the national floor below. The first test alone dropped real prices:
// 1,99 €/L is a genuine chain-wide price for E10 and SP98, and a few dear stations in a postcode
// pull its average up. The floor keeps the rule for what nobody charges (a lone 1,38 €/L diesel).
export const OUTLIER_GAP = 0.25;
// National floor: this percentile of the fresh sane prices of the fuel, minus the margin. Read
// from the feed (ODSQL percentile()) and kept ten minutes; if it cannot be read, no price is set
// aside as a typo. A sample under FLOOR_MIN_SAMPLE is too thin to trust. Tier 2 until a deploy
// has run it. Live floors, and the count of prices under them, are printed by check:feed.
export const FLOOR_PERCENTILE = 1;
export const FLOOR_MARGIN = 0.05;
export const FLOOR_MIN_SAMPLE = 200;
export const FLOOR_CACHE_MS = 600000;
export const FLOOR_RETRY_MS = 60000;

/**
 * Filter clause keeping rows whose `updatedField` is within the last FRESH_HOURS. The feed's own
 * clock evaluates now(); `now(hours=-72)` and the plan's `now(days=-3)` select the same rows.
 */
export function freshClause(updatedField) {
  return `(${updatedField} >= now(hours=-${FRESH_HOURS}) and ${updatedField} <= now(hours=${FUTURE_TOLERANCE_HOURS}))`;
}

/** The same rule applied to one returned row, as a safety net behind the filter clause. */
export function isFresh(updated, now = Date.now()) {
  const t = Date.parse(updated);
  if (!Number.isFinite(t)) return false;
  return t >= now - FRESH_HOURS * 3600000 && t <= now + FUTURE_TOLERANCE_HOURS * 3600000;
}

/**
 * Filter clause keeping prices at or above `floorEuros`, written in the unit the feed uses
 * (scale 1 for €/L, 1000 for thousandths). The floor is cut down to a thousandth, so a price is
 * never set aside for being a hair under a line it is not under.
 */
export function floorClause(field, floorEuros, scale = 1) {
  return `${field} >= ${floorValue(floorEuros, scale)}`;
}

/** The prices floorClause() sets aside: strictly under the same cut-down floor. */
export function underClause(field, floorEuros, scale = 1) {
  return `${field} < ${floorValue(floorEuros, scale)}`;
}

function floorValue(floorEuros, scale) {
  const milli = Math.floor(floorEuros * 1000 + 1e-9);
  return scale === 1000 ? milli : Number((milli / 1000).toFixed(3));
}

/** A feed failure; `status` is the HTTP status the feed sent, 0 for a timeout or a network error. */
export class FeedError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'FeedError';
    this.status = status;
  }
}

// The endpoints cap each feed request, and /api/stations also caps the whole search, so a slow
// feed ends in a quick 502 on the page instead of a function still spending quota after the
// visitor has given up (the page waits 10 s).
export const ENDPOINT_TIMEOUT_MS = 2500;
export const SEARCH_DEADLINE_MS = 8000;

// The feed allows 50 000 requests a day (reset 00:00 UTC) and sends max-age=300 itself, and the
// URLs repeat because the feed evaluates now(). So an answer is kept five minutes per URL, in
// module scope: a tank-size click, a second visitor on the same instance and the ticker's four
// queries cost nothing. The cache only serves the fetch function that filled it, so replacing
// fetch (a test stub, a polyfill) can never serve another source's answers. Callers must not
// modify what they get back.
export const FEED_CACHE_MS = 300000;
const CACHE_MAX = 300;
const cache = new Map(); // url → { at, ttl, fetchRef, promise }

export function clearFeedCache() {
  cache.clear();
}

function remember(url, entry) {
  if (cache.size >= CACHE_MAX && !cache.has(url)) cache.delete(cache.keys().next().value);
  cache.set(url, entry);
}

async function fetchJson(url, budgetMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new FeedError(`feed answered ${res.status}`, res.status);
    return await res.json();
  } catch (error) {
    if (error instanceof FeedError) throw error;
    if (error?.name === 'AbortError') throw new FeedError(`feed did not answer within ${budgetMs} ms`);
    throw new FeedError(String(error?.message || error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One query to the feed. `timeoutMs` caps this request, `deadline` (epoch ms) caps the whole
 * search it belongs to. `ttlMs` is how long the answer is reused (0 = always ask the feed);
 * `failTtlMs` keeps a failure for that long too, for queries whose failure is survivable.
 */
export async function queryRecords(params, { timeoutMs = 8000, deadline = Infinity, ttlMs = FEED_CACHE_MS, failTtlMs = 0 } = {}) {
  const url = `${RECORDS_URL}?${new URLSearchParams(params)}`;
  const fetchRef = globalThis.fetch;
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.fetchRef === fetchRef && now - hit.at < hit.ttl) return hit.promise;
  const budget = Math.min(timeoutMs, deadline - now);
  if (!(budget > 0)) throw new FeedError('the search ran out of time');
  const promise = fetchJson(url, budget);
  if (ttlMs > 0 || failTtlMs > 0) {
    const entry = { at: now, ttl: ttlMs, fetchRef, promise };
    remember(url, entry);
    promise.catch(() => {
      if (failTtlMs > 0) Object.assign(entry, { at: Date.now(), ttl: failTtlMs });
      else if (cache.get(url) === entry) cache.delete(url);
    });
  }
  return promise;
}

/**
 * National price floor for a fuel, in euros: the FLOOR_PERCENTILE-th percentile of the fresh sane
 * prices minus FLOOR_MARGIN. Null when it cannot be read or rests on too few prices; callers then
 * skip the typo check rather than guess. Never throws.
 */
export async function nationalFloor(fuel, { deadline } = {}) {
  const { price: field, updated } = FIELDS[fuel];
  try {
    const data = await queryRecords({
      select: `percentile(${field}, ${FLOOR_PERCENTILE}) as floor, count(${field}) as sample`,
      where: `${saneClause(field)} and ${freshClause(updated)}`,
      limit: '1',
    }, { deadline, timeoutMs: ENDPOINT_TIMEOUT_MS, ttlMs: FLOOR_CACHE_MS, failTtlMs: FLOOR_RETRY_MS });
    const row = data?.results?.[0] || {};
    const base = toEuros(row.floor);
    if (base == null || !(Number(row.sample) >= FLOOR_MIN_SAMPLE)) return null;
    return Math.round((base - FLOOR_MARGIN) * 1000) / 1000;
  } catch {
    return null;
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
export function send(res, status, body, cacheSeconds = 0, staleSeconds = cacheSeconds * 3) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0
    ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`
    : 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Answer a failed feed read. A 429 means the day's quota is spent: say 503 and ask the edge to
 * remember it for a minute, so the visitors that follow do not each cost the function a try.
 * Anything else is a 502, never cached.
 */
export function sendFeedError(res, error) {
  if (error?.status === 429) {
    res.setHeader('retry-after', '60');
    return send(res, 503, { error: 'feed_rate_limited', detail: String(error.message) }, 60, 0);
  }
  return send(res, 502, { error: 'feed_unavailable', detail: String(error?.message || error) });
}
