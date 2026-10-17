// GET /api/diesel → live national average prices from the official station feed.
// This is the "live" number for the ticker. The buyback itself uses the DGEC weekly figure
// in public/config.js, which a person checks and updates every week.
// Same freshness as /api/stations ("à jour ou rien"): a station's price counts only if its own
// update field for that fuel says it was declared in the last 72 hours, so the ticker and the
// cheapest-station search agree on what "current" means.
import {
  ENDPOINT_TIMEOUT_MS, FIELDS, FRESH_HOURS, freshClause, queryRecords, saneClause, send, sendFeedError, toEuros,
} from './_feed.js';

// The four queries run together, each capped at 2,5 s. Answers are reused for five minutes in
// queryRecords (see _feed.js), which keeps the ticker's quota use flat.
const opts = () => ({ timeoutMs: ENDPOINT_TIMEOUT_MS });

async function average(fuel) {
  const { price: field, updated } = FIELDS[fuel];
  const data = await queryRecords({
    select: `avg(${field}) as average, count(${field}) as stations`,
    where: `${saneClause(field)} and ${freshClause(updated)}`,
    limit: '1',
  }, opts());
  const row = data?.results?.[0] || {};
  return { average: toEuros(row.average), stations: Number(row.stations) || 0 };
}

/** Stations with a sane price for this fuel, whatever its age (to say how many were left out). */
async function declared(fuel) {
  const field = FIELDS[fuel].price;
  const data = await queryRecords({ select: `count(${field}) as stations`, where: saneClause(field), limit: '1' }, opts());
  return Number(data?.results?.[0]?.stations) || 0;
}

export default async function handler(req, res) {
  try {
    const [gazole, e10, sp98, gazoleDeclared] = await Promise.all([
      ...['gazole', 'e10', 'sp98'].map(average),
      declared('gazole'),
    ]);
    if (!gazole.average) throw new Error('no fresh diesel average in the feed');
    const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
    send(res, 200, {
      live: {
        gazole: round3(gazole.average),
        e10: round3(e10.average),
        sp98: round3(sp98.average),
        stations: gazole.stations, // diesel stations behind the average: updated in the last 72 h
        staleCount: Math.max(0, gazoleDeclared - gazole.stations), // diesel stations left out as older
        freshHours: FRESH_HOURS,
      },
      source: 'prix-carburants.gouv.fr · data.economie.gouv.fr (Licence Ouverte)',
      fetchedAt: new Date().toISOString(),
    }, 600);
  } catch (error) {
    sendFeedError(res, error);
  }
}
