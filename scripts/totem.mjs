// The 08:00 totem: a 1200 × 675 card of the station's three numbers, a French caption, and a
// prefilled X link so a founder posts it by hand (no paid X API, no X credentials here).
//   node scripts/totem.mjs [--post] [--out <dir>] [--now <ISO time>] [--no-live] [--no-render]
//   (which of the two daily cron lines may run is decided by scripts/_gate.mjs, before this)
//
// Numbers: the official weekly diesel price and the buyback rate it gives (public/config.js and
// public/js/formula.js), the live national average (the same feed and code as GET /api/diesel;
// a dash when the feed is down, never a guess), and the next plein (clock.js, never before
// firstPleinAt). --post sends the card with its caption to the public channel, then the card, a
// draft and the X link to the founders' chat; without the Telegram secrets it prints instead.
// This is the one unattended public post. Its text must pass ligne-continue (docs/salle-de-controle.md)
// before the Telegram secrets are created; without them this job only prints.
// Tier 2: the X composer link (x.com/intent/post?text=…) opens a prefilled post as X documents it;
// not exercised here. X is never called by code: a founder presses the button.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import diesel from '../api/diesel.js';
import { buybackPct, frNumber } from '../public/js/formula.js';
import { nextPleinAt } from '../public/js/clock.js';
import { NBSP, typo } from '../public/js/typo.js';
import { loadConfig } from './official-price.mjs';
import { renderPng } from './_render.mjs';
import { scrub, sendMessage, sendPhoto } from './telegram.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIZE = { width: 1200, height: 675 };

// ---- clock ---------------------------------------------------------------------------------

const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A day number never parts from its month: "9 oct.", "24 octobre". */
const nb = (s) => s.replace(/([0-9]) (?=[a-zà-ÿ])/gi, `$1${NBSP}`);

/** The next plein as an instant: the coming Saturday 18:00, but never before the first one. */
export function nextPlein(now, config) {
  const first = Date.parse(config.firstPleinAt);
  return Math.max(nextPleinAt(now), Number.isFinite(first) ? first : 0);
}

// ---- facts and words -----------------------------------------------------------------------

/** Live national diesel average from the same code as /api/diesel, or null. */
export async function liveDiesel() {
  const res = { statusCode: 0, body: '', setHeader() {}, end(b) { this.body = b; } };
  try {
    await diesel({ url: '/api/diesel', query: {} }, res);
    const v = JSON.parse(res.body)?.live?.gazole;
    return res.statusCode === 200 && v > 1 && v < 4 ? v : null;
  } catch {
    return null;
  }
}

export function facts({ now, config, live }) {
  const at = nextPlein(now, config);
  const left = Math.max(0, at - now);
  return {
    dateLabel: cap(nb(dayFormat.format(now))),
    official: config.official.gazole,
    weekLabel: nb(config.official.weekLabel),
    ratePct: buybackPct(config.official.gazole),
    live: live ?? null,
    pleinLabel: `${nb(dayFormat.format(at))}, 18:00`,
    days: Math.floor(left / 86400000),
    hours: Math.floor((left % 86400000) / 3600000),
  };
}

const eur = (n, d) => `${frNumber(n, d)} €`;
/** A full stop, unless the text already ends with one ("9 oct." is an abbreviation). */
const endSentence = (s) => (s.endsWith('.') ? s : `${s}.`);

/** The post text, French, typography applied, no link (the link lives in the bio). */
export function caption(f) {
  return typo([
    f.live === null ? null : `Gazole ce matin : ${eur(f.live, 3)}/L en moyenne nationale.`,
    // the base comes first: a bare "taux" reads as a yield, and this post has no page around it to explain
    `${frNumber(f.ratePct, 1)} % des frais de la semaine rachètent des $PLEIN, brûlés ensuite (20 × ${eur(f.official, 4)}/L, relevé officiel du ${f.weekLabel}).`,
    `Prochain plein : ${f.pleinLabel}.`,
    'Cryptoactif risqué : perte totale possible. 18+. Lien en bio.',
  ].filter(Boolean).join('\n'));
}

/** Link that opens X's composer with the text filled in; a person presses the button. */
export const intentUrl = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

// ---- the card ------------------------------------------------------------------------------

const FONTS = [
  ['Barlow Condensed', 700, 'normal', 'barlow-condensed-latin-700-normal.woff2'],
  ['Barlow Condensed', 800, 'normal', 'barlow-condensed-latin-800-normal.woff2'],
  ['Doto', 900, 'normal', 'doto-latin-900-normal.woff2'],
  ['IBM Plex Mono', 400, 'normal', 'ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, 'normal', 'ibm-plex-mono-latin-500-normal.woff2'],
  ['Instrument Serif', 400, 'italic', 'instrument-serif-latin-400-italic.woff2'],
];
// embedded, so the page renders the same wherever the browser opens it from
const fontFaces = () => FONTS.map(([family, weight, style, file]) => {
  const data = readFileSync(join(ROOT, 'public', 'fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}).join('\n');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const row = (label, sub, value, color, size) => `
      <div class="row"><span class="lab"><b>${esc(label)}</b><i>${esc(typo(sub))}</i></span>
        <span class="led" style="font-size:${size}px;color:${color};text-shadow:0 0 18px ${color}99">${esc(value)}</span></div>`;

/** The card as one HTML page, 1200 × 675. */
export function totemHtml(f) {
  const countdown = f.days > 0 ? `${f.days}J ${f.hours}H` : `${f.hours}H`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Station $PLEIN · totem du jour</title>
<style>
${fontFaces()}
*{box-sizing:border-box;margin:0}
body{width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden;position:relative;color:#F1F4F6;font-family:'Barlow Condensed','Arial Narrow',sans-serif;
background:radial-gradient(ellipse 60% 40% at 25% 0%,rgba(214,230,255,.14),transparent 70%),radial-gradient(ellipse 40% 40% at 78% 95%,rgba(255,61,46,.12),transparent 70%),radial-gradient(ellipse 30% 30% at 82% 98%,rgba(60,240,138,.08),transparent 70%),#07090C}
.canopy{position:absolute;left:50px;right:50px;top:18px;height:5px;border-radius:3px;background:#F1F4F6;box-shadow:0 0 20px 4px rgba(225,238,255,.55),0 20px 80px 16px rgba(225,238,255,.1)}
.left{position:absolute;left:70px;top:96px;width:490px;display:flex;flex-direction:column;gap:18px}
.mono{font-family:'IBM Plex Mono',monospace}
.date{font-weight:500;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#A7AFB9}
.title{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:76px;line-height:1.02}
.note{font-size:18px;line-height:1.6;color:#A7AFB9}
.note b{font-family:'IBM Plex Mono',monospace;font-weight:500;color:#F1F4F6}
.totem{position:absolute;right:70px;top:56px;width:560px}
.body{padding:14px;border-radius:20px;background:linear-gradient(180deg,#1B2028,#12161B);border:1px solid #2C333D;box-shadow:0 50px 120px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07);display:flex;flex-direction:column;gap:11px}
.plate{background:#F1F4F6;color:#0B0D10;border-radius:10px;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 36px rgba(241,244,246,.2)}
.plate b{font-weight:800;font-size:44px;line-height:1}
.row{background:#030405;border:1px solid #1E242C;border-radius:10px;padding:15px 20px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.lab{display:flex;flex-direction:column;gap:7px;line-height:1}
.lab b{font-weight:700;font-size:32px;letter-spacing:.08em}
.lab i{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:15px;color:#8A939E}
.led{font-family:'Doto','IBM Plex Mono',monospace;font-weight:900;line-height:.9;white-space:nowrap}
.legs{width:56%;margin:0 auto;display:flex;justify-content:space-between}
.legs span{width:24px;height:60px;background:linear-gradient(180deg,#1C2128,#0C0F13)}
.road{position:absolute;left:0;right:0;bottom:0;height:44px;background:#0A0C0F;border-top:2px solid rgba(241,244,246,.45);display:flex;align-items:center}
.road div{width:100%;height:4px;background:repeating-linear-gradient(90deg,rgba(241,244,246,.7) 0 50px,transparent 50px 108px)}
</style></head>
<body>
<div class="canopy"></div>
<div class="left">
  <span class="mono date">${esc(f.dateLabel)}</span>
  <span class="title">Le totem du jour.</span>
  <p class="mono note">Rachat = <b>${esc(typo(`20 × ${eur(f.official, 4)}/L`))}</b> en${NBSP}% des frais de la semaine, relevé officiel du ${esc(endSentence(f.weekLabel))}<br>Prochain plein : <b>${esc(f.pleinLabel)}</b>.</p>
</div>
<div class="totem">
  <div class="body">
    <div class="plate"><b>STATION $PLEIN</b>
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:#0B0D10;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M6.5 8h5"/><path d="M14 11h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg>
    </div>${row('GAZOLE', f.live === null ? 'flux indisponible' : 'ce matin, en direct', f.live === null ? '—' : frNumber(f.live, 3), '#FF3D2E', 84)}${row('RACHAT', 'part des frais', `${frNumber(f.ratePct, 1)}%`, '#3CF08A', 84)}${row('PLEIN DANS', 'samedi, 18:00', countdown, '#FFA733', 64)}
  </div>
  <div class="legs" aria-hidden="true"><span></span><span></span></div>
</div>
<div class="road" aria-hidden="true"><div></div></div>
</body></html>
`;
}

// ---- command line --------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      post: { type: 'boolean' }, out: { type: 'string' }, now: { type: 'string' },
      'no-live': { type: 'boolean' }, 'no-render': { type: 'boolean' },
    },
  });
  const now = values.now ? Date.parse(values.now) : Date.now();
  if (!Number.isFinite(now)) throw new Error('--now is not a date');

  const config = loadConfig(readFileSync(join(ROOT, 'public', 'config.js'), 'utf8'));
  const f = facts({ now, config, live: values['no-live'] ? null : await liveDiesel() });
  const text = caption(f);
  const link = intentUrl(text);

  const dir = values.out || join(tmpdir(), 'plein-totem');
  mkdirSync(dir, { recursive: true });
  const day = new Date(now).toISOString().slice(0, 10);
  const html = join(dir, `totem-${day}.html`);
  const png = join(dir, `totem-${day}.png`);
  writeFileSync(html, totemHtml(f));
  console.log(`caption (${text.length} characters):\n${text}\n\nX link:\n${link}\n`);
  if (values['no-render']) { console.log(`html: ${html}`); return; }

  try {
    renderPng(html, png, SIZE);
  } catch (error) {
    if (values.post) await sendMessage('ops', `Totem du jour : le rendu a échoué (${scrub(error.message)}). À faire à la main.\n\n${text}`);
    throw error;
  }
  console.log(`png: ${png}`);

  if (values.post) {
    await sendPhoto('channel', png, text);
    await sendPhoto('ops', png, 'Totem du jour envoyé au canal. Image à joindre au post X.');
    await sendMessage('ops', `Brouillon X (à poster à la main depuis le compte de la station, avec l’image ci-dessus) :\n${link}\n\nTexte :\n${text}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(scrub(error.message, process.env.TELEGRAM_BOT_TOKEN));
    process.exit(1);
  });
}
