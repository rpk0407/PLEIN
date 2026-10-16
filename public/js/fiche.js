// Fills the fact sheet (fiche-plein.html) from the same sources as the home page:
// /config.js for this week's official price, /live.json for the contract and wallets.
import { buybackPct, teamPct, frNumber } from './formula.js';
import { isSolanaAddress } from './mint.js';
import { NBSP as NB } from './typo.js';

const C = window.PLEIN_CONFIG || {};
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const LAUNCH_AT = Date.parse(C.launchAt || '2026-10-17T18:00:00+02:00');

const price = C.official?.gazole;
if (price) {
  const pct = buybackPct(price);
  $$('[data-official="formula"]').forEach((el) => {
    el.textContent = `20${NB}×${NB}${frNumber(price, 3)}${NB}€ = ${frNumber(pct, 1)}${NB}%`;
  });
  $$('[data-official="team"]').forEach((el) => { el.textContent = `${frNumber(teamPct(price), 1)}${NB}%`; });
  $$('[data-official="source"]').forEach((el) => { el.textContent = C.official.source || ''; });
}

function showAddress(el, address, kind) {
  const a = document.createElement('a');
  a.href = `https://solscan.io/${kind}/${address}`;
  a.rel = 'noopener';
  a.textContent = address;
  el.replaceChildren(a);
}

fetch('/live.json', { cache: 'no-store', headers: { accept: 'application/json' } })
  .then((res) => (res.ok ? res.json() : null))
  .then((live) => {
    if (!live) return;
    if (isSolanaAddress(live.contract) && Date.now() >= LAUNCH_AT) {
      $$('[data-ca]').forEach((el) => showAddress(el, live.contract, 'token'));
    }
    Object.entries(live.wallets || {}).forEach(([key, address]) => {
      if (isSolanaAddress(address)) $$(`[data-wallet="${key}"]`).forEach((el) => showAddress(el, address, 'account'));
    });
  })
  .catch(() => {});
