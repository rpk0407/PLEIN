// The loyalty card: a souvenir kept in the visitor's own browser. It is not a game with a prize.
// Nothing is sent anywhere, nothing is won, and no purchase or holding counts toward it.
//
// Nothing is written to the browser until the visitor takes the card (createKeeper below).
// Shape (docs/interfaces.md), under localStorage['plein.carte']:
//   { v: 1, stamps: [{ kind, week }], full: 0 }
// One stamp per kind per ISO week; ten stamps fill the card. A full card stays on screen until a
// stamp comes in a later week, which starts a fresh card; `full` counts the cards filled so far.
import { isoWeek } from './clock.js';

export const STORAGE_KEY = 'plein.carte';
export const SLOTS = 10;
export const KINDS = ['plein', 'monplein', 'totem', 'ticket'];

const WEEK = /^\d{4}-W\d{2}$/;

export const emptyCard = () => ({ v: 1, stamps: [], full: 0 });

/** Clean whatever was stored: anything unexpected is dropped, never trusted. */
export function parseCard(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return emptyCard(); }
  }
  if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.stamps)) return emptyCard();
  const seen = new Set();
  const stamps = [];
  for (const s of data.stamps) {
    if (!s || !KINDS.includes(s.kind) || typeof s.week !== 'string' || !WEEK.test(s.week)) continue;
    const key = `${s.kind}|${s.week}`;
    if (seen.has(key) || stamps.length >= SLOTS) continue;
    seen.add(key);
    stamps.push({ kind: s.kind, week: s.week });
  }
  const full = Number.isInteger(data.full) && data.full > 0 && data.full < 1e6 ? data.full : 0;
  // a card read with ten stamps has been filled at least once
  return { v: 1, stamps, full: Math.max(full, stamps.length >= SLOTS ? 1 : 0) };
}

export const isFull = (card) => card.stamps.length >= SLOTS;

/**
 * Try to add a stamp. Returns { card, status }, where status is 'added', 'duplicate' (this kind is
 * already stamped this week), 'full' (the card is full and this is still the same week, so
 * nothing more is taken) or 'invalid'. The input card is never changed.
 */
export function addStamp(card, kind, now) {
  if (!KINDS.includes(kind) || !Number.isFinite(now)) return { card, status: 'invalid' };
  const week = isoWeek(now);
  const current = parseCard(card);
  if (current.stamps.some((s) => s.kind === kind && s.week === week)) return { card: current, status: 'duplicate' };
  if (isFull(current)) {
    const latest = current.stamps.reduce((max, s) => (s.week > max ? s.week : max), '');
    if (week <= latest) return { card: current, status: 'full' };
    // a later week: the old card is kept in `full`, a new one starts with this stamp
    return { card: { v: 1, stamps: [{ kind, week }], full: current.full }, status: 'added' };
  }
  const stamps = [...current.stamps, { kind, week }];
  const filled = stamps.length >= SLOTS;
  return { card: { v: 1, stamps, full: current.full + (filled ? 1 : 0) }, status: 'added' };
}

/** What the page shows: how many slots are stamped, and which kinds already count this week. */
export function cardView(card, now) {
  const week = isoWeek(now);
  const thisWeek = Object.fromEntries(KINDS.map((k) => [k, card.stamps.some((s) => s.kind === k && s.week === week)]));
  return { count: card.stamps.length, slots: SLOTS, full: isFull(card), cardsFilled: card.full, thisWeek };
}

/**
 * Read the card from a Storage-like object. Returns null when storage is unavailable (so the page
 * can keep the card in memory for the visit), an empty card when nothing is stored yet.
 */
export function readCard(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    return raw == null ? emptyCard() : parseCard(raw);
  } catch {
    return null;
  }
}

/** Write the card; false when storage refuses (private window, quota, blocked). */
export function writeCard(storage, card) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(card));
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the visitor has taken the card, which is to say the key exists. Reading is not
 * writing: this call stores nothing.
 */
export function cardTaken(storage) {
  try {
    return Boolean(storage) && storage.getItem(STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/** Throw the card away: removes the key. False when storage refuses. */
export function discardCard(storage) {
  try {
    if (!storage) return false;
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The card as the page keeps it. Stamps live in memory, and nothing is written to the browser until
 * the visitor presses "Prendre ma carte": that click is the first write, so the storage serves a
 * service the visitor asked for (CNIL consent question, still open for the lawyer; see
 * mentions-legales.html). The key's existence is the choice. Once taken, every new stamp is written.
 * Without a usable storage the card simply lives for the visit.
 */
export function createKeeper(storage) {
  let taken = cardTaken(storage);
  let card = taken ? readCard(storage) ?? emptyCard() : emptyCard();
  return {
    get card() { return card; },
    get taken() { return taken; },
    /** Add a stamp and return its status ('added', 'duplicate', 'full', 'invalid'). */
    stamp(kind, now) {
      if (taken) {
        if (cardTaken(storage)) card = readCard(storage) ?? card; // another tab may have stamped meanwhile
        else { taken = false; card = emptyCard(); } // another tab threw the card away: do not bring it back
      }
      const result = addStamp(card, kind, now);
      card = result.card;
      if (result.status === 'added' && taken) writeCard(storage, card);
      return result.status;
    },
    /** The visitor takes the card. False when the browser refuses to store it: the card then lives for the visit. */
    take() {
      if (!taken) taken = writeCard(storage, card);
      return taken;
    },
    /** The visitor throws the card away: the key goes, the stamps with it. */
    discard() {
      taken = false;
      card = emptyCard();
      return discardCard(storage);
    },
  };
}
