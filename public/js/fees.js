// The fees on every $PLEIN trade, as pump.fun publishes them (pump.fun/docs/fees, read on
// 17 October 2026). Tier 2 until the first ticket shows them on-chain; if pump.fun changes the
// schedule, change the data here and the tests will say what else must move.
//
// Percentages are of the trade, written with at most three decimals. The creator share is the part
// that reaches the station's creator wallet; the protocol share stays with pump.fun; LP goes to
// the liquidity providers of the PumpSwap pool.
import { frNumber, splitWeek } from './formula.js';

/** On the bonding curve (SOL or USDC pairs). */
export const CURVE = { creator: 0.3, protocol: 0.95, lp: 0, total: 1.25 };

/** A PumpSwap pool that is not the coin's canonical one pays the creator nothing. */
export const NON_CANONICAL = { creator: 0, protocol: 0.05, lp: 0.25, total: 0.3 };

/**
 * The sentence the page prints wherever it speaks of the station's share (the fee lane and the FAQ):
 * a swap routed through a pool the station is not paid by (the non-canonical PumpSwap row above, or
 * another DEX) brings the station nothing, and Jupiter picks the route. Tier 2, like the table.
 */
export const NON_CANONICAL_NOTE = 'Un échange passé par une autre pool (pool PumpSwap non officielle, autre DEX) ne rapporte rien à la station.';

/** Platform fee on trades placed through pump.fun's own web or mobile app (from 17 October 2026). */
export const PLATFORM_FEE_PCT = 0.45;
export const PLATFORM_FEE_REFERRAL_PCT = 0.4;

/**
 * Jupiter's own fee on a swap made through the Jupiter Plugin, which is a version of Jupiter Ultra:
 * 0.50 % on a token under 24 hours old, 0.10 % on everything else (developers.jup.ag/docs/ultra/fees,
 * read on 17 October 2026). Tier 2: the Plugin's own page lists no figure; confirm with a real quote
 * from the Plugin before the page states more than "d'après Jupiter".
 */
export const JUPITER_FEE_NEW_TOKEN_PCT = 0.5;
export const JUPITER_FEE_PCT = 0.1;

/** Cost of migrating the curve to PumpSwap, in SOL. */
export const GRADUATION_COST_SOL = 0.015;

// Row: [from, to, creator, protocol, lp]. `from` belongs to the row, `to` to the next one. Past the
// first row, protocol and LP are always 0.050 and 0.200. The first row (0.930 / 0.020) is the
// canonical pool's, so it applies only after migration; on the curve, CURVE applies instead.
const build = (list) => list.map(([from, to, creator, protocol = 0.05, lp = 0.2]) => ({
  from, to, creator, protocol, lp, total: Math.round((creator + protocol + lp) * 1000) / 1000,
}));

/** Canonical pool, USDC pair. Market cap in USD. */
export const USDC_TIERS = build([
  [0, 59000, 0.3, 0.93, 0.02],
  [59000, 300000, 0.95], [300000, 500000, 0.9], [500000, 700000, 0.85], [700000, 900000, 0.8],
  [900000, 2000000, 0.75], [2000000, 3000000, 0.7], [3000000, 4000000, 0.65], [4000000, 5000000, 0.6],
  [5000000, 6000000, 0.55], [6000000, 7000000, 0.5], [7000000, 8000000, 0.45], [8000000, 9000000, 0.4],
  [9000000, 10000000, 0.35], [10000000, 11000000, 0.3], [11000000, 12000000, 0.28],
  [12000000, 13000000, 0.25], [13000000, 14000000, 0.23], [14000000, 15000000, 0.2],
  [15000000, 16000000, 0.18], [16000000, 17000000, 0.15], [17000000, 18000000, 0.13],
  [18000000, 19000000, 0.1], [19000000, 20000000, 0.08], [20000000, Infinity, 0.05],
]);

/** Canonical pool, SOL pair. Market cap in SOL. */
export const SOL_TIERS = build([
  [0, 420, 0.3, 0.93, 0.02],
  [420, 1470, 0.95], [1470, 2460, 0.9], [2460, 3440, 0.85], [3440, 4420, 0.8], [4420, 9820, 0.75],
  [9820, 14740, 0.7], [14740, 19650, 0.65], [19650, 24560, 0.6], [24560, 29470, 0.55],
  [29470, 34380, 0.5], [34380, 39300, 0.45], [39300, 44210, 0.4], [44210, 49120, 0.35],
  [49120, 54030, 0.3], [54030, 58940, 0.275], [58940, 63860, 0.25], [63860, 68770, 0.225],
  [68770, 73681, 0.2], [73681, 78590, 0.175], [78590, 83500, 0.15], [83500, 88400, 0.125],
  [88400, 93330, 0.1], [93330, 98240, 0.075], [98240, Infinity, 0.05],
]);

export const TIERS = { USDC: USDC_TIERS, SOL: SOL_TIERS };

/**
 * The fee row in force. `complete` is true once the pool has migrated to PumpSwap; `marketCap`
 * is in the pair's unit (USD for USDC, SOL for SOL). Returns { creator, protocol, lp, total, tier }
 * (tier is the row's index, null on the curve), or null when it cannot be known: nothing read about
 * the curve, a migrated pool whose market cap was not read, or an unknown pair. Never a guess.
 */
export function feeRow({ complete, marketCap, quote } = {}) {
  if (complete == null) return null;
  if (!complete) return { ...CURVE, tier: null };
  const tiers = TIERS[quote];
  const cap = typeof marketCap === 'number' ? marketCap : NaN;
  if (!tiers || !Number.isFinite(cap) || cap < 0) return null;
  const index = tiers.findIndex((row) => cap >= row.from && cap < row.to);
  return index < 0 ? null : { ...tiers[index], tier: index };
}

/** The station's share of each trade in percent, or null when unknown. */
export function stationFeePct(args) {
  return feeRow(args)?.creator ?? null;
}

/** The part pump.fun keeps, in percent, or null when unknown. */
export function protocolFeePct(args) {
  return feeRow(args)?.protocol ?? null;
}

// ---------------------------------------------------------------- wording, shared by the page and its tests

const NB = ' ';

/** 59000 → "59 k$", 20000000 → "20 M$", 1500000 → "1,5 M$"; a SOL pair → "1 470 SOL". */
export function formatCap(value, quote) {
  if (quote === 'SOL') return `${frNumber(value, 0)}${NB}SOL`;
  if (value >= 1e6) return `${frNumber(value / 1e6, value % 1e6 ? 1 : 0)}${NB}M$`;
  if (value >= 1e3) return `${frNumber(value / 1e3, 0)}${NB}k$`;
  return `${frNumber(value, 0)}${NB}$`;
}

/** 0.95 → "0,95 %", 0.275 → "0,275 %" (two to three decimals, nothing rounded away). */
export function formatPct(value) {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value)}${NB}%`;
}

/**
 * The pump.fun clause of the pump's fee note, "les frais de pump.fun (…)". On the curve the figures
 * are known; once the pool has migrated the share depends on the tier and on the route Jupiter picks,
 * so the clause says that instead of repeating the curve's 1,25 %. `complete` is the curve state
 * (true migrated, false on the curve, null or undefined not read, which keeps the curve wording).
 */
export function pumpFeeClause(complete) {
  if (complete === true) return 'ceux de la pool PumpSwap, selon son palier et la route choisie par Jupiter';
  return `${formatPct(CURVE.total)} sur la courbe, dont ${formatPct(CURVE.creator)} pour la station`;
}

/** "59 k$ à 300 k$" or "au-delà de 20 M$" for the last band. */
export function bandLabel(row, quote) {
  if (row.to === Infinity) return `au-delà de ${formatCap(row.from, quote)}`;
  return `${formatCap(row.from, quote)} à ${formatCap(row.to, quote)}`;
}

/**
 * The scale in one sentence: the opening row (a small pool pays the station less), where the share
 * peaks, and where it ends. A coin whose cap falls back under the first threshold after migration
 * pays the opening rate again, so the sentence must not start at the peak.
 */
export function scaleSentence(quote) {
  const tiers = TIERS[quote];
  const [low, top] = tiers;
  const last = tiers[tiers.length - 1];
  return `${formatPct(low.creator)} sous ${formatCap(low.to, quote)}, ${formatPct(top.creator)} de ${formatCap(top.from, quote)} à ${formatCap(top.to, quote)}, puis moins par paliers, jusqu’à ${formatPct(last.creator)} au-delà de ${formatCap(last.from, quote)}`;
}

/**
 * The week's fees as the gauge shows them. They wait in two places: the creator wallet's vault until
 * they are claimed (Saturday 17:50), then the multisig, the réservoir. The planned buyback needs both
 * sides, so `complete` is false and the page shows a dash while either is unread: a sum with one side
 * missing would be a guess. Amounts are in the quote asset (USDC); null means not read.
 * Returns { total, complete, label, note }; total is null when neither side was read.
 */
export function weekFees({ reservoir = null, unclaimed = null } = {}) {
  const known = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const hasReservoir = known(reservoir);
  const hasUnclaimed = known(unclaimed);
  if (hasReservoir && hasUnclaimed) {
    return {
      total: reservoir + unclaimed,
      complete: true,
      label: 'Réservoir + frais à réclamer',
      note: `dont ${frNumber(unclaimed, 2)}${NB}USDC pas encore réclamés`,
    };
  }
  if (hasReservoir) {
    return { total: reservoir, complete: false, label: 'Réservoir (multisig)', note: `frais à réclamer${NB}: pas relevés` };
  }
  if (hasUnclaimed) {
    return { total: unclaimed, complete: false, label: 'Frais à réclamer (wallet créateur)', note: `réservoir${NB}: pas relevé` };
  }
  return { total: null, complete: false, label: 'Réservoir · frais de la semaine', note: '' };
}

/**
 * The planned buyback for the coming Saturday, the way scripts/plein.mjs will compute it. `total` and
 * `complete` come from weekFees(): everything the station holds (réservoir + creator vault), which
 * includes what earlier weeks left in the réservoir. `held` is that leftover, { aid, buyback, team }
 * in USDC as the latest ticket says (all zeros before plein #1), or null when it cannot be known.
 * The split is made on the week's fees alone (total minus what is held); the buyback that was
 * carried is bought on top. Returns { fees, heldTotal, heldBuyback, planned, reason }, with every
 * figure null unless reason is 'ok': 'unread' (a side of the balance is missing), 'held-unknown',
 * 'below-held' (the balance is smaller than the ticket says it should be: something moved that the
 * ticket does not show) or 'no-price'. A number is never filled in.
 */
export function weekPlan({ total = null, complete = false, held = null, price } = {}) {
  const none = (reason) => ({ fees: null, heldTotal: null, heldBuyback: null, planned: null, reason });
  if (!complete || typeof total !== 'number' || !Number.isFinite(total) || total < 0) return none('unread');
  if (!held) return none('held-unknown');
  const cents = (x) => Math.round(x * 100);
  const heldCents = cents(held.aid) + cents(held.buyback) + cents(held.team);
  const feesCents = cents(total) - heldCents;
  if (!Number.isFinite(feesCents)) return none('held-unknown');
  if (feesCents < 0) return none('below-held');
  let split;
  try {
    split = splitWeek(feesCents / 100, price);
  } catch {
    return none('no-price');
  }
  return {
    fees: feesCents / 100,
    heldTotal: heldCents / 100,
    heldBuyback: cents(held.buyback) / 100,
    planned: (cents(split.buyback) + cents(held.buyback)) / 100,
    reason: 'ok',
  };
}
