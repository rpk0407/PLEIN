// What the page reads from outside, cleaned before it is shown: the /api/chain reading and the
// ticket files (shapes in docs/interfaces.md). Anything that is not exactly what the shape
// promises becomes null, which the page shows as a dash. A gap is never filled with a guess.
import { frNumber } from './formula.js';
import { isSolanaAddress } from './mint.js';

const finite = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const nonNegative = (x) => (finite(x) !== null && x >= 0 ? x : null);
const isoOrNull = (x) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? x : null);

/** The top-10 holder share above which the light turns amber, in percent. */
export const TOP10_LIMIT_PCT = 30;

/** 'revoked' (the authority is null), 'active' (an address holds it), null (not read). */
function authority(token, key) {
  if (!token || typeof token !== 'object' || !(key in token)) return null;
  if (token[key] === null) return 'revoked';
  return isSolanaAddress(token[key]) ? 'active' : null;
}

/**
 * One /api/chain reading, flattened. Returns null if the body is not an object. Every field the
 * page uses is a number, a boolean, an authority state or null.
 */
export function readChain(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const pct = finite(data.curve?.progressPct);
  return {
    asOf: isoOrNull(data.asOf),
    mint: isSolanaAddress(data.mint) ? data.mint : null,
    reservoirUsdc: nonNegative(data.reservoir?.usdc),
    // fees still in the creator wallet's vault, not yet claimed into the réservoir; only in USDC (Tier 2)
    unclaimedUsdc: data.creatorVault?.unit === 'USDC' ? nonNegative(data.creatorVault.unclaimed) : null,
    burned: nonNegative(data.token?.burned),
    volume24hUsd: nonNegative(data.market?.volume24hUsd),
    marketCapUsd: nonNegative(data.market?.marketCapUsd),
    priceUsd: nonNegative(data.market?.priceUsd),
    progressPct: pct === null ? null : Math.min(100, Math.max(0, pct)),
    complete: typeof data.curve?.complete === 'boolean' ? data.curve.complete : null,
    mintAuthority: authority(data.token, 'mintAuthority'),
    freezeAuthority: authority(data.token, 'freezeAuthority'),
    top10Pct: finite(data.holders?.top10Pct) !== null && data.holders.top10Pct >= 0 && data.holders.top10Pct <= 100
      ? data.holders.top10Pct : null,
  };
}

/**
 * True when the reading holds at least one value actually read. A reading whose every block is null
 * (the endpoint answered but the chain did not) must not make the page claim "Relevé du …".
 */
export function hasReading(reading) {
  if (!reading) return false;
  const { asOf, mint, ...values } = reading;
  return Object.values(values).some((value) => value !== null);
}

/**
 * The lights a reading can set. A light is present only when its fact was read, and its label
 * states the fact only when the state is 'ok'; otherwise it names what is checked.
 */
export function chainLights(reading) {
  const lights = {};
  if (!reading) return lights;
  if (reading.mintAuthority === 'revoked') {
    lights.mint = { state: 'ok', label: 'Création révoquée', detail: 'relevé sur la chaîne' };
  } else if (reading.mintAuthority === 'active') {
    lights.mint = { state: 'warn', label: 'Autorité de création', detail: 'pas révoquée, relevé sur la chaîne' };
  }
  if (reading.freezeAuthority === 'revoked') {
    lights.freeze = { state: 'ok', label: 'Gel révoqué', detail: 'relevé sur la chaîne' };
  } else if (reading.freezeAuthority === 'active') {
    lights.freeze = { state: 'warn', label: 'Autorité de gel', detail: 'pas révoquée, relevé sur la chaîne' };
  }
  if (reading.top10Pct !== null) {
    const ok = reading.top10Pct <= TOP10_LIMIT_PCT;
    lights.top10 = {
      state: ok ? 'ok' : 'warn',
      label: `Top 10 des wallets : ${frNumber(reading.top10Pct, 1)} %`,
      detail: `hors courbe et pools · seuil ${TOP10_LIMIT_PCT} %`,
    };
  }
  return lights;
}

// ---------------------------------------------------------------- tickets

const B58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const TICKET_PATH = /^\/tickets\/[A-Za-z0-9._-]+\.json$/;

/** A transaction signature shaped like one (base58, 80-90 characters), not proof it exists. */
export const isTxId = (value) => typeof value === 'string' && B58_SIGNATURE.test(value);

/** Solscan page of a transaction; null unless the id is shaped like one. */
export const solscanTx = (id) => (isTxId(id) ? `https://solscan.io/tx/${id}` : null);

/** { tickets: [{ n, date, path }] } → valid entries, oldest first. Anything else → []. */
export function readTicketIndex(data) {
  const list = Array.isArray(data?.tickets) ? data.tickets : [];
  const seen = new Set();
  return list
    .filter((t) => t && Number.isInteger(t.n) && t.n > 0 && TICKET_PATH.test(t.path || '')
      && typeof t.date === 'string' && Number.isFinite(Date.parse(t.date)))
    .filter((t) => (seen.has(t.n) ? false : seen.add(t.n)))
    .map((t) => ({ n: t.n, date: t.date, path: t.path }))
    .sort((a, b) => a.n - b.n);
}

const tx = (entry) => (entry && typeof entry === 'object' ? { id: isTxId(entry.sig) ? entry.sig : null } : null);

/**
 * The most slices a ticket may list. scripts/plein.mjs and scripts/ticket.mjs allow the same
 * number (a test pins the two together), so the page never shows a cut list as the whole.
 */
export const MAX_SLICES = 48;

/** What earlier weeks left in the réservoir: { aid, buyback, team }, each an amount or null; null if the block is missing. */
function readCarried(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  return { aid: nonNegative(block.aid), buyback: nonNegative(block.buyback), team: nonNegative(block.team) };
}

/** One ticket file, cleaned. Returns null if it has no usable number. Shape: docs/interfaces.md. */
export function readTicket(data) {
  if (!data || typeof data !== 'object' || !Number.isInteger(data.n) || data.n <= 0) return null;
  const at = Date.parse(data.at);
  const unit = typeof data.unit === 'string' && /^[A-Z]{2,6}$/.test(data.unit) ? data.unit : null;
  const slices = Array.isArray(data.slices) ? data.slices : [];
  return {
    n: data.n,
    at: Number.isFinite(at) ? at : null,
    price: nonNegative(data.diesel?.price),
    unit,
    // reservoir = fees + carried; the split below is made on the week's fees alone
    reservoir: nonNegative(data.reservoir),
    fees: nonNegative(data.fees),
    carried: readCarried(data.carried),
    ratePct: nonNegative(data.ratePct),
    buyback: nonNegative(data.buyback),
    aid: nonNegative(data.aid),
    team: nonNegative(data.team),
    // the part of the buyback (this week's plus what was carried in) that was not made
    unspent: nonNegative(data.unspent),
    burned: nonNegative(data.burn?.amount),
    sliceCount: slices.length,
    slices: slices.slice(0, MAX_SLICES).map(tx).filter(Boolean),
    burn: tx(data.burn),
    aidTransfer: tx(data.aidTransfer),
    teamTransfer: tx(data.teamTransfer),
    claim: tx(data.claim),
    notes: (Array.isArray(data.notes) ? data.notes : []).filter((x) => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 240)),
  };
}

// ---------------------------------------------------------------- what a ticket leaves in the réservoir

const cents = (x) => (x === null || x === undefined ? null : Math.round(x * 100));
const plus = (a, b) => (a === null || b === null ? null : a + b);

/** The three carried amounts added up, in USDC to the cent; null if the block is missing or one amount is unreadable. */
export function carriedTotal(carried) {
  if (!carried) return null;
  const sum = plus(plus(cents(carried.aid), cents(carried.buyback)), cents(carried.team));
  return sum === null ? null : sum / 100;
}

/**
 * What a cleaned ticket leaves in the réservoir for the next plein, in the ticket's unit:
 * { aid, buyback, team }, or null when any of it cannot be read (a guess here would move the planned
 * buyback). The rule is the one scripts/plein.mjs applies (heldOver, which a test pins this to): the
 * aid and team shares stay when their transfer is null, together with what was already carried for
 * them; the buyback that was not made (`unspent`) stays too.
 */
export function heldOver(ticket) {
  if (!ticket) return null;
  const carried = ticket.carried;
  const aid = ticket.aidTransfer ? 0 : plus(cents(ticket.aid), cents(carried?.aid));
  const team = ticket.teamTransfer ? 0 : plus(cents(ticket.team), cents(carried?.team));
  const buyback = cents(ticket.unspent);
  if (aid === null || team === null || buyback === null) return null;
  return { aid: aid / 100, buyback: buyback / 100, team: team / 100 };
}

/**
 * The money that sits in the réservoir at the start of the coming plein besides its own week's
 * fees. `lastPlein` is the instant of the latest plein that has run (null if none has), `latest` the
 * cleaned latest published ticket (null if none), `indexRead` whether the ticket list and that
 * ticket have been read. Returns { held, reason, from }: `held` is { aid, buyback, team } or null.
 *   none        no plein has run yet, so nothing is carried (plein #1)
 *   ticket      read from ticket #from
 *   loading     the tickets have not been read yet
 *   missing     a plein has run and no ticket is published
 *   pending     the ticket of the latest plein is not published yet (between 19:05 and the pull request)
 *   unreadable  the ticket does not say
 */
export function heldForNextPlein({ latest = null, indexRead = false, lastPlein = null } = {}) {
  if (lastPlein === null || lastPlein === undefined) return { held: { aid: 0, buyback: 0, team: 0 }, reason: 'none', from: null };
  if (!indexRead) return { held: null, reason: 'loading', from: null };
  if (!latest) return { held: null, reason: 'missing', from: null };
  if (latest.at === null) return { held: null, reason: 'unreadable', from: latest.n };
  if (latest.at < lastPlein) return { held: null, reason: 'pending', from: latest.n };
  const held = heldOver(latest);
  return held ? { held, reason: 'ticket', from: latest.n } : { held: null, reason: 'unreadable', from: latest.n };
}
