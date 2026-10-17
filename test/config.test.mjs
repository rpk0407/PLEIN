// The two hand-edited files: public/config.js (settings) and public/live.json (contract,
// wallets, dashboard). A mistake here reaches every visitor, so the shapes are pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isSolanaAddress } from '../public/js/mint.js';
import { buybackPct } from '../public/js/formula.js';
import { PLEIN_WINDOW_MS, frenchWhen, paris } from '../public/js/clock.js';

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
  const ics = read('public/plein.ics');
  const stamp = (instant) => {
    const p = paris(instant);
    const z = (n, len = 2) => String(n).padStart(len, '0');
    return `${z(p.y, 4)}${z(p.m)}${z(p.d)}T${z(p.h)}${z(p.min)}${z(p.s)}`;
  };
  const events = ics.split('BEGIN:VEVENT').slice(1).map((e) => e.split('END:VEVENT')[0]);
  const opening = events.find((e) => /UID:ouverture-/.test(e));
  const weekly = events.find((e) => /UID:plein-du-samedi@/.test(e));
  assert.ok(opening && weekly, 'both events are there');
  assert.ok(opening.includes(`DTSTART;TZID=Europe/Paris:${stamp(Date.parse(c.launchAt))}`), 'the opening event starts at launchAt');
  assert.ok(opening.includes(`à partir de ${frenchWhen(Date.parse(c.launchAt)).hm}.`), 'its description names the opening time');
  assert.ok(/SEQUENCE:[1-9]/.test(opening), 'a corrected event carries a sequence number so calendars update it');
  assert.ok(weekly.includes(`DTSTART;TZID=Europe/Paris:${stamp(Date.parse(c.firstPleinAt))}`), 'the weekly event starts at firstPleinAt');
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
  assert.ok(!/setItem|writeCard|localStorage\.(?:set|remove)/.test(app), 'the page never writes the card itself: createKeeper does, after "Prendre ma carte"');
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
  assert.ok(text.includes('Prendre ma carte') && text.includes('Jeter ma carte'));
  assert.ok(!/Ta carte reste dans ton navigateur\./.test(text), 'the old sentence promised storage that no longer happens by itself');
});
