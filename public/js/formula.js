// The $PLEIN weekly split. Single source of truth for the site, the API and the weekly job.
//
// Rule (published on the site, never changed without four weeks' notice):
//   buyback rate = 20 × official weekly diesel price in €/L,
//   rounded to the nearest 0.1 point (halves round up), then kept between 30 % and 60 %.
//   Food aid = 10 % of the week's creator fees, always.
//   Team = whatever is left.
// The rate is rounded BEFORE it is applied, so anyone can redo the ticket by hand:
// réservoir × 46,6 % = rachat.
//
// Everything is worked in integers (ten-thousandths of a euro, tenths of a point, cents).
// In floating point, 20 × 2.1725 × 10 is 434.49999999999994 and would round down; an
// official price has at most four decimals, so integers give the exact answer every time.

export const MULTIPLIER = 20;
export const FLOOR_PCT = 30;
export const CEILING_PCT = 60;
export const AID_PCT = 10;

/** A price in euros per litre as an integer number of ten-thousandths of a euro. */
function tenThousandths(dieselEurPerL) {
  const price = Number(dieselEurPerL);
  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError('diesel price must be a positive number of euros per litre');
  }
  return Math.round(price * 10000);
}

/** Buyback share in tenths of a point (466 means 46.6 %). */
export function buybackTenths(dieselEurPerL) {
  const k = tenThousandths(dieselEurPerL);
  // rate in tenths = MULTIPLIER × k / 1000, rounded half up
  const raw = Math.floor((MULTIPLIER * k + 500) / 1000);
  return Math.min(CEILING_PCT * 10, Math.max(FLOOR_PCT * 10, raw));
}

/** Buyback share in percent for a diesel price in euros per litre. */
export function buybackPct(dieselEurPerL) {
  return buybackTenths(dieselEurPerL) / 10;
}

/** Team share in percent for a diesel price in euros per litre. */
export function teamPct(dieselEurPerL) {
  return (1000 - AID_PCT * 10 - buybackTenths(dieselEurPerL)) / 10;
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
  const tenths = buybackTenths(dieselEurPerL);
  const buyback = Math.round((total * tenths) / 1000);
  const aid = Math.round((total * AID_PCT) / 100);
  const team = total - buyback - aid;
  return {
    ratePct: tenths / 10,
    teamPct: (1000 - AID_PCT * 10 - tenths) / 10,
    buyback: buyback / 100,
    aid: aid / 100,
    team: team / 100,
    total: total / 100,
  };
}

/** Cost of a fill-up in euros, to the cent (halves round up). */
export function fillCost(dieselEurPerL, litres) {
  const k = tenThousandths(dieselEurPerL);
  const l = Math.round(Number(litres));
  if (!Number.isFinite(l) || l <= 0) throw new RangeError('litres must be a positive whole number');
  return Math.floor((k * l + 50) / 100) / 100;
}

/** French number formatting: 2,356 · 3 412,00 (narrow no-break space for thousands). */
export function frNumber(value, digits = 0) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
