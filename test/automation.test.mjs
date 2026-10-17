// The bots and scheduled jobs: the official-price reader, the look-alike watch, the Telegram
// sender, the daily totem, the schedule gate with its first-plein floor, the Saturday guard that
// notices a dropped run, and the workflow files. Everything runs offline (fetch is stubbed, GitHub's
// Actions API is a fake, the ministry's workbook is rebuilt in memory); the live checks are done by
// hand and in CI. Tier 2: no workflow has run on GitHub yet, so the files are read here, not run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  findTableUrl, loadConfig, opsMessage, parseFrenchDate, parseOfficial, sourceSentence, unzip, updateConfig, weekLabel, xlsxToTsv,
} from '../scripts/official-price.mjs';
import {
  alertText, distance, findClones, lookalike, markdownReport, normalize, parseSeen, searchAll, toAlert,
} from '../scripts/vigie.mjs';
import { chunkText, plainFromMarkdown, scrub, sendMessage, sendPhoto } from '../scripts/telegram.mjs';
import { findBrowser, pngSize, renderPng } from '../scripts/_render.mjs';
import { caption, facts, intentUrl, nextPlein, totemHtml } from '../scripts/totem.mjs';
import {
  FREEZE_LEAD_MS, ORDER_JOB, ORDER_STEP, ORDER_WORKFLOW, QUIET_DAYS,
  afterOrders, feesOf, freezeOf, lookForSent, orderAlertText, sentAtOf, sentNote,
  cronTime, decide, earlyNote, firstPleinFromConfig, judgeOrder, lookAtOrders, missingTelegram, orderOfRun, watchOrder, when,
} from '../scripts/_gate.mjs';
import { paris, parisInstant } from '../public/js/clock.js';
import { typo } from '../public/js/typo.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const node = process.execPath;
const scratch = () => mkdtempSync(join(tmpdir(), 'plein-test-'));

// ---- official price ------------------------------------------------------------------------

const TABLE = [
  ['', 'PRIX DE VENTE H.T.T. (en euro par litre)', '', '', '', '', '', 'PRIX DE VENTE T.T.C. (en euro par litre)'],
  ['Date', 'Gazole', 'Super SP95-E5', 'Super SP95-E10', 'Super SP98', 'E85', 'GPLc', 'Gazole', 'Super SP95-E5'],
  ['46297', '1.3554', '', '', '', '', '', '2.3555', '2.2117'],
  ['46304', '1.3327', '', '', '', '', '', '2.3283', '2.2122'],
  ['46311', '1.30', '', '', '', '', '', '', ''],              // next Friday, row prepared but no price yet
  ['MOYENNES MENSUELLES'],
  ['46300', '', '', '', '', '', '', '9.99', ''],               // a monthly row must never be read as weekly
];
const tsv = (rows) => rows.map((r) => r.join('\t')).join('\n');

test('the latest weekly all-taxes diesel price is read from the ministry table', () => {
  const got = parseOfficial(tsv(TABLE));
  assert.equal(got.price, 2.3283);
  assert.equal(got.date, '2026-10-09');
  assert.equal(got.weekLabel, '9 oct.');
  assert.equal(got.source, 'Relevé hebdomadaire officiel du 9 octobre 2026');
  assert.equal(got.rows, 2);
});

test('a table that is not the one we know is refused, not guessed at', () => {
  const crazy = TABLE.map((r) => r.slice());
  crazy[3][7] = '23.283';
  assert.throws(() => parseOfficial(tsv(crazy)), /sane band/);
  assert.throws(() => parseOfficial(tsv(TABLE.slice(1))), /T\.T\.C\./);
  assert.throws(() => parseOfficial('a\tb\nc\td'), /Date/);
  assert.throws(() => parseOfficial(tsv(TABLE.slice(0, 2))), /no weekly/);
});

test('dates are written the way config.js writes them', () => {
  assert.equal(weekLabel('2026-02-01'), '1 févr.');
  assert.equal(sourceSentence('2026-12-01'), 'Relevé hebdomadaire officiel du 1er décembre 2026');
  assert.equal(parseFrenchDate('Relevé hebdomadaire officiel du 9 octobre 2026'), '2026-10-09');
  assert.equal(parseFrenchDate(sourceSentence('2026-12-01')), '2026-12-01');
  assert.equal(parseFrenchDate('quoted by a newspaper'), null);
});

/** A zip archive in memory (deflate), the container of an .xlsx. */
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const WORKBOOK = {
  '[Content_Types].xml': '<Types/>',
  'xl/workbook.xml': '<workbook><sheets><sheet name="Combustibles" sheetId="3" r:id="rId9"/><sheet name="Carburants routiers" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Type="x" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>PRIX DE VENTE H.T.T.</t></si><si><t>PRIX DE VENTE T.T.C.</t></si><si><t>Date</t></si><si><r><t>Ga</t></r><r><t>zole</t></r></si><si><t>MOYENNES MENSUELLES</t></si></sst>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
<row r="1"><c r="A1" s="1"/><c r="B1" t="s"><v>0</v></c><c r="H1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="H2" t="s"><v>3</v></c></row>
<row r="3"><c r="A3"><v>46297</v></c><c r="B3"><v>1.3554</v></c><c r="H3"><v>2.3555</v></c></row>
<row r="4"><c r="A4"><v>46304</v></c><c r="B4"><v>1.3327</v></c><c r="H4"><f>ROUND(x,4)</f><v>2.3283000000000001</v></c></row>
<row r="5"><c r="A5" t="s"><v>4</v></c></row>
<row r="6"><c r="A6"><v>46305</v></c><c r="H6"><v>9.99</v></c></row>
</sheetData></worksheet>`,
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
};

test('the .xlsx is opened with built-ins: right sheet, strings resolved, formulas read as their value', () => {
  const book = zip(WORKBOOK);
  assert.ok(unzip(book).has('xl/sharedStrings.xml'));
  const text = xlsxToTsv(book);
  assert.match(text, /^\tPRIX DE VENTE H\.T\.T\.\t/);
  assert.equal(parseOfficial(text).price, 2.3283);
  assert.throws(() => unzip(Buffer.from('not a zip')), /not a zip/);
});

const CONFIG = [
  '// Settings.',
  'window.PLEIN_CONFIG = {',
  '  launchAt: \'2026-10-17T15:30:00+02:00\',',
  '',
  '  // Official weekly national average for diesel, used for Saturday\'s buyback rate.',
  '  // 2 Oct 2026 survey: 2.3555 €/L as quoted by a newspaper.',
  '  // Tier 2 until checked against the ministry\'s own weekly note.',
  '  official: {',
  '    gazole: 2.3555,',
  '    weekLabel: \'2 oct.\',',
  '    source: \'Relevé hebdomadaire officiel du 2 octobre 2026\',',
  '  },',
  '',
  '  links: { xHandle: \'\' },',
  '};',
  '',
];
const NEXT = { price: 2.3283, date: '2026-10-09', weekLabel: '9 oct.', source: 'Relevé hebdomadaire officiel du 9 octobre 2026' };

test('updating config.js changes the official block and its dated comment, nothing else', () => {
  for (const eol of ['\n', '\r\n']) {
    const before = CONFIG.join(eol);
    const after = updateConfig(before, NEXT, { gazole: 2.3555, date: '2026-10-02' });
    const a = loadConfig(before);
    const b = loadConfig(after);
    assert.deepEqual(b.official, { gazole: 2.3283, weekLabel: '9 oct.', source: NEXT.source });
    assert.equal(b.launchAt, a.launchAt);
    assert.deepEqual(b.links, a.links);
    assert.match(after, /9 Oct 2026 survey: 2\.3283/);
    assert.match(after, /Previous survey \(2 Oct 2026\): 2\.3555/);
    assert.doesNotMatch(after, /Tier 2 until checked/);
    assert.match(after, /Official weekly national average for diesel/); // the standing comment stays
    assert.equal(after.split('\n').every((line, i, all) => i === all.length - 1 || line.endsWith('\r') === (eol === '\r\n')), true);
    assert.equal(updateConfig(after, NEXT, null), after.replace(/ {2}\/\/ Previous survey[^\r\n]*\r?\n/, ''));
  }
  assert.throws(() => updateConfig('window.PLEIN_CONFIG = {};', NEXT), /official/);
});

test('the link to the price table is found on the ministry page, and the weekly note derives from the date', () => {
  const html = '<a href="/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_1.xlsx?x=1&amp;y=2">x</a><a href="other.pdf">';
  assert.equal(findTableUrl(html), 'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_1.xlsx?x=1&y=2');
  assert.equal(findTableUrl('<a href="x.pdf">'), null);
});

test('the command writes config.js from a local workbook, once, and says when nothing is new', () => {
  const dir = scratch();
  const book = join(dir, 'table.xlsx');
  const config = join(dir, 'config.js');
  writeFileSync(book, zip(WORKBOOK));
  writeFileSync(config, CONFIG.join('\n'));
  const run = (...args) => JSON.parse(execFileSync(node, [join(root, 'scripts/official-price.mjs'), '--json', '--file', book, '--config', config, ...args], { encoding: 'utf8' }));
  const dry = run();
  assert.equal(dry.status, 'new');
  assert.equal(dry.written, false);
  assert.equal(dry.ratePct, 46.6);
  assert.match(dry.opsMessage, /^Nouveau relevé officiel\u00A0: gazole 2,3283\u00A0€\/L/);
  assert.equal(loadConfig(readFileSync(config, 'utf8')).official.gazole, 2.3555);
  assert.equal(run('--write').written, true);
  assert.equal(loadConfig(readFileSync(config, 'utf8')).official.gazole, 2.3283);
  assert.equal(run('--write').status, 'unchanged');
  // a workbook older than config.js is an error, not a quiet downgrade
  const old = CONFIG.join('\n').replace('2 octobre', '16 octobre').replace('2 oct.', '16 oct.');
  writeFileSync(config, old);
  assert.throws(() => execFileSync(node, [join(root, 'scripts/official-price.mjs'), '--file', book, '--config', config], { stdio: 'pipe' }), /older than config/);
});

test('the ops-chat sentence for a new survey is French, typeset, and ends where the link goes', () => {
  const base = { status: 'new', price: 2.3283, weekLabel: '9 oct.', ratePct: 46.6, current: { gazole: 2.3555, weekLabel: '2 oct.', ratePct: 47.1 }, warnings: [] };
  const text = opsMessage(base);
  assert.equal(typo(text), text, 'already typeset');
  assert.match(text, /^Nouveau relevé officiel\u00A0: gazole 2,3283\u00A0€\/L \(9 oct\.\), config\.js a 2,3555 \(2 oct\.\)\./);
  assert.match(text, /Taux de rachat\u00A0: 46,6\u00A0% \(avant\u00A0: 47,1\u00A0%\)\./);
  assert.match(text, /en un clic\u00A0:$/);
  assert.doesNotMatch(text, /Avertissement/);
  assert.match(opsMessage({ ...base, status: 'revised' }), /^Relevé officiel révisé/);
  assert.match(opsMessage({ ...base, warnings: ['moved by more than 10 %'] }), /Avertissement\u00A0: voir la PR/);
});

// ---- the look-alike watch ------------------------------------------------------------------

const OFFICIAL = 'OffiC1aLmintAddressxxxxxxxxxxxxxxxxxxxpump';
const pair = (address, symbol, name, extra = {}) => ({
  chainId: 'solana', pairAddress: `pair-${address}`, url: `https://dexscreener.com/solana/pair-${address}`,
  baseToken: { address, symbol, name }, ...extra,
});

test('tickers and names that pose as $PLEIN are told apart from the rest', () => {
  assert.equal(normalize('$PLE1N'), 'plein');
  assert.equal(normalize('РLЕIN'), 'plein'); // Cyrillic Р and Е
  assert.equal(normalize('Le  Plein!'), 'leplein');
  assert.equal(distance('plien', 'plein'), 1); // swapped letters
  assert.equal(lookalike('PLEIN'), 'high');
  assert.equal(lookalike('Station PLEIN'), 'high');
  assert.equal(lookalike('PLE1N'), 'high');
  assert.equal(lookalike('PLEIN COIN'), 'medium');
  assert.equal(lookalike('bostplein'), 'medium');
  assert.equal(lookalike('PLAIN'), 'low');
  assert.equal(lookalike('PLIEN'), 'low');
  assert.equal(lookalike('HODL'), null);
  assert.equal(lookalike('PL'), null);
  assert.equal(lookalike(undefined), null);
});

test('findClones drops the official mint, other chains and unrelated tokens, and merges pairs of one token', () => {
  const pairs = [
    pair(OFFICIAL, 'PLEIN', 'Station PLEIN'),
    pair('cloneA', 'PLEIN', 'plein', { liquidity: { usd: 100 }, volume: { h24: 10 }, pairCreatedAt: Date.parse('2026-10-16T10:00:00Z') }),
    pair('cloneA', 'PLEIN', 'plein', { liquidity: { usd: 900 }, volume: { h24: 5 }, pairCreatedAt: Date.parse('2026-10-15T10:00:00Z'), url: 'https://dexscreener.com/solana/big' }),
    pair('cloneB', 'PLEINCOIN', 'x', { liquidity: { usd: 50000 } }),
    pair('cloneC', 'PLAIN', 'Plain Token'),
    { ...pair('cloneD', 'PLEIN', 'PLEIN'), chainId: 'base' },
    pair('other', 'HODL', 'HODL This'),
    { baseToken: null },
  ];
  const clones = findClones(pairs, OFFICIAL);
  assert.deepEqual(clones.map((c) => [c.address, c.severity]), [['cloneA', 'high'], ['cloneB', 'medium'], ['cloneC', 'low']]);
  const a = clones[0];
  assert.equal(a.pairs, 2);
  assert.equal(a.liquidityUsd, 900);
  assert.equal(a.volume24hUsd, 15);
  assert.equal(a.createdAt, '2026-10-15T10:00:00.000Z');
  assert.equal(a.url, 'https://dexscreener.com/solana/big');
  // before launch nothing is official: our own token is a suspect too
  assert.equal(findClones(pairs, '').length, 4);
  assert.deepEqual(findClones(undefined, ''), []);
});

test('the report remembers what it has seen, so only new look-alikes alert the founders', () => {
  const clones = findClones([pair('cloneA', 'PLEIN', 'plein'), pair('cloneC', 'PLAIN', 'x')], '');
  const first = markdownReport({ clones, seen: [], official: '', now: new Date('2026-10-17T12:00:00Z') });
  assert.match(first, /Relevé du 2026-10-17 12:00 UTC/);
  assert.match(first, /NOUVEAU/);
  assert.deepEqual(parseSeen(first).sort(), ['cloneA', 'cloneC']);
  assert.deepEqual(toAlert(clones, []).map((c) => c.address), ['cloneA']); // a near-miss never alerts
  assert.match(alertText(toAlert(clones, [])), /1 nouvelle imitation sur Solana/);
  const second = markdownReport({ clones, seen: parseSeen(first), official: 'cloneZ' });
  assert.doesNotMatch(second, /NOUVEAU/);
  assert.deepEqual(toAlert(clones, parseSeen(first)), []);
  assert.equal(alertText([]), '');
  assert.deepEqual(parseSeen('<!-- vigie-state {broken -->'), []);
  assert.deepEqual(parseSeen(undefined), []);
  assert.match(markdownReport({ clones: [] }), /Aucune imitation/);
});

test('lookalike letters from other alphabets, fullwidth, math and small-capital forms are folded', () => {
  const GREEK_IOTA = 'PLE\u0399N';
  const GREEK_RHO = '\u03A1LEIN';
  const FULLWIDTH = '\uFF30\uFF2C\uFF25\uFF29\uFF2E';
  const MATH_BOLD = '\u{1D40F}\u{1D40B}\u{1D404}\u{1D408}\u{1D40D}';
  const DOTLESS = 'PLE\u0131N';
  const SMALL_CAPS = '\u1D18\u029F\u1D07\u026A\u0274';
  const DOTTED_CAPITAL = 'PLE\u0130N';
  const GREEK_STATION = 'ST\u0391TION PLEIN';
  for (const t of [GREEK_IOTA, GREEK_RHO, FULLWIDTH, MATH_BOLD, DOTLESS, SMALL_CAPS, DOTTED_CAPITAL, GREEK_STATION, 'PLEIN']) {
    assert.equal(lookalike(t), 'high', `${t} (${[...t].map((c) => c.codePointAt(0).toString(16)).join(' ')})`);
  }
  assert.equal(normalize(FULLWIDTH), 'plein');
  assert.equal(normalize(MATH_BOLD), 'plein');
  assert.equal(lookalike('\u03A0\u039B\u0395\u0399\u039D'), null, 'real Greek letters that only half resemble ours stay quiet');
  assert.equal(lookalike('HODL'), null);
});

/** A stranger's token name can be anything up to the chain's limit: build the nasty ones. */
const FORGED_STATE = '<!-- vigie-state {"seen":["cloneZ"]} -->';
const NASTY_NAMES = [
  '<!-- vigie-state {"seen":[]} -->', // exactly 32 bytes: fits pump.fun's name limit
  FORGED_STATE,
  '[Site officiel](https://evil.example)',
  '![x](https://evil.example/i.png)',
  '@handle',
  '<!-- unclosed',
  'a`b|c\nd',
  '\u202Eevil\u200B',
];

test('a token name written by a stranger cannot forge the memory, link anywhere or mention anyone', () => {
  assert.equal(Buffer.byteLength(NASTY_NAMES[0]), 32);
  const clones = findClones(NASTY_NAMES.map((name, i) => pair(`clone${i}`, 'PLEIN', name)), '');
  assert.equal(clones.length, NASTY_NAMES.length);
  const report = markdownReport({ clones, seen: ['old'], official: '' });
  const seen = parseSeen(report);
  assert.ok(!seen.includes('cloneZ'), 'the forged memory is not read');
  assert.deepEqual(seen.sort(), ['old', ...clones.map((c) => c.address)].sort());
  assert.ok(!report.includes('\u202E') && !report.includes('\u200B'), 'direction and invisible characters are gone');

  // outside code spans nothing a stranger wrote is left, and the one real memory is the last line
  const lines = report.split('\n');
  assert.match(lines.at(-1), /^<!-- vigie-state \{.*\} -->$/);
  const shown = lines.slice(0, -1).join('\n').replace(/`[^`\n]*`/g, '');
  for (const bad of ['evil.example', '@handle', 'unclosed', 'vigie-state', 'cloneZ']) assert.ok(!shown.includes(bad), bad);
  assert.equal(lines.slice(0, -1).filter((l) => l.includes('<!--')).length, 3, 'the three names that hold a comment opener sit inside code spans');
  // every table row keeps its seven cells
  for (const row of lines.filter((l) => /^\| (haute|moyenne|faible)/.test(l))) {
    assert.equal(row.replace(/`[^`\n]*`/g, '').split('|').length, 9, row);
  }
  assert.match(report, /écrits par des inconnus/);
  assert.match(report, /`\[Site officiel\]\(https:\/\/evil\.example\)`/);
});

test('the memory is read from the last line only, with either line ending', () => {
  const one = '<!-- vigie-state {"seen":["a"]} -->';
  const two = '<!-- vigie-state {"seen":["b"]} -->';
  assert.deepEqual(parseSeen(`${one}\nsome text\n${two}\n`), ['b']);
  assert.deepEqual(parseSeen(`${one}\nsome text after it`), [], 'text after the last line means there is no memory');
  assert.deepEqual(parseSeen(`x\r\n${two}\r\n`), ['b']);
  assert.deepEqual(parseSeen(`| a | ${one} | b |\n${two}`), ['b']);
  assert.deepEqual(parseSeen(`| a | ${one} | b |`), [], 'a copy inside a table row is not the memory');
});

test('the vigie writes only DexScreener links, and its Telegram alert defangs what strangers wrote', () => {
  const clones = findClones([
    pair('good', 'PLEIN', 'plein'),
    pair('bad', 'PLEIN', 'plein', { url: 'https://evil.example/x' }),
    pair('worse', 'PLEIN', 'plein', { url: 'javascript:alert(1)' }),
    pair('tricky', 'PLEIN', 'plein', { url: 'https://dexscreener.com.evil.example/x' }),
    pair('named', 'PLEIN', 'see https://evil.example or @handle'),
  ], '');
  const url = (a) => clones.find((c) => c.address === a).url;
  assert.equal(url('good'), 'https://dexscreener.com/solana/pair-good');
  assert.deepEqual([url('bad'), url('worse'), url('tricky')], [null, null, null]);
  const text = alertText(clones);
  assert.doesNotMatch(text, /evil\.example|javascript:|@handle|dexscreener\.com\.evil/);
  assert.match(text, /evil\[\.\]example/);
  assert.match(text, /\(at\)handle/);
  assert.match(text, /https:\/\/dexscreener\.com\/solana\/pair-good/);
  // a long name is cut, in characters, so an emoji is never split
  const long = alertText(findClones([pair('long', 'PLEIN', 'x'.repeat(30) + '\u{1F600}'.repeat(30))], ''));
  assert.doesNotMatch(long, /\uFFFD/);
  assert.ok(!long.includes('\u{1F600}'.repeat(30)));
});

test('a failing DexScreener search is reported, and only a total failure is fatal', async () => {
  const calls = [];
  const flaky = async (url) => {
    calls.push(new URL(url).searchParams.get('q'));
    if (calls.length === 2) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ pairs: [pair('cloneA', 'PLEIN', 'plein')] }) };
  };
  const some = await searchAll(flaky, ['A', 'B', 'C']);
  assert.deepEqual(calls, ['A', 'B', 'C']);
  assert.equal(some.pairs.length, 1); // the same pair from two searches counts once
  assert.equal(some.errors.length, 1);
  assert.equal(some.failed, false);
  const none = await searchAll(async () => { throw new Error('offline'); }, ['A', 'B']);
  assert.equal(none.failed, true);
});

// ---- Telegram ------------------------------------------------------------------------------

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const ENV = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_OPS_CHAT_ID: '-1001', TELEGRAM_CHANNEL_ID: '@station' };
const noNetwork = async () => { throw new Error('the network must not be used in a dry run'); };

test('without secrets Telegram calls print what they would send and touch nothing', async () => {
  const lines = [];
  const log = (s) => lines.push(s);
  assert.deepEqual(await sendMessage('ops', 'Bonjour', { env: {}, fetch: noNetwork, log }), { ok: true, dryRun: true, sent: 0 });
  assert.match(lines[0], /dry run.*ops.*TELEGRAM_BOT_TOKEN, TELEGRAM_OPS_CHAT_ID/s);
  assert.match(lines[0], /Bonjour/);
  // a token but no chat: still a dry run, and the token is never printed
  await sendMessage('channel', 'x', { env: { TELEGRAM_BOT_TOKEN: TOKEN }, fetch: noNetwork, log });
  assert.match(lines[1], /TELEGRAM_CHANNEL_ID/);
  assert.equal((await sendPhoto('ops', 'card.png', 'légende', { env: {}, fetch: noNetwork, log })).dryRun, true);
  assert.match(lines[2], /card\.png[\s\S]*légende/);
  assert.ok(lines.every((l) => !l.includes(TOKEN)));
  await assert.rejects(sendMessage('everyone', 'x', { env: ENV, fetch: noNetwork }), /unknown Telegram target/);
});

test('the command line is a dry run too when its secrets are missing', () => {
  const env = { ...process.env, TELEGRAM_BOT_TOKEN: '', TELEGRAM_OPS_CHAT_ID: '', TELEGRAM_CHANNEL_ID: '' };
  const out = execFileSync(node, [join(root, 'scripts/telegram.mjs'), '--ops', '--text', 'Bonjour la station'], { env, encoding: 'utf8' });
  assert.match(out, /\[dry run\] sendMessage → ops/);
  assert.match(out, /Bonjour la station/);
  assert.throws(() => execFileSync(node, [join(root, 'scripts/telegram.mjs'), '--ops', '--channel', '--text', 'x'], { env, stdio: 'pipe' }));
});

test('with secrets, messages go to the Bot API as JSON, long ones in pieces, and errors never carry the token', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
  const sent = await sendMessage('ops', `${'a'.repeat(3000)}\n${'b'.repeat(3000)}\n${'c'.repeat(100)}`, { env: ENV, fetch: ok });
  assert.equal(sent.sent, 2);
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(calls[0].body.chat_id, '-1001');
  assert.ok(calls.every((c) => c.body.text.length <= 4000 && c.body.link_preview_options.is_disabled));

  const refused = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) });
  await assert.rejects(sendMessage('ops', 'x', { env: ENV, fetch: refused }), (e) => /401: Unauthorized/.test(e.message) && !e.message.includes(TOKEN));
  const leaky = async (url) => { throw new Error(`connect failed for ${url}`); };
  await assert.rejects(sendMessage('ops', 'x', { env: ENV, fetch: leaky }), (e) => !e.message.includes(TOKEN) && e.message.includes('bot***'));
  assert.equal(scrub(`see ${TOKEN} and bot111222333:ZZZZZZZZZZZZZZZZ`, TOKEN).includes('ZZZZ'), false);
});

test('a hung Telegram call is cut off and reported, and the deadline reaches fetch', async () => {
  const dir = scratch();
  const file = join(dir, 'card.png');
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  // the deadline is on every call, as a signal fetch can act on
  const seen = [];
  const ok = async (url, init) => { seen.push(init.signal); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
  await sendMessage('ops', 'x', { env: ENV, fetch: ok });
  await sendPhoto('ops', file, 'x', { env: ENV, fetch: ok });
  assert.equal(seen.length, 2);
  assert.ok(seen.every((s) => s instanceof AbortSignal && !s.aborted));

  // a server that never answers: fetch rejects when the signal fires, as the real one does
  // (a timer keeps the test's event loop alive until then: the deadline's own timer does not)
  const never = (init) => new Promise((_, reject) => {
    const keep = setTimeout(() => {}, 10000);
    init.signal.addEventListener('abort', () => { clearTimeout(keep); reject(init.signal.reason); });
  });
  const hangs = (url, init) => never(init);
  const timedOut = (e) => /Telegram sendMessage timed out after 30 ms/.test(e.message) && !e.message.includes(TOKEN);
  await assert.rejects(sendMessage('ops', 'x', { env: ENV, fetch: hangs, timeoutMs: 30 }), timedOut);
  await assert.rejects(sendPhoto('ops', file, 'x', { env: ENV, fetch: hangs, timeoutMs: 30 }), (e) => /sendPhoto timed out/.test(e.message) && !e.message.includes(TOKEN));
  // a server that answers the headers and then stalls on the body
  const stalls = async (url, init) => ({
    ok: true, status: 200,
    json: () => never(init),
  });
  await assert.rejects(sendMessage('ops', 'x', { env: ENV, fetch: stalls, timeoutMs: 30 }), timedOut);
  // the second message of a long text gets its own deadline
  let n = 0;
  const second = async (url, init) => (++n === 1 ? ok(url, init) : hangs(url, init));
  await assert.rejects(sendMessage('ops', `${'a'.repeat(3000)}\n${'b'.repeat(3000)}`, { env: ENV, fetch: second, timeoutMs: 30 }), timedOut);
  assert.equal(n, 2);
});

test('a photo goes up as multipart form data, with its caption, or as a separate message when too long', async () => {
  const dir = scratch();
  const file = join(dir, 'card.png');
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, body: init.body }); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
  await sendPhoto('channel', file, 'Bonjour', { env: ENV, fetch: ok });
  assert.match(calls[0].url, /\/sendPhoto$/);
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].body.get('chat_id'), '@station');
  assert.equal(calls[0].body.get('caption'), 'Bonjour');
  assert.equal(calls[0].body.get('photo').type, 'image/png');
  assert.equal(calls[0].body.get('photo').name, 'card.png');
  calls.length = 0;
  await sendPhoto('ops', file, 'x'.repeat(1500), { env: ENV, fetch: ok });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.get('caption'), null);
  assert.match(calls[1].url, /\/sendMessage$/);
});

test('markdown reports become plain text and long text is cut at line breaks', () => {
  const md = '# Titre\n\n**gras** et `code`\n\n\n\n<!-- vigie-state {"seen":[]} -->\n';
  assert.equal(plainFromMarkdown(md), 'Titre\n\ngras et code');
  assert.deepEqual(chunkText('a\nb'), ['a\nb']);
  assert.deepEqual(chunkText(`${'a'.repeat(5)}\n${'b'.repeat(5)}`, 8), ['aaaaa', 'bbbbb']);
  assert.deepEqual(chunkText('x'.repeat(10), 4), ['xxxx', 'xxxx', 'xx']);
  assert.deepEqual(chunkText(''), ['']);
});

// ---- the totem -----------------------------------------------------------------------------

const config = loadConfig(readFileSync(join(root, 'public/config.js'), 'utf8'));
const MORNING = Date.parse('2026-10-17T06:00:00Z'); // 08:00 in Paris, the day of the opening

test('a cron line is read as its fixed UTC minute and hour, or refused', () => {
  assert.deepEqual(cronTime('17 6 * * *'), { min: 17, hour: 6 });
  assert.deepEqual(cronTime('52 16 * * 6'), { min: 52, hour: 16 });
  for (const bad of ['*/15 9-20 17 10 *', '7 */3 * * *', '60 6 * * *', '0 24 * * *', '', undefined, 'garbage']) assert.equal(cronTime(bad), null, String(bad));
});

test('the gate follows the cron line, not the wall clock: one run in summer and in winter, however late GitHub is', () => {
  const MORNING_GATE = { hour: 8, until: '11:00' };
  const at = (day, h, min, delayMin = 0) => Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`) + delayMin * 60000;
  const run = (cron, now, gate = MORNING_GATE) => decide({ event: 'schedule', cron, now, ...gate });
  const lines = ['17 6 * * *', '17 7 * * *'];
  const passing = (day, delay) => lines.filter((cron) => {
    const [min, hour] = cron.split(' ');
    return run(cron, at(day, Number(hour), Number(min), delay)).go;
  });
  // summer time until Saturday 24 October, winter time from Sunday 25 October (and back on 28 March)
  assert.deepEqual(passing('2026-10-17', 0), ['17 6 * * *']);
  assert.deepEqual(passing('2026-10-24', 0), ['17 6 * * *']);
  assert.deepEqual(passing('2026-10-25', 0), ['17 7 * * *']); // the day of the change itself
  assert.deepEqual(passing('2026-10-26', 0), ['17 7 * * *']);
  assert.deepEqual(passing('2027-03-27', 0), ['17 7 * * *']); // Saturday before the spring change: still winter
  assert.deepEqual(passing('2027-03-28', 0), ['17 6 * * *']);
  for (const day of ['2026-10-17', '2026-10-24', '2026-10-25', '2026-11-30', '2027-03-27', '2027-03-28', '2027-07-14']) {
    for (const delay of [0, 1, 30, 70, 90, 150]) assert.equal(passing(day, delay).length, 1, `${day} +${delay} min`);
    assert.equal(passing(day, 175).length, 0, `${day}: after 11:00 Paris nothing goes, the button is the way`);
  }

  // the double post the review found: in winter the 06:17 UTC line, started 75 minutes late, looks like 08:32 Paris
  const late = at('2026-11-02', 6, 17, 75);
  assert.equal(run('17 6 * * *', late).go, false);
  assert.match(run('17 6 * * *', late).why, /07:17 in Paris/);
  assert.equal(run('17 7 * * *', at('2026-11-02', 7, 17, 5)).go, true);
  // and its summer twin: the 07:17 UTC line is 09:17 Paris, never the morning one, even on time
  assert.equal(run('17 7 * * *', at('2026-10-17', 7, 17)).go, false);
  // a run that starts after midnight UTC is judged by the line's own day
  assert.equal(decide({ event: 'schedule', cron: '52 16 * * 6', now: Date.parse('2026-11-01T00:10:00Z'), hour: 17, until: '18:30' }).go, false);

  // the skips that are normal stay quiet; the ones nobody planned say so (the workflow messages the founders)
  assert.equal(run('17 7 * * *', at('2026-10-17', 7, 17)).warn, undefined, 'the other clock regime owns that day');
  const tooLate = run('17 6 * * *', at('2026-10-17', 6, 17, 300));
  assert.equal(tooLate.go, false);
  assert.equal(tooLate.warn, true);
  assert.match(tooLate.why, /cut-off/);
  assert.equal(run('17 6 * * *', at('2026-10-17', 6, 17, 90)).warn, undefined, 'a late start still inside the window is a go');

  // by hand always goes; anything else, and a missing or unreadable line, stays closed with a warning
  assert.deepEqual(decide({ event: 'workflow_dispatch', now: at('2026-10-17', 12, 0), ...MORNING_GATE }), { go: true, why: 'started by hand' });
  for (const event of ['push', undefined]) assert.equal(decide({ event, cron: '17 6 * * *', now: at('2026-10-17', 6, 17), ...MORNING_GATE }).go, false);
  for (const cron of ['', undefined, '*/15 9-20 17 10 *']) {
    const verdict = run(cron, at('2026-10-17', 6, 17));
    assert.equal(verdict.go, false);
    assert.equal(verdict.warn, true);
  }
  assert.throws(() => decide({ event: 'schedule', cron: '17 6 * * *', now: at('2026-10-17', 6, 17), hour: 8, until: 'eleven' }), /--until/);

  // the command line: GITHUB_EVENT_NAME and CRON come from the environment; go=… and warn=… on stdout,
  // the two lines the workflow appends to GITHUB_OUTPUT
  const cli = (cron, now, ...extra) => Object.fromEntries(execFileSync(node, [join(root, 'scripts/_gate.mjs'), '--hour', '8', '--until', '11:00', '--now', now, ...extra], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GITHUB_EVENT_NAME: 'schedule', CRON: cron },
  }).trim().split('\n').map((l) => l.trim().split('=')));
  assert.deepEqual(cli('17 6 * * *', '2026-10-17T06:20:00Z'), { go: 'true', warn: 'false' });
  assert.deepEqual(cli('17 7 * * *', '2026-10-17T07:20:00Z'), { go: 'false', warn: 'false' }); // not this line's day: quiet
  assert.deepEqual(cli('17 6 * * *', '2026-11-02T07:32:00Z'), { go: 'false', warn: 'false' });
  assert.deepEqual(cli('', '2026-10-17T06:20:00Z'), { go: 'false', warn: 'true' });              // an empty schedule context
  assert.deepEqual(cli('17 6 * * *', '2026-10-17T12:20:00Z'), { go: 'false', warn: 'true' });    // started after the cut-off
  assert.deepEqual(cli('', '2026-10-17T12:00:00Z', '--event', 'workflow_dispatch'), { go: 'true', warn: 'false' });
  assert.throws(() => execFileSync(node, [join(root, 'scripts/_gate.mjs'), '--hour', '8'], { stdio: 'pipe' }), /Command failed/);
});

// ---- the first plein: the gate's floor ------------------------------------------------------

const FIRST = Date.parse(config.firstPleinAt); // Saturday 24 October 2026, 18:00 Paris
const utc = (day, h, min, delayMin = 0) => Date.parse(`${day}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`) + delayMin * 60000;
const PLEIN_GATE = { hour: 17, until: '18:30', firstPlein: FIRST };
const schedule = (cron, now, gate = PLEIN_GATE) => decide({ event: 'schedule', cron, now, ...gate });

test('no scheduled plein runs before the price freeze of the first plein, and the first one is never blocked', () => {
  assert.equal(FIRST, Date.parse('2026-10-24T18:00:00+02:00'));
  assert.equal(FREEZE_LEAD_MS, 15 * 60000);
  // launch day, Saturday 17 October: neither the order lines (17:52 Paris) nor the guard lines (17:58) go,
  // on time or late, and the skip is planned, so it does not warn
  for (const cron of ['52 15 * * 6', '52 16 * * 6', '58 15 * * 6', '58 16 * * 6']) {
    const { min, hour } = cronTime(cron);
    for (const delay of [0, 7, 35, 90]) {
      const verdict = schedule(cron, utc('2026-10-17', hour, min, delay));
      assert.equal(verdict.go, false, `${cron} +${delay} min`);
      assert.equal(verdict.warn, undefined, `${cron} +${delay} min: a planned wait is quiet`);
    }
  }
  assert.match(schedule('52 15 * * 6', utc('2026-10-17', 15, 52)).why, /no plein yet.*Saturday 24 October 2026, 18:00 Paris/);
  // the gap this closes: without the floor the same line goes, a week early
  assert.equal(decide({ event: 'schedule', cron: '52 15 * * 6', now: utc('2026-10-17', 15, 55), hour: 17, until: '18:30' }).go, true);

  // the first Saturday and the ones after it: exactly the lines that went before, one order and one guard each
  const goers = (day, lines, delay = 0) => lines.filter((cron) => {
    const { min, hour } = cronTime(cron);
    return schedule(cron, utc(day, hour, min, delay)).go;
  });
  for (const [day, order, guard] of [
    ['2026-10-24', '52 15 * * 6', '58 15 * * 6'], ['2026-10-31', '52 16 * * 6', '58 16 * * 6'],
    ['2026-12-19', '52 16 * * 6', '58 16 * * 6'], ['2027-03-27', '52 16 * * 6', '58 16 * * 6'], ['2027-04-03', '52 15 * * 6', '58 15 * * 6'],
  ]) {
    for (const delay of [0, 10, 35]) assert.deepEqual(goers(day, ['52 15 * * 6', '52 16 * * 6'], delay), [order], `${day} order +${delay}`);
    // the guard is due at 17:58, so 30 minutes late is 18:28, the last start before the cut-off
    for (const delay of [0, 10, 30]) assert.deepEqual(goers(day, ['58 15 * * 6', '58 16 * * 6'], delay), [guard], `${day} guard +${delay}`);
  }

  // the boundary is the freeze itself: 17:45 Paris on the first Saturday goes, a minute earlier does not
  assert.equal(schedule('45 15 * * 6', utc('2026-10-24', 15, 45)).go, true);
  const justBefore = schedule('44 15 * * 6', utc('2026-10-24', 15, 44));
  assert.equal(justBefore.go, false);
  assert.equal(justBefore.warn, undefined);
  // after the floor the cut-off still applies, and is not planned: it warns
  const late = schedule('52 15 * * 6', utc('2026-10-24', 15, 52, 45));
  assert.equal(late.go, false);
  assert.equal(late.warn, true);
});

test('a first-plein date that is far away or unreadable warns instead of silently skipping every Saturday', () => {
  // up to QUIET_DAYS before the freeze: a planned wait (the week before, or a one-week postponement)
  assert.equal(QUIET_DAYS, 8);
  assert.equal(schedule('52 15 * * 6', Date.parse('2026-10-16T15:52:00Z')).warn, undefined, 'just under eight days');
  assert.equal(schedule('52 15 * * 6', Date.parse('2026-10-15T15:52:00Z')).warn, true, 'nine days: a date that looks wrong');
  const far = schedule('52 15 * * 6', utc('2026-10-03', 15, 52));
  assert.equal(far.go, false);
  assert.equal(far.warn, true);
  assert.match(far.why, /check firstPleinAt/);
  // a date config.js does not give is never read as "no floor": the gate stays shut and says so
  for (const bad of [null, NaN]) {
    const verdict = schedule('52 15 * * 6', utc('2026-10-24', 15, 52), { ...PLEIN_GATE, firstPlein: bad });
    assert.equal(verdict.go, false);
    assert.equal(verdict.warn, true);
    assert.match(verdict.why, /cannot read firstPleinAt/);
  }
  // the line that does not own this clock regime stays quiet even then, so one problem is one message
  assert.equal(schedule('52 16 * * 6', utc('2026-10-24', 16, 55), { ...PLEIN_GATE, firstPlein: null }).warn, undefined);
});

test('a press of the button works before the first plein and says it is early', () => {
  const dispatch = (now, firstPlein = FIRST) => decide({ event: 'workflow_dispatch', now, hour: 17, until: '18:30', firstPlein });
  const early = dispatch(utc('2026-10-17', 10, 0));
  assert.equal(early.go, true);
  assert.equal(early.early, true);
  assert.match(early.why, /before the first plein \(Saturday 24 October 2026, 18:00 Paris\)/);
  assert.equal(dispatch(FIRST - FREEZE_LEAD_MS - 1).early, true);
  assert.deepEqual(dispatch(FIRST - FREEZE_LEAD_MS), { go: true, why: 'started by hand', early: false }, 'from the freeze on it is the real thing');
  assert.equal(dispatch(utc('2026-10-25', 9, 0)).early, false);
  // asked for the floor but could not read it: still goes (the order is read only), cannot call itself early
  assert.deepEqual(dispatch(utc('2026-10-17', 10, 0), null), { go: true, why: 'started by hand', early: false });
  // the note that goes on top of the order
  const note = earlyNote(FIRST);
  assert.match(note, /^\*\*NOTE: this order was started early, by hand\.\*\*/);
  assert.match(note, /Saturday 24 October 2026, 18:00 Paris/);
  assert.match(note, /`firstPleinAt` in public\/config\.js/);
  assert.match(note, /preview/);
  assert.equal(when(Date.parse('2026-10-31T18:00:00+01:00')), 'Saturday 31 October 2026, 18:00 Paris');
});

test('firstPleinAt is read from config.js the way the site reads it, and an unreadable file is null', () => {
  assert.equal(firstPleinFromConfig(readFileSync(join(root, 'public/config.js'), 'utf8')), FIRST);
  assert.equal(firstPleinFromConfig("window.PLEIN_CONFIG = { firstPleinAt: '2026-11-07T18:00:00+01:00' };"), Date.parse('2026-11-07T18:00:00+01:00'));
  for (const bad of ['', 'window.PLEIN_CONFIG = {};', "window.PLEIN_CONFIG = { firstPleinAt: 'next Saturday' };", 'window.PLEIN_CONFIG = {', 'throw new Error("x")', undefined]) {
    assert.equal(firstPleinFromConfig(bad), null, String(bad));
  }
  assert.equal(firstPleinFromConfig('while (true) {}'), null, 'a file that never ends is cut off');
});

test('the gate command line: --first-plein reads config.js, writes the early note, and prints early= only when asked', () => {
  const dir = scratch();
  const run = (extra, env) => {
    const out = execFileSync(node, [join(root, 'scripts/_gate.mjs'), '--hour', '17', '--until', '18:30', ...extra], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env },
    });
    return Object.fromEntries(out.trim().split('\n').map((l) => l.trim().split('=')));
  };
  const sched = (cron) => ({ GITHUB_EVENT_NAME: 'schedule', CRON: cron });
  // launch day: shut, quiet
  assert.deepEqual(run(['--first-plein', '--now', '2026-10-17T15:55:00Z'], sched('52 15 * * 6')), { go: 'false', warn: 'false', early: 'false' });
  assert.deepEqual(run(['--first-plein', '--now', '2026-10-17T16:00:00Z'], sched('58 15 * * 6')), { go: 'false', warn: 'false', early: 'false' });
  // the first Saturday, summer line; then the first winter Saturday
  assert.deepEqual(run(['--first-plein', '--now', '2026-10-24T15:55:00Z'], sched('52 15 * * 6')), { go: 'true', warn: 'false', early: 'false' });
  assert.deepEqual(run(['--first-plein', '--now', '2026-10-31T16:59:00Z'], sched('58 16 * * 6')), { go: 'true', warn: 'false', early: 'false' });
  // a gate that was not asked for the floor (the totem) prints what it always printed
  assert.deepEqual(run(['--now', '2026-10-17T15:55:00Z'], sched('52 15 * * 6')), { go: 'true', warn: 'false' });
  // by hand before the first plein: goes, early, and the note file is written
  const note = join(dir, 'early-note.md');
  assert.deepEqual(run(['--first-plein', '--early-note', note, '--now', '2026-10-17T10:00:00Z'], { GITHUB_EVENT_NAME: 'workflow_dispatch', CRON: '' }), { go: 'true', warn: 'false', early: 'true' });
  assert.match(readFileSync(note, 'utf8'), /started early.*Saturday 24 October 2026, 18:00 Paris/s);
  // by hand on the day: not early, and no note is written
  const none = join(dir, 'none.md');
  assert.deepEqual(run(['--first-plein', '--early-note', none, '--now', '2026-10-24T15:50:00Z'], { GITHUB_EVENT_NAME: 'workflow_dispatch', CRON: '' }), { go: 'true', warn: 'false', early: 'false' });
  assert.equal(existsSync(none), false);
  // a config.js without the date, or no config.js at all: shut and warn
  const bare = join(dir, 'bare.js');
  writeFileSync(bare, 'window.PLEIN_CONFIG = {};');
  for (const config of [bare, join(dir, 'missing.js')]) {
    assert.deepEqual(run(['--first-plein', '--config', config, '--now', '2026-10-24T15:55:00Z'], sched('52 15 * * 6')), { go: 'false', warn: 'true', early: 'false' }, config);
  }
});

// ---- the Saturday guard --------------------------------------------------------------------

const REPO = 'rpk0407/PLEIN';
const SAT = '2026-10-24'; // Saturday 24 October 2026: 15:52Z is 17:52 in Paris
const runUrl = (id) => `https://github.com/${REPO}/actions/runs/${id}`;
const orderRun = (id, hh, mm, over = {}) => ({ id, event: 'schedule', status: 'completed', conclusion: 'success', created_at: `${SAT}T${hh}:${mm}:07Z`, html_url: runUrl(id), ...over });
const jobStep = (name, conclusion) => ({ name, status: 'completed', conclusion });
const JOBS = {
  sent: [{ name: ORDER_JOB, status: 'completed', conclusion: 'success', steps: [jobStep('Is this the run for this Saturday?', 'success'), jobStep(ORDER_STEP, 'success'), jobStep('Tell the founders it failed', 'skipped')] }],
  failed: [{ name: ORDER_JOB, status: 'completed', conclusion: 'failure', steps: [jobStep('Work out the purchase order', 'failure'), jobStep(ORDER_STEP, 'skipped')] }],
  timedOut: [{ name: ORDER_JOB, status: 'completed', conclusion: 'cancelled', steps: [jobStep('Work out the purchase order', 'cancelled'), jobStep(ORDER_STEP, 'skipped')] }],
  closed: [{ name: ORDER_JOB, status: 'completed', conclusion: 'success', steps: [jobStep('Is this the run for this Saturday?', 'success'), jobStep(ORDER_STEP, 'skipped')] }],
  skipped: [{ name: ORDER_JOB, status: 'completed', conclusion: 'skipped', steps: [] }, { name: 'garde', status: 'in_progress', conclusion: null, steps: [] }],
  running: [{ name: ORDER_JOB, status: 'in_progress', conclusion: null, steps: [jobStep('Work out the purchase order', 'success'), { name: ORDER_STEP, status: 'in_progress', conclusion: null }] }],
  queued: [{ name: ORDER_JOB, status: 'queued', conclusion: null, steps: [] }],
  sentThenBusy: [{ name: ORDER_JOB, status: 'in_progress', conclusion: null, steps: [jobStep(ORDER_STEP, 'success')] }],
};

test('a run of the plein workflow is read as sent, running, failed or idle from its jobs', () => {
  const done = { status: 'completed' };
  assert.equal(orderOfRun(done, JOBS.sent), 'sent');
  assert.equal(orderOfRun(done, JOBS.failed), 'failed');
  assert.equal(orderOfRun(done, JOBS.timedOut), 'failed');
  assert.equal(orderOfRun(done, JOBS.closed), 'idle', 'a gate that closed made no order');
  assert.equal(orderOfRun(done, JOBS.skipped), 'idle', 'the guard\'s own run has the order job skipped');
  assert.equal(orderOfRun(done, []), 'idle');
  assert.equal(orderOfRun(done, undefined), 'idle');
  assert.equal(orderOfRun({ status: 'queued' }, []), 'running', 'no job yet on a run that has not started');
  assert.equal(orderOfRun({ status: 'in_progress' }, JOBS.running), 'running');
  assert.equal(orderOfRun({ status: 'in_progress' }, JOBS.queued), 'running');
  assert.equal(orderOfRun({ status: 'in_progress' }, JOBS.sentThenBusy), 'sent', 'the send step is what counts');
});

test('only runs since the 17:45 freeze count, the guard\'s own run never does, and sent beats running beats failed', () => {
  const since = utc(SAT, 15, 45);
  const byRun = (entries) => new Map(Object.entries(entries).map(([id, j]) => [id, j]));
  const run = (runs, entries, selfId = '999') => judgeOrder({ runs, jobsByRun: byRun(entries), since, selfId });
  // yesterday's order, and one at 17:44, are not Saturday's
  assert.equal(run([orderRun(1, '15', '44'), { ...orderRun(2, '15', '50'), created_at: '2026-10-23T15:50:07Z' }], { 1: JOBS.sent, 2: JOBS.sent }).state, 'missing');
  assert.equal(run([orderRun(3, '15', '45')], { 3: JOBS.sent }).state, 'sent', 'the freeze minute itself counts');
  // the guard's own run, sent or not, is excluded
  assert.equal(run([orderRun(999, '15', '58')], { 999: JOBS.sent }).state, 'missing');
  // a press of the button counts like the schedule
  assert.equal(run([orderRun(4, '15', '53', { event: 'workflow_dispatch' })], { 4: JOBS.sent }).state, 'sent');
  // precedence and the run to blame
  const mixed = run([orderRun(5, '15', '52'), orderRun(6, '15', '56')], { 5: JOBS.failed, 6: JOBS.running });
  assert.equal(mixed.state, 'running');
  const failed = run([orderRun(5, '15', '52'), orderRun(7, '15', '53')], { 5: JOBS.failed, 7: JOBS.closed });
  assert.equal(failed.state, 'failed');
  assert.equal(failed.culprit.id, 5);
  assert.equal(run([orderRun(5, '15', '52'), orderRun(8, '15', '54')], { 5: JOBS.failed, 8: JOBS.sent }).state, 'sent', 'a retry that worked ends the alarm');
  assert.equal(run([orderRun(7, '15', '53')], { 7: JOBS.closed }).state, 'missing');
  assert.equal(run([], {}).state, 'missing');
  assert.equal(run(undefined, {}).state, 'missing');
});

/** A fake GitHub: `script(n)` gives the jobs of every run on the n-th look at the list; `runs` may be a function of n too. */
function fakeGitHub(runs, script, log = []) {
  let looks = 0;
  const fetch = async (url, init) => {
    log.push({ url, init });
    const { pathname } = new URL(url);
    if (pathname === `/repos/${REPO}/actions/workflows/${ORDER_WORKFLOW}/runs`) {
      looks += 1;
      const list = typeof runs === 'function' ? runs(looks) : runs;
      return { ok: true, status: 200, json: async () => ({ workflow_runs: list }) };
    }
    const m = /^\/repos\/rpk0407\/PLEIN\/actions\/runs\/(\d+)\/jobs$/.exec(pathname);
    if (m) return { ok: true, status: 200, json: async () => ({ jobs: script(looks)[m[1]] ?? [] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return fetch;
}
const GUARD_ENV = { GH_TOKEN: 'ghs_testtoken123', GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: '999', GITHUB_SERVER_URL: 'https://github.com' };
const clock = { t: 0 }; // a fake clock that only the fake sleep moves
const sleepless = () => {
  const naps = [];
  return { naps, sleep: async (ms) => { naps.push(ms); clock.t += ms; } };
};

test('the guard reads the runs with its own token, only the ones that matter, and never leaks the token', async () => {
  const log = [];
  const runs = [orderRun(999, '15', '58'), orderRun(11, '15', '52'), { ...orderRun(12, '15', '10'), created_at: '2026-10-23T15:10:07Z' }];
  const verdict = await lookAtOrders({ fetch: fakeGitHub(runs, () => ({ 11: JOBS.sent, 12: JOBS.sent }), log), env: GUARD_ENV, since: utc(SAT, 15, 45) });
  assert.equal(verdict.state, 'sent');
  const paths = log.map((c) => new URL(c.url).pathname + new URL(c.url).search);
  assert.deepEqual(paths, [`/repos/${REPO}/actions/workflows/plein.yml/runs?per_page=30`, `/repos/${REPO}/actions/runs/11/jobs?per_page=30`], 'no jobs read for its own run or for yesterday\'s');
  assert.ok(log.every((c) => c.url.startsWith('https://api.github.com/') && c.init.headers.authorization === 'Bearer ghs_testtoken123' && c.init.signal instanceof AbortSignal));

  // failures say what and where, never the token, and never read as "fine"
  const status = (code) => async () => ({ ok: false, status: code, json: async () => ({}) });
  await assert.rejects(lookAtOrders({ fetch: status(500), env: GUARD_ENV, since: 0 }), (e) => /GitHub answered 500 for \/repos\/rpk0407\/PLEIN\/actions\/workflows\/plein\.yml\/runs/.test(e.message) && !e.message.includes('ghs_'));
  await assert.rejects(lookAtOrders({ fetch: async (url, init) => { throw new Error(`connect failed ${init.headers.authorization}`); }, env: GUARD_ENV, since: 0 }),
    (e) => /GitHub unreachable/.test(e.message) && !e.message.includes('ghs_testtoken123'));
  await assert.rejects(lookAtOrders({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ message: 'oops' }) }), env: GUARD_ENV, since: 0 }), /no list of workflow runs/);
  await assert.rejects(lookAtOrders({ fetch: noNetwork, env: { ...GUARD_ENV, GH_TOKEN: '' }, since: 0 }), /GH_TOKEN/);
  await assert.rejects(lookAtOrders({ fetch: noNetwork, env: { ...GUARD_ENV, GITHUB_REPOSITORY: 'a/b/../../c' }, since: 0 }), /owner\/name/);
  await assert.rejects(lookAtOrders({ fetch: noNetwork, env: { ...GUARD_ENV, GITHUB_API_URL: 'http://api.example.test' }, since: 0 }), /https/);
});

test('at 17:58 the guard stays quiet when the order went out, waits for a run in progress, and otherwise alerts', async () => {
  const start = utc(SAT, 15, 58); // 17:58 in Paris
  const watch = (runs, script, over = {}) => {
    clock.t = start;
    const { naps, sleep } = sleepless();
    return watchOrder({ fetch: fakeGitHub(runs, script), env: GUARD_ENV, clock: () => clock.t, sleep, ...over }).then((r) => ({ ...r, naps }));
  };
  const own = orderRun(999, '15', '58');
  // the order went out: nothing to say
  assert.deepEqual(await watch([own, orderRun(21, '15', '52')], () => ({ 21: JOBS.sent })), { alert: false, state: 'sent', text: '', naps: [] });

  // no plein run at all (GitHub dropped the 17:52 line): the guard waits the full five minutes in case
  // the line is only late, then alerts, with the fallback and the guard's own log
  const none = await watch([own], () => ({}));
  assert.equal(none.alert, true);
  assert.equal(none.state, 'missing');
  assert.match(none.text, /^Aucun ordre d'achat n'est arrivé à 18:03 et le job plein n'a pas tourné\./);
  assert.match(none.text, /presser le bouton plein/);
  assert.match(none.text, /npm run plein -- --from-chain --markdown/);
  assert.match(none.text, /Journal de la garde : https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/999$/);
  assert.deepEqual(none.naps, Array(10).fill(30000));
  // and waitMs 0 says it at once
  const atOnce = await watch([own], () => ({}), { waitMs: 0 });
  assert.deepEqual([atOnce.state, atOnce.naps.length], ['missing', 0]);
  assert.match(atOnce.text, /17:58/);

  // GitHub starts the 17:52 line late (the case that made two orders): nothing at 17:58, the run shows
  // up at 18:00 and sends at 18:01. The guard saw it coming and says nothing, so nobody presses the button.
  const late = await watch(
    (looks) => (looks < 5 ? [own] : [own, orderRun(26, '16', '00', { status: 'in_progress', conclusion: null })]),
    (looks) => ({ 26: looks < 7 ? JOBS.running : JOBS.sent }),
  );
  assert.deepEqual([late.alert, late.state, late.text], [false, 'sent', '']);
  assert.deepEqual(late.naps, Array(6).fill(30000));
  // a line that comes after the five minutes is the button's business, and the alert says what happens then
  const tooLate = await watch((looks) => (looks < 12 ? [own] : [own, orderRun(27, '16', '07')]), () => ({ 27: JOBS.sent }));
  assert.deepEqual([tooLate.alert, tooLate.state, tooLate.naps.length], [true, 'missing', 10]);
  assert.match(tooLate.text, /s'arrête de lui-même quand un ordre est déjà parti/);

  // a run that already broke does not wait: its own notice has gone out, the founders need the way out now
  assert.deepEqual((await watch([own, orderRun(28, '15', '52')], () => ({ 28: JOBS.failed }))).naps, []);

  // a run that broke: alert, pointing at its log
  const broke = await watch([own, orderRun(22, '15', '52')], () => ({ 22: JOBS.failed }));
  assert.equal(broke.state, 'failed');
  assert.match(broke.text, /a échoué ou a été interrompu/);
  assert.ok(broke.text.includes(runUrl(22)));

  // the gate closed on the run (a wrong clock regime, a cut-off): that is no order either
  assert.equal((await watch([own, orderRun(23, '15', '52')], () => ({ 23: JOBS.closed }))).state, 'missing');

  // a run still going: the guard waits, polling every 30 s, and is quiet if it finishes in time
  const slow = await watch([own, orderRun(24, '15', '52', { status: 'in_progress', conclusion: null })], (looks) => ({ 24: looks < 3 ? JOBS.running : JOBS.sent }));
  assert.deepEqual([slow.alert, slow.state], [false, 'sent']);
  assert.deepEqual(slow.naps, [30000, 30000]);

  // one that never finishes: it stops waiting after five minutes and says it is still running
  const stuck = await watch([own, orderRun(25, '15', '52', { status: 'in_progress', conclusion: null })], () => ({ 25: JOBS.running }));
  assert.equal(stuck.alert, true);
  assert.equal(stuck.state, 'running');
  assert.equal(stuck.naps.length, 10);
  assert.match(stuck.text, /tourne encore à 18:03/);
  assert.ok(stuck.text.includes(runUrl(25)));
  // and waitMs 0 does not wait at all
  assert.equal((await watch([own, orderRun(25, '15', '52', { status: 'in_progress', conclusion: null })], () => ({ 25: JOBS.running }), { waitMs: 0 })).naps.length, 0);

  // GitHub unreadable: an error, never "no alert"
  clock.t = start;
  await assert.rejects(watchOrder({ fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }), env: GUARD_ENV, clock: () => clock.t, sleep: async () => {} }), /GitHub answered 403/);

  // the freeze is today's 17:45 Paris, winter or summer
  clock.t = utc('2026-11-07', 16, 58);
  const winter = await watchOrder({
    fetch: fakeGitHub([{ ...orderRun(30, '16', '52'), created_at: '2026-11-07T16:52:07Z' }, { ...orderRun(31, '16', '40'), created_at: '2026-11-07T16:40:07Z' }], () => ({ 30: JOBS.closed, 31: JOBS.sent })),
    env: GUARD_ENV, clock: () => clock.t, sleep: async () => {}, waitMs: 0, // no waiting: this sleep would not move the clock
  });
  assert.equal(winter.state, 'missing', 'the 17:40 CET order is before the freeze (16:45Z), the 17:52 one was closed');
});

test('the alert for the ops chat is French, typeset, and tells the founders what to do', () => {
  const NB = String.fromCharCode(0xA0); // the non-breaking space typo() puts before : ; ! ? and inside « »
  for (const state of ['missing', 'failed', 'running']) {
    const text = orderAlertText({ state, now: utc(SAT, 15, 58), runUrl: runUrl(999), culpritUrl: runUrl(5) });
    assert.equal(typo(text), text, `${state}: already typeset`);
    assert.match(text, /17:58/);
    assert.match(text, new RegExp(`À faire${NB}: `));
    assert.match(text, /le bouton plein \(Actions, plein, Run workflow\), en donnant le réservoir à la main/);
    assert.doesNotMatch(text, /undefined|null|NaN/);
    assert.ok(text.length < 900, `${text.length} characters`);
  }
  const textOf = (state) => orderAlertText({ state, now: utc(SAT, 15, 58), runUrl: runUrl(999), culpritUrl: runUrl(5) });
  // nothing came and nothing is on its way: press the button or run it on a laptop, and a late line stops by itself
  for (const state of ['missing', 'failed']) {
    assert.match(textOf(state), new RegExp(`À faire${NB}: presser le bouton plein`), state);
    assert.match(textOf(state), new RegExp(`«${NB}npm run plein -- --from-chain --markdown${NB}»`), state);
    assert.match(textOf(state), /Les tranches commencent à 18:00\./, state);
  }
  assert.match(textOf('missing'), new RegExp(`il s'arrête de lui-même quand un ordre est déjà parti${NB}: un seul ordre à exécuter`));
  assert.doesNotMatch(textOf('failed'), /s'arrête de lui-même/);
  // a run still going is already working on the order: wait and watch its log, press the button only if it fails
  const running = textOf('running');
  assert.match(running, new RegExp(`À faire${NB}: attendre la fin du job en suivant son journal, sans presser le bouton plein`));
  assert.match(running, /S'il échoue, presser alors le bouton plein/);
  assert.match(running, /Un seul ordre à exécuter\./);
  assert.doesNotMatch(running, /npm run plein/);
  assert.ok(orderAlertText({ state: 'running', now: utc(SAT, 15, 58), culpritUrl: runUrl(5) }).includes(runUrl(5)));
  assert.doesNotMatch(orderAlertText({ state: 'missing', now: utc(SAT, 15, 58) }), /Journal de la garde/);
});

test('the guard command line refuses a missing argument and treats unreadable GitHub as exit code 2', () => {
  const guard = (args, env) => {
    try {
      execFileSync(node, [join(root, 'scripts/_gate.mjs'), ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } });
      return { status: 0 };
    } catch (e) { return { status: e.status, stderr: String(e.stderr), stdout: String(e.stdout) }; }
  };
  assert.equal(guard(['--watch-order'], {}).status, 1, 'no --alert-file');
  assert.equal(guard(['--watch-order', '--alert-file', join(scratch(), 'a.txt'), '--wait', '99'], {}).status, 1, 'a wait over eight minutes');
  const noToken = guard(['--watch-order', '--alert-file', join(scratch(), 'a.txt')], { GH_TOKEN: '', GITHUB_TOKEN: '', GITHUB_REPOSITORY: REPO });
  assert.equal(noToken.status, 2);
  assert.match(noToken.stderr, /GH_TOKEN/);
  assert.doesNotMatch(noToken.stdout, /alert=/, 'an unreadable GitHub never prints alert=false');
});

test('the guard command line, end to end against a local fake of the Actions API', async () => {
  // runs created "after the freeze" relative to today's Paris 17:45, whenever this test runs
  const p = paris(Date.now());
  const freeze = parisInstant(p.y, p.m, p.d, 17, 45);
  const created = new Date(freeze + 7 * 60000).toISOString();
  const seenAuth = [];
  let scenario = 'missing';
  const server = createServer((req, res) => {
    seenAuth.push(req.headers.authorization);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (scenario === 'down') return send(500, { message: 'boom' });
    if (req.url.startsWith(`/repos/${REPO}/actions/workflows/plein.yml/runs`)) {
      return send(200, { workflow_runs: scenario === 'missing' ? [] : [{ id: 41, event: 'schedule', status: 'completed', conclusion: 'success', created_at: created, html_url: runUrl(41) }] });
    }
    if (req.url.startsWith(`/repos/${REPO}/actions/runs/41/jobs`)) return send(200, { jobs: scenario === 'sent' ? JOBS.sent : JOBS.failed });
    return send(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const env = { ...process.env, GH_TOKEN: 'ghs_faketoken', GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: '999', GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` };
    const guard = async () => {
      const file = join(scratch(), 'alert.txt');
      try {
        const { stdout } = await promisify(execFile)(node, [join(root, 'scripts/_gate.mjs'), '--watch-order', '--alert-file', file, '--wait', '0'], { env, encoding: 'utf8' });
        return { status: 0, out: Object.fromEntries(stdout.trim().split('\n').map((l) => l.split('='))), alert: existsSync(file) ? readFileSync(file, 'utf8') : null };
      } catch (e) { return { status: e.code, stdout: String(e.stdout), stderr: String(e.stderr) }; }
    };
    scenario = 'sent';
    const sent = await guard();
    assert.deepEqual([sent.status, sent.out, sent.alert], [0, { alert: 'false', state: 'sent' }, null], 'the order went out: quiet, no alert file');
    scenario = 'missing';
    const missing = await guard();
    assert.deepEqual([missing.status, missing.out], [0, { alert: 'true', state: 'missing' }]);
    assert.match(missing.alert, /Aucun ordre d'achat n'est arrivé/);
    assert.match(missing.alert, /Journal de la garde : https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/999/);
    scenario = 'failed';
    const failed = await guard();
    assert.deepEqual([failed.status, failed.out], [0, { alert: 'true', state: 'failed' }]);
    assert.ok(failed.alert.includes(runUrl(41)));
    scenario = 'down';
    const down = await guard();
    assert.equal(down.status, 2, 'GitHub unreadable is exit code 2');
    assert.doesNotMatch(down.stdout, /alert=/);
    assert.match(down.stderr, /GitHub answered 500/);
    assert.doesNotMatch(down.stderr + down.stdout, /ghs_faketoken/);
    assert.ok(seenAuth.length > 4 && seenAuth.every((a) => a === 'Bearer ghs_faketoken'));
  } finally {
    server.close();
  }
});

// ---- one order a Saturday: the duplicate check of the order job -----------------------------

test('when an order was sent is read from its send step, and the freeze and the fees are 17:45 and 17:50 in Paris', () => {
  const run = orderRun(50, '15', '52');
  const jobs = (completedAt) => [{ name: ORDER_JOB, status: 'completed', conclusion: 'success', steps: [{ ...jobStep(ORDER_STEP, 'success'), completed_at: completedAt }] }];
  const done = utc(SAT, 15, 53) + 41000;
  assert.equal(sentAtOf(run, jobs('2026-10-24T15:53:41Z')), done);
  assert.equal(sentAtOf(run, JOBS.sent), Date.parse(run.created_at), 'no step time: the start of the run');
  assert.equal(sentAtOf(run, undefined), Date.parse(run.created_at));
  const since = utc(SAT, 15, 45);
  const judged = (runs, entries) => judgeOrder({ runs, jobsByRun: new Map(Object.entries(entries)), since, selfId: '999' });
  assert.equal(judged([run], { 50: jobs('2026-10-24T15:53:41Z') }).sentAt, done);
  assert.equal(judged([run], { 50: JOBS.failed }).sentAt, null);
  assert.equal(judged([], {}).sentAt, null);
  assert.equal(freezeOf(utc(SAT, 16, 5)), utc(SAT, 15, 45));
  assert.equal(feesOf(utc(SAT, 16, 5)), utc(SAT, 15, 50));
  assert.equal(feesOf(utc('2026-10-31', 16, 55)), utc('2026-10-31', 16, 50), 'winter');
});

test('a scheduled run behind an order already sent stops; a press of the button goes ahead with a note', () => {
  const go = { go: true, why: 'the 17:52 Paris line, started in time', early: false };
  const button = { go: true, why: 'started by hand', early: false };
  const closed = { go: false, why: 'no plein yet', early: false };
  const sentAt = utc(SAT, 16, 3) + 10000; // 18:03 in Paris
  const sent = { state: 'sent', sentAt, culprit: { html_url: runUrl(7), created_at: `${SAT}T16:02:07Z` } };

  // the late line, arriving behind a press of the button: stops, and says nothing to the founders
  const behind = afterOrders({ verdict: go, event: 'schedule', sent });
  assert.deepEqual([behind.go, behind.duplicate, behind.warn, behind.sentNote], [false, true, undefined, undefined]);
  assert.match(behind.why, /already sent today \(18:03 Paris, https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/7\); this scheduled run stops/);

  // the press behind an order: goes, with the note that only one order may be executed
  const pressed = afterOrders({ verdict: button, event: 'workflow_dispatch', sent });
  assert.deepEqual([pressed.go, pressed.duplicate], [true, true]);
  assert.match(pressed.sentNote, /^\*\*NOTE: an order was already sent today, at 18:03 Paris \(https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/7\)\.\*\*/);
  assert.match(pressed.sentNote, /Execute only one order/);
  assert.ok(pressed.sentNote.endsWith('\n\n'), 'ready to go in front of the order');
  assert.equal(afterOrders({ verdict: { ...button, early: true }, event: 'workflow_dispatch', sent }).early, true, 'the early flag survives');
  // the start of the run stands in when the API gives no time for the step
  assert.match(afterOrders({ verdict: button, event: 'workflow_dispatch', sent: { ...sent, sentAt: null } }).sentNote, /at 18:02 Paris/);

  // no order, one still running or broken, GitHub unreadable: nothing changes
  for (const other of [null, { state: 'missing', culprit: null }, { state: 'running', culprit: {} }, { state: 'failed', culprit: {} }]) {
    for (const [verdict, event] of [[go, 'schedule'], [button, 'workflow_dispatch']]) {
      assert.deepEqual(afterOrders({ verdict, event, sent: other }), { ...verdict, duplicate: false }, `${event} / ${other?.state}`);
    }
  }
  // a gate that was already closed stays as it was
  assert.deepEqual(afterOrders({ verdict: closed, event: 'schedule', sent }), { ...closed, duplicate: false });
  // a link from the API that is not https never reaches the note
  assert.doesNotMatch(sentNote({ at: sentAt, url: 'javascript:alert(1)' }), /javascript/);
  assert.match(sentNote({ at: sentAt, url: '' }), /^\*\*NOTE: an order was already sent today, at 18:03 Paris\.\*\*/);
});

test('the duplicate check never throws and never waits on GitHub past its deadline', async () => {
  const since = utc(SAT, 15, 50);
  const ok = await lookForSent({ fetch: fakeGitHub([orderRun(11, '15', '52')], () => ({ 11: JOBS.sent })), env: GUARD_ENV, since });
  assert.deepEqual([ok.error, ok.sent.state], ['', 'sent']);
  const hang = await lookForSent({ fetch: () => new Promise(() => {}), env: GUARD_ENV, since, deadlineMs: 40 });
  assert.equal(hang.sent, null);
  assert.match(hang.error, /GitHub did not answer within 0\.04 seconds/);
  const down = await lookForSent({ fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }), env: GUARD_ENV, since });
  assert.equal(down.sent, null);
  assert.match(down.error, /GitHub answered 502/);
  const noToken = await lookForSent({ fetch: noNetwork, env: { ...GUARD_ENV, GH_TOKEN: '' }, since });
  assert.equal(noToken.sent, null);
  assert.match(noToken.error, /GH_TOKEN/);
});

test('the order gate, end to end against a local fake of the Actions API: one order a Saturday, whoever comes second', async () => {
  const sentJobs = (done) => [{ name: ORDER_JOB, status: 'completed', conclusion: 'success', steps: [{ ...jobStep(ORDER_STEP, 'success'), completed_at: done }] }];
  const state = { runs: [], jobs: {}, down: false, requests: [] };
  const server = createServer((req, res) => {
    state.requests.push(req.url);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (state.down) return send(500, { message: 'boom' });
    if (req.url.startsWith(`/repos/${REPO}/actions/workflows/plein.yml/runs`)) return send(200, { workflow_runs: state.runs });
    const m = /^\/repos\/rpk0407\/PLEIN\/actions\/runs\/(\d+)\/jobs/.exec(req.url);
    if (m) return send(200, { jobs: state.jobs[m[1]] ?? [] });
    return send(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const gate = async (event, cron, now, envOver = {}) => {
      const note = join(scratch(), 'already-sent.md');
      const env = {
        ...process.env, GITHUB_EVENT_NAME: event, CRON: cron, GH_TOKEN: 'ghs_faketoken', GITHUB_TOKEN: '', GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: '999',
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, ...envOver,
      };
      const args = [join(root, 'scripts/_gate.mjs'), '--hour', '17', '--until', '18:30', '--first-plein', '--skip-if-sent', '--sent-note', note, '--now', now];
      const { stdout, stderr } = await promisify(execFile)(node, args, { env, encoding: 'utf8' });
      return { out: Object.fromEntries(stdout.trim().split('\n').map((l) => l.trim().split('='))), stderr, note: existsSync(note) ? readFileSync(note, 'utf8') : null };
    };
    const SCHEDULED = '52 15 * * 6';
    const verdictOf = (r) => [r.out.go, r.out.warn, r.out.early, r.out.duplicate];

    // the story that made two orders: GitHub starts the 17:52 line 15 minutes late, the guard alerted at
    // 18:03, a founder pressed the button, and the order went out at 18:03
    state.runs = [{ ...orderRun(60, '16', '02', { event: 'workflow_dispatch' }) }];
    state.jobs = { 60: sentJobs('2026-10-24T16:03:10Z') };
    const behind = await gate('schedule', SCHEDULED, '2026-10-24T16:07:00Z');
    assert.deepEqual(verdictOf(behind), ['false', 'false', 'false', 'true'], 'closed, quietly: no warn, so no message to the founders');
    assert.match(behind.stderr, /^skipped: an order was already sent today \(18:03 Paris, https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/60\); this scheduled run stops/m);
    assert.equal(behind.note, null);

    // the other way round: the scheduled order went out at 17:53 and someone presses the button at 18:02
    state.runs = [orderRun(61, '15', '52')];
    state.jobs = { 61: sentJobs('2026-10-24T15:53:20Z') };
    const pressed = await gate('workflow_dispatch', '', '2026-10-24T16:02:00Z');
    assert.deepEqual(verdictOf(pressed), ['true', 'false', 'false', 'true']);
    assert.match(pressed.stderr, /^::warning title=Order already sent::/m);
    assert.match(pressed.note, /^\*\*NOTE: an order was already sent today, at 17:53 Paris \(https:\/\/github\.com\/rpk0407\/PLEIN\/actions\/runs\/61\)\.\*\*/);
    assert.match(pressed.note, /Execute only one order/);

    // no order yet; the run's own id, an order from before the fees (17:50), and yesterday's order do not count
    state.runs = [orderRun(999, '15', '53'), orderRun(62, '15', '47'), { ...orderRun(63, '15', '52'), created_at: '2026-10-23T15:52:07Z' }];
    state.jobs = { 999: sentJobs('2026-10-24T15:54:00Z'), 62: sentJobs('2026-10-24T15:48:00Z'), 63: sentJobs('2026-10-23T15:53:00Z') };
    state.requests = [];
    const first = await gate('schedule', SCHEDULED, '2026-10-24T15:55:00Z');
    assert.deepEqual(verdictOf(first), ['true', 'false', 'false', 'false']);
    assert.equal(first.note, null);
    assert.equal(state.requests.length, 1, 'only the list: none of those runs needed its jobs read');

    // a closed gate asks GitHub nothing (launch day: no plein yet)
    state.requests = [];
    const launchDay = await gate('schedule', SCHEDULED, '2026-10-17T15:55:00Z');
    assert.deepEqual(verdictOf(launchDay), ['false', 'false', 'false', 'false']);
    assert.deepEqual(state.requests, []);

    // GitHub unreadable never stops an order: it goes ahead, with a warning that names the problem and not the token
    state.down = true;
    const down = await gate('schedule', SCHEDULED, '2026-10-24T15:55:00Z');
    assert.deepEqual(verdictOf(down), ['true', 'false', 'false', 'false']);
    assert.match(down.stderr, /^::warning title=Duplicate check::could not tell whether an order was already sent \(GitHub answered 500 for [^)]*\); going ahead$/m);
    assert.doesNotMatch(down.stderr + JSON.stringify(down.out), /ghs_faketoken/);
  } finally {
    server.close();
  }
});

// ---- the Telegram check --------------------------------------------------------------------

test('a step that must reach the founders fails loudly when the Telegram secrets are empty', () => {
  const all = { TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_OPS_CHAT_ID: '-1001', TELEGRAM_CHANNEL_ID: '@station' };
  assert.deepEqual(missingTelegram(all), []);
  assert.deepEqual(missingTelegram({}), ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_OPS_CHAT_ID']);
  assert.deepEqual(missingTelegram({ ...all, TELEGRAM_OPS_CHAT_ID: '  ' }), ['TELEGRAM_OPS_CHAT_ID']);
  assert.deepEqual(missingTelegram({ ...all, TELEGRAM_CHANNEL_ID: '' }), [], 'the channel only matters when asked');
  assert.deepEqual(missingTelegram({ ...all, TELEGRAM_CHANNEL_ID: '' }, { channel: true }), ['TELEGRAM_CHANNEL_ID']);
  assert.deepEqual(missingTelegram(undefined), ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_OPS_CHAT_ID']);

  const check = (env, ...flags) => {
    try {
      return { status: 0, stdout: execFileSync(node, [join(root, 'scripts/_gate.mjs'), '--require-ops', ...flags], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } }) };
    } catch (e) { return { status: e.status, stdout: String(e.stdout) }; }
  };
  const secret = 'AAHsecret-bot-token-value-1234567890';
  const ok = check({ ...all, TELEGRAM_BOT_TOKEN: secret });
  assert.equal(ok.status, 0);
  assert.doesNotMatch(ok.stdout, new RegExp(secret));
  const none = check({ TELEGRAM_BOT_TOKEN: secret, TELEGRAM_OPS_CHAT_ID: '', TELEGRAM_CHANNEL_ID: '' });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^::error title=Telegram secrets missing::TELEGRAM_OPS_CHAT_ID is empty/);
  assert.match(none.stdout, /Settings, Secrets and variables, Actions/);
  assert.doesNotMatch(none.stdout, new RegExp(secret), 'names only, never values');
  assert.equal(check({ ...all, TELEGRAM_CHANNEL_ID: '' }, '--require-channel').status, 1);
  assert.match(check({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_OPS_CHAT_ID: '', TELEGRAM_CHANNEL_ID: '' }).stdout, /TELEGRAM_BOT_TOKEN and TELEGRAM_OPS_CHAT_ID are empty/);
});

test('the next plein is Saturday 18:00 Paris, and never before the first one', () => {
  assert.equal(nextPlein(MORNING, config), Date.parse('2026-10-24T18:00:00+02:00')); // not this evening
  assert.equal(nextPlein(Date.parse('2026-10-26T06:00:00Z'), config), Date.parse('2026-10-31T18:00:00+01:00'));
  const f = facts({ now: MORNING, config, live: 2.366 });
  assert.equal(f.dateLabel, 'Samedi 17\u00A0octobre');
  assert.equal(f.pleinLabel, 'samedi 24\u00A0octobre, 18:00');
  assert.deepEqual([f.days, f.hours], [7, 10]);
  assert.equal(f.ratePct, 46.6);
});

test('the caption is French, typographically correct, free of links and short enough for X', () => {
  for (const live of [2.366, null]) {
    const text = caption(facts({ now: MORNING, config, live }));
    assert.equal(typo(text), text, 'already typeset');
    assert.doesNotMatch(text, / [:;!?%€»]|« |\d [%€]/, 'no breakable space before French punctuation');
    assert.doesNotMatch(text, /https?:|www\.|\.com|\.fr/, 'the link stays in the bio');
    assert.ok(text.length <= 280, `${text.length} characters`);
    // the percentage names what it is a percentage of, in the site's own words, and is not called a "taux"
    assert.match(text, /^46,6\u00A0% des frais de la semaine rach\u00E8tent des \$PLEIN, br\u00FBl\u00E9s ensuite \(20\u00A0\u00D7 2,3283\u00A0\u20AC\/L, relev\u00E9 officiel du 9\u00A0oct\.\)\./m);
    assert.doesNotMatch(text, /[Tt]aux|en vigueur|rendement|garanti/);
    assert.match(text, /Prochain plein\u00A0: samedi 24\u00A0octobre, 18:00\./);
    assert.match(text, /Cryptoactif risqué/);
    assert.equal(text.includes('Gazole ce matin'), live !== null); // no feed, no invented number
    if (live !== null) assert.match(text, /Gazole ce matin\u00A0: 2,366\u00A0€\/L/);
  }
  // the longest labels the year can bring still fit: every day of 400, the longest survey label, both feeds
  const longest = { ...config, official: { ...config.official, weekLabel: '30 sept.' } };
  for (let day = 0; day < 400; day++) {
    for (const live of [2.366, null]) {
      const text = caption(facts({ now: MORNING + day * 86400000, config: longest, live }));
      assert.ok(text.length <= 280, `day +${day}: ${text.length} characters`);
    }
  }
  const text = caption(facts({ now: MORNING, config, live: 2.366 }));
  assert.equal(decodeURIComponent(intentUrl(text).slice('https://x.com/intent/post?text='.length)), text);
  assert.ok(intentUrl(text).startsWith('https://x.com/intent/post?text='));
});

test('the card is one self-contained 1200 × 675 page with the three numbers, and a dash when the feed is down', () => {
  const live = totemHtml(facts({ now: MORNING, config, live: 2.366 }));
  assert.match(live, /STATION \$PLEIN/);
  assert.match(live, /2,366/);
  assert.match(live, /46,6%/);
  // the card says whose percentage it is, twice, and no longer has a bare "en vigueur"
  assert.match(live, /part des frais/);
  assert.match(live, /en % des frais de la semaine/);
  assert.doesNotMatch(live, /en vigueur/);
  assert.match(live, /7J 10H/);
  assert.match(live, /width:1200px;height:675px/);
  assert.doesNotMatch(live.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, ''), /https?:\/\/(?!www\.w3\.org)/, 'no outside request');
  const down = totemHtml(facts({ now: MORNING, config, live: null }));
  assert.match(down, /flux indisponible/);
  assert.doesNotMatch(down, /2,366/);
});

// ---- the renderer --------------------------------------------------------------------------

test('a browser is looked for in the usual places, in order', () => {
  // slashes are compared forward so the same test holds on Windows (path.join uses backslashes there)
  const slash = (p) => (p === null ? p : p.replace(/\\/g, '/'));
  const only = (...paths) => (p) => paths.includes(slash(p));
  const find = (opts) => slash(findBrowser(opts));
  assert.equal(find({ env: { CHROME_PATH: '/x/chrome' }, exists: only('/x/chrome', '/usr/bin/chromium') }), '/x/chrome');
  assert.equal(find({ env: { CHROME_PATH: '/x/missing' }, exists: only('/usr/bin/chromium') }), null);
  assert.equal(find({ env: { PATH: '/usr/bin' }, exists: only('/usr/bin/chromium', '/usr/bin/google-chrome') }), '/usr/bin/google-chrome');
  assert.equal(find({ env: { PATH: '' }, exists: only('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') }),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
  assert.equal(find({ env: { PATH: '' }, exists: () => false }), null);
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(1200, 16);
  header.writeUInt32BE(675, 20);
  assert.deepEqual(pngSize(header), { width: 1200, height: 675 });
  assert.equal(pngSize(Buffer.from('GIF89a')), null);
  const saved = process.env.CHROME_PATH;
  process.env.CHROME_PATH = join(tmpdir(), 'no-such-browser');
  try { assert.throws(() => renderPng('x.html', join(tmpdir(), 'x.png')), /no Chrome or Edge/); } finally {
    if (saved === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = saved;
  }
});

test('the card really renders at 1200 × 675 (needs Chrome or Edge; skipped in CI)', { skip: !findBrowser() || !!process.env.CI }, () => {
  const dir = scratch();
  const html = join(dir, 'totem.html');
  writeFileSync(html, totemHtml(facts({ now: MORNING, config, live: 2.366 })));
  const png = renderPng(html, join(dir, 'totem.png'), { width: 1200, height: 675 });
  assert.deepEqual(pngSize(readFileSync(png)), { width: 1200, height: 675 });
});

// ---- the workflow files --------------------------------------------------------------------

const workflowDir = join(root, '.github', 'workflows');
const MINE = ['totem', 'vigie', 'prix-officiel', 'plein', 'releve', 'audit'];
// Line endings are normalised: on Windows git checks tracked files out with CRLF (core.autocrlf), and
// the structure tests below match on "\n" and on exact indentation.
const readWorkflow = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const workflow = (name) => readWorkflow(join(workflowDir, `${name}.yml`));
// The workflow files reach the repository in their own commit (pushing them needs the token's
// workflow scope); until then these tests say so instead of failing on a missing file.
const WORKFLOWS = MINE.every((n) => existsSync(join(workflowDir, `${n}.yml`))) ? {} : { skip: 'the workflow files are not in this tree yet' };
/** The workflow without its comment lines, for tests about what it does rather than what it says. */
const codeOf = (text) => text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

/** Lines inside `run:` blocks (a block scalar or a one-liner). */
function runLines(text) {
  const out = [];
  let indent = null;
  for (const line of text.split('\n')) {
    const lead = line.match(/^(\s*)/)[1].length;
    if (indent !== null && (line.trim() === '' || lead > indent)) { out.push(line); continue; }
    indent = null;
    const m = line.match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    if (/^[|>][+-]?$/.test(m[2])) indent = m[1].length + (line.includes('- run:') ? 2 : 0);
    else out.push(m[2]);
  }
  return out;
}

test('every workflow is bounded, least-privilege and passes untrusted input only through env', WORKFLOWS, () => {
  assert.deepEqual(MINE.filter((n) => !readdirSync(workflowDir).includes(`${n}.yml`)), []);
  for (const name of MINE) {
    const text = workflow(name);
    assert.match(text, /^permissions:\n {2}contents: (read|write)/m, `${name}: permissions`);
    assert.match(text, /^concurrency:\n {2}group: /m, `${name}: concurrency`);
    assert.match(text, /timeout-minutes: \d+/, `${name}: timeout`);
    assert.match(text, /uses: actions\/checkout@v4/, `${name}: checkout`);
    assert.match(text, /node-version: 22/, `${name}: node 22`);
    assert.doesNotMatch(text, /uses: [^\n]*@(main|master)\b/, `${name}: pinned actions`);
    assert.doesNotMatch(text, /pull_request_target|--force|git push [^\n]*(main|master)\b/, `${name}: no risky triggers or pushes to main`);
    // a ${{ }} expression in a shell line would let an input or a secret become code
    assert.deepEqual(runLines(text).filter((l) => l.includes('${{')), [], `${name}: expressions inside run:`);
    // inputs and secrets reach steps as environment variables only
    for (const line of text.split('\n').filter((l) => /\$\{\{\s*(secrets|inputs|github\.event\.inputs)/.test(l) && !l.trim().startsWith('#'))) {
      assert.match(line, /^\s+[A-Z][A-Z0-9_]*: \$\{\{/, `${name}: ${line.trim()}`);
    }
    const secrets = [...text.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    for (const s of secrets) assert.ok(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_OPS_CHAT_ID', 'SOLANA_RPC_URL'].includes(s), `${name}: ${s}`);
  }
  // the price job pushes a branch and nothing more: opening, approving or merging a pull request is
  // a person's act. A token that may write pull requests could also approve one (the two-key rule).
  assert.match(workflow('prix-officiel'), /^permissions:\n {2}contents: write\n(?! {2}pull-requests)/m);
  for (const name of MINE) {
    const code = codeOf(workflow(name));
    assert.doesNotMatch(code, /pull-requests: write/, `${name}: no pull-request write access`);
    assert.doesNotMatch(code, /gh pr (create|merge|review|approve|edit)|--auto|--admin|--approve/, `${name}: never touches a pull request`);
  }
  assert.match(workflow('vigie'), /issues: write/);
});

/** The jobs of a workflow by id: the text of each. */
function jobsOf(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const out = {};
  for (const part of body.split(/^(?=  [A-Za-z0-9_-]+:\s*$)/m)) {
    const id = part.match(/^ {2}([A-Za-z0-9_-]+):/)?.[1];
    if (id) out[id] = part;
  }
  return out;
}
/** The steps of a job: [{ name, text }]. A step with no name is called by its `uses:`. */
function stepsOf(job) {
  return job.split(/^(?= {6}- )/m).slice(1).map((text) => ({ name: text.match(/^ {6}- (?:name: )?(.*)$/m)[1].trim(), text }));
}
const stepNamed = (job, name) => stepsOf(job).find((s) => s.name === name);
const crons = (name) => [...workflow(name).matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
const RUN_URL_ENV = /^ {10}RUN_URL: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}$/m;

test('the jobs a Saturday depends on tell the founders when they fail, without a secret or a link in a shell line', WORKFLOWS, () => {
  for (const [name, id, title] of [
    ['plein', 'plein', 'Tell the founders it failed'], ['plein', 'garde', 'Tell the founders the guard failed'],
    ['prix-officiel', 'prix', 'Tell the founders it failed'], ['audit', 'audit', 'Tell the founders it failed'],
  ]) {
    const notice = stepsOf(jobsOf(workflow(name))[id]).at(-1);
    // it is the last step, so it sees every earlier failure
    assert.equal(notice.name, title, `${name}/${id}: the failure notice is the last step`);
    assert.match(notice.text, /^ {8}if: failure\(\) \|\| cancelled\(\)$/m, `${name}/${id}: a job stopped by its time limit is not "failed"`);
    assert.match(notice.text, /^ {8}timeout-minutes: 2$/m, `${name}/${id}: the notice has time of its own`);
    assert.match(notice.text, RUN_URL_ENV, `${name}/${id}`);
    assert.match(notice.text, /scripts\/telegram\.mjs --ops --text "[^"]*\$RUN_URL"/, `${name}/${id}`);
    // French wording with no mark that wants a non-breaking space typed into YAML
    const said = notice.text.match(/--text "([^"]*)"/)[1];
    assert.doesNotMatch(said, /[:;!?%€»«]/, `${name}/${id}: ${said}`);
  }
  // a hung Telegram call must fail its own step quickly (the job then still has time to send the
  // notice above), and a missing secret must fail it loudly instead of printing to a log nobody reads
  for (const [name, id, title] of [
    ['plein', 'plein', 'Send it to the founders'], ['plein', 'garde', 'Tell the founders no order arrived'],
    ['prix-officiel', 'prix', 'Tell the founders'], ['audit', 'audit', 'Send it to the founders'],
    ['releve', 'releve', 'Send it to the founders'], ['vigie', 'vigie', 'Tell the founders about new look-alikes'],
    // the notices of a run that is green by design are loud about a missing secret too
    ['plein', 'plein', 'Tell the founders the run was skipped'], ['plein', 'garde', 'Tell the founders the guard was skipped'],
    ['totem', 'totem', 'Tell the founders the run was skipped'],
  ]) {
    const own = stepNamed(jobsOf(workflow(name))[id], title);
    assert.ok(own, `${name}/${id}: ${title}`);
    assert.match(own.text, /^ {8}timeout-minutes: 2$/m, `${name}/${id}: ${title}`);
    const check = own.text.indexOf('node scripts/_gate.mjs --require-ops');
    const send = own.text.indexOf('node scripts/telegram.mjs --ops');
    assert.ok(check >= 0 && send > check, `${name}/${id}: ${title} checks the Telegram secrets before it sends`);
  }
  // the totem renders and keeps its card first, and only then goes red for a missing secret
  const totem = stepsOf(jobsOf(workflow('totem')).totem);
  const names = totem.map((s) => s.name);
  assert.ok(names.indexOf('Keep the card') < names.indexOf('Were the Telegram secrets there?'));
  assert.equal(totem.at(-1).name, 'Were the Telegram secrets there?');
  assert.match(totem.at(-1).text, /^ {8}if: steps\.gate\.outputs\.go == 'true' && \(github\.event_name == 'schedule' \|\| inputs\.post\)$/m);
  assert.match(totem.at(-1).text, /run: node scripts\/_gate\.mjs --require-ops --require-channel$/m);
  // the noisy ones stay quiet: vigie runs every 15 minutes on launch day, totem reports its own render failure
  for (const name of ['vigie', 'totem', 'releve']) assert.doesNotMatch(workflow(name), /Tell the founders it failed/, name);
});

test('a gate that closes for no planned reason tells the founders, because the run itself is green', WORKFLOWS, () => {
  for (const [name, id, title, opening] of [
    ['plein', 'plein', 'Tell the founders the run was skipped', "Le job plein n'a pas tourné"],
    ['plein', 'garde', 'Tell the founders the guard was skipped', "La garde du plein n'a pas tourné"],
    ['totem', 'totem', 'Tell the founders the run was skipped', "Le job totem n'a pas tourné"],
  ]) {
    const steps = stepsOf(jobsOf(workflow(name))[id]);
    const gate = steps.findIndex((s) => s.text.includes('id: gate'));
    const at = steps.findIndex((s) => s.name === title);
    assert.ok(gate >= 0 && at >= 0, `${name}/${id}: has the skipped-run notice`);
    const own = steps[at].text;
    assert.match(own, /^ {8}if: steps\.gate\.outputs\.warn == 'true'$/m, `${name}/${id}`);
    assert.match(own, /^ {8}timeout-minutes: 2$/m, `${name}/${id}`);
    assert.match(own, RUN_URL_ENV, `${name}/${id}`);
    const said = own.match(/scripts\/telegram\.mjs --ops --text "([^"]*\$RUN_URL)"/)?.[1];
    assert.ok(said, `${name}/${id}: sends to the ops chat with the run link`);
    assert.ok(said.startsWith(opening), `${name}/${id}: ${said}`);
    assert.doesNotMatch(said, /[:;!?%€»«]/, `${name}/${id}: ${said}`);
    // it sits right after the gate, before any step that waits for go=true, and it is not the failure notice
    const firstGo = steps.findIndex((s) => s.text.includes("steps.gate.outputs.go == 'true'"));
    assert.ok(gate < at && at < firstGo, `${name}/${id}`);
    assert.doesNotMatch(own, /failure\(\)/, `${name}/${id}`);
  }
});

test('the price job gives a founder a one-click link instead of opening the pull request', WORKFLOWS, () => {
  const code = codeOf(workflow('prix-officiel'));
  assert.match(code, /compare\/\$BASE\.\.\.\$branch\?expand=1&title=/);
  assert.match(code, /GITHUB_STEP_SUMMARY/);
  assert.match(code, /scripts\/telegram\.mjs --ops --text/);
  assert.match(code, /opsMessage/);
  assert.match(code, /steps\.branch\.outputs\.pushed == 'true'/, 'the founders are told once, when the branch is pushed');
  assert.match(code, /branch="prix\/\$DATE-\$\{price\/\.\/\}"/, 'a revised figure for the same survey gets its own branch');
});

test('the morning, Saturday and guard jobs are gated by the cron line that started them, never by the wall clock alone', WORKFLOWS, () => {
  const gateLine = (extra) => new RegExp(`^ {8}env:\\n {10}CRON: \\$\\{\\{ github\\.event\\.schedule \\}\\}\\n {8}run: node scripts\\/_gate\\.mjs --hour \\d+ --until \\d{1,2}:\\d{2}${extra} >> "\\$GITHUB_OUTPUT"$`, 'm');
  const gateOf = (job) => { const m = job.match(/_gate\.mjs --hour (\d+) --until (\d{1,2}:\d{2})/); return { hour: Number(m[1]), until: m[2] }; };
  const totemJob = jobsOf(workflow('totem')).totem;
  const pleinJobs = jobsOf(workflow('plein'));
  assert.match(totemJob, gateLine(''), 'totem: gate');
  // the order's gate also does the duplicate check, so it carries the job's own token to read the list of runs
  const orderGate = new RegExp('^ {8}env:\\n {10}CRON: \\$\\{\\{ github\\.event\\.schedule \\}\\}\\n {10}GH_TOKEN: \\$\\{\\{ github\\.token \\}\\}\\n {8}run: node scripts\\/_gate\\.mjs --hour 17 --until 18:30'
    + ' --first-plein --early-note "\\$RUNNER_TEMP\\/early-note\\.md" --skip-if-sent --sent-note "\\$RUNNER_TEMP\\/already-sent\\.md" >> "\\$GITHUB_OUTPUT"$', 'm');
  assert.match(pleinJobs.plein, orderGate, 'plein: gate with the first-plein floor, the early note and the duplicate check');
  assert.match(pleinJobs.garde, gateLine(' --first-plein'), 'garde: gate with the first-plein floor');
  for (const name of ['totem', 'plein']) assert.doesNotMatch(codeOf(workflow(name)), /date \+%H%M|TZ=Europe\/Paris date/, `${name}: no wall-clock test left in the shell`);

  // each job's own lines, run through its own gate, on the days around both clock changes
  const goers = (lines, gate, day, delay) => lines.filter((cron) => {
    const { min, hour } = cronTime(cron);
    return decide({ event: 'schedule', cron, now: utc(day, hour, min, delay), ...gate }).go;
  });
  const days = ['2026-10-17', '2026-10-24', '2026-10-25', '2026-10-26', '2026-11-30', '2027-03-27', '2027-03-28', '2027-07-14'];
  for (const day of days) for (const delay of [0, 10, 35]) {
    assert.equal(goers(crons('totem'), gateOf(totemJob), day, delay).length, 1, `totem ${day} +${delay} min`);
  }
  // the Saturday lines: the order and the guard each go once a Saturday from the first plein, and never on launch day
  const saturdays = ['2026-10-24', '2026-10-31', '2026-12-19', '2027-03-27', '2027-04-03', '2027-07-17'];
  const lines = (prefix) => crons('plein').filter((c) => c.startsWith(`${prefix} `));
  const order = { ...gateOf(pleinJobs.plein), firstPlein: FIRST };
  const guard = { ...gateOf(pleinJobs.garde), firstPlein: FIRST };
  assert.deepEqual(gateOf(pleinJobs.plein), gateOf(pleinJobs.garde), 'the guard has the order\'s clock regime and cut-off');
  for (const day of saturdays) {
    for (const delay of [0, 10, 35]) assert.equal(goers(lines('52'), order, day, delay).length, 1, `order ${day} +${delay} min`);
    for (const delay of [0, 10, 30]) assert.equal(goers(lines('58'), guard, day, delay).length, 1, `guard ${day} +${delay} min`);
  }
  for (const delay of [0, 10, 35, 90]) {
    assert.deepEqual(goers(lines('52'), order, '2026-10-17', delay), [], `launch day: no order +${delay} min`);
    assert.deepEqual(goers(lines('58'), guard, '2026-10-17', delay), [], `launch day: no guard +${delay} min`);
  }
});

test('the plein workflow keeps the order and its guard apart: own lines, own group, a token that only reads runs', WORKFLOWS, () => {
  const text = workflow('plein');
  const jobs = jobsOf(text);
  assert.deepEqual(Object.keys(jobs), [ORDER_JOB, 'garde']);
  // which job does a schedule line start? the workflow's own conditions, evaluated on each line
  const evaluate = (expression, schedule) => new Function('startsWith', 'github', `return ${expression};`)((s, prefix) => String(s ?? '').startsWith(prefix), { event: { schedule } });
  const condition = (job) => job.match(/^ {4}if: \$\{\{ (.*) \}\}$/m)[1];
  const lines = crons('plein');
  const starting = (schedule) => Object.keys(jobs).filter((id) => evaluate(condition(jobs[id]), schedule));
  for (const cron of lines) assert.deepEqual(starting(cron), [cron.startsWith('58 ') ? 'garde' : ORDER_JOB], cron);
  assert.deepEqual(starting(''), [ORDER_JOB], 'a press of the button starts the order, never the guard');
  assert.deepEqual(starting(undefined), [ORDER_JOB]);
  // the guard never waits behind the run it watches
  const group = text.match(/^concurrency:\n {2}group: \$\{\{ (.*) \}\}$/m)[1];
  for (const cron of lines) assert.equal(evaluate(group, cron), cron.startsWith('58 ') ? 'plein-garde' : 'plein', cron);
  assert.equal(evaluate(group, ''), 'plein');
  assert.match(text, /^ {2}cancel-in-progress: false$/m);
  // least privilege: the workflow reads the repository; the two jobs that look at runs (the guard, and the
  // order's duplicate check) also read Actions; nothing writes
  assert.match(text, /^permissions:\n {2}contents: read\n/m);
  for (const id of [ORDER_JOB, 'garde']) {
    assert.match(jobs[id], /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n {4}\S/m, `${id}: reads runs, writes nothing`);
  }
  assert.doesNotMatch(codeOf(text), /: write/);
  assert.equal([...codeOf(text).matchAll(/^ {4}permissions:/gm)].length, 2, 'no other job widens its permissions');
  // the guard's token reaches its step through env, and the wait fits inside the step, which fits inside the job
  const watch = stepNamed(jobs.garde, 'Was the order sent?');
  assert.match(watch.text, /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
  assert.match(watch.text, /run: node scripts\/_gate\.mjs --watch-order --alert-file "\$RUNNER_TEMP\/alert\.txt" --wait \d+ >> "\$GITHUB_OUTPUT"$/m);
  const wait = Number(watch.text.match(/--wait (\d+)/)[1]);
  const stepLimit = Number(watch.text.match(/^ {8}timeout-minutes: (\d+)$/m)[1]);
  const jobLimit = Number(jobs.garde.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  assert.ok(wait <= 8 && wait + 2 <= stepLimit && stepLimit + 2 <= jobLimit, `${wait} / ${stepLimit} / ${jobLimit}`);
  assert.match(stepNamed(jobs.garde, 'Tell the founders no order arrived').text, /^ {8}if: steps\.watch\.outputs\.alert == 'true'$/m);
  // what the guard looks for is really in the order job: the file, the job id and the step that sends
  assert.ok(existsSync(join(workflowDir, ORDER_WORKFLOW)));
  assert.ok(stepNamed(jobs[ORDER_JOB], ORDER_STEP), `a step named "${ORDER_STEP}" in the ${ORDER_JOB} job`);
  assert.match(stepNamed(jobs[ORDER_JOB], ORDER_STEP).text, /scripts\/telegram\.mjs --ops --file "\$RUNNER_TEMP\/plein\.md"/);
});

test('the order is sent first and the draft is kept after, whatever happened: neither can take the other down', WORKFLOWS, () => {
  const steps = stepsOf(jobsOf(workflow('plein'))[ORDER_JOB]);
  const names = steps.map((s) => s.name);
  const keep = steps[names.indexOf('Keep the order and the ticket draft')];
  assert.ok(names.indexOf('Work out the purchase order') < names.indexOf(ORDER_STEP));
  // after the send, so a hanging or failing artifact service cannot delay or skip the order ...
  assert.ok(names.indexOf(ORDER_STEP) < names.indexOf(keep.name));
  // ... still run when the send failed (a Telegram outage must not take the draft with it) ...
  assert.match(keep.text, /^ {8}if: always\(\) && steps\.gate\.outputs\.go == 'true'$/m);
  // ... and never turn a sent order into a red run (which tells the founders it may not have arrived), or eat the job's minutes
  assert.match(keep.text, /^ {8}continue-on-error: true$/m);
  assert.match(keep.text, /^ {8}timeout-minutes: 2$/m);
  assert.match(keep.text, /^ {8}uses: actions\/upload-artifact@v4$/m);
  assert.ok(names.indexOf(keep.name) < names.indexOf('Tell the founders it failed'), 'the failure notice stays last');
  // the totem's copy of its card is bounded the same way
  const card = stepNamed(jobsOf(workflow('totem')).totem, 'Keep the card');
  assert.match(card.text, /^ {8}continue-on-error: true$/m);
  assert.match(card.text, /^ {8}timeout-minutes: 2$/m);
});

test('the workflow files are read as the same text on a CRLF checkout', WORKFLOWS, () => {
  // git on Windows (core.autocrlf) hands tracked files out with CRLF; every structure test matches "\n"
  const dir = scratch();
  for (const name of MINE) {
    const crlf = join(dir, `${name}.yml`);
    writeFileSync(crlf, workflow(name).replace(/\n/g, '\r\n'));
    assert.ok(readFileSync(crlf, 'utf8').includes('\r\n'), `${name}: the copy really has CRLF`);
    assert.equal(readWorkflow(crlf), workflow(name), name);
  }
  assert.deepEqual(Object.keys(jobsOf(readWorkflow(join(dir, 'plein.yml')))), [ORDER_JOB, 'garde']);
  assert.match(readWorkflow(join(dir, 'plein.yml')), /^permissions:\n {2}contents: read\n/m);
});

test('the vigie reports to the run summary before anything can fail, and tells the founders before it marks anything as seen', WORKFLOWS, () => {
  const steps = stepsOf(jobsOf(workflow('vigie')).vigie);
  const names = steps.map((s) => s.name);
  assert.match(steps[names.indexOf('Search DexScreener')].text, /cat "\$RUNNER_TEMP\/report\.md" >> "\$GITHUB_STEP_SUMMARY"/);
  assert.ok(names.indexOf('Search DexScreener') < names.indexOf('Tell the founders about new look-alikes'));
  assert.ok(names.indexOf('Tell the founders about new look-alikes') < names.indexOf('Update the issue'), 'the issue (the memory) is updated last');
  assert.doesNotMatch(steps[names.indexOf('Update the issue')].text, /GITHUB_STEP_SUMMARY/);
});

test('no step that reaches outside runs without a time limit of its own, and the limit fits inside the job', WORKFLOWS, () => {
  // the order's gate asks GitHub (the duplicate check) and the artifact steps ask the artifact service
  const outside = /node scripts\/(?:telegram|official-price|plein|audit|releve|vigie|totem)\.mjs|node scripts\/_gate\.mjs [^\n]*(?:--watch-order|--skip-if-sent)|\buses: actions\/upload-artifact@|\bgh (?:issue|label)\b|git push|npm test/;
  let checked = 0;
  for (const name of MINE) {
    for (const [id, job] of Object.entries(jobsOf(workflow(name)))) {
      const jobLimit = Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
      for (const s of stepsOf(job)) {
        if (!outside.test(codeOf(s.text))) continue;
        const own = s.text.match(/^ {8}timeout-minutes: (\d+)$/m);
        assert.ok(own, `${name}/${id}: "${s.name}" reaches outside and has no timeout-minutes of its own`);
        assert.ok(Number(own[1]) < jobLimit, `${name}/${id}: "${s.name}" ${own[1]} min against the job's ${jobLimit}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 20, `${checked} steps checked`);
});

test('the Saturday job checks the official price before it builds the order, and says so first if config.js is behind', WORKFLOWS, () => {
  const job = jobsOf(workflow('plein'))[ORDER_JOB];
  const code = codeOf(job);
  const at = (title) => stepsOf(job).findIndex((s) => s.name === title);
  assert.ok(at('Is this the run for this Saturday?') < at('Is config.js on the latest official price?'));
  assert.ok(at('Is config.js on the latest official price?') < at('Work out the purchase order'));
  assert.match(code, /timeout 90 node scripts\/official-price\.mjs --json >/, 'a ministry site that does not answer cannot stop the order');
  assert.match(code, /reason="no answer within 90 seconds"/);
  assert.doesNotMatch(code, /official-price\.mjs[^\n]*--write/, 'the check never writes config.js');
  assert.match(code, /status" = "new" \] \|\| \[ "\$status" = "revised"/);
  assert.match(code, /::error title=Official price is out of date::/);
  assert.match(code, /::warning title=Official price not checked::/, 'an outside failure is a warning, not a stop');
  // the notes go in front of the order that goes to the summary and to Telegram: "early" first, then the price
  assert.match(code, /--early-note "\$RUNNER_TEMP\/early-note\.md"/);
  assert.match(code, /for note in already-sent early-note price-warning; do/);
  assert.match(code, /cat "\$RUNNER_TEMP\/\$note\.md" >> "\$RUNNER_TEMP\/plein\.md"/);
  assert.match(code, /cat "\$RUNNER_TEMP\/order\.md" >> "\$RUNNER_TEMP\/plein\.md"/);
  assert.match(code, /cat "\$RUNNER_TEMP\/plein\.md" >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(code, /telegram\.mjs --ops --file "\$RUNNER_TEMP\/plein\.md"/);
  // the order step has a limit under the job's, so the failure notice still reaches the founders in time
  assert.match(stepsOf(job)[at('Work out the purchase order')].text, /^ {8}timeout-minutes: 5$/m);
});

test('the schedules are the ones the founders asked for', WORKFLOWS, () => {
  for (const name of MINE) for (const c of crons(name)) assert.equal(c.split(' ').length, 5, `${name}: ${c}`);
  // no line fires on the hour: GitHub names the top of the hour as its busiest time, when runs are delayed or dropped
  for (const name of MINE) for (const c of crons(name)) assert.notEqual(c.split(' ')[0], '0', `${name}: ${c}`);
  assert.deepEqual(crons('totem'), ['17 6 * * *', '17 7 * * *']);
  // Monday to Friday, twice a day, and Saturday morning: a Thursday or Friday publication still gets its link
  assert.deepEqual(crons('prix-officiel'), ['23 8,14 * * 1-5', '23 8 * * 6']);
  assert.deepEqual(crons('audit'), ['30 14 17 10 *']);
  assert.deepEqual(crons('releve'), []);
  assert.ok(crons('vigie').includes('*/15 9-20 17 10 *'));
  assert.ok(crons('vigie').some((c) => /^\d+ \*\/3 \* \* \*$/.test(c)));
  for (const name of MINE) assert.match(workflow(name), /workflow_dispatch:/, `${name}: a button`);
  // the plein order fires at 17:52 Paris in both clock regimes: after the week's fees reach the
  // réservoir (17:50), before the buyback opens (18:00). The guard fires six minutes later, at 17:58.
  assert.deepEqual(crons('plein'), ['52 15 * * 6', '52 16 * * 6', '58 15 * * 6', '58 16 * * 6']);
  const at = (iso) => { const p = paris(Date.parse(iso)); return p.h * 100 + p.min; };
  assert.equal(at('2026-10-24T15:52:00Z'), 1752); // Saturday 24 October, summer time
  assert.equal(at('2026-10-31T16:52:00Z'), 1752); // Saturday 31 October, winter time
  assert.equal(at('2026-10-31T15:52:00Z'), 1652); // the other line is an hour early that day
  assert.equal(at('2026-10-24T15:58:00Z'), 1758);
  assert.equal(at('2026-10-31T16:58:00Z'), 1758);
  const gates = [...workflow('plein').matchAll(/_gate\.mjs --hour 17 --until 18:30 --first-plein/g)];
  assert.equal(gates.length, 2, 'both Saturday jobs read the first-plein floor');
  assert.match(workflow('audit'), /16:30 Paris/);
});
