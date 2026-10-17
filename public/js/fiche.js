// Fills the fact sheet (fiche-plein.html) from the same sources as the home page:
// /config.js for the launch, the launchpad and the latest official price, /live.json for the
// contract and wallets. The HTML prints a fallback for everything here; this file only overwrites.
import { buybackPct, teamPct, frNumber } from './formula.js';
import { isSolanaAddress } from './mint.js';
import { paris } from './clock.js';
import { NBSP as NB } from './typo.js';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const QUOTES = ['USDC', 'SOL'];

const dayOf = (p) => `${p.d === 1 ? '1er' : p.d} ${MONTHS[p.m - 1]} ${p.y}`;

/** The day as Paris clocks show it: "24 octobre 2026", "1er mai 2027". '' if it is not a time. */
export function frDay(instant) {
  return Number.isFinite(instant) ? dayOf(paris(instant)) : '';
}

/** An instant as Paris clocks show it: "samedi 17 octobre 2026 à 15:30". '' if it is not a time. */
export function frWhen(instant) {
  if (!Number.isFinite(instant)) return '';
  const p = paris(instant);
  const z = (n) => String(n).padStart(2, '0');
  return `${DAYS[p.dow]} ${dayOf(p)} à ${z(p.h)}:${z(p.min)}`;
}

/** The quote asset the fee tables are read in: 'USDC', 'SOL', or null if config.js says anything else. */
export function quoteAsset(launchpad) {
  return QUOTES.includes(launchpad?.quote) ? launchpad.quote : null;
}

/** The coin's page on the launchpad. Only pump.fun URLs, and only for a well-formed contract. */
export function coinUrl(launchpad, contract) {
  const base = launchpad?.coinUrl;
  if (typeof base !== 'string' || !base.startsWith('https://pump.fun/')) return null;
  return isSolanaAddress(contract) ? `${base}${contract}` : null;
}

/**
 * What live.json puts on the page right now, as { href, text } links, or null for "show the printed
 * fallback". The contract only from the opening on and only if it is well-formed; the pump.fun page
 * only with a contract; each wallet only if its own address is well-formed. A null here also means
 * "take down what was shown": the team blanks or corrects a wrong address in live.json and an open
 * page must follow, as the home page does.
 */
export function planSlots(live, { now, launchAt, launchpad }) {
  const contract = isSolanaAddress(live?.contract) && now >= launchAt ? live.contract : null;
  const coin = contract ? coinUrl(launchpad, contract) : null;
  return {
    contract: contract && { href: `https://solscan.io/token/${contract}`, text: contract },
    coin: coin && { href: coin, text: `Ouvrir sur ${launchpad?.name || 'pump.fun'}` },
    // looked up by the slot's own key: no selector is built from the file's contents
    wallet(key) {
      const address = live?.wallets?.[key];
      return isSolanaAddress(address) ? { href: `https://solscan.io/account/${address}`, text: address } : null;
    },
  };
}

/**
 * Puts a link in a slot, or puts the slot's printed fallback back when there is nothing to show.
 * The fallback is remembered on first contact. A link already showing is left alone, so a
 * visitor selecting the address is not interrupted by the next read.
 */
export function paint(el, entry, doc = document) {
  if (el.dataset.fallback === undefined) el.dataset.fallback = el.textContent;
  const showing = el.dataset.shown;
  if (!entry) {
    if (showing === undefined) return;
    el.textContent = el.dataset.fallback;
    delete el.dataset.shown;
    return;
  }
  if (showing === entry.href) return;
  const a = doc.createElement('a');
  a.href = entry.href;
  a.rel = 'noopener';
  a.textContent = entry.text;
  el.replaceChildren(a);
  el.dataset.shown = entry.href;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Milliseconds until the next read of live.json. Same rhythm as the home page around the
 * opening (every 15 s from five minutes before, every minute once open); once the contract is
 * on the page, a slow read still catches a corrected one.
 */
export function nextReadDelay(now, launchAt, contractShown) {
  if (contractShown) return 5 * MINUTE;
  const untilOpen = launchAt - now;
  if (untilOpen > 5 * MINUTE) return 5 * MINUTE;
  return untilOpen > 0 ? 15 * SECOND : MINUTE;
}

function fill() {
  const C = window.PLEIN_CONFIG || {};
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const LAUNCH_AT = Date.parse(C.launchAt || '2026-10-17T15:30:00+02:00');
  const launchpad = C.launchpad || {};

  // launch, first plein, launchpad, quote asset
  $$('[data-launch="when"]').forEach((el) => { el.textContent = frWhen(LAUNCH_AT) || el.textContent; });
  // the intro names the first plein's day too, so a moved firstPleinAt cannot leave it saying 24 October
  const first = frWhen(Date.parse(C.firstPleinAt));
  if (first) $$('[data-first-plein]').forEach((el) => { el.textContent = first; });
  const firstDay = frDay(Date.parse(C.firstPleinAt));
  if (firstDay) $$('[data-first-plein-day]').forEach((el) => { el.textContent = firstDay; });
  if (launchpad.name) $$('[data-launchpad="name"]').forEach((el) => { el.textContent = launchpad.name; });
  const quote = quoteAsset(launchpad);
  if (quote) $$('[data-launchpad="quote"]').forEach((el) => { el.textContent = quote; });
  // Show the tier table that matches the quote asset; with an unknown one, show none rather than a
  // wrong one. With no quote at all (config.js did not load) the printed default stays, like every
  // other fallback on the page.
  if (launchpad.quote !== undefined) {
    $$('[data-quote-table]').forEach((el) => { el.hidden = el.dataset.quoteTable !== quote; });
  }

  // the latest official diesel price (not a promise about the next plein: that one freezes its own at 17:45)
  const price = C.official?.gazole;
  if (price) {
    const pct = buybackPct(price);
    $$('[data-official="formula"]').forEach((el) => {
      el.textContent = `20${NB}×${NB}${frNumber(price, 3)}${NB}€ = ${frNumber(pct, 1)}${NB}%`;
    });
    $$('[data-official="team"]').forEach((el) => { el.textContent = `${frNumber(teamPct(price), 1)}${NB}%`; });
    $$('[data-official="source"]').forEach((el) => { el.textContent = C.official.source || ''; });
  }

  // Contract and wallets: only well-formed addresses, the contract only from the opening on, and
  // a slot whose address was withdrawn goes back to its printed fallback.
  // Returns whether the contract is on the page.
  function apply(live) {
    const plan = planSlots(live, { now: Date.now(), launchAt: LAUNCH_AT, launchpad });
    $$('[data-ca]').forEach((el) => paint(el, plan.contract));
    $$('[data-coin]').forEach((el) => paint(el, plan.coin));
    $$('[data-wallet]').forEach((el) => paint(el, plan.wallet(el.dataset.wallet)));
    return plan.contract !== null;
  }

  // The fiche is where people check the address, so an open page must catch the opening, a
  // corrected contract and a withdrawn one without a reload. A failed read keeps whatever the page
  // already shows.
  let shown = false;
  async function read() {
    try {
      const res = await fetch('/live.json', { cache: 'no-store', headers: { accept: 'application/json' } });
      const live = res.ok ? await res.json() : null;
      if (live && typeof live === 'object') shown = apply(live);
    } catch { /* offline: the printed fallbacks stay */ }
    setTimeout(read, nextReadDelay(Date.now(), LAUNCH_AT, shown));
  }
  read();
}

// the test imports this file in Node, where there is no page to fill
if (typeof document !== 'undefined') fill();
