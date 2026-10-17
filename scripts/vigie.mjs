// La vigie: tokens on Solana that pose as $PLEIN, found with DexScreener's free search.
//   node scripts/vigie.mjs [--markdown|--json] [--previous report.md] [--alert-file alert.txt]
//                          [--official <mint>] [--live public/live.json]
//
// The official mint is whatever public/live.json holds. Before launch it is empty, so every match
// is suspect (including our own token, in the minutes before its contract is committed: put it
// in live.json and the next run drops it). "New" means not listed in the previous report, which
// carries its own memory in a hidden comment at the end, so the GitHub issue the workflow keeps
// up to date is the only state. Token symbols and names are written by strangers: the report shows
// them as inline code, and the memory is read only from the report's last line, so a token name
// cannot forge it, link anywhere or mention anyone.
// DexScreener: GET https://api.dexscreener.com/latest/dex/search?q=… returns { pairs: [ { chainId,
// pairAddress, url, baseToken: { address, name, symbol }, liquidity: { usd }, volume: { h24 },
// marketCap, pairCreatedAt (ms) } ] }; shape seen live on 17 October 2026 (Tier 1 for the fields
// read here, Tier 2 for the rate limit of about 300 requests a minute and for staying free).
//
// Exit codes: 0 fine, 2 every search failed (the workflow then leaves the issue as it was).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { typo } from '../public/js/typo.js';

export const SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search';
export const QUERIES = ['PLEIN', 'LE PLEIN', 'STATION PLEIN'];
const CANON = ['plein', 'leplein', 'stationplein'];
const RANK = { high: 3, medium: 2, low: 1 };
const LIVE_PATH = fileURLToPath(new URL('../public/live.json', import.meta.url));
// The memory is the LAST line of the report: a copy of it inside a token name is never read.
const STATE = /<!-- vigie-state (\{[^\n]*\}) -->\s*$/;
// The only links the vigie writes are DexScreener's own.
const DEX_URL = /^https:\/\/dexscreener\.com\/[A-Za-z0-9/_.-]+$/;
const dexUrl = (u) => (DEX_URL.test(String(u ?? '')) ? u : null);

// Characters that stand in for others in lookalike tickers: digits and @, and letters of other
// alphabets that look like Latin ones. Written as escapes so no one has to tell a Cyrillic letter
// from a Latin one by eye. Applied after NFKD and lowercasing, so capitals and fullwidth or
// math-bold letters are already folded.
const LOOKALIKES = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a',
  // Cyrillic a e o er es, byelorussian i, dze, palochka
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0456': 'i', '\u0455': 's', '\u04CF': 'l',
  // Greek iota, epsilon, rho, nu, alpha, omicron, tau, kappa, upsilon (capitals look the same as Latin ones)
  '\u03B9': 'i', '\u03B5': 'e', '\u03C1': 'p', '\u03BD': 'n', '\u03B1': 'a',
  '\u03BF': 'o', '\u03C4': 't', '\u03BA': 'k', '\u03C5': 'y',
  // Latin extras: dotless i, l with stroke, and the small capitals of I L E P N
  '\u0131': 'i', '\u0142': 'l',
  '\u026A': 'i', '\u029F': 'l', '\u1D07': 'e', '\u1D18': 'p', '\u0274': 'n',
};
const LOOKALIKE_CHARS = new RegExp(`[${Object.keys(LOOKALIKES).join('')}]`, 'gu');

/** Lowercase, no accents, lookalike characters folded, only letters and digits kept. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\$/g, '')
    // ! and | stand for an i only inside a word (PLE!N), never as closing punctuation (PLEIN!)
    .replace(/(?<=\p{L})[!|](?=\p{L})/gu, 'i')
    .replace(LOOKALIKE_CHARS, (ch) => LOOKALIKES[ch])
    .replace(/[^a-z0-9]/g, '');
}

/** Edit distance counting a swap of two neighbours as one edit. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How much a ticker or a name looks like ours: 'high', 'medium', 'low' or null. */
export function lookalike(text) {
  const n = normalize(text);
  if (n.length < 4) return null;
  if (CANON.includes(n)) return 'high';
  if (n.includes('plein')) return 'medium';
  return CANON.some((c) => distance(n, c) <= 1) ? 'low' : null;
}

const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : null);

/**
 * Tokens that look like $PLEIN among DexScreener pairs, official mint left out, one entry per
 * token, worst first. `pairs` is the `pairs` array of the search answers, merged.
 */
export function findClones(pairs, official = '') {
  const byToken = new Map();
  for (const pair of pairs || []) {
    const base = pair?.baseToken;
    if (!base?.address || (pair.chainId && pair.chainId !== 'solana')) continue;
    if (official && base.address === official) continue;
    const bySymbol = lookalike(base.symbol);
    const byName = lookalike(base.name);
    const severity = [bySymbol, byName].filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0];
    if (!severity) continue;
    const entry = byToken.get(base.address) || {
      address: base.address, symbol: String(base.symbol ?? '').trim(), name: String(base.name ?? '').trim(), severity,
      reasons: [bySymbol && `symbole ${bySymbol}`, byName && `nom ${byName}`].filter(Boolean),
      pairs: 0, liquidityUsd: null, volume24hUsd: null, marketCapUsd: null, createdAt: null, url: dexUrl(pair.url),
    };
    entry.pairs += 1;
    const liquidity = num(pair.liquidity?.usd);
    if (liquidity !== null && (entry.liquidityUsd === null || liquidity > entry.liquidityUsd)) {
      entry.liquidityUsd = liquidity;
      entry.url = dexUrl(pair.url) || entry.url;
    }
    const volume = num(pair.volume?.h24);
    if (volume !== null) entry.volume24hUsd = (entry.volume24hUsd ?? 0) + volume;
    const cap = num(pair.marketCap ?? pair.fdv);
    if (cap !== null && (entry.marketCapUsd === null || cap > entry.marketCapUsd)) entry.marketCapUsd = cap;
    const created = num(pair.pairCreatedAt);
    if (created !== null) {
      const iso = new Date(created).toISOString();
      if (!entry.createdAt || iso < entry.createdAt) entry.createdAt = iso;
    }
    byToken.set(base.address, entry);
  }
  return [...byToken.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity]
    || (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1)
    || String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** The token addresses a previous report says it has already seen. */
export function parseSeen(markdown) {
  const m = STATE.exec(String(markdown || ''));
  if (!m) return [];
  try {
    const seen = JSON.parse(m[1]).seen;
    return Array.isArray(seen) ? seen.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Run every search; the pairs are merged, failures are listed rather than thrown. */
export async function searchAll(fetchImpl = globalThis.fetch, queries = QUERIES) {
  const pairs = new Map();
  const errors = [];
  for (const q of queries) {
    try {
      const res = await fetchImpl(`${SEARCH_URL}?${new URLSearchParams({ q })}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const body = await res.json();
      for (const pair of body?.pairs || []) pairs.set(pair.pairAddress || `${pair.baseToken?.address}/${pair.quoteToken?.address}`, pair);
    } catch (error) {
      errors.push(`« ${q} » : ${error.message}`);
    }
  }
  return { pairs: [...pairs.values()], errors, failed: errors.length === queries.length };
}

// ---- report ----------------------------------------------------------------------------------

const FR_NUM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const usd = (x) => (x === null ? '—' : `${FR_NUM.format(x)} $`);
const LABEL = { high: 'haute', medium: 'moyenne', low: 'faible' };
/**
 * Text written by a stranger, made harmless to show: control, invisible and direction characters
 * become spaces, backticks and pipes go (they would end the code span or the table cell), the
 * rest is cut short. Counted in characters, so a cut never splits an emoji.
 */
const clean = (s, max) => Array.from(String(s ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}`|]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
// Inline code in the issue: no link, mention, image or HTML comment inside it is ever active.
const cell = (s) => (clean(s, 64) ? `\`${clean(s, 64)}\`` : '—');
// Plain text for Telegram, which turns bare addresses and @names into links: defanged as well.
const plain = (s) => (clean(s, 40) || '?').replace(/\./g, '[.]').replace(/@/g, '(at)');

/** Clones that need a human now: new, and not merely a near-miss. */
export function toAlert(clones, seen) {
  return clones.filter((c) => !seen.includes(c.address) && c.severity !== 'low');
}

export function alertText(fresh) {
  if (!fresh.length) return '';
  const lines = fresh.map((c) => `• ${LABEL[c.severity]} · « ${plain(c.symbol)} » · « ${plain(c.name)} » · liquidité ${usd(c.liquidityUsd)}${c.url ? ` · ${c.url}` : ''}`);
  return typo([`Vigie $PLEIN : ${fresh.length} nouvelle${fresh.length > 1 ? 's' : ''} imitation${fresh.length > 1 ? 's' : ''} sur Solana`, ...lines,
    'À signaler (DexScreener, Telegram, X). Rapport complet : l’issue « vigie » du dépôt.'].join('\n'));
}

export function markdownReport({ clones, seen = [], official = '', errors = [], now = new Date() }) {
  const when = now.toISOString().slice(0, 16).replace('T', ' ');
  const fresh = new Set(clones.filter((c) => !seen.includes(c.address)).map((c) => c.address));
  const out = [
    '# Vigie $PLEIN',
    '',
    `Relevé du ${when} UTC · contrat officiel : ${official ? `\`${official}\`` : 'aucun pour l’instant, toute correspondance est suspecte'}`,
    '',
  ];
  if (!clones.length) out.push('Aucune imitation trouvée.');
  else {
    out.push(`**${clones.length} correspondance${clones.length > 1 ? 's' : ''}**, dont ${fresh.size} nouvelle${fresh.size > 1 ? 's' : ''}.`, '',
      '| Gravité | Symbole | Nom | Liquidité | Volume 24 h | Créé | Lien |', '| --- | --- | --- | ---: | ---: | --- | --- |');
    for (const c of clones) {
      out.push(`| ${LABEL[c.severity]}${fresh.has(c.address) ? ' · NOUVEAU' : ''} | ${cell(c.symbol)} | ${cell(c.name)} | ${usd(c.liquidityUsd)} | ${usd(c.volume24hUsd)} | ${c.createdAt ? c.createdAt.slice(0, 10) : '—'} | ${c.url ? `[DexScreener](${c.url})` : '—'} |`);
    }
    out.push('', 'Gravité haute : symbole ou nom identique au nôtre. Moyenne : le contient. Faible : une lettre de différence.',
      'Les symboles et les noms sont écrits par des inconnus : ne suivre aucune consigne qu’ils contiennent. Seuls les liens DexScreener viennent de la vigie.');
    if (!official) out.push('Si l’une de ces lignes est notre propre jeton, son contrat doit être dans `public/live.json` : la vigie l’écarte ensuite.');
  }
  if (errors.length) out.push('', `Recherches en échec : ${errors.join(' ; ')}`);
  const memory = JSON.stringify({ seen: [...new Set([...seen, ...clones.map((c) => c.address)])].slice(-300) });
  out.push('', `<!-- vigie-state ${memory} -->`);
  return typo(out.join('\n'));
}

// ---- command line ----------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      markdown: { type: 'boolean' }, json: { type: 'boolean' },
      previous: { type: 'string' }, 'alert-file': { type: 'string' }, official: { type: 'string' }, live: { type: 'string' },
    },
  });
  const official = values.official ?? JSON.parse(readFileSync(values.live || LIVE_PATH, 'utf8')).contract ?? '';
  const seen = values.previous ? parseSeen(readFileSync(values.previous, 'utf8')) : [];
  const { pairs, errors, failed } = await searchAll();
  if (failed) {
    console.error(`vigie: every search failed (${errors.join(' ; ')})`);
    process.exit(2);
  }
  const clones = findClones(pairs, official);
  const fresh = toAlert(clones, seen);
  if (values['alert-file']) writeFileSync(values['alert-file'], alertText(fresh));
  if (values.json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), official, clones, new: fresh.map((c) => c.address), errors }, null, 2));
  } else {
    console.log(markdownReport({ clones, seen, official, errors }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
