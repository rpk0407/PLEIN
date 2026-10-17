// The latest official weekly national average price of diesel (gazole, all taxes included),
// read from the ministry's own price table, and optionally written into public/config.js.
//   node scripts/official-price.mjs [--json] [--write] [--config <path>] [--file <table.xlsx>]
//
// Source: DGEC, "Prix des produits pétroliers" page on ecologie.gouv.fr. It offers the weekly
// note (NPG-YYYY.MM.DD.pdf, but those pages are raster images, so no text to read) and a
// spreadsheet, "Prix HTT et TTC depuis janvier 2020.xlsx", with one row per Friday, refreshed
// every Monday. The spreadsheet is the machine-readable one; its sheet "Carburants routiers"
// has the all-taxes Gazole column. Read on 17 October 2026: 9 Oct 2026 = 2.3283 (Tier 1 for
// that figure; the page layout and file name can change, Tier 2 going forward, which is why
// the script finds the link on the page first and fails loudly when the shape is not the one
// below). Reads and writes one local file; signs and sends nothing.
//
// Exit codes: 0 fine (also "nothing new"), 1 the data is invalid or older than config.js,
// 2 the ministry's site could not be read.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buybackPct, frNumber } from '../public/js/formula.js';
import { typo } from '../public/js/typo.js';

export const PAGE_URL = 'https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers';
export const TABLE_URL = 'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_0.xlsx';
const CONFIG_PATH = fileURLToPath(new URL('../public/config.js', import.meta.url));

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- reading the spreadsheet with built-ins only -------------------------------------------

/** The files of a zip archive as a Map(name → Buffer). Reads the central directory. */
export function unzip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('not a zip file');
  const count = buffer.readUInt16LE(end + 10);
  let p = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('broken zip directory');
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const raw = buffer.subarray(dataStart, dataStart + size);
    if (method !== 0 && method !== 8) throw new Error(`zip method ${method} is not supported`);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => decodeXml([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * The road-fuel sheet of the ministry's workbook as tab-separated text, one line per row, cells
 * in column order (strings resolved, numbers as stored: dates stay Excel day numbers).
 */
export function xlsxToTsv(buffer) {
  const files = unzip(buffer);
  const text = (name) => (files.has(name) ? files.get(name).toString('utf8') : '');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  // the sheet called "Carburants routiers", else the first one
  const sheets = [...text('xl/workbook.xml').matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)];
  const wanted = sheets.find((s) => /routiers/i.test(decodeXml(s[1]))) || sheets[0];
  let target = 'worksheets/sheet1.xml';
  if (wanted) {
    const rel = text('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship [^>]*Id="${wanted[2]}"[^>]*>`));
    const to = rel && rel[0].match(/Target="([^"]*)"/);
    if (to) target = to[1].replace(/^\/?(xl\/)?/, '');
  }
  const sheet = text(`xl/${target}`);
  if (!sheet) throw new Error('the road-fuel sheet is missing from the workbook');
  const lines = [];
  for (const row of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3] || '';
      const v = body.match(/<v>([\s\S]*?)<\/v>/);
      let value = '';
      if (/t="s"/.test(c[2]) && v) value = shared[Number(v[1])] ?? '';
      else if (/t="inlineStr"/.test(c[2])) value = textOf(body);
      else if (v) value = decodeXml(v[1]);
      cells[colIndex(c[1])] = value.replace(/[\t\r\n]+/g, ' ');
    }
    lines.push(Array.from(cells, (x) => x ?? '').join('\t'));
  }
  return lines.join('\n');
}

// ---- reading the weekly rows ---------------------------------------------------------------

const serialToIso = (serial) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);

/** "9 oct." from 2026-10-09. */
export function weekLabel(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
/** "Relevé hebdomadaire officiel du 9 octobre 2026" from 2026-10-09. */
export function sourceSentence(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `Relevé hebdomadaire officiel du ${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
}
/** The ISO date inside a French sentence like the one above, or null. */
export function parseFrenchDate(sentence) {
  const m = String(sentence).toLowerCase().match(/(\d{1,2})(?:er)? ([a-zéûô]+) (\d{4})/);
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  if (!m || month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Latest weekly diesel price (all taxes) in the table text from xlsxToTsv().
 * Returns { price, date, weekLabel, source, rows } or throws when the table is not the one we know.
 */
export function parseOfficial(text) {
  const rows = String(text).split('\n').map((line) => line.split('\t'));
  const head = rows.findIndex((r, i) => i < 6 && r.some((c) => c.trim() === 'Date'));
  if (head < 0) throw new Error('no "Date" header row in the price table');
  // the all-taxes block starts at the cell that says T.T.C.; its Gazole column is the first one after
  const ttc = rows.slice(0, head).flatMap((r) => r.map((c, i) => (/T\.?T\.?C/i.test(c) ? i : -1))).find((i) => i >= 0);
  if (ttc === undefined) throw new Error('no all-taxes (T.T.C.) block in the price table');
  const col = rows[head].findIndex((c, i) => i >= ttc && c.trim().toLowerCase() === 'gazole');
  if (col < 0) throw new Error('no Gazole column in the all-taxes block');

  // the weekly rows follow the header; the first row with a text label starts the monthly averages
  const weekly = [];
  for (const r of rows.slice(head + 1)) {
    const first = (r[0] ?? '').trim();
    if (first === '') continue;
    const serial = Number(first);
    if (!Number.isFinite(serial)) break;
    const price = Number((r[col] ?? '').replace(',', '.'));
    if (serial > 40000 && serial < 80000 && Number.isFinite(price) && price > 0) weekly.push({ serial, price });
  }
  if (!weekly.length) throw new Error('no weekly diesel rows in the price table');
  const latest = weekly.reduce((a, b) => (b.serial > a.serial ? b : a));
  const price = Math.round(latest.price * 10000) / 10000;
  if (!(price >= 1 && price <= 4)) throw new Error(`diesel price ${price} €/L is outside the sane band (1 to 4)`);
  const date = serialToIso(latest.serial);
  return { price, date, weekLabel: weekLabel(date), source: sourceSentence(date), rows: weekly.length };
}

/** The price-table link on the ministry's page, absolute, or null. */
export function findTableUrl(html) {
  const m = String(html).match(/href="([^"]*Prix(?:%20|\s|\+)HTT[^"]*\.xlsx[^"]*)"/i);
  return m ? new URL(m[1].replace(/&amp;/g, '&'), PAGE_URL).href : null;
}
/** Where the weekly note for a Friday lives (a PDF of images: for a human to cross-check). */
export const noteUrl = (iso) => `https://www.ecologie.gouv.fr/sites/default/files/documents/NPG-${iso.replace(/-/g, '.')}.pdf`;

// ---- writing config.js ---------------------------------------------------------------------

/** Read window.PLEIN_CONFIG out of the config file's text. */
export function loadConfig(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  // copied here so the object has this realm's prototypes (the vm context has its own)
  return structuredClone(sandbox.window.PLEIN_CONFIG);
}

const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const enDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS_EN[m - 1]} ${y}`; };

/**
 * New text for config.js with only the official block changed: the three values and the dated
 * comment line(s) that sit directly above it. Everything else is left byte for byte.
 */
export function updateConfig(source, next, previous = null) {
  const block = /^([ \t]*)official:\s*\{[^}]*\},?[ \t]*(?=\r?$)/m.exec(source);
  const eol = source.includes('\r\n') ? '\r\n' : '\n'; // config.js may be checked out with CRLF
  if (!block) throw new Error('no "official: { … }" block found in config.js');
  const indent = block[1];
  const comment = [`${indent}// ${enDate(next.date)} survey: ${next.price} €/L, read from the ministry's weekly price table`
    + ' by scripts/official-price.mjs.'];
  if (previous) comment.push(`${indent}// Previous survey${previous.date ? ` (${enDate(previous.date)})` : ''}: ${previous.gazole}.`);
  const replacement = [
    ...comment,
    `${indent}official: {`,
    `${indent}  gazole: ${next.price},`,
    `${indent}  weekLabel: ${quote(next.weekLabel)},`,
    `${indent}  source: ${quote(next.source)},`,
    `${indent}},`,
  ].join(eol);

  // the dated lines above the block: from the first "// <date> survey" comment down to it
  const before = source.slice(0, block.index);
  const lines = before.split('\n');
  let start = lines.length - 1; // lines[start] is the (empty) start of the block's own line
  let first = -1;
  for (let i = lines.length - 2; i >= 0 && /^\s*\/\//.test(lines[i]); i -= 1) {
    if (/^\s*\/\/ \d{1,2} \p{L}+ \d{4} survey/u.test(lines[i])) first = i;
  }
  if (first >= 0) start = first;
  const kept = lines.slice(0, start).join('\n');
  const head = start === 0 ? '' : `${kept}\n`;
  return head + replacement + source.slice(block.index + block[0].length);
}

/**
 * The sentence for the founders' ops chat when the survey is new or revised (French, typeset). It
 * ends with the call to open the pull request: the workflow adds the link on the next line.
 */
export function opsMessage({ status, price, weekLabel: week, ratePct, current, warnings = [] }) {
  const head = status === 'revised' ? 'Relevé officiel révisé' : 'Nouveau relevé officiel';
  return typo([
    `${head} : gazole ${frNumber(price, 4)} €/L (${week}), config.js a ${frNumber(current.gazole, 4)} (${current.weekLabel}).`,
    `Taux de rachat : ${frNumber(ratePct, 1)} % (avant : ${frNumber(current.ratePct, 1)} %).`,
    warnings.length ? 'Avertissement : voir la PR.' : null,
    'Vérifier le chiffre sur la note hebdomadaire, puis ouvrir la PR en un clic :',
  ].filter(Boolean).join(' '));
}

// ---- command line --------------------------------------------------------------------------

async function get(url, as = 'text') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'station-plein-price-check (read only)' } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadTable(file) {
  if (file) return { buffer: readFileSync(file), url: file };
  let url = TABLE_URL;
  try { url = findTableUrl(await get(PAGE_URL)) || TABLE_URL; } catch { /* use the known link */ }
  return { buffer: await get(url, 'buffer'), url };
}

async function main() {
  const { values } = parseArgs({
    options: { json: { type: 'boolean' }, write: { type: 'boolean' }, config: { type: 'string' }, file: { type: 'string' } },
  });
  const configPath = values.config || CONFIG_PATH;
  const configText = readFileSync(configPath, 'utf8');
  const current = loadConfig(configText).official;
  const currentDate = parseFrenchDate(current.source);

  let found;
  let url;
  try {
    const table = await loadTable(values.file);
    url = table.url;
    found = parseOfficial(xlsxToTsv(table.buffer));
  } catch (error) {
    const unreadable = /answered|fetch failed|aborted|ENOTFOUND|ECONN|ETIMEDOUT/i.test(`${error.message} ${error.cause?.code || ''}`);
    console.error(`official price: ${error.message}`);
    process.exit(unreadable ? 2 : 1);
  }

  const warnings = [];
  if (currentDate && found.date < currentDate) {
    console.error(`official price: the table's latest row (${found.date}) is older than config.js (${currentDate})`);
    process.exit(1);
  }
  const status = !currentDate || found.date > currentDate ? 'new'
    : found.price === current.gazole ? 'unchanged' : 'revised';
  if (Math.abs(found.price - current.gazole) / current.gazole > 0.1) warnings.push('the price moved by more than 10 % in one week: check the table by hand');
  if ((Date.now() - Date.parse(found.date)) / 86400000 > 21) warnings.push('the latest row is more than three weeks old');

  const result = {
    ...found, url, noteUrl: noteUrl(found.date), status, warnings,
    ratePct: buybackPct(found.price),
    current: { gazole: current.gazole, weekLabel: current.weekLabel, source: current.source, ratePct: buybackPct(current.gazole) },
    written: false,
  };
  result.opsMessage = opsMessage(result);
  if (values.write && status !== 'unchanged') {
    writeFileSync(configPath, updateConfig(configText, found, { gazole: current.gazole, date: currentDate }));
    result.written = true;
  }

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const fr = (n, d) => n.toFixed(d).replace('.', ',');
  console.log(`Diesel, official weekly average (${found.source}): ${fr(found.price, 4)} €/L → buyback ${fr(result.ratePct, 1)} %`);
  console.log(`config.js has ${fr(current.gazole, 4)} (${current.weekLabel}) → ${status}${result.written ? ', config.js updated' : ''}`);
  console.log(`table: ${url}\nweekly note to cross-check: ${result.noteUrl}`);
  for (const w of warnings) console.log(`warning: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
