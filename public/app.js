// Station $PLEIN · behaviour for public/index.html. No framework, no build step.
// The markup comes from the design board; hooks are data attributes:
//   data-bind="key"          text that changes          data-if="name"     shown or hidden
//   data-on-click="handler"  click                      data-on-input      input
//   data-on-submit           form submit                data-post="…"     text once the station is open
// Settings come from /config.js (set once). The contract, wallets and dashboard come from
// /live.json, re-read while the page is open, so the contract appears at the opening without a
// reload. Once open, the dashboard is read from /api/chain every minute; live.json is the fallback.
import { buybackPct, fillCost, frNumber, teamPct } from './js/formula.js';
import { isSolanaAddress } from './js/mint.js';
import { NBSP as NB, typo } from './js/typo.js';
import {
  PLEIN_WINDOW_MS, countdownTarget, formatCountdown, frenchWhen, isoWeek, lastPleinAt, nextPleinAt, paris, pleinInProgress,
} from './js/clock.js';
import {
  CURVE, TIERS, bandLabel, feeRow, formatCap, formatPct, pumpFeeClause, scaleSentence, weekFees, weekPlan,
} from './js/fees.js';
import {
  carriedTotal, chainLights, hasReading, heldForNextPlein, readChain, readTicket, readTicketIndex, solscanTx,
} from './js/readings.js';
import { cardView, createKeeper } from './js/carte.js';

const C = window.PLEIN_CONFIG || {};
C.contract = '';
C.wallets = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fr = (value, digits = 0) => frNumber(value, digits);

const LAUNCH_AT = Date.parse(C.launchAt || '2026-10-17T15:30:00+02:00');
// NaN (not configured) means no floor on the countdown
const FIRST_PLEIN_AT = Date.parse(C.firstPleinAt || '');
const LAUNCHPAD = C.launchpad || {};
const QUOTE = LAUNCHPAD.quote === 'SOL' ? 'SOL' : 'USDC';
const COIN_URL = typeof LAUNCHPAD.coinUrl === 'string' && LAUNCHPAD.coinUrl.startsWith('https://') ? LAUNCHPAD.coinUrl : '';
const isOpen = () => Boolean(C.contract) && Date.now() >= LAUNCH_AT;
/** "samedi 24 oct. 18:00" */
function whenText(time) {
  const w = frenchWhen(time);
  return `${w.weekday} ${w.day} ${w.month} ${w.hm}`;
}
/** "samedi à 15:30" */
function openingAt() {
  const w = frenchWhen(LAUNCH_AT);
  return `${w.weekday} à ${w.hm}`;
}
/** "samedi 15:30", for the ticker */
function openingShort() {
  const w = frenchWhen(LAUNCH_AT);
  return `${w.weekday} ${w.hm}`;
}
const FUEL_LABEL = { gazole: 'Gazole', e10: 'SP95-E10', sp98: 'SP98' };
const LEDS = {
  rouge: { hex: '#FF3D2E', glow: 'rgba(255, 61, 46, 0.6)' },
  vert: { hex: '#3CF08A', glow: 'rgba(60, 240, 138, 0.55)' },
  ambre: { hex: '#FFA733', glow: 'rgba(255, 167, 51, 0.55)' },
};
/**
 * fetch with a deadline. A request that stalls (a mobile network handoff, say) is cut after ten
 * seconds, so the busy flags of the polling loops are always released and the opening is never
 * missed for want of a reload. Callers already keep the last state when a fetch throws.
 */
const FETCH_TIMEOUT_MS = 10000;
function fetchWithin(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
  }
  const controller = new AbortController(); // older browsers; aborting a finished request does nothing
  setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal });
}

const CHIP_ON = { background: '#FFA733', color: '#0B0C0E', borderColor: '#FFA733' };
const CHIP_OFF = { background: '#171B21', color: '#F1F4F6', borderColor: '#3A414C' };

const params = new URLSearchParams(location.search);
const priceInput = $('#gazole');
const state = {
  // without config.js, keep the figure printed in the page rather than invent one
  price: C.official?.gazole ?? (Number(priceInput?.value) || 2.3283),
  // a totem prefilled from a shared link is labelled as a visitor's card, not the station's
  visitorCard: ['l1', 'v1', 'l2', 'v2'].some((key) => params.has(key)),
  fuel: 'gazole',
  tank: 50,
  cp: '',
  l1: (params.get('l1') || 'MORAL').toUpperCase().slice(0, 14),
  v1: (params.get('v1') || '0,00').slice(0, 8),
  l2: (params.get('l2') || 'LOYER').toUpperCase().slice(0, 14),
  v2: (params.get('v2') || '980').slice(0, 8),
  format: ['totem', 'panneau', 'ticket'].includes(params.get('f')) ? params.get('f') : 'totem',
  led: LEDS[params.get('led')] ? params.get('led') : 'rouge',
  check: '',
  checked: false,
  results: null,
};

// ---------------------------------------------------------------- tiny binding helpers
function setText(key, value) {
  $$(`[data-bind="${key}"]`).forEach((el) => { el.textContent = typo(value); });
}
const put = (el, value) => { el.textContent = typo(value); };
function setIf(name, on) {
  $$(`[data-if="${name}"]`).forEach((el) => { el.hidden = !on; });
}
function syncChips(group, value) {
  $$(`[data-on-click="pick"][data-group="${group}"]`).forEach((btn) => {
    const on = btn.dataset.value === String(value);
    Object.assign(btn.style, on ? CHIP_ON : CHIP_OFF);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- countdown (Europe/Paris)
let lastOpen = null;
let lastPassed = null; // whether the opening time has passed, contract or not
let nextLiveAt = 0;
let nextChainAt = 0;
let nextTicketsAt = 0;
let pleinWeek = '';
function tick() {
  const now = Date.now();
  const open = isOpen();
  const passed = now >= LAUNCH_AT;
  if (open !== lastOpen || passed !== lastPassed) {
    lastOpen = open;
    lastPassed = passed;
    applyPhase();
  }
  let text;
  let label;
  let when;
  let ticker; // [label, value] shown in the ticker
  const running = open ? pleinInProgress(now, FIRST_PLEIN_AT) : null; // never true on opening day
  if (running) {
    text = formatCountdown((running.end - now) / 1000);
    label = 'Ticket dans';
    when = 'plein en cours';
    ticker = ['Plein', 'en cours'];
    if (pleinWeek !== isoWeek(now)) {
      pleinWeek = isoWeek(now);
      stamp('plein', now);
    }
  } else if (open) {
    const target = countdownTarget(now, FIRST_PLEIN_AT);
    text = formatCountdown((target - now) / 1000);
    label = 'Plein dans';
    when = whenText(target);
    ticker = ['Prochain plein', when]; // on opening day it is a week away, so the date is named
  } else if (now < LAUNCH_AT) {
    text = formatCountdown((LAUNCH_AT - now) / 1000);
    label = 'Ouverture dans';
    when = whenText(LAUNCH_AT);
    ticker = ['Ouverture', openingShort()];
  } else {
    text = 'imminente';
    label = 'Ouverture';
    when = whenText(LAUNCH_AT);
    ticker = ['Ouverture', openingShort()];
  }
  setText('countdown', text);
  setText('countdownWhen', when);
  setText('tickerLabel', ticker[0]);
  setText('tickerWhen', ticker[1]);
  $$('[data-countdown-label]').forEach((el) => { el.textContent = label; });
  if (isoWeek(now) !== shownWeek) renderCarte(); // the card's "this week" marks turn over on Monday
  if (open && now >= nextChainAt) {
    nextChainAt = now + 60000;
    loadChain();
  }
  if (now >= nextTicketsAt) {
    // every minute while a plein runs or its ticket is awaited, every five minutes otherwise
    const awaited = Boolean(running) || heldNow(now).reason === 'pending';
    nextTicketsAt = now + (awaited ? 60000 : 300000);
    loadTickets();
  }
  if (now >= nextLiveAt) {
    // every 15 s from five minutes before the opening until the contract is out, then every minute
    const nearOpening = !open && now >= LAUNCH_AT - 5 * 60 * 1000;
    nextLiveAt = now + (nearOpening ? 15000 : open ? 60000 : 300000);
    loadLiveState();
  }
}

// ---------------------------------------------------------------- live.json: contract, wallets, dashboard
let liveText = '';
let liveBusy = false;
async function loadLiveState() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    const res = await fetchWithin('/live.json', { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const text = await res.text();
    if (text === liveText) return;
    const live = JSON.parse(text);
    liveText = text;
    // an address is shown only if it is well-formed; a typo'd or pasted-wrong value stays hidden
    const contract = isSolanaAddress(live.contract) ? live.contract : '';
    if (pluginRequested && contract !== C.contract) {
      // the swap widget was set up with the previous contract: start clean rather than trade it
      location.reload();
      return;
    }
    C.contract = contract;
    C.wallets = Object.fromEntries(Object.entries(live.wallets || {}).filter(([, a]) => isSolanaAddress(a)));
    if (live.dashboard) C.dashboard = live.dashboard;
    lastOpen = isOpen();
    lastPassed = Date.now() >= LAUNCH_AT;
    applyPhase();
    applyDashboard();
    renderCheck();
    tick(); // the clock switches to "Plein dans" in the same frame as the contract appears
  } catch {
    // keep what the page already shows
  } finally {
    liveBusy = false;
  }
}

// ---------------------------------------------------------------- phase: before / after opening
function applyPhase() {
  const open = isOpen();
  $$('[data-post]').forEach((el) => {
    if (el.dataset.pre === undefined) el.dataset.pre = el.textContent;
    el.textContent = open ? el.dataset.post : el.dataset.pre;
  });
  $$('[data-ca]').forEach((el) => { el.textContent = open ? C.contract : `publié ici ${openingAt()}`; });
  $$('[data-on-click="copyCA"]').forEach((btn) => {
    btn.disabled = !open;
    btn.style.opacity = open ? '1' : '0.45';
    btn.style.cursor = open ? 'pointer' : 'not-allowed';
    btn.title = open ? 'Copier l’adresse officielle' : 'L’adresse sera publiée ici à l’ouverture';
  });
  setIf('pumpClosed', !open);
  setIf('pumpLive', open);
  applyTotemAria();
  applyDashboard(); // tag, curve gauge and fee lane depend on the phase too

  const links = C.links || {};
  if (links.xHandle) {
    $$('[data-link="x"]').forEach((a) => { a.href = `https://x.com/${links.xHandle}`; });
    setText('xLabel', `X · @${links.xHandle}`);
  }
  if (links.telegram) {
    $$('[data-link="telegram"]').forEach((a) => { a.href = links.telegram; });
    setText('telegramLabel', 'Telegram');
  }
  const tokenLinks = {
    dexscreener: `https://dexscreener.com/solana/${C.contract}`,
    solscan: `https://solscan.io/token/${C.contract}`,
    jupiter: `https://jup.ag/swap/USDC-${C.contract}`,
  };
  if (COIN_URL) tokenLinks.pumpfun = `${COIN_URL}${C.contract}`; // the contract passed isSolanaAddress, so it is safe in a path
  Object.entries(tokenLinks).forEach(([key, href]) => {
    $$(`[data-link="${key}"]`).forEach((a) => {
      if (a.dataset.hrefPre === undefined) a.dataset.hrefPre = a.getAttribute('href') || '';
      a.setAttribute('href', open ? href : a.dataset.hrefPre); // a withdrawn contract leaves no link behind
    });
  });
  // Before the opening a missing wallet keeps the promise printed in the page (each says when it will
  // be published). Once the opening time has passed, that promise would be stale, so it says so.
  const passed = Date.now() >= LAUNCH_AT;
  $$('[data-wallet]').forEach((el) => {
    if (el.dataset.walletPre === undefined) el.dataset.walletPre = el.textContent;
    el.textContent = (C.wallets || {})[el.dataset.wallet] || (passed ? 'pas encore publié' : el.dataset.walletPre);
  });
  // the commitment is worded as a promise until the wallets it names are all published
  const walletsOut = PUBLIC_WALLETS.every((key) => (C.wallets || {})[key]);
  setText('walletsPromise', walletsOut
    ? 'Tous nos wallets sont publics : réservoir, équipe, aide.'
    : 'Tous nos wallets seront publics avant le premier plein : réservoir, équipe, aide.');
}
/** The wallets the commitment "tous nos wallets sont publics" covers (the founders' personal wallets are listed apart). */
const PUBLIC_WALLETS = ['creator', 'reservoir', 'aid', 'team'];

// ---------------------------------------------------------------- official price, live price
function applyOfficial() {
  const price = C.official?.gazole;
  if (!price) return;
  const pct = buybackPct(price);
  $$('[data-official="price"]').forEach((el) => { el.textContent = fr(price, 3); });
  $$('[data-official="week"]').forEach((el) => put(el, `officiel · ${C.official.weekLabel}`));
  $$('[data-official="rate"]').forEach((el) => put(el, `${fr(pct, 1)} %`));
  $$('[data-official="rateCompact"]').forEach((el) => { el.textContent = `${fr(pct, 1)}%`; });
  $$('[data-official="formula"]').forEach((el) => { el.textContent = `20${NB}×${NB}${fr(price, 3)}${NB}€ = ${fr(pct, 1)}${NB}%`; });
  $$('[data-official="weekLegend"]').forEach((el) => { el.textContent = `${fr(price, 3)} cette semaine`; });
  $$('[data-official-mark]').forEach((el) => {
    const min = Number(priceInput?.min) || 1.5;
    const max = Number(priceInput?.max) || 3.2;
    el.style.left = `${(((price - min) / (max - min)) * 100).toFixed(1)}%`;
  });
  applyTotemAria();
}
function applyTotemAria() {
  const price = C.official?.gazole;
  if (!price) return;
  const until = isOpen() ? 'au prochain plein' : `à l’ouverture, ${openingAt()}`;
  $$('[data-official-aria]').forEach((el) => {
    el.setAttribute('aria-label', `Totem de la station : gazole ${fr(price, 3)} euros le litre au relevé officiel, rachat ${fr(buybackPct(price), 1)} % au dernier relevé, et le compte à rebours jusqu’${until}`);
  });
}
/** The ticker says "en direct" only once the live feed has answered; until then it shows the official survey. */
function showFuel(gazole, live) {
  $$('[data-live-label]').forEach((el) => { el.textContent = live ? 'Gazole en direct' : 'Gazole · relevé officiel'; });
  $$('[data-live="gazole"]').forEach((el) => { el.textContent = `${fr(gazole, 3)}${NB}€/L`; });
  $$('[data-live="fill50"]').forEach((el) => put(el, `${fr(fillCost(gazole, 50), 2)} €`));
}
async function loadLive() {
  try {
    const res = await fetchWithin('/api/diesel', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.live?.gazole) showFuel(data.live.gazole, true);
  } catch {
    // keep the official figure printed in the page
  }
}

// ---------------------------------------------------------------- dashboard (from config)
const NEEDLE = (fraction) => {
  const f = Math.min(1, Math.max(0, fraction));
  const angle = Math.PI - f * Math.PI;
  return `M130 150L${(130 + 85 * Math.cos(angle)).toFixed(1)} ${(150 - 85 * Math.sin(angle)).toFixed(1)}`;
};
const VOYANT_STYLE = {
  ok: { stroke: '#3CF08A', bg: 'rgba(60, 240, 138, 0.10)', glow: '0 0 18px rgba(60, 240, 138, 0.30)', detail: '#8A939E', border: '#1E242C' },
  warn: { stroke: '#FFA733', bg: 'rgba(255, 167, 51, 0.12)', glow: '0 0 18px rgba(255, 167, 51, 0.38)', detail: '#FFB95E', border: '#4A3A20' },
  pending: { stroke: '#8A939E', bg: 'rgba(138, 147, 158, 0.10)', glow: 'none', detail: '#8A939E', border: '#1E242C' },
};
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
/** The last /api/chain reading, once open; null until the endpoint has answered. */
let chain = null;
let chainBusy = false;
/**
 * A reading counts only for the contract the page shows (the endpoint reads its own copy of live.json),
 * and only if it holds something actually read: an answer made of nulls falls back to live.json.
 */
const chainUsable = () => hasReading(chain) && isOpen() && chain.mint === C.contract;
/**
 * What the dashboard shows: the chain reading once there is one (a null in it stays a dash), live.json
 * before that or if the endpoint never answers. The lights the chain cannot judge stay as live.json sets them.
 */
function dashboardView() {
  const d = C.dashboard || {};
  if (!chainUsable()) return d;
  return {
    asOf: chain.asOf,
    reservoirUsdc: chain.reservoirUsdc,
    unclaimedUsdc: chain.unclaimedUsdc ?? null, // creator vault, not yet claimed (Tier 2)
    volume24hUsd: chain.volume24hUsd,
    burned: chain.burned,
    gaugeFullUsdc: d.gaugeFullUsdc,
    voyants: { ...(d.voyants || {}), ...chainLights(chain) },
    ct: d.ct,
  };
}
async function loadChain() {
  if (chainBusy) return;
  chainBusy = true;
  try {
    const res = await fetchWithin('/api/chain', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const reading = readChain(await res.json());
    if (!reading) return;
    chain = reading;
    applyDashboard();
  } catch {
    // keep the last reading; before any, the dashboard keeps what live.json says
  } finally {
    chainBusy = false;
  }
}
function renderDashTag() {
  const asOf = Date.parse(dashboardView().asOf || '');
  let text = 'Les compteurs s’allument à l’ouverture';
  if (isOpen()) {
    if (Number.isFinite(asOf)) {
      const p = Object.fromEntries(dateFormat.formatToParts(new Date(asOf)).map((x) => [x.type, x.value]));
      text = `Relevé du ${p.day} ${p.month} à ${p.hour}:${p.minute}`;
    } else {
      text = 'En attente du premier relevé';
    }
  }
  setText('dashTag', text);
}
// The odometer grows a group of three drums when the count passes 99 999 999.
let odometerParts = null;
function renderOdometer(value) {
  const odo = $('[data-odometer]');
  if (!odo) return;
  if (!odometerParts) {
    const kids = Array.from(odo.children);
    odometerParts = {
      cell: kids.find((el) => el.textContent.trim() !== '')?.cloneNode(true),
      gap: kids.find((el) => el.textContent.trim() === '')?.cloneNode(true),
    };
    if (!odometerParts.cell || !odometerParts.gap) return;
  }
  const known = value != null && Number.isFinite(Number(value));
  const digits = known ? String(Math.max(0, Math.floor(Number(value)))).padStart(8, '0').split('') : Array(8).fill('–');
  const nodes = [];
  digits.forEach((digit, i) => {
    if (i > 0 && (digits.length - i) % 3 === 0) nodes.push(odometerParts.gap.cloneNode(true));
    const cell = odometerParts.cell.cloneNode(true);
    cell.textContent = digit;
    nodes.push(cell);
  });
  odo.replaceChildren(...nodes);
  odo.setAttribute('aria-label', known ? `Compteur : ${fr(Math.floor(Number(value)), 0)} $PLEIN brûlés` : 'Compteur : pas encore relevé');
}
function applyDashboard() {
  const d = dashboardView();
  const dash = (key, text) => $$(`[data-dash="${key}"]`).forEach((el) => put(el, text));
  // null means "not measured yet": a dash, never a zero. The week's fees sit unclaimed in the creator
  // vault until Saturday 17:50, so the gauge counts the multisig and the vault together, and says so;
  // the planned buyback needs both sides read.
  const fees = weekFees({ reservoir: d.reservoirUsdc, unclaimed: d.unclaimedUsdc });
  const now = Date.now();
  const held = heldNow(now);
  const plan = weekPlan({ total: fees.total, complete: fees.complete, held: held.held, price: C.official?.gazole ?? state.price });
  if (fees.total !== null) {
    dash('reservoir', fr(fees.total, 0));
    $$('[data-needle="reservoir"]').forEach((el) => el.setAttribute('d', NEEDLE(fees.total / (d.gaugeFullUsdc || 5000))));
  } else {
    dash('reservoir', '—');
    $$('[data-needle="reservoir"]').forEach((el) => el.setAttribute('d', NEEDLE(0)));
  }
  renderPlanned(plan, held, isOpen() ? pleinInProgress(now, FIRST_PLEIN_AT) : null);
  // the gauge counts everything the station holds, carried money included, and says how much of it is
  const heldTotal = carriedTotal(held.held);
  const heldNote = heldTotal > 0 ? `dont ${fr(heldTotal, 2)}${NB}USDC reportés des semaines précédentes` : '';
  const gaugeNote = [fees.note, heldNote].filter(Boolean).join(' · ');
  setText('gaugeLabel', fees.label);
  setText('gaugeNote', gaugeNote);
  $$('[data-bind="gaugeNote"]').forEach((el) => { el.hidden = !gaugeNote; });
  if (d.volume24hUsd != null) {
    const k = d.volume24hUsd / 1000;
    dash('volume', k >= 1 ? `${fr(k, 0)} k` : fr(d.volume24hUsd, 0));
    $$('[data-needle="volume"]').forEach((el) => el.setAttribute('d', NEEDLE(d.volume24hUsd / 250000)));
  } else {
    dash('volume', '—');
    $$('[data-needle="volume"]').forEach((el) => el.setAttribute('d', NEEDLE(0)));
  }
  if ('burned' in d) renderOdometer(d.burned);
  renderDashTag();
  Object.entries(d.voyants || {}).forEach(([key, v]) => {
    const li = $(`[data-voyant="${key}"]`);
    if (!li) return;
    const style = VOYANT_STYLE[v.state] || VOYANT_STYLE.pending;
    const light = $('[data-voyant-light]', li);
    light.style.background = style.bg;
    light.style.boxShadow = style.glow;
    $('svg', light).style.stroke = style.stroke;
    li.style.borderColor = style.border;
    if (v.label) put($('[data-voyant-label]', li), v.label);
    const detail = $('[data-voyant-detail]', li);
    if (v.detail) put(detail, v.detail);
    detail.style.color = style.detail;
  });
  renderCurve();
  renderFeeLane();
  if (d.ct) {
    const ct = $('[data-ct]');
    if (ct) {
      const color = d.ct.state === 'ok' ? '#3CF08A' : d.ct.state === 'warn' ? '#FFA733' : '#A7AFB9';
      ct.style.borderColor = color;
      ct.style.color = color;
      put($('[data-ct-verdict]', ct), d.ct.verdict || '');
      put($('[data-ct-note]', ct), d.ct.note || '');
    }
  }
}

/**
 * What the last plein left in the réservoir, from the latest published ticket (heldForNextPlein).
 * Nothing before plein #1; unknown, never zero, while a plein has run and its ticket cannot be read.
 */
function heldNow(now) {
  const last = lastPleinAt(now);
  const ran = Number.isFinite(FIRST_PLEIN_AT) ? last >= FIRST_PLEIN_AT : last >= LAUNCH_AT;
  const latestN = tickets.list.at(-1)?.n ?? null;
  const latest = latestN === null ? null : tickets.cache.get(latestN) ?? null;
  const indexRead = tickets.indexRead && (latestN === null || latest !== null);
  return heldForNextPlein({ latest, indexRead, lastPlein: ran ? last : null });
}
/**
 * "Rachat prévu samedi": the week's fees times the rate, plus the buyback an earlier week left unspent.
 * While a plein runs the réservoir drains slice by slice, so no number is computed; it reads "en cours".
 * When the carried money cannot be told, the number is a dash and the line under it says why.
 */
function renderPlanned(plan, held, running) {
  const pct = buybackPct(C.official?.gazole ?? state.price);
  const share = `frais de la semaine${NB}×${NB}${fr(pct, 1)}${NB}%`;
  let status = '';
  let formula = share;
  if (running) {
    status = 'en cours';
    formula = `le ticket sort vers ${frenchWhen(running.end).hm}`;
  } else if (held.reason === 'pending' || held.reason === 'missing') {
    formula = 'en attente du ticket du dernier plein';
  } else if (held.reason === 'unreadable') {
    formula = 'reliquat du dernier ticket illisible';
  } else if (plan.reason === 'below-held') {
    formula = `réservoir sous le reliquat du dernier ticket${NB}: à vérifier`;
  } else if (plan.reason === 'ok' && plan.heldBuyback > 0) {
    formula = `${share} + ${fr(plan.heldBuyback, 2)}${NB}USDC reportés`;
  }
  $$('[data-dash="planned"]').forEach((el) => put(el, plan.reason === 'ok' ? fr(plan.planned, 0) : '—'));
  $$('[data-dash="plannedFormula"]').forEach((el) => put(el, formula));
  setText('plannedStatus', status);
  setIf('plannedNumber', status === '');
  setIf('plannedStatus', status !== '');
}

// ---------------------------------------------------------------- bonding-curve gauge and fee lane
function renderCurve() {
  const root = $('[data-curve]');
  if (!root) return;
  const reading = chainUsable() ? chain : null;
  const done = reading?.complete === true;
  const pct = done ? 100 : reading?.progressPct ?? null; // null = not read: a dash, an empty bar
  put($('[data-curve-value]', root), pct === null ? '—' : `${done ? '100' : fr(pct, 1)} %`);
  $('[data-curve-bar]', root).style.width = `${pct ?? 0}%`;
  const track = $('[data-curve-track]', root);
  if (pct === null) track.removeAttribute('aria-valuenow');
  else track.setAttribute('aria-valuenow', String(Math.round(pct * 10) / 10));
  put($('[data-curve-caption]', root), done ? 'Migrée sur PumpSwap' : 'À 100 %, la pool migre sur PumpSwap');
}
/** The station's share by band, one bar per band; the live band is lit once the pool has migrated. */
function buildFeeScale() {
  const holder = $('[data-fee-scale]');
  if (!holder) return;
  const tiers = TIERS[QUOTE];
  const top = Math.max(...tiers.map((row) => row.creator));
  holder.replaceChildren(...tiers.map((row) => {
    const bar = document.createElement('span');
    bar.title = typo(`${bandLabel(row, QUOTE)} : ${formatPct(row.creator)}`);
    Object.assign(bar.style, {
      flex: '1 1 0', minWidth: '0', height: `${Math.max(4, (row.creator / top) * 100).toFixed(1)}%`, borderRadius: '3px 3px 0 0', background: '#3A414C',
    });
    return bar;
  }));
  holder.setAttribute('aria-label', typo(`Part de la station par palier de capitalisation : ${scaleSentence(QUOTE)}`));
  setText('feeScale', scaleSentence(QUOTE));
  setText('feeLaneSource', `Échelle des pools ${QUOTE}, d’après pump.fun/docs/fees (relevée le 17 octobre 2026). Le premier ticket montrera ce qui arrive vraiment.`);
}
const PUMP_TOTAL_SUPPLY = 1e9; // every pump.fun coin is created with one billion tokens
function renderFeeLane() {
  const reading = chainUsable() ? chain : null;
  // pump.fun sets the tier from the token's price times one billion (its documented rule), not from
  // the circulating supply DexScreener's market cap uses, which weekly burns shrink. So the band is an
  // estimate from DexScreener's price (Tier 2). The price is in dollars only: a SOL pair cannot place
  // the band, and the lane says so.
  const marketCap = QUOTE === 'USDC' && reading?.priceUsd != null ? reading.priceUsd * PUMP_TOTAL_SUPPLY : null;
  const row = reading ? feeRow({ complete: reading.complete, marketCap, quote: QUOTE }) : null;
  let tag;
  let now;
  if (!isOpen()) {
    tag = 'Avant l’ouverture';
    now = Date.now() >= LAUNCH_AT
      ? 'La pool ouvre dès que le contrat est publié ici.'
      : `La pool ouvre ${openingAt()}, sur la courbe : ${formatPct(CURVE.creator)} pour la station.`;
  } else if (!reading || reading.complete === null) {
    tag = 'En attente du premier relevé';
    now = 'Palier en attente du premier relevé.';
  } else if (reading.complete === false) {
    tag = 'Sur la courbe';
    now = `Pool sur la courbe : ${formatPct(CURVE.total)} par échange, dont ${formatPct(CURVE.creator)} pour la station.`;
  } else if (row) {
    tag = 'Migrée sur PumpSwap';
    now = `Pool migrée, capitalisation ≈${NB}${formatCap(marketCap, QUOTE)} (prix DexScreener × 1 milliard de jetons) : palier probable ${bandLabel(row, QUOTE)}, ${formatPct(row.creator)} pour la station. Le ticket montre ce qui arrive vraiment.`;
  } else {
    tag = 'Migrée sur PumpSwap';
    now = 'Pool migrée. Capitalisation non relevée : palier en attente.';
  }
  $$('[data-fee-scale] > span').forEach((bar, i) => {
    const lit = row !== null && row.tier === i;
    bar.style.background = lit ? '#FFA733' : '#3A414C';
    bar.style.boxShadow = lit ? '0 0 12px rgba(255, 167, 51, 0.6)' : 'none';
  });
  setText('feeLaneTag', tag);
  setText('feeLaneNow', now);
  setText('pumpFeeClause', pumpFeeClause(reading?.complete ?? null)); // the pump's note follows the curve state
}

// ---------------------------------------------------------------- tickets (public/tickets/*.json)
const tickets = { list: [], cache: new Map(), shown: null, indexRead: false };
const DOW_SHORT = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const frPrice = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
const longDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const longDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });
const money = (value, unit) => (value === null ? '—' : `${fr(value, 2)} ${unit || ''}`.trim());
const placeholderTile = $('[data-ticket-wall] > span')?.cloneNode(true); // the printed "à venir" tile, reused for the weeks to come
/** The Saturday 18:00 of plein number n, from the first plein; null when no first plein is configured. */
function pleinAtN(n) {
  if (!Number.isFinite(FIRST_PLEIN_AT)) return null;
  let at = FIRST_PLEIN_AT;
  for (let i = 1; i < n; i += 1) at = nextPleinAt(at + 60000);
  return at;
}
async function ensureTicket(n) {
  if (tickets.cache.has(n)) return tickets.cache.get(n);
  const entry = tickets.list.find((t) => t.n === n);
  if (!entry) return null;
  try {
    const res = await fetchWithin(entry.path, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const ticket = readTicket(await res.json());
    if (!ticket || ticket.n !== n) return null;
    tickets.cache.set(n, ticket);
    return ticket;
  } catch {
    return null;
  }
}
const currentTicketN = () => tickets.shown ?? tickets.list.at(-1)?.n ?? null;
async function loadTickets() {
  try {
    const res = await fetchWithin('/tickets/index.json', { cache: 'no-store', headers: { accept: 'application/json' } });
    if (res.status === 404) tickets.list = []; // no wall yet: the printed sample stays, labelled
    else if (res.ok) tickets.list = readTicketIndex(await res.json());
    else return;
  } catch {
    return; // offline: keep what the page shows
  }
  tickets.indexRead = true;
  // the latest ticket always (the planned buyback needs what it left), and the one on show
  const latest = tickets.list.at(-1)?.n ?? null;
  if (latest !== null) await ensureTicket(latest);
  const n = currentTicketN();
  if (n !== null && n !== latest) await ensureTicket(n);
  renderTickets();
  applyDashboard();
}
function fillTicket(t) {
  const set = (key, text) => $$(`[data-tk="${key}"]`).forEach((el) => put(el, text));
  const p = t.at === null ? null : paris(t.at);
  const two = (x) => String(x).padStart(2, '0');
  set('n', String(t.n));
  set('when', p ? `${DOW_SHORT[p.dow]} ${two(p.d)}/${two(p.m)} · ${two(p.h)}:${two(p.min)}` : '—');
  set('price', t.price === null ? '—' : `${frPrice.format(t.price)} €/L`);
  set('rate', t.ratePct === null ? '—' : `${fr(t.ratePct, 1)} %`);
  // The split is made on the week's fees; the réservoir also holds what earlier weeks left in it.
  // Those rows show only when something was carried, so the lines add up like on the PNG ticket.
  const carriedSum = carriedTotal(t.carried);
  const showCarried = t.carried !== null && (carriedSum === null || carriedSum > 0);
  const show = (name, on) => $$(`[data-tk-show="${name}"]`).forEach((el) => { el.hidden = !on; });
  set('reservoir', money(t.reservoir, t.unit));
  set('carried', carriedSum === null ? '—' : money(carriedSum, t.unit));
  set('fees', money(t.fees, t.unit));
  show('carried', showCarried);
  const carriedDetail = carriedSum !== null && carriedSum > 0
    ? `Reporté des semaines précédentes : aide ${money(t.carried.aid, t.unit)} · rachat ${money(t.carried.buyback, t.unit)} · équipe ${money(t.carried.team, t.unit)}.`
    : '';
  set('carriedDetail', carriedDetail);
  show('carriedDetail', carriedDetail !== '');
  set('buyback', money(t.buyback, t.unit));
  set('unspent', money(t.unspent, t.unit));
  show('unspent', t.unspent !== null && t.unspent > 0); // the buyback not made, carried into the next week
  set('aid', money(t.aid, t.unit));
  set('team', money(t.team, t.unit));
  set('burned', t.burned === null ? '—' : fr(Math.floor(t.burned), 0));
  // a share whose transfer is null is held, and says so; it never goes to the team in place of the aid
  const held = (share, carried) => (share === null || carried === null ? null : Math.round((share + carried) * 100) / 100);
  const heldLine = (label, transfer, amount, word) => {
    if (transfer) return [label, transfer];
    if (amount === null) return [label, null, '—'];
    return amount > 0 ? [label, null, `${word} · cumul ${money(amount, t.unit)}`] : null;
  };
  const total = t.sliceCount;
  const lines = [
    ...t.slices.map((s, i) => [`RACHAT ${i + 1}/${total}`, s]),
    ...(t.burn ? [['BURN', t.burn]] : []),
    heldLine('DON', t.aidTransfer, held(t.aid, t.carried?.aid ?? null), 'retenu'),
    heldLine('ÉQUIPE', t.teamTransfer, held(t.team, t.carried?.team ?? null), 'reportée'),
    ...(t.claim ? [['FRAIS RÉCLAMÉS', t.claim]] : []),
  ].filter(Boolean);
  const holder = $('[data-tk-tx]');
  const template = $('template[data-template="ticketTx"]');
  holder.replaceChildren(...lines.map(([label, entry, status]) => {
    const row = template.content.firstElementChild.cloneNode(true);
    $('[data-tk-label]', row).textContent = `TX ${label}`;
    const link = $('[data-tk-link]', row);
    const href = entry ? solscanTx(entry.id) : null;
    if (href) link.href = href;
    else link.replaceWith(Object.assign(document.createElement('span'), { textContent: typo(status ?? '—') }));
    return row;
  }));
  const notes = $('[data-tk-notes]');
  put(notes, t.notes.join(' '));
  notes.hidden = t.notes.length === 0;
  const slot = $('[data-tk-barcode]');
  const source = $('[data-ticket-barcode]');
  if (slot && source && !slot.firstChild) slot.appendChild(source.cloneNode(true));
}
function renderWall(activeN) {
  const wall = $('[data-ticket-wall]');
  const template = $('template[data-template="ticketTile"]');
  if (!wall || !template || !placeholderTile) return;
  const nodes = tickets.list.slice(-6).map((entry) => {
    const tile = template.content.firstElementChild.cloneNode(true);
    const day = frenchWhen(Date.parse(`${entry.date}T12:00:00Z`));
    tile.dataset.n = String(entry.n);
    $('[data-tile="n"]', tile).textContent = `#${entry.n}`;
    $('[data-tile="date"]', tile).textContent = `${day.day} ${day.month}`;
    $('[data-tile="state"]', tile).textContent = entry.n === activeN ? 'affiché' : 'voir';
    tile.setAttribute('aria-pressed', entry.n === activeN ? 'true' : 'false');
    if (entry.n === activeN) tile.style.borderColor = '#FFA733';
    return tile;
  });
  const next = (tickets.list.at(-1)?.n ?? 0) + 1;
  const upcoming = Math.max(1, 3 - nodes.length);
  for (let k = 0; k < upcoming; k += 1) {
    const tile = placeholderTile.cloneNode(true);
    const at = pleinAtN(next + k);
    const [num, date] = tile.querySelectorAll('strong, span');
    num.textContent = `#${next + k}`;
    if (at === null) {
      date.textContent = '';
    } else {
      const day = frenchWhen(at);
      date.textContent = `${day.day} ${day.month}`;
    }
    nodes.push(tile);
  }
  wall.replaceChildren(...nodes);
}
function renderTickets() {
  const n = currentTicketN();
  const shown = n === null ? null : tickets.cache.get(n) ?? null;
  setIf('ticketReal', Boolean(shown));
  setIf('ticketSample', !shown); // the example stays, labelled, until a real ticket can be shown
  setIf('ticketNone', tickets.list.length === 0);
  setText('ticketCta', shown ? 'Voir le dernier ticket' : 'Voir un exemple de ticket');
  setText('ticketKindHint', tickets.list.length ? 'un clic sur un lien Solscan d’un ticket' : 'un clic sur un lien Solscan d’un vrai ticket, dès le premier');
  if (shown) fillTicket(shown);
  renderWall(n);
}

// ---------------------------------------------------------------- loyalty card (browser only)
const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();
// Stamps live in memory. Nothing is written to the browser until the visitor presses "Prendre ma
// carte" (that click is the first write); without storage the card lives for the visit.
const keeper = createKeeper(storage);
let carteNote = '';
let shownWeek = '';
function stamp(kind, now = Date.now()) {
  if (keeper.stamp(kind, now) === 'added') renderCarte();
}
function buildStamps() {
  const holder = $('[data-stamps]');
  const template = $('template[data-template="stamp"]');
  if (!holder || !template) return;
  holder.replaceChildren(...Array.from({ length: 10 }, () => template.content.firstElementChild.cloneNode(true)));
}
function renderCarte() {
  const now = Date.now();
  shownWeek = isoWeek(now);
  const view = cardView(keeper.card, now);
  setIf('carteLoose', !keeper.taken);
  setIf('carteKept', keeper.taken);
  setText('carteNote', carteNote);
  $$('[data-bind="carteNote"]').forEach((el) => { el.hidden = !carteNote; });
  setText('carteCount', String(view.count));
  setIf('carteFull', view.full);
  setIf('carteCards', view.cardsFilled > 0);
  setText('carteCards', String(view.cardsFilled));
  $$('[data-stamps] > [data-stamp]').forEach((slot, i) => {
    const on = i < view.count;
    Object.assign(slot.style, {
      background: on ? '#FFA733' : 'transparent',
      borderStyle: on ? 'solid' : 'dashed',
      borderColor: on ? '#FFA733' : '#3A414C',
      boxShadow: on ? '0 0 14px rgba(255, 167, 51, 0.45)' : 'none',
    });
    $('svg', slot).style.opacity = on ? '1' : '0';
  });
  $$('[data-kind]').forEach((item) => {
    const on = view.thisWeek[item.dataset.kind] === true;
    const state = $('[data-kind-state]', item);
    put(state, on ? 'tamponné cette semaine' : 'pas cette semaine');
    state.style.color = on ? '#FFA733' : '#8A939E';
  });
}

// ---------------------------------------------------------------- the toll: diesel slider
function renderSplit() {
  const pct = buybackPct(state.price);
  const team = teamPct(state.price);
  setText('priceLabel', fr(state.price, 3));
  setText('buyPct', `${fr(pct, 1)} %`);
  setText('teamPct', `${fr(team, 1)} %`);
  $$('[data-bar-buy]').forEach((el) => { el.style.width = `${pct.toFixed(1)}%`; });
  $$('[data-bind-aria-label="barLabel"]').forEach((el) => {
    el.setAttribute('aria-label', `Répartition : rachat et burn ${fr(pct, 1)} %, aide alimentaire 10 %, équipe ${fr(team, 1)} %`);
  });
}

// ---------------------------------------------------------------- Mon Plein
function clearStations() {
  $$('[data-stations] > li').forEach((li) => li.remove());
}
function renderStations(data) {
  const template = $('template[data-template="station"]');
  const list = $('[data-stations]');
  clearStations();
  data.stations.forEach((station, i) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const field = (key, value) => {
      const el = $(`[data-field="${key}"]`, node);
      if (el) put(el, value);
    };
    field('rank', String(i + 1));
    field('name', station.address || 'Station');
    field('km', [station.city, station.updatedLabel].filter(Boolean).join(' · '));
    field('price', fr(station.price, 3));
    field('save', station.saving > 0.005 ? `−${fr(station.saving, 2)} €` : 'au prix moyen');
    const link = $('[data-field-href="maps"]', node);
    if (link && station.lat && station.lon) {
      link.href = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`;
    }
    list.appendChild(node);
  });
  const best = data.stations[0].price;
  const n = data.stations.length;
  const where = data.area === 'departement' ? 'Dans ton département' : 'Dans ton code postal';
  setText('resultsTitle', `${n} station${n > 1 ? 's' : ''} · ${data.cp} · ${FUEL_LABEL[data.fuel] || data.fuel}`);
  setText('resultsTag', 'En direct · données officielles');
  setText('spreadLine', `${where}, ${fr(data.spread, 3)} €/L d’écart entre la station la moins chère et la plus chère : ${fr(data.spread * state.tank, 2)} € sur un plein de ${state.tank} L.`);
  setText('bestPrice', fr(best, 3));
  setIf('hasResults', true);
  state.results = data;
}
async function findStations(event) {
  event.preventDefault();
  if (!/^\d{5}$/.test(state.cp)) {
    setText('spreadLine', 'Entre un code postal à 5 chiffres.');
    return;
  }
  setText('resultsTag', 'Recherche…');
  try {
    const res = await fetchWithin(`/api/stations?cp=${state.cp}&fuel=${state.fuel}&tank=${state.tank}`, { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data.stations?.length) throw new Error(data.error || 'empty');
    renderStations(data);
    stamp('monplein');
  } catch {
    clearStations();
    setIf('hasResults', false);
    setText('resultsTag', 'Indisponible');
    setText('spreadLine', 'Pas de prix disponibles pour ce code postal en ce moment. Essaie un code voisin ou réessaie dans un instant.');
  }
}

// ---------------------------------------------------------------- L'Atelier
function renderAtelier() {
  setText('l1', state.l1);
  setText('v1', state.v1);
  setText('l2', state.l2);
  setText('v2', state.v2);
  setIf('isTotem', state.format === 'totem');
  setIf('isPanneau', state.format === 'panneau');
  setIf('isTicket', state.format === 'ticket');
  setIf('visitorCard', state.visitorCard);
  const led = LEDS[state.led];
  $$('[data-led-target]').forEach((el) => {
    el.style.color = led.hex;
    el.style.textShadow = `0 0 12px ${led.glow}`;
  });
  syncChips('format', state.format);
  syncChips('led', state.led);
  ['l1', 'v1', 'l2', 'v2'].forEach((key) => {
    $$(`[data-bind-value="${key}"]`).forEach((input) => {
      if (input !== document.activeElement) input.value = state[key];
    });
  });
}

function fitFont(ctx, text, weight, family, size, maxWidth, minSize = 18) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && s > minSize) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
async function drawCard() {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all([
    document.fonts.load('900 100px Doto'),
    document.fonts.load('800 60px "Barlow Condensed"'),
    document.fonts.load('700 50px "Barlow Condensed"'),
    document.fonts.load('500 26px "IBM Plex Mono"'),
  ]).catch(() => {});
  const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const DOTO = 'Doto, "IBM Plex Mono", monospace';
  const MONO = '"IBM Plex Mono", monospace';
  const led = LEDS[state.led];

  ctx.fillStyle = '#07090C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -80, 40, W / 2, -80, 760);
  glow.addColorStop(0, 'rgba(214, 230, 255, 0.16)');
  glow.addColorStop(1, 'rgba(214, 230, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(225, 238, 255, 0.8)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#F1F4F6';
  ctx.fillRect(70, 30, W - 140, 5);
  ctx.restore();

  if (state.format === 'totem') {
    const x = 190;
    const w = 700;
    roundRect(ctx, x, 230, w, 590, 26);
    ctx.fillStyle = '#151A20';
    ctx.fill();
    ctx.strokeStyle = '#2C333D';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRect(ctx, x + 22, 252, w - 44, 120, 14);
    ctx.fillStyle = '#F1F4F6';
    ctx.fill();
    ctx.fillStyle = '#0B0D10';
    ctx.textBaseline = 'middle';
    ctx.font = `800 70px ${COND}`;
    ctx.fillText('STATION $PLEIN', x + 52, 314);
    [[state.l1, state.v1, 392], [state.l2, state.v2, 600]].forEach(([label, value, y]) => {
      roundRect(ctx, x + 22, y, w - 44, 196, 14);
      ctx.fillStyle = '#030405';
      ctx.fill();
      ctx.fillStyle = '#F1F4F6';
      fitFont(ctx, label, 700, COND, 52, 250);
      ctx.fillText(label, x + 56, y + 98);
      ctx.save();
      ctx.shadowColor = led.glow;
      ctx.shadowBlur = 26;
      ctx.fillStyle = led.hex;
      ctx.textAlign = 'right';
      fitFont(ctx, value, 900, DOTO, 132, 340, 40);
      ctx.fillText(value, x + w - 56, y + 104);
      ctx.restore();
    });
    ctx.fillStyle = '#1A1F26';
    ctx.fillRect(x + 170, 820, 26, 150);
    ctx.fillRect(x + w - 196, 820, 26, 150);
  } else if (state.format === 'panneau') {
    roundRect(ctx, 110, 380, 860, 520, 26);
    ctx.fillStyle = '#1D4FA3';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#F1F4F6';
    roundRect(ctx, 130, 400, 820, 480, 18);
    ctx.stroke();
    roundRect(ctx, 168, 438, 250, 74, 10);
    ctx.fillStyle = '#F1F4F6';
    ctx.fill();
    ctx.fillStyle = '#1D4FA3';
    ctx.textBaseline = 'middle';
    ctx.font = `800 50px ${COND}`;
    ctx.fillText('SORTIE 17', 190, 477);
    ctx.fillStyle = '#FFFFFF';
    [[state.l1, state.v1, 610], [state.l2, state.v2, 720]].forEach(([label, value, y]) => {
      ctx.textAlign = 'left';
      fitFont(ctx, label, 700, COND, 78, 480);
      ctx.fillText(label, 172, y);
      ctx.textAlign = 'right';
      fitFont(ctx, value, 700, COND, 78, 240);
      ctx.fillText(value, 908, y);
    });
    ctx.textAlign = 'left';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(820, 850);
    ctx.lineTo(900, 790);
    ctx.moveTo(850, 788);
    ctx.lineTo(902, 788);
    ctx.lineTo(902, 840);
    ctx.stroke();
  } else {
    const x = 240;
    const w = 600;
    ctx.fillStyle = '#F2EFE6';
    ctx.fillRect(x, 260, w, 640);
    ctx.beginPath();
    for (let i = 0; i <= 20; i += 1) ctx.lineTo(x + (w / 20) * i, i % 2 === 0 ? 900 : 926);
    ctx.lineTo(x + w, 900);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#17181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 64px ${COND}`;
    ctx.fillText('STATION $PLEIN', W / 2, 340);
    ctx.font = `500 22px ${MONO}`;
    ctx.fillText('TICKET DE CAISSE · SOLANA', W / 2, 392);
    const dashed = (y) => {
      ctx.save();
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#17181B';
      ctx.beginPath();
      ctx.moveTo(x + 40, y);
      ctx.lineTo(x + w - 40, y);
      ctx.stroke();
      ctx.restore();
    };
    dashed(440);
    [[state.l1, state.v1, 520], [state.l2, state.v2, 610]].forEach(([label, value, y]) => {
      ctx.textAlign = 'left';
      fitFont(ctx, label, 500, MONO, 34, 300);
      ctx.fillText(label, x + 40, y);
      const lw = ctx.measureText(label).width;
      ctx.textAlign = 'right';
      fitFont(ctx, value, 600, MONO, 34, 200);
      const vw = ctx.measureText(value).width;
      ctx.fillText(value, x + w - 40, y);
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8A8A80';
      ctx.beginPath();
      ctx.moveTo(x + 52 + lw, y + 12);
      ctx.lineTo(x + w - 52 - vw, y + 12);
      ctx.stroke();
      ctx.restore();
    });
    dashed(690);
    ctx.textAlign = 'center';
    ctx.font = `600 28px ${MONO}`;
    ctx.fillText('MERCI DE VOTRE VISITE', W / 2, 760);
    ctx.font = `500 22px ${MONO}`;
    ctx.fillText('PROCHAIN PLEIN : SAMEDI 18:00', W / 2, 806);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8A939E';
  ctx.font = `500 24px ${MONO}`;
  ctx.fillText(`FAIT À LA STATION $PLEIN${C.siteUrl ? ` · ${C.siteUrl.replace(/^https?:\/\//, '')}` : ''}`, W / 2, H - 120);
  ctx.fillStyle = '#0A0C0F';
  ctx.fillRect(0, H - 72, W, 72);
  ctx.fillStyle = 'rgba(241, 244, 246, 0.5)';
  ctx.fillRect(0, H - 72, W, 3);
  ctx.fillStyle = 'rgba(241, 244, 246, 0.72)';
  for (let x = 0; x < W; x += 128) ctx.fillRect(x, H - 38, 64, 6);
  return canvas;
}
async function downloadPng() {
  const canvas = await drawCard();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `totem-plein-${state.format}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    stamp('totem');
  }, 'image/png');
}
function atelierLink() {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ l1: state.l1, v1: state.v1, l2: state.l2, v2: state.v2, f: state.format, led: state.led }).toString();
  url.hash = 'atelier';
  return url.toString();
}

// ---------------------------------------------------------------- contract checker
function renderCheck() {
  const value = state.check.trim();
  const idle = !state.checked || value === '';
  const official = (C.contract || '').trim();
  const ok = !idle && Boolean(official) && value === official;
  setIf('checkIdle', idle);
  setIf('checkOk', ok);
  setIf('checkBad', !idle && !ok);
  const bad = $('[data-if="checkBad"] p');
  if (bad) {
    bad.textContent = official
      ? 'Ce n’est PAS $PLEIN. Ne signe rien.'
      : `Le contrat officiel n’est pas encore publié. Tout contrat qui circule avant ${frenchWhen(LAUNCH_AT).hm} est faux.`;
  }
}

// ---------------------------------------------------------------- the pump (Jupiter Plugin)
let pluginRequested = false;
function mountPlugin() {
  if (pluginRequested || !isOpen()) return;
  pluginRequested = true;
  const jup = C.jupiter || {};
  const script = document.createElement('script');
  script.src = jup.pluginSrc;
  script.async = true;
  script.onload = () => {
    const formProps = { fixedMint: C.contract, initialOutputMint: C.contract, initialInputMint: jup.inputMint };
    if (jup.referralAccount) {
      formProps.referralAccount = jup.referralAccount;
      formProps.referralFee = jup.referralFeeBps;
    }
    window.Jupiter?.init({ displayMode: 'integrated', integratedTargetId: 'jupiter-plugin', formProps });
  };
  document.head.appendChild(script);
}
let lastFocus = null;
function openPump() {
  const pump = $('#pump');
  if (!pump) return;
  lastFocus = document.activeElement;
  pump.hidden = false;
  mountPlugin();
  $('[data-on-click="closePump"]', pump)?.focus();
}
function closePump() {
  const pump = $('#pump');
  if (!pump) return;
  pump.hidden = true;
  lastFocus?.focus?.();
}

// ---------------------------------------------------------------- handlers
const handlers = {
  openPump,
  closePump,
  async copyCA(event, el) {
    if (!isOpen()) return;
    const ok = await copyText(C.contract);
    setText('caLabel', ok ? 'Copié' : 'Copier');
    setText('caShort', ok ? 'Copié' : 'Contrat');
    setTimeout(() => { setText('caLabel', 'Copier'); setText('caShort', 'Contrat'); }, 2000);
  },
  onPrice(event) {
    state.price = Number(event.target.value);
    renderSplit();
  },
  onCp(event) {
    state.cp = event.target.value.replace(/\D/g, '').slice(0, 5);
    event.target.value = state.cp;
  },
  onFind: findStations,
  pick(event, el) {
    const { group, value } = el.dataset;
    if (group === 'fuel') state.fuel = value;
    if (group === 'tank') state.tank = Number(value);
    if (group === 'format') state.format = value;
    if (group === 'led') state.led = value;
    syncChips(group, value);
    if (group === 'format' || group === 'led') renderAtelier();
    if ((group === 'fuel' || group === 'tank') && state.results) {
      findStations(new Event('submit'));
    }
  },
  preset(event, el) {
    state.l2 = state.l1;
    state.v2 = state.v1;
    state.l1 = el.dataset.l;
    state.v1 = el.dataset.v;
    state.visitorCard = false; // the totem on screen is now the viewer's own
    renderAtelier();
  },
  onL1(event) { state.l1 = event.target.value.toUpperCase(); state.visitorCard = false; renderAtelier(); },
  onV1(event) { state.v1 = event.target.value; state.visitorCard = false; renderAtelier(); },
  onL2(event) { state.l2 = event.target.value.toUpperCase(); state.visitorCard = false; renderAtelier(); },
  onV2(event) { state.v2 = event.target.value; state.visitorCard = false; renderAtelier(); },
  downloadPng,
  ticketLink() { stamp('ticket'); }, // a click on a real ticket's Solscan link; the link itself opens normally
  takeCarte() {
    // the visitor asked for the card: this is the first thing written to the browser
    carteNote = keeper.take() ? '' : 'Ton navigateur refuse le stockage : la carte ne dure que le temps de cette visite.';
    renderCarte();
  },
  dropCarte() {
    keeper.discard();
    carteNote = '';
    renderCarte();
  },
  async showTicket(event, el) {
    tickets.shown = Number(el.dataset.n);
    await ensureTicket(tickets.shown);
    renderTickets();
  },
  async copyLink(event, el) {
    if (el.dataset.label === undefined) el.dataset.label = el.textContent;
    const ok = await copyText(atelierLink());
    el.textContent = ok ? 'Lien copié' : 'Copie impossible';
    clearTimeout(Number(el.dataset.timer));
    el.dataset.timer = String(setTimeout(() => { el.textContent = el.dataset.label; }, 2000));
  },
  async shareCard() {
    const best = state.results?.stations?.[0]?.price;
    if (!best) return;
    const text = typo(`Mon plein à ${fr(best, 3)} €/L. Trouve le tien sur la Station.`);
    const url = `${location.origin}/#mon-plein`;
    if (navigator.share) {
      try { await navigator.share({ text, url }); } catch { /* dismissed */ }
    } else {
      await copyText(`${text} ${url}`);
    }
  },
  onCheckInput(event) {
    state.check = event.target.value;
    state.checked = false;
    renderCheck();
  },
  onCheck(event) {
    event.preventDefault();
    state.checked = true;
    renderCheck();
  },
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-on-click]');
  if (el && handlers[el.dataset.onClick]) {
    handlers[el.dataset.onClick](event, el);
    return;
  }
  const pump = $('#pump');
  if (pump && !pump.hidden && event.target.matches('#pump [role="dialog"]')) closePump();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#pump')?.hidden) closePump();
});
$$('[data-on-input]').forEach((el) => el.addEventListener('input', (event) => handlers[el.dataset.onInput]?.(event, el)));
$$('[data-on-submit]').forEach((el) => el.addEventListener('submit', (event) => handlers[el.dataset.onSubmit]?.(event, el)));

// ---------------------------------------------------------------- start
if (priceInput) priceInput.value = String(state.price);
if (C.official?.gazole) showFuel(C.official.gazole, false);
applyOfficial();
applyDashboard();
renderSplit();
renderAtelier();
renderCheck();
buildFeeScale();
buildStamps();
renderCarte();
renderTickets(); // the printed sample until a real ticket is read
if (Number.isFinite(FIRST_PLEIN_AT)) {
  const firstTicketAt = FIRST_PLEIN_AT + PLEIN_WINDOW_MS; // the ticket prints when the window closes
  setText('firstTicketWhen', `${longDay.format(firstTicketAt)} à ${frenchWhen(firstTicketAt).hm}`);
  setText('firstPleinDay', longDate.format(FIRST_PLEIN_AT));
}
tick(); // also applies the phase and starts reading /live.json, /api/chain and the tickets
setInterval(tick, 1000);
loadLive();
