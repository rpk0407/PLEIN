// GET /api/diesel → live national average prices from the official station feed.
// This is the "live" number for the ticker. The buyback itself uses the DGEC weekly figure
// in public/config.js, which a person checks and updates every week.
import { FIELDS, SANE_MAX, SANE_MIN, queryRecords, send, toEuros } from './_feed.js';

async function average(fuel) {
  const field = FIELDS[fuel].price;
  const data = await queryRecords({
    select: `avg(${field}) as average, count(${field}) as stations`,
    where: `${field} >= ${SANE_MIN} and ${field} <= ${SANE_MAX}`,
    limit: '1',
  });
  const row = data?.results?.[0] || {};
  return { average: toEuros(row.average), stations: Number(row.stations) || 0 };
}

export default async function handler(req, res) {
  try {
    const [gazole, e10, sp98] = await Promise.all(['gazole', 'e10', 'sp98'].map(average));
    if (!gazole.average) throw new Error('no diesel average in the feed');
    const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
    send(res, 200, {
      live: {
        gazole: round3(gazole.average),
        e10: round3(e10.average),
        sp98: round3(sp98.average),
        stations: gazole.stations,
      },
      source: 'prix-carburants.gouv.fr · data.economie.gouv.fr (Licence Ouverte)',
      fetchedAt: new Date().toISOString(),
    }, 600);
  } catch (error) {
    send(res, 502, { error: 'feed_unavailable', detail: String(error.message || error) });
  }
}
