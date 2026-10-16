// Station $PLEIN · behaviour for public/index.html. No framework, no build step.
// The markup comes from the design board; hooks are data attributes:
//   data-bind="key"          text that changes          data-if="name"     shown or hidden
//   data-on-click="handler"  click                      data-on-input      input
//   data-on-submit           form submit                data-post="…"     text once the station is open
// Settings come from /config.js (set once). The contract, wallets and dashboard come from
// /live.json, re-read while the page is open, so the contract appears at 18:00 without a reload.
import { buybackPct, teamPct, frNumber } from './js/formula.js';
import { isSolanaAddress } from './js/mint.js';
import { NBSP as NB, typo } from './js/typo.js';

const C = window.PLEIN_CONFIG || {};
C.contract = '';
C.wallets = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fr = (value, digits = 0) => frNumber(value, digits);

const LAUNCH_AT = Date.parse(C.launchAt || '2026-10-17T18:00:00+02:00');
const isOpen = () => Boolean(C.contract) && Date.now() >= LAUNCH_AT;
const FUEL_LABEL = { gazole: 'Gazole', e10: 'SP95-E10', sp98: 'SP98' };
const LEDS = {
  rouge: { hex: '#FF3D2E', glow: 'rgba(255, 61, 46, 0.6)' },
  vert: { hex: '#3CF08A', glow: 'rgba(60, 240, 138, 0.55)' },
  ambre: { hex: '#FFA733', glow: 'rgba(255, 167, 51, 0.55)' },
};
const CHIP_ON = { background: '#FFA733', color: '#0B0C0E', borderColor: '#FFA733' };
const CHIP_OFF = { background: '#171B21', color: '#F1F4F6', borderColor: '#3A414C' };

const params = new URLSearchParams(location.search);
const state = {
  price: C.official?.gazole ?? 2.356,
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
const parisFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function parisWeekSeconds(time) {
  const p = Object.fromEntries(parisFormat.formatToParts(new Date(time)).map((x) => [x.type, x.value]));
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] ?? 0;
  return dow * 86400 + Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
}
function secondsToNextPlein(time) {
  let delta = 6 * 86400 + 18 * 3600 - parisWeekSeconds(time);
  if (delta <= 0) delta += 7 * 86400;
  return delta;
}
function formatCountdown(total) {
  const z = (n) => String(n).padStart(2, '0');
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}J ` : ''}${z(h)}:${z(m)}:${z(s)}`;
}
let lastOpen = null;
let nextLiveAt = 0;
function tick() {
  const now = Date.now();
  const open = isOpen();
  if (open !== lastOpen) {
    lastOpen = open;
    applyPhase();
  }
  let text;
  let label;
  if (open) {
    text = formatCountdown(secondsToNextPlein(now));
    label = 'Plein dans';
  } else if (now < LAUNCH_AT) {
    text = formatCountdown(Math.round((LAUNCH_AT - now) / 1000));
    label = 'Ouverture dans';
  } else {
    text = 'imminente';
    label = 'Ouverture';
  }
  setText('countdown', text);
  $$('[data-countdown-label]').forEach((el) => { el.textContent = label; });
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
    const res = await fetch('/live.json', { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const text = await res.text();
    if (text === liveText) return;
    const live = JSON.parse(text);
    liveText = text;
    // an address is shown only if it is well-formed; a typo'd or pasted-wrong value stays hidden
    C.contract = isSolanaAddress(live.contract) ? live.contract : '';
    C.wallets = Object.fromEntries(Object.entries(live.wallets || {}).filter(([, a]) => isSolanaAddress(a)));
    if (live.dashboard) C.dashboard = live.dashboard;
    lastOpen = isOpen();
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
  $$('[data-ca]').forEach((el) => { el.textContent = open ? C.contract : 'publié ici samedi à 18:00'; });
  $$('[data-on-click="copyCA"]').forEach((btn) => {
    btn.disabled = !open;
    btn.style.opacity = open ? '1' : '0.45';
    btn.style.cursor = open ? 'pointer' : 'not-allowed';
    btn.title = open ? 'Copier l’adresse officielle' : 'L’adresse sera publiée ici à l’ouverture';
  });
  setIf('pumpClosed', !open);
  setIf('pumpLive', open);
  setText('dashTag', open ? 'En direct' : 'Les compteurs s’allument à l’ouverture');

  const links = C.links || {};
  if (links.xHandle) {
    $$('[data-link="x"]').forEach((a) => { a.href = `https://x.com/${links.xHandle}`; });
    setText('xLabel', `X · @${links.xHandle}`);
  }
  if (links.telegram) {
    $$('[data-link="telegram"]').forEach((a) => { a.href = links.telegram; });
    setText('telegramLabel', 'Telegram');
  }
  if (open) {
    $$('[data-link="dexscreener"]').forEach((a) => { a.href = `https://dexscreener.com/solana/${C.contract}`; });
    $$('[data-link="solscan"]').forEach((a) => { a.href = `https://solscan.io/token/${C.contract}`; });
    $$('[data-link="jupiter"]').forEach((a) => { a.href = `https://jup.ag/swap/USDC-${C.contract}`; });
  }
  Object.entries(C.wallets || {}).forEach(([key, address]) => {
    if (!address) return;
    $$(`[data-wallet="${key}"]`).forEach((el) => { el.textContent = address; });
  });
}

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
  $$('[data-dash="plannedFormula"]').forEach((el) => { el.textContent = `réservoir${NB}×${NB}${fr(pct, 1)}${NB}%`; });
  $$('[data-official="weekLegend"]').forEach((el) => { el.textContent = `${fr(price, 3)} cette semaine`; });
  $$('[data-official-mark]').forEach((el) => {
    const min = Number(priceInput?.min) || 1.5;
    const max = Number(priceInput?.max) || 3.2;
    el.style.left = `${(((price - min) / (max - min)) * 100).toFixed(1)}%`;
  });
  $$('[data-official-aria]').forEach((el) => {
    el.setAttribute('aria-label', `Totem de la station : gazole ${fr(price, 3)} euros le litre au relevé officiel, rachat ${fr(pct, 1)} % ce samedi, et le compte à rebours jusqu’au prochain plein`);
  });
}
function showLive(gazole) {
  $$('[data-live="gazole"]').forEach((el) => { el.textContent = `${fr(gazole, 3)}${NB}€/L`; });
  $$('[data-live="fill50"]').forEach((el) => put(el, `${fr(gazole * 50, 2)} €`));
}
async function loadLive() {
  try {
    const res = await fetch('/api/diesel', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.live?.gazole) showLive(data.live.gazole);
  } catch {
    // keep the fallback printed in the page
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
function applyDashboard() {
  const d = C.dashboard || {};
  if (d.reservoirUsdc != null) {
    $$('[data-dash="reservoir"]').forEach((el) => { el.textContent = fr(d.reservoirUsdc, 0); });
    $$('[data-needle="reservoir"]').forEach((el) => el.setAttribute('d', NEEDLE(d.reservoirUsdc / (d.gaugeFullUsdc || 5000))));
    const planned = (d.reservoirUsdc * buybackPct(C.official?.gazole ?? state.price)) / 100;
    $$('[data-dash="planned"]').forEach((el) => { el.textContent = fr(planned, 0); });
  }
  if (d.volume24hUsd != null) {
    const k = d.volume24hUsd / 1000;
    $$('[data-dash="volume"]').forEach((el) => put(el, k >= 1 ? `${fr(k, 0)} k` : fr(d.volume24hUsd, 0)));
    $$('[data-needle="volume"]').forEach((el) => el.setAttribute('d', NEEDLE(d.volume24hUsd / 250000)));
  }
  if (d.burned != null) {
    const digits = String(Math.max(0, Math.floor(d.burned))).padStart(8, '0').slice(-8).split('');
    const cells = $$('[data-odometer] > span').filter((el) => el.textContent.trim() !== '');
    cells.forEach((cell, i) => { cell.textContent = digits[i] ?? '0'; });
    $$('[data-odometer]').forEach((el) => el.setAttribute('aria-label', `Compteur : ${fr(d.burned, 0)} $PLEIN brûlés`));
  } else {
    $$('[data-odometer]').forEach((el) => el.setAttribute('aria-label', 'Compteur : pas encore de burn'));
  }
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
  setText('resultsTitle', `${data.stations.length} stations · ${data.cp} · ${FUEL_LABEL[data.fuel] || data.fuel}`);
  setText('resultsTag', 'En direct · données officielles');
  setText('spreadLine', `Dans ton secteur, ${fr(data.spread, 3)} €/L d’écart entre la station la moins chère et la plus chère : ${fr(data.spread * state.tank, 2)} € sur un plein de ${state.tank} L.`);
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
    const res = await fetch(`/api/stations?cp=${state.cp}&fuel=${state.fuel}&tank=${state.tank}`, { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data.stations?.length) throw new Error(data.error || 'empty');
    renderStations(data);
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
      : 'Le contrat officiel n’est pas encore publié. Tout contrat qui circule avant 18:00 est faux.';
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
    renderAtelier();
  },
  onL1(event) { state.l1 = event.target.value.toUpperCase(); renderAtelier(); },
  onV1(event) { state.v1 = event.target.value; renderAtelier(); },
  onL2(event) { state.l2 = event.target.value.toUpperCase(); renderAtelier(); },
  onV2(event) { state.v2 = event.target.value; renderAtelier(); },
  downloadPng,
  async copyLink(event, el) {
    const ok = await copyText(atelierLink());
    const label = el.textContent;
    el.textContent = ok ? 'Lien copié' : 'Copie impossible';
    setTimeout(() => { el.textContent = label; }, 2000);
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
const priceInput = $('#gazole');
if (priceInput) priceInput.value = String(state.price);
if (C.liveFallback?.gazole) showLive(C.liveFallback.gazole);
applyOfficial();
applyDashboard();
renderSplit();
renderAtelier();
renderCheck();
tick(); // also applies the phase and starts reading /live.json
setInterval(tick, 1000);
loadLive();
