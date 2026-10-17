// The two hand-edited files: public/config.js (settings) and public/live.json (contract,
// wallets, dashboard). A mistake here reaches every visitor, so the shapes are pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isSolanaAddress } from '../public/js/mint.js';
import { buybackPct } from '../public/js/formula.js';
import { PLEIN_WINDOW_MS, frenchWhen, paris } from '../public/js/clock.js';
import { PLATFORM_FEE_PCT, formatPct } from '../public/js/fees.js';
import { planSlots as fichePlan } from '../public/js/fiche.js';
import { quoteEndpoint } from '../public/js/route.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('public/config.js'), sandbox);
  return sandbox.window.PLEIN_CONFIG;
}

test('the swap widget can only come from Jupiter, with USDC in and no referral fee', () => {
  const { jupiter } = loadConfig();
  assert.equal(new URL(jupiter.pluginSrc).origin, 'https://plugin.jup.ag');
  assert.equal(jupiter.inputMint, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(jupiter.referralAccount, '');
  assert.equal(jupiter.referralFeeBps, 0);
});

test('the launch time and the official price are usable', () => {
  const c = loadConfig();
  assert.ok(Number.isFinite(Date.parse(c.launchAt)), 'launchAt must parse');
  assert.match(c.launchAt, /[+-]\d\d:\d\d$/, 'launchAt carries its UTC offset');
  assert.ok(c.official.gazole > 1 && c.official.gazole < 4, 'diesel price in a sane band');
  assert.ok(Number.isFinite(buybackPct(c.official.gazole)));
  assert.ok(c.official.weekLabel && c.official.source, 'the week and the source are named');
});

test('the launchpad is pump.fun, with a known pair and an https coin page', () => {
  const { launchpad } = loadConfig();
  assert.equal(launchpad.name, 'pump.fun');
  assert.ok(['USDC', 'SOL'].includes(launchpad.quote), 'quote asset is USDC or SOL');
  const url = new URL(launchpad.coinUrl);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'pump.fun');
  assert.ok(url.pathname.endsWith('/'), 'coinUrl ends with a slash: the contract is appended to it');
});

test('opening: Saturday 15:30 Paris; first weekly plein: Saturday 24 October at 18:00', () => {
  const c = loadConfig();
  const open = paris(Date.parse(c.launchAt));
  assert.deepEqual([open.dow, open.h, open.min], [6, 15, 30], 'opening: a Saturday at 15:30 Paris');
  assert.match(c.firstPleinAt, /[+-]\d\d:\d\d$/, 'firstPleinAt carries its UTC offset');
  const first = paris(Date.parse(c.firstPleinAt));
  assert.deepEqual([first.dow, first.h, first.min, first.s], [6, 18, 0, 0], 'first plein: a Saturday at 18:00 Paris');
  assert.ok(Date.parse(c.firstPleinAt) > Date.parse(c.launchAt), 'the first plein comes after the opening');
  assert.ok(Date.parse(c.firstPleinAt) - Date.parse(c.launchAt) > 24 * 3600 * 1000, 'opening evening is not a plein');
});

test('the times printed in index.html are the ones config.js sets', () => {
  const c = loadConfig();
  const html = read('public/index.html');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const openingHm = frenchWhen(Date.parse(c.launchAt)).hm;
  const mentions = [...text.matchAll(/(?:ouverture|Ouverture|ouvre|publié ici|à partir de)\s+(?:dans\s+)?(?:samedi\s+)?(?:\d+\s+\w+\.?\s+)?(?:à\s+)?(\d\d:\d\d)/g)];
  assert.ok(mentions.length >= 6, `the page mentions the opening time in several places (found ${mentions.length})`);
  for (const [phrase, hm] of mentions) assert.equal(hm, openingHm, `"${phrase}" matches launchAt (${openingHm})`);
  // the weekly plein is still 18:00, and the wall says when the first ticket prints
  assert.ok(text.includes('Samedi, 18:00. Le plein.'));
  const ticketAt = Date.parse(c.firstPleinAt) + PLEIN_WINDOW_MS;
  const longDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(ticketAt);
  assert.ok(text.includes(`Le premier ticket s’imprime ${longDay} à ${frenchWhen(ticketAt).hm}`), 'empty-wall line names the first ticket time');
  const firstDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(Date.parse(c.firstPleinAt));
  assert.ok(text.includes(`à partir du ${firstDay}`), 'the card names the first plein day');
});

test('live.json only ever holds well-formed public addresses, and honest dashboard values', () => {
  const live = JSON.parse(read('public/live.json'));
  assert.ok(live.contract === '' || isSolanaAddress(live.contract), 'contract is empty or a Solana address');
  for (const [key, address] of Object.entries(live.wallets)) {
    assert.ok(address === '' || isSolanaAddress(address), `wallet ${key} is empty or a Solana address`);
  }
  const d = live.dashboard;
  for (const key of ['reservoirUsdc', 'volume24hUsd', 'burned']) {
    assert.ok(d[key] === null || (Number.isFinite(d[key]) && d[key] >= 0), `${key} is null or a non-negative number`);
  }
  const measured = d.reservoirUsdc !== null || d.volume24hUsd !== null;
  assert.ok(!measured || Number.isFinite(Date.parse(d.asOf)), 'a measured value carries the time of its reading');
  for (const [key, v] of Object.entries(d.voyants)) {
    assert.ok(['ok', 'warn', 'pending'].includes(v.state), `voyant ${key} has a known state`);
  }
});

test('live.json lights: a pending light names what is checked, and says what the page prints', () => {
  const live = JSON.parse(read('public/live.json'));
  const html = read('public/index.html');
  const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  for (const [key, v] of Object.entries(live.dashboard.voyants)) {
    // CLAUDE.md: a label states a fact only once its state is ok; a number in a pending label is a fact
    if (v.state !== 'ok') assert.ok(!/\d[\d,.]*\s*%/.test(v.label), `voyant ${key} is ${v.state}: its label "${v.label}" must not state a percentage`);
    const start = html.indexOf(`<li data-voyant="${key}"`);
    const li = start < 0 ? null : html.slice(start, html.indexOf('</li>', start));
    assert.ok(li, `index.html has the ${key} light`);
    assert.equal(plain(li.match(/data-voyant-label[^>]*>([^<]*)</)[1]), v.label, `${key}: the printed label is the one live.json sets`);
    assert.equal(plain(li.match(/data-voyant-detail[^>]*>([^<]*)</)[1]), v.detail, `${key}: the printed detail is the one live.json sets`);
  }
  const ct = live.dashboard.ct;
  assert.equal(plain(html.match(/data-ct-verdict[^>]*>([^<]*)</)[1]), ct.verdict);
  assert.equal(plain(html.match(/data-ct-note[^>]*>([^<]*)</)[1]), ct.note);
});

test('the times in live.json are the audit time, one hour after the opening (npm run audit at 16:30)', () => {
  const c = loadConfig();
  const auditHm = frenchWhen(Date.parse(c.launchAt) + 3600 * 1000).hm;
  const live = JSON.parse(read('public/live.json'));
  const strings = [];
  (function walk(x) {
    if (typeof x === 'string') strings.push(x);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  }(live));
  const times = strings.flatMap((s) => [...s.matchAll(/\b(\d\d:\d\d)\b/g)].map((m) => m[1]));
  assert.ok(times.length >= 3, 'the lights say when they are measured');
  for (const hm of times) assert.equal(hm, hm === '15:30' ? '15:30' : auditHm, `"${hm}" is the audit time (${auditHm}) or the opening (15:30)`);
  assert.ok(live._readme.includes(`the contract at ${frenchWhen(Date.parse(c.launchAt)).hm} on launch day`), '_readme names the opening time');
});

test('plein.ics: the opening event is at launchAt, the weekly one starts at firstPleinAt', () => {
  const c = loadConfig();
  const raw = read('public/plein.ics');
  // RFC 5545: CRLF line ends, content lines folded at 75 octets
  assert.ok(raw.startsWith('BEGIN:VCALENDAR\r\n') && raw.endsWith('END:VCALENDAR\r\n'), 'a calendar, CRLF line ends');
  assert.ok(!/[^\r]\n/.test(raw), 'no bare line feed');
  for (const line of raw.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `folded at 75 octets: "${line.slice(0, 40)}"`);
  const ics = raw.replace(/\r\n[ \t]/g, ''); // unfolded
  for (const name of ['VCALENDAR', 'VTIMEZONE', 'VEVENT', 'VALARM']) {
    assert.equal(ics.split(`BEGIN:${name}`).length, ics.split(`END:${name}`).length, `${name} blocks are closed`);
  }
  assert.ok(ics.includes('TZID:Europe/Paris') && ics.includes('X-WR-TIMEZONE:Europe/Paris'), 'Paris time, so the 25 October clock change is the calendar\'s job');
  // a stamp the way the calendar writes a Paris wall-clock time
  const stamp = (instant) => {
    const p = paris(instant);
    const z = (n, len = 2) => String(n).padStart(len, '0');
    return `${z(p.y, 4)}${z(p.m)}${z(p.d)}T${z(p.h)}${z(p.min)}${z(p.s)}`;
  };
  const events = ics.split('BEGIN:VEVENT').slice(1).map((e) => e.split('END:VEVENT')[0]);
  const opening = events.find((e) => /UID:ouverture-/.test(e));
  const weekly = events.find((e) => /UID:plein-du-samedi@/.test(e));
  assert.equal(events.length, 2, 'the opening and the weekly plein, nothing else');
  assert.ok(opening && weekly, 'both events are there');
  const launchAt = Date.parse(c.launchAt);
  const firstPleinAt = Date.parse(c.firstPleinAt);
  assert.ok(opening.includes(`DTSTART;TZID=Europe/Paris:${stamp(launchAt)}`), 'the opening event starts at launchAt (15:30 Paris)');
  assert.ok(opening.includes(`DTEND;TZID=Europe/Paris:${stamp(launchAt + 30 * 60 * 1000)}`), 'and lasts half an hour');
  assert.ok(opening.includes(`à partir de ${frenchWhen(launchAt).hm}.`), 'its description names the opening time');
  assert.ok(opening.includes(`le premier plein est le samedi ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(firstPleinAt)} à ${frenchWhen(firstPleinAt).hm}`),
    'and says that the first plein is a week later, as the page does');
  assert.ok(/SEQUENCE:[1-9]/.test(opening), 'a corrected event carries a sequence number so calendars update it');
  assert.ok(weekly.includes(`DTSTART;TZID=Europe/Paris:${stamp(firstPleinAt)}`), 'the weekly event starts at firstPleinAt (Saturday 18:00 Paris)');
  assert.ok(weekly.includes(`DTEND;TZID=Europe/Paris:${stamp(firstPleinAt + PLEIN_WINDOW_MS)}`), 'and ends when the ticket prints (19:05)');
  assert.ok(weekly.includes('RRULE:FREQ=WEEKLY;BYDAY=SA'), 'every Saturday');
  assert.ok(stamp(firstPleinAt).slice(0, 8) > stamp(launchAt).slice(0, 8), 'no weekly plein on opening day');
  assert.notEqual(opening.match(/UID:(\S+)/)[1], weekly.match(/UID:(\S+)/)[1]);
});

test('the page does not let an opening-day visitor read the first buyback as tonight', () => {
  const c = loadConfig();
  const html = read('public/index.html');
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const firstDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(Date.parse(c.firstPleinAt));
  assert.ok(text.includes(`Chaque samedi à 18 h, à partir du ${firstDay}, une part des frais`), 'the hero names the first plein');
  assert.ok(text.includes(`Premier plein samedi ${firstDay} ; pas de plein le jour de l’ouverture.`), 'the section says there is no plein on opening day');
  const meta = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(meta.includes(`à partir du ${firstDay}`), 'the meta description names the first plein');
});

// ---------------------------------------------------------------- what the page promises, and what it hooks onto

const pageText = () => read('public/index.html').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('wallets: each placeholder says when it will be published, as the fiche does, and every listed wallet has a slot in live.json', () => {
  const html = read('public/index.html');
  const live = JSON.parse(read('public/live.json'));
  const shown = [...html.matchAll(/data-wallet="(\w+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(shown.map(([key]) => key).sort(), ['aid', 'creator', 'founder1', 'founder2', 'reservoir', 'team']);
  for (const [key] of shown) assert.ok(key in live.wallets, `live.json has a slot for ${key}`);
  const promise = Object.fromEntries(shown);
  // the multisig, the aid wallet and the team payout wallet come with the first plein; the others with the opening
  for (const key of ['reservoir', 'aid', 'team']) assert.equal(promise[key], 'publié avant le premier plein', `${key}`);
  for (const key of ['creator', 'founder1', 'founder2']) assert.equal(promise[key], 'publié à l’ouverture', `${key}`);
  const fiche = read('public/fiche-plein.html');
  for (const key of ['reservoir', 'aid']) {
    assert.ok(fiche.includes(`data-wallet="${key}">publié avant le premier plein`), `the fiche promises the same for ${key}`);
  }
  // the commitments are worded as promises until the signers and wallets are out
  const text = pageText();
  assert.ok(text.includes('Ses signataires seront publiés avant le premier plein.'));
  assert.ok(text.includes('Tous nos wallets seront publics avant le premier plein : réservoir, équipe, aide.'));
  assert.ok(!/signataires sont publiés|Tous nos wallets sont publics/.test(text), 'no commitment stated as done that is not');
  assert.ok(!/Les wallets sont publiés\. /.test(text));
});

test('the page does not claim what the team knows to be false or unsettled', () => {
  const text = pageText();
  assert.ok(/Une tranche toutes les 5 minutes, chacune avec sa transaction\./.test(text));
  assert.ok(!/bondir|pour ne pas faire/.test(text), 'slicing is not sold as keeping the price down (docs/moteur.md section 4)');
  assert.ok(text.includes('Tant que la convention n’est pas signée, ces 10 % attendent dans le wallet aide, publié, et ne vont jamais à l’équipe.'), 'the FAQ says where the aid waits');
  const team = JSON.parse(read('public/live.json')).dashboard.voyants.team;
  assert.ok(!/annoncé/.test(team.detail), 'the team light does not read as "the team holds 0 %"');
  assert.ok(/0 % réservé/.test(team.detail) && /achat à la création/.test(team.detail), 'it says 0 % reserved, and that a creation buy is published');
});

test('app.js: every request has a deadline, the loyalty card writes only through the keeper, and every hook has a handler', () => {
  const app = read('public/app.js');
  const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => /\bfetch\(/.test(line));
  assert.equal(bare.length, 2, 'fetch( appears only inside fetchWithin (the signal and the fallback), nowhere else');
  assert.ok(/AbortSignal\.timeout\(ms\)/.test(app) && /new AbortController\(\)/.test(app) && /FETCH_TIMEOUT_MS = 10000/.test(app));
  assert.ok(!/setItem|writeCard|localStorage\.(?:set|remove)/.test(app), 'the page never writes the card itself: createKeeper does, after "Prendre une carte"');
  const html = read('public/index.html');
  const handlersBlock = app.slice(app.indexOf('const handlers = {'), app.indexOf('document.addEventListener(\'click\''));
  const hooks = new Set([...html.matchAll(/data-on-(?:click|input|submit)="(\w+)"/g)].map((m) => m[1]));
  assert.ok(hooks.has('takeCarte') && hooks.has('dropCarte'), 'the card buttons are on the page');
  for (const name of hooks) assert.ok(new RegExp(String.raw`\b${name}\b`).test(handlersBlock), `a handler exists for ${name}`);
  // the ticket rows fillTicket fills exist in the real-ticket template
  for (const key of ['carried', 'fees', 'unspent', 'carriedDetail']) assert.ok(html.includes(`data-tk="${key}"`), `ticket row ${key}`);
  for (const name of ['carried', 'unspent', 'carriedDetail']) assert.ok(html.includes(`data-tk-show="${name}"`), `ticket toggle ${name}`);
  for (const name of ['plannedNumber', 'plannedStatus', 'carteLoose', 'carteKept']) assert.ok(html.includes(`data-if="${name}"`), `${name} is on the page`);
});

test('the card is described as kept only after the visitor takes it', () => {
  const text = pageText();
  assert.ok(text.includes('Tant que tu n’as pas pris ta carte, tes tampons ne vivent que dans cette page : rien n’est écrit dans ton navigateur.'));
  assert.ok(text.includes('Prendre une carte') && text.includes('Rendre la carte'));
  assert.ok(!/Ta carte reste dans ton navigateur\./.test(text), 'the old sentence promised storage that no longer happens by itself');
});

test('the card: taken with a tap, handed back with another, and it says what it is worth', () => {
  const html = read('public/index.html');
  const text = pageText();
  assert.ok(text.includes('Prendre une carte') && text.includes('Rendre la carte'));
  assert.ok(!/Prendre ma carte|Jeter ma carte/.test(text), 'the buttons were renamed');
  assert.ok(text.includes('La carte ne vaut rien et ne sera jamais convertie en jetons.'));
  assert.ok(!text.includes('Elle ne vaut rien'), 'the promise names the card: after the line about the page, « Elle » could be read as the page');
  assert.ok(text.includes('Rendre la carte l’efface de ton navigateur.'), 'the kept-card line says what handing it back does');
  // "Prendre" shows while there is no card, "Rendre" once there is one, and the promise shows in both states
  assert.match(html, /<button type="button" data-if="carteLoose" data-on-click="takeCarte"[^>]*>Prendre une carte<\/button>/);
  assert.match(html, /<button type="button" data-if="carteKept" hidden data-on-click="dropCarte"[^>]*>Rendre la carte<\/button>/);
  assert.match(html, /<p data-carte-promise style="[^"]*">La carte ne vaut rien et ne sera jamais convertie en jetons\.<\/p>/);
  const promiseTag = html.match(/<p data-carte-promise[^>]*>/)[0];
  assert.ok(!promiseTag.includes('data-if') && !promiseTag.includes('hidden'), 'the promise is not tied to a state');
  // the handlers behind the two buttons go through the keeper only
  const app = read('public/app.js');
  assert.ok(/takeCarte\(\) \{[^}]*keeper\.take\(\)/.test(app) && /dropCarte\(\) \{[^}]*keeper\.discard\(\)/.test(app));
});

const NBSP = ' ';
const ONES = '1'.repeat(32); // the system address, a visibly fake placeholder
// page text with the tags gone; only ASCII white space collapses, because \s would eat the no-break spaces
const flat = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, NBSP).replace(/[ \t\r\n]+/g, ' ');

test('the pump: a plate for "no route", the swap widget only after Jupiter has one', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  // four panels; all but the closed one start hidden, and the widget's box lives only in the last
  assert.ok(html.includes('data-if="pumpClosed"'));
  for (const name of ['pumpChecking', 'pumpWaiting', 'pumpLive']) assert.match(html, new RegExp(`data-if="${name}" hidden style="display: contents"`), name);
  assert.match(html, /data-if="pumpLive" hidden[^>]*>\s*<div id="jupiter-plugin"/, 'the widget sits inside pumpLive, which starts hidden');
  assert.equal(html.split('id="jupiter-plugin"').length, 2, 'one widget box');
  // the plate: the sentences of docs/innovations.md T5, the pump.fun fee from fees.js, a link to the coin page, no referral
  const start = html.indexOf('data-if="pumpWaiting"');
  const plateHtml = html.slice(start, html.indexOf('data-if="pumpLive"'));
  const plate = flat(plateHtml);
  assert.ok(plate.includes(`Jupiter ne dessert pas encore $PLEIN. Sur la page pump.fun du jeton, pump.fun ajoute ${formatPct(PLATFORM_FEE_PCT)} de frais de plateforme${NBSP}; la part de la station ne change pas (d’après pump.fun).`), plate);
  assert.ok(!/l’app ajoute|est la même/.test(plate), 'the platform fee is pump.fun\'s and the creator share is attributed to pump.fun, as the line below says');
  assert.match(plateHtml, /<a href="https:\/\/pump\.fun" data-link="pumpfun" target="_blank" rel="noopener"/, 'the coin page link reuses the pumpfun hook, which adds the contract');
  assert.ok(!/referral|[?&](ref|r)=/i.test(plateHtml) && !plateHtml.includes('?'), 'no referral code, no query string on the coin link');
  // the route line sits under the widget
  assert.match(html, /id="jupiter-plugin"[^>]*><\/div>\s*<p data-bind="pumpRoute"/);
  // under the route line, a link to the coin's page that shows only when the route could not be checked
  const live = html.slice(html.indexOf('data-if="pumpLive"'), html.indexOf('<p style', html.indexOf('data-if="pumpLive"')));
  assert.match(live, /<a data-if="pumpUnverified" hidden href="https:\/\/pump\.fun" data-link="pumpfun" target="_blank" rel="noopener"/, 'hidden until the route is unverified, on the pumpfun hook');
  assert.ok(!/referral|[?&](ref|r)=/i.test(live) && !live.includes('?'), 'no referral code, no query string on that link either');
  // wiring: the press of the button asks; a route, or an answer that says nothing about it, sets the widget up;
  // only Jupiter's word that there is no route (or the script failing) falls back to the plate
  assert.ok(/from '\.\/js\/route\.js'/.test(app) && /\btestRoute\(/.test(app) && /quoteEndpoint\(jup\.quoteUrl\)/.test(app));
  assert.equal(app.match(/\bmountPlugin\(\)/g).length, 2, 'mountPlugin is defined once and called once, from checkRoute');
  const openPump = app.slice(app.indexOf('function openPump()'), app.indexOf('function closePump()'));
  assert.ok(/checkRoute\(\)/.test(openPump) && !/mountPlugin/.test(openPump), 'the button asks before anything is set up');
  const check = app.slice(app.indexOf('async function checkRoute()'), app.indexOf('let lastFocus'));
  assert.ok(/pumpStateFor\(result\.state\)/.test(check), 'the decision is the tested one in route.js');
  assert.ok(/state !== 'waiting'\) mountPlugin\(\)/.test(check), 'the widget is set up for a route and for an unverified one, not for a plate');
  assert.ok(/state !== 'route'\) pumpTest\.timer = setTimeout\(checkRoute, RETRY_MS\)/.test(check), 'anything short of a route retries every minute');
  assert.ok(/'waiting' \|\| pumpTest\.state === 'unverified'\) && sinceLast < MIN_GAP_MS/.test(check), 'the unverified state is inside the rate window too');
  const render = app.slice(app.indexOf('function renderPump()'), app.indexOf('/** The pump follows the phase'));
  assert.ok(/setIf\('pumpLive', open && \(state === 'route' \|\| state === 'unverified'\)\)/.test(render), 'the widget box shows for both');
  assert.ok(/setIf\('pumpUnverified', open && state === 'unverified'\)/.test(render) && /setText\('pumpRoute', UNVERIFIED_NOTE\)/.test(render), 'and the unverified line replaces the route line');
  assert.ok(!/routeLine\(/.test(render.slice(render.indexOf("state === 'unverified'"), render.indexOf("state === 'route' && result"))), 'the unverified state never claims what Jupiter proposed');
  assert.ok(/MIN_GAP_MS/.test(check), 'and never twice within the free endpoint\'s rate window');
  assert.ok(/script\.onerror/.test(app), 'the widget script failing leaves the plate, not an empty box');
  const close = app.slice(app.indexOf('function closePump()'), app.indexOf('// ---------------------------------------------------------------- handlers'));
  assert.ok(/clearTimeout\(pumpTest\.timer\)/.test(close), 'a closed panel stops asking');
  assert.ok(!/\bfetch\(/.test(read('public/js/route.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/fetchImpl\(/g, '')), 'route.js reaches the network only through its injected, time-limited call');
});

test('the pump notes: the platform fee is the one fees.js holds, and the pump closes before the opening', () => {
  const html = read('public/index.html');
  const pump = flat(html.slice(html.indexOf('<div id="pump"')));
  assert.ok(pump.includes(`pump.fun indique ne pas prélever ici ses ${formatPct(PLATFORM_FEE_PCT)} de plateforme, réservés à son site et à son appli.`), 'the old note and the plate agree on the figure');
  assert.ok(pump.includes('La pompe ouvre samedi à 15:30'), 'the closed panel still names the opening');
  assert.ok(pump.includes('La pompe vérifie sa route'), 'the checking panel');
});

test('config.js: a quote endpoint override, if there is one, is an https address on a Jupiter host', () => {
  const { jupiter } = loadConfig();
  if (jupiter.quoteUrl === undefined || jupiter.quoteUrl === '') return; // the default is used
  assert.equal(quoteEndpoint(jupiter.quoteUrl), jupiter.quoteUrl, 'quoteEndpoint would refuse it and fall back to the default');
});

test('fiche: the creation line links to a Solscan account page (the creator wallet), never to a transaction', () => {
  const fiche = read('public/fiche-plein.html');
  const line = fiche.split(/\r?\n/).find((l) => l.includes('Lancement&nbsp;:'));
  assert.ok(line, 'the launch line is there');
  assert.ok(line.includes('Création&nbsp;: depuis le wallet créateur, <span class="mono" data-wallet="creator">publié à l’ouverture</span>, dont la page Solscan liste la transaction de création.'));
  assert.ok(!/class="todo">\[lien Solscan de la transaction/.test(fiche), 'the old placeholder asked for a transaction link');
  // a transaction signature is a 87-88 character base58 string, which the no-signing guard rejects everywhere
  for (const page of ['public/fiche-plein.html', 'public/index.html', 'public/mentions-legales.html']) {
    assert.ok(!/solscan\.io\/tx\//.test(read(page)), `${page} links no transaction`);
  }
  // what the fiche script paints into a wallet slot is an account page, and into the contract slot a token page
  const planned = fichePlan({ contract: ONES, wallets: { creator: ONES } }, { now: 1, launchAt: 0, launchpad: loadConfig().launchpad });
  assert.equal(planned.wallet('creator').href, `https://solscan.io/account/${ONES}`);
  assert.equal(planned.contract.href, `https://solscan.io/token/${ONES}`);
});
