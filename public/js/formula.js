// The $PLEIN weekly split. Single source of truth for the site, the API and the weekly job.
//
// Rule (published on the site, never changed without four weeks' notice):
//   buyback rate = 20 × official DGEC weekly diesel price in €/L,
//   rounded to the nearest 0.1 point, then kept between 30 % and 60 %.
//   Food aid = 10 % of the week's creator fees, always.
//   Team = whatever is left.
// The rate is rounded BEFORE it is applied, so anyone can redo the ticket by hand:
// réservoir × 47,1 % = rachat.

export const MULTIPLIER = 20;
export const FLOOR_PCT = 30;
export const CEILING_PCT = 60;
export const AID_PCT = 10;

/** Buyback share in percent for a diesel price in euros per litre. */
export function buybackPct(dieselEurPerL) {
  const price = Number(dieselEurPerL);
  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError('diesel price must be a positive number of euros per litre');
  }
  const raw = Math.round(MULTIPLIER * price * 10) / 10;
  return Math.min(CEILING_PCT, Math.max(FLOOR_PCT, raw));
}

/** Team share in percent for a diesel price in euros per litre. */
export function teamPct(dieselEurPerL) {
  return Math.round((100 - AID_PCT - buybackPct(dieselEurPerL)) * 10) / 10;
}

/**
 * Split one week of creator fees. Amounts are worked in cents so the three parts
 * always add back to the total; the team takes the rounding remainder.
 */
export function splitWeek(feesUsdc, dieselEurPerL) {
  const total = Math.round(Number(feesUsdc) * 100);
  if (!Number.isFinite(total) || total < 0) {
    throw new RangeError('fees must be a non-negative amount');
  }
  const pct = buybackPct(dieselEurPerL);
  const buyback = Math.round((total * pct) / 100);
  const aid = Math.round((total * AID_PCT) / 100);
  const team = total - buyback - aid;
  return {
    ratePct: pct,
    teamPct: Math.round((100 - AID_PCT - pct) * 10) / 10,
    buyback: buyback / 100,
    aid: aid / 100,
    team: team / 100,
    total: total / 100,
  };
}

/** French number formatting: 2,356 · 3 412,00 (narrow no-break space for thousands). */
export function frNumber(value, digits = 0) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
