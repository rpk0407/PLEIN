// The bots and scheduled jobs: the official-price reader, the look-alike watch, the Telegram
// sender, the daily totem and the workflow files. Everything runs offline (fetch is stubbed,
// the ministry's workbook is rebuilt in memory); the live checks are done by hand and in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
import { cronTime, decide } from '../scripts/_gate.mjs';
import { paris } from '../public/js/clock.js';
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
const workflow = (name) => readFileSync(join(workflowDir, `${name}.yml`), 'utf8');
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

test('every workflow is bounded, least-privilege and passes untrusted input only through env', () => {
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

test('the jobs a Saturday depends on tell the founders when they fail, without a secret or a link in a shell line', () => {
  for (const name of ['plein', 'prix-officiel', 'audit']) {
    const text = workflow(name);
    const step = text.slice(text.indexOf('- name: Tell the founders it failed'));
    assert.ok(step.length < text.length, `${name}: has a failure notice`);
    assert.match(step, /^ {8}if: failure\(\) \|\| cancelled\(\)$/m, `${name}: a job stopped by its time limit is not "failed"`);
    assert.match(step, /^ {8}timeout-minutes: 2$/m, `${name}: the notice has time of its own`);
    assert.match(step, /^ {10}RUN_URL: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}$/m, name);
    assert.match(step, /scripts\/telegram\.mjs --ops --text "[^"]*\$RUN_URL"/, name);
    // it is the last step, so it sees every earlier failure
    assert.equal((text.match(/^ {6}- /gm) || []).length, (text.slice(0, text.indexOf('- name: Tell the founders it failed')).match(/^ {6}- /gm) || []).length + 1, `${name}: last step`);
    // French wording with no mark that wants a non-breaking space typed into YAML
    const said = step.match(/--text "([^"]*)"/)[1];
    assert.doesNotMatch(said, /[:;!?%€»«]/, `${name}: ${said}`);
  }
  // a hung Telegram call must fail its own step quickly: the job then still has time to send the notice above
  for (const [name, title] of [['plein', 'Send it to the founders'], ['prix-officiel', 'Tell the founders'], ['audit', 'Send it to the founders']]) {
    const text = workflow(name);
    const start = text.indexOf(`- name: ${title}\n`);
    assert.ok(start >= 0, `${name}: ${title}`);
    const own = text.slice(start, text.indexOf('\n      - ', start + 1));
    assert.match(own, /^ {8}timeout-minutes: 2$/m, `${name}: ${title}`);
    assert.match(own, /scripts\/telegram\.mjs/, `${name}: ${title}`);
  }
  // the noisy ones stay quiet: vigie runs every 15 minutes on launch day, totem reports its own render failure
  for (const name of ['vigie', 'totem', 'releve']) assert.doesNotMatch(workflow(name), /Tell the founders it failed/, name);
});

test('a gate that closes for no planned reason tells the founders, because the run itself is green', () => {
  for (const name of ['plein', 'totem']) {
    const text = workflow(name);
    const start = text.indexOf('- name: Tell the founders the run was skipped\n');
    assert.ok(start >= 0, `${name}: has the skipped-run notice`);
    const own = text.slice(start, text.indexOf('\n      - ', start + 1));
    assert.match(own, /^ {8}if: steps\.gate\.outputs\.warn == 'true'$/m, name);
    assert.match(own, /^ {8}timeout-minutes: 2$/m, name);
    assert.match(own, /^ {10}RUN_URL: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}$/m, name);
    const said = own.match(/scripts\/telegram\.mjs --ops --text "([^"]*\$RUN_URL)"/)?.[1];
    assert.ok(said, `${name}: sends to the ops chat with the run link`);
    assert.match(said, new RegExp(`^Le job ${name} n'a pas tourné`), name);
    assert.doesNotMatch(said, /[:;!?%€»«]/, `${name}: ${said}`);
    // it sits right after the gate, before any step that waits for go=true, and it is not the failure notice
    assert.ok(text.indexOf('id: gate') < start && start < text.indexOf("steps.gate.outputs.go == 'true'"), name);
    assert.doesNotMatch(own, /failure\(\)/, name);
  }
});

test('the price job gives a founder a one-click link instead of opening the pull request', () => {
  const code = codeOf(workflow('prix-officiel'));
  assert.match(code, /compare\/\$BASE\.\.\.\$branch\?expand=1&title=/);
  assert.match(code, /GITHUB_STEP_SUMMARY/);
  assert.match(code, /scripts\/telegram\.mjs --ops --text/);
  assert.match(code, /opsMessage/);
  assert.match(code, /steps\.branch\.outputs\.pushed == 'true'/, 'the founders are told once, when the branch is pushed');
  assert.match(code, /branch="prix\/\$DATE-\$\{price\/\.\/\}"/, 'a revised figure for the same survey gets its own branch');
});

test('the morning and Saturday jobs are gated by the cron line that started them, never by the wall clock alone', () => {
  const crons = (name) => [...workflow(name).matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
  for (const name of ['totem', 'plein']) {
    const text = workflow(name);
    assert.match(text, /^ {8}env:\n {10}CRON: \$\{\{ github\.event\.schedule \}\}\n {8}run: node scripts\/_gate\.mjs --hour \d+ --until \d{1,2}:\d{2} >> "\$GITHUB_OUTPUT"$/m, `${name}: gate`);
    assert.doesNotMatch(codeOf(text), /date \+%H%M|TZ=Europe\/Paris date/, `${name}: no wall-clock test left in the shell`);
  }
  const gateOf = (name) => { const m = workflow(name).match(/_gate\.mjs --hour (\d+) --until (\d{1,2}:\d{2})/); return { hour: Number(m[1]), until: m[2] }; };
  // each workflow's own lines, run through its own gate, on the days around both clock changes
  const days = {
    totem: ['2026-10-17', '2026-10-24', '2026-10-25', '2026-10-26', '2026-11-30', '2027-03-27', '2027-03-28', '2027-07-14'],
    plein: ['2026-10-24', '2026-10-31', '2026-12-19', '2027-03-27', '2027-04-03', '2027-07-17'], // Saturdays
  };
  for (const name of ['totem', 'plein']) {
    const gate = gateOf(name);
    for (const day of days[name]) {
      for (const delay of [0, 10, 35]) {
        const goers = crons(name).filter((cron) => {
          const { min, hour } = cronTime(cron);
          const now = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`) + delay * 60000;
          return decide({ event: 'schedule', cron, now, ...gate }).go;
        });
        assert.equal(goers.length, 1, `${name} ${day} +${delay} min: ${goers}`);
      }
    }
  }
});

test('the Saturday job checks the official price before it builds the order, and says so first if config.js is behind', () => {
  const text = workflow('plein');
  const code = codeOf(text);
  const step = (title) => text.indexOf(`- name: ${title}`);
  assert.ok(step('Is this the run for this Saturday?') < step('Is config.js on the latest official price?'));
  assert.ok(step('Is config.js on the latest official price?') < step('Work out the purchase order'));
  assert.match(code, /node scripts\/official-price\.mjs --json >/);
  assert.doesNotMatch(code, /official-price\.mjs[^\n]*--write/, 'the check never writes config.js');
  assert.match(code, /status" = "new" \] \|\| \[ "\$status" = "revised"/);
  assert.match(code, /::error title=Official price is out of date::/);
  assert.match(code, /::warning title=Official price not checked::/, 'an outside failure is a warning, not a stop');
  // the warning is put in front of the order that goes to the summary and to Telegram
  assert.match(code, /cat "\$RUNNER_TEMP\/price-warning\.md" "\$RUNNER_TEMP\/order\.md" > "\$RUNNER_TEMP\/plein\.md"/);
  assert.match(code, /telegram\.mjs --ops --file "\$RUNNER_TEMP\/plein\.md"/);
});

test('the schedules are the ones the founders asked for', () => {
  const crons = (name) => [...workflow(name).matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
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
  // the plein job fires at 17:52 Paris in both clock regimes: after the week's fees reach the
  // réservoir (17:50), before the buyback opens (18:00)
  assert.deepEqual(crons('plein'), ['52 15 * * 6', '52 16 * * 6']);
  const at = (iso) => { const p = paris(Date.parse(iso)); return p.h * 100 + p.min; };
  assert.equal(at('2026-10-24T15:52:00Z'), 1752); // Saturday 24 October, summer time
  assert.equal(at('2026-10-31T16:52:00Z'), 1752); // Saturday 31 October, winter time
  assert.equal(at('2026-10-31T15:52:00Z'), 1652); // the other line is an hour early that day
  assert.match(workflow('plein'), /_gate\.mjs --hour 17 --until 18:30/);
  assert.match(workflow('audit'), /16:30 Paris/);
});
