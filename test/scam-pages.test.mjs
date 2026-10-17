// T4, "les mots de l'arnaque, occupés d'avance": the scam vocabulary (/airdrop, /claim, /presale,
// /bonus, /remboursement, /v2, /migration) answers with a static page that says it does not
// exist; llms.txt tells AI assistants the same, in French and English; public/404.html catches the
// variants the exact rewrites miss (/claim/, /Claim). Offline: the dev server is started on
// localhost and nothing leaves the machine.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { isSolanaAddress } from '../public/js/mint.js';
import { MULTIPLIER, FLOOR_PCT, CEILING_PCT, AID_PCT } from '../public/js/formula.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NBSP = ' ';

const AIRDROP_PATHS = ['/airdrop', '/claim', '/presale', '/bonus', '/remboursement'];
const V2_PATHS = ['/v2', '/migration'];
const AIRDROP_PAGE = '/pas-d-airdrop.html';
const V2_PAGE = '/pas-de-v2.html';
const PAGES = [AIRDROP_PAGE, V2_PAGE];
const NOT_FOUND_PAGE = '/404.html';
const ALL_PAGES = [...PAGES, NOT_FOUND_PAGE];
const LEGAL_PAGE = '/mentions-legales.html';

const vercel = JSON.parse(read('vercel.json'));
const config = (() => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('public/config.js'), sandbox);
  return sandbox.window.PLEIN_CONFIG;
})();
const llms = read('public/llms.txt');
const html = Object.fromEntries(ALL_PAGES.map((page) => [page, read(`public${page}`)]));
const legal = read(`public${LEGAL_PAGE}`);
const live = JSON.parse(read('public/live.json'));

// ---- helpers ---------------------------------------------------------------------------------

const B58 = '1-9A-HJ-NP-Za-km-z';
const B58_RUN = new RegExp(`(?<![${B58}])[${B58}]{32,44}(?![${B58}])`, 'g');
/** Every run of 32 to 44 base58 characters: the shape of a Solana address, valid or not. */
const addressShapes = (text) => text.match(B58_RUN) ?? [];

/** The text a reader sees: comments, styles, scripts and tags removed, entities decoded. */
function visibleText(page) {
  return page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]*>/g, '')
    .replaceAll('&nbsp;', NBSP)
    .replaceAll('&amp;', '&');
}

/** French typography: no plain space before : ; ! ? % € » and none after «. */
function typographyFaults(text) {
  const faults = [];
  for (const m of text.matchAll(/ [:;!?%€»]|« /g)) {
    faults.push(`"${text.slice(Math.max(0, m.index - 20), m.index + 3).replace(/\s+/g, ' ')}"`);
  }
  return faults;
}

/** The paragraphs of a page, as source with comments removed, to ask what one sentence links to. */
const paragraphs = (page) => [...page.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);

/** Width and height in the PNG header (IHDR), so a meta tag can be checked against the file. */
function pngSize(path) {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${path} is a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Once config.siteUrl is set, the two pages and llms.txt must name it: a lookalike site can copy
 * these words and vouch for its own live.json. Returns the names of the files that do not.
 */
const missingDomain = (siteUrl, files) => {
  const domain = String(siteUrl || '').trim().replace(/\/+$/, '');
  return domain ? Object.entries(files).filter(([, text]) => !text.includes(domain)).map(([name]) => name) : [];
};

const hrefs = (page) => [...page.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
const sameOrigin = (url) => url.startsWith('/') || url.startsWith('#');

// ---- vercel.json -----------------------------------------------------------------------------

test('the seven scam paths are rewrites to a static page that exists, not redirects', () => {
  const wanted = new Map([
    ...AIRDROP_PATHS.map((path) => [path, AIRDROP_PAGE]),
    ...V2_PATHS.map((path) => [path, V2_PAGE]),
  ]);
  assert.ok(Array.isArray(vercel.rewrites), 'vercel.json has a rewrites list');
  for (const [source, destination] of wanted) {
    const hits = vercel.rewrites.filter((r) => r.source === source);
    assert.equal(hits.length, 1, `${source} has exactly one rewrite`);
    assert.equal(hits[0].destination, destination, `${source} goes to ${destination}`);
    assert.ok(existsSync(new URL(`../public${destination}`, import.meta.url)), `public${destination} exists`);
    assert.ok(!existsSync(new URL(`../public${source}`, import.meta.url)), `no file shadows ${source} (the filesystem wins over a rewrite)`);
  }
  assert.equal(vercel.rewrites.length, wanted.size, 'no other rewrite hides in the list');
  // a redirect would replace the scammer's path in the address bar with ours
  const redirected = (vercel.redirects ?? []).map((r) => r.source);
  for (const source of wanted.keys()) assert.ok(!redirected.includes(source), `${source} is not redirected`);
});

test('every setting vercel.json had before T4 is still there', () => {
  assert.equal(vercel.framework, null);
  assert.equal(vercel.outputDirectory, 'public');
  assert.deepEqual(vercel.functions['api/chain.js'], { includeFiles: 'public/live.json', maxDuration: 30 });
  const headerFor = (source) => vercel.headers.find((h) => h.source === source)?.headers ?? [];
  const value = (source, key) => headerFor(source).find((h) => h.key === key)?.value;
  assert.equal(value('/live.json', 'Cache-Control'), 'no-store, max-age=0');
  assert.equal(value('/config.js', 'Cache-Control'), 'no-cache');
  assert.equal(value('/fonts/(.*)', 'Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(value('/(.*)', 'X-Content-Type-Options'), 'nosniff');
  assert.equal(value('/(.*)', 'X-Frame-Options'), 'DENY');
  assert.equal(value('/(.*)', 'Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.match(value('/(.*)', 'Permissions-Policy'), /camera=\(\)/);
});

test('llms.txt is served as plain text', () => {
  const entry = vercel.headers.find((h) => h.source === '/llms.txt');
  assert.ok(entry, 'a header rule for /llms.txt');
  const type = entry.headers.find((h) => h.key === 'Content-Type')?.value;
  assert.match(type, /^text\/plain(;|$)/);
});

// ---- the two pages ---------------------------------------------------------------------------

test('the airdrop page says there is none, in the station\'s words', () => {
  const text = visibleText(html[AIRDROP_PAGE]).replaceAll(NBSP, ' ');
  assert.match(text, /Il n’y a pas d’airdrop \$PLEIN\. Il n’y en aura pas\. Un lien qui t’en promet un veut vider ton wallet\./);
  assert.match(text, /ne sera jamais convertie en jetons/);
  assert.match(text, /Le seul contrat de \$PLEIN est celui affiché sur la page d’accueil/);
  // one section per word the scammers sell
  for (const word of ['Airdrop', 'Claim', 'Presale', 'Bonus du Plein', 'Remboursement', 'V2, migration']) {
    assert.ok(text.includes(word), `the page answers "${word}"`);
  }
  assert.match(text, /deuxième arnaque/);
});

test('the airdrop page speaks plainly: no memo voice, no repeated line', () => {
  const text = visibleText(html[AIRDROP_PAGE]).replaceAll(NBSP, ' ');
  assert.match(text, /Ni pour un post, ni pour ceux qui détiennent : la station n’envoie de jetons à personne\./);
  assert.ok(!/Les deux, c’est non|c’est lié à la détention|c’est de la promotion payée/.test(text), 'the legal reasoning stays in the docs');
  assert.match(text, /Un vrai airdrop \$PLEIN, ça n’existe pas\. Celui qu’on te montre est faux\./);
  assert.equal(text.split('Un lien qui t’en promet').length - 1, 1, 'the chapo line is said once');
  assert.ok(!/Des jetons gratuits/.test(text), 'the old formula that repeated the chapo is gone');
  assert.equal(text.split('ne sera jamais convertie en jetons').length - 1, 1);
  assert.equal(text.split('n’en envoie pas aux visiteurs').length - 1, 1, 'the buyback sends no tokens: said once, under « Bonus du Plein »');
});

test('the warning box names the other page: it is read on the station\'s own page', () => {
  for (const page of PAGES) {
    const text = visibleText(html[page]).replaceAll(NBSP, ' ');
    assert.match(text, /Un lien ou un message t’a promis (des jetons|une V2) \? Sur sa page :/, `${page}: the box says whose page`);
    assert.match(text, /Ferme sa page et ne réponds pas\./, page);
    assert.ok(!/Ferme l’onglet/.test(text), `${page}: never "close the tab" on the station's own page`);
    assert.ok(!/à lire avant de cliquer/.test(text), `${page}: the kicker is not for someone who already clicked`);
  }
  assert.match(visibleText(html[AIRDROP_PAGE]), /ferme la page du lien, c’est fini/);
});

test('both pages hand the visitor the address checker of the home page', () => {
  const index = read('public/index.html');
  assert.ok(index.includes('id="verif"'), 'the home page has the checker');
  assert.match(index, /On compare l’adresse au seul contrat officiel\. Rien n’est envoyé\./, 'the checker does what the pages say');
  for (const page of PAGES) {
    assert.ok(hrefs(html[page]).includes('/#verif'), `${page} links /#verif`);
    const text = visibleText(html[page]).replaceAll(NBSP, ' ');
    assert.match(text, /Colle l’adresse qu’on t’a donnée dans le vérificateur de la station : il la compare au seul contrat officiel, sans rien envoyer\./);
  }
});

test('the reporting sentence never leads to an empty bracket', () => {
  const bracket = /Pour signaler une imitation(?:&nbsp;| )?: <span class="todo">/.test(legal);
  const reporting = paragraphs(html[AIRDROP_PAGE]).filter((p) => /signaler/.test(p));
  assert.equal(reporting.length, 1, 'the airdrop page tells a victim how to report');
  if (bracket) {
    assert.ok(!reporting[0].includes('mentions-legales.html'), 'the legal notice still has [adresse e-mail]: do not send a victim there');
    assert.match(visibleText(reporting[0]), /outil de signalement de la plateforme où tu l’as vue/);
  }
});

test('the V2 page says there is none and that the migration asks nothing', () => {
  const text = visibleText(html[V2_PAGE]).replaceAll(NBSP, ' ');
  assert.match(text, /Il n’y a pas de V2 de \$PLEIN\. Une « V2 » ou un « nouveau contrat » annoncé ailleurs que sur ce site est faux\./);
  assert.match(text, /La migration sur pump\.fun ne te demande rien\./);
  assert.match(text, /Le seul contrat est celui du site\./);
  assert.match(text, /Il n’y a pas d’airdrop \$PLEIN/, 'the V2 page still carries the airdrop line');
  assert.ok(!/jamais de V2|jamais de nouveau contrat/i.test(text), 'no promise forever: only the founders can make that one');
  assert.ok(!/n’est prévue/.test(text), 'no hedge a scammer can answer with "now it is planned"');
});

test('the pages are true before and after the opening at 15:30', () => {
  // the pages go live before the opening: nothing may say the coin was launched or already trades
  for (const [name, source] of [...PAGES.map((page) => [page, html[page]]), ['/llms.txt', llms]]) {
    const text = visibleText(source).replaceAll(NBSP, ' ');
    assert.ok(!/est lancé sur pump\.fun|lancé sur pump\.fun le|launched on pump\.fun/.test(text), `${name} does not state the launch in the past tense`);
  }
  assert.match(visibleText(html[V2_PAGE]), /\$PLEIN s’échange sur pump\.fun à partir de l’ouverture\./);
});

test('the pages use the site look, no script, and call nothing outside the domain', () => {
  for (const page of ALL_PAGES) {
    const source = html[page];
    assert.match(source, /<html lang="fr">/);
    assert.match(source, /<meta name="viewport" content="width=device-width, initial-scale=1/);
    assert.match(source, /<link rel="stylesheet" href="\/css\/page\.css">/);
    assert.match(source, /<title>[^<]+· Station \$PLEIN<\/title>/);
    assert.ok(!/<script/i.test(source), `${page} has no script`);
    assert.ok(!/ style="[^"]*url\(/.test(source), `${page} loads nothing from a style`);
    for (const url of hrefs(source)) assert.ok(sameOrigin(url), `${page}: ${url} stays on the site`);
  }
});

test('every link on the pages lands on a file that exists', () => {
  const index = read('public/index.html');
  for (const page of ALL_PAGES) {
    for (const url of hrefs(html[page])) {
      const [path, fragment] = url.split('#');
      const file = path === '/' || path === '' ? 'public/index.html' : `public${path}`;
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${page}: ${url} -> ${file}`);
      if (fragment) assert.ok(index.includes(`id="${fragment}"`) && file === 'public/index.html', `${page}: #${fragment} is an anchor of the home page`);
    }
  }
});

test('the pages keep French typography', () => {
  for (const page of ALL_PAGES) {
    assert.deepEqual(typographyFaults(visibleText(html[page])), [], `${page}: plain space before high punctuation or after «`);
  }
});

// ---- link previews: the pages are posted as replies under scam posts -------------------------

test('the two pages carry a full link preview: card type, image with its size, and what it shows', () => {
  const generic = pngSize('public/og.png'); // the dedicated "pas d'airdrop" card is still to come
  for (const page of PAGES) {
    const source = html[page];
    assert.match(source, /<meta name="twitter:card" content="summary_large_image">/, `${page} has a twitter:card`);
    const image = source.match(/<meta property="og:image" content="([^"]+)">/)?.[1];
    assert.ok(image, `${page} has an og:image`);
    assert.ok(/^https:\/\//.test(image) || existsSync(new URL(`../public${image}`, import.meta.url)), `${page}: ${image} exists`);
    if (image === '/og.png') {
      assert.equal(Number(source.match(/og:image:width" content="(\d+)"/)?.[1]), generic.width, `${page}: og:image:width is the file's`);
      assert.equal(Number(source.match(/og:image:height" content="(\d+)"/)?.[1]), generic.height, `${page}: og:image:height is the file's`);
    }
    assert.match(source, /<meta property="og:image:alt" content="[^"]{20,}">/, `${page} describes its image`);
    assert.match(source, /<meta property="og:title" content="Pas d(e|’)/, `${page}: the preview title says "no"`);
  }
});

// ---- the domain, once there is one -----------------------------------------------------------

test('once config.siteUrl is set, both pages and llms.txt name it (a lookalike site copies the words)', () => {
  // the check itself, with a made-up domain on the reserved .test TLD
  const files = { a: 'Le seul site est https://station.test', b: 'rien ici', c: 'https://station.test/' };
  assert.deepEqual(missingDomain('', files), [], 'nothing to check while there is no domain');
  assert.deepEqual(missingDomain('https://station.test', files), ['b']);
  assert.deepEqual(missingDomain('https://station.test/', files), ['b'], 'a trailing slash is ignored');
  // the real files
  const real = { [AIRDROP_PAGE]: html[AIRDROP_PAGE], [V2_PAGE]: html[V2_PAGE], '/llms.txt': llms };
  assert.deepEqual(missingDomain(config.siteUrl, real), [],
    `config.siteUrl is set (${config.siteUrl}): write "Le seul site de la station est ..." in section 4 of the airdrop page, section 2 of the V2 page, and in llms.txt (both languages)`);
});

// ---- the 404 page ----------------------------------------------------------------------------

test('the 404 page answers a scam path the exact rewrites miss', () => {
  const source = html[NOT_FOUND_PAGE];
  const text = visibleText(source).replaceAll(NBSP, ' ');
  assert.match(source, /<meta name="robots" content="noindex">/, 'a 404 is not indexed');
  assert.match(text, /Page introuvable/);
  assert.match(text, /Si on t’a promis un airdrop, un remboursement ou une V2 : il n’y en a pas\./);
  for (const target of [AIRDROP_PAGE, V2_PAGE, '/']) assert.ok(hrefs(source).includes(target), `links ${target}`);
  for (const url of hrefs(source)) assert.ok(url.startsWith('/'), `${url}: absolute, the page is served at any depth`);
  assert.ok(!existsSync(new URL('../public/claim', import.meta.url)), 'no file shadows a scam path');
});

// ---- no address anywhere ---------------------------------------------------------------------

test('the detector sees an address (so a clean result means something)', () => {
  const usdc = config.jupiter.inputMint; // a public mint, 44 characters
  assert.ok(isSolanaAddress(usdc));
  assert.deepEqual(addressShapes(`Contrat : ${usdc}.`), [usdc]);
  assert.deepEqual(addressShapes('1'.repeat(32)), ['1'.repeat(32)]);
  assert.deepEqual(addressShapes('fiche-plein.html /tickets/index.json'), []);
});

test('no page and not llms.txt holds a base58 address', () => {
  for (const [name, text] of [...ALL_PAGES.map((page) => [page, html[page]]), ['/llms.txt', llms]]) {
    assert.deepEqual(addressShapes(text), [], `${name} holds no address-shaped text`);
    for (const run of addressShapes(text)) assert.ok(!isSolanaAddress(run), `${name}: ${run}`);
  }
});

// ---- llms.txt --------------------------------------------------------------------------------

const [english, french] = llms.split(/^---$/m);

test('llms.txt has an English part and a French part, and links the live files in both', () => {
  assert.ok(!llms.startsWith('﻿'), 'no byte order mark');
  assert.match(english, /^# Station \$PLEIN\n/);
  assert.match(french, /\n# Station \$PLEIN \(français\)\n/);
  const wanted = ['/live.json', '/fiche-plein.html', '/tickets/index.json', '/api/chain', AIRDROP_PAGE, V2_PAGE];
  for (const [language, part] of [['English', english], ['French', french]]) {
    for (const path of wanted) assert.ok(part.includes(`](${path})`), `${language} part links ${path}`);
  }
});

test('every link in llms.txt points at something the site serves', () => {
  const targets = new Set([...llms.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]));
  assert.ok(targets.size >= 6);
  for (const target of targets) {
    const file = target === '/' ? 'public/index.html' : target.startsWith('/api/') ? `api/${target.slice(5)}.js` : `public${target}`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${target} -> ${file}`);
  }
});

test('the rule in llms.txt is the formula in public/js/formula.js', () => {
  assert.ok(english.includes(`= ${MULTIPLIER} x the official weekly national average diesel price`));
  assert.ok(english.includes(`kept between ${FLOOR_PCT}% and ${CEILING_PCT}%`));
  assert.ok(english.includes(`Food aid = ${AID_PCT}% of the week's fees`));
  assert.ok(french.includes(`= ${MULTIPLIER}${NBSP}× le prix national moyen hebdomadaire officiel du gazole`));
  assert.ok(french.includes(`entre ${FLOOR_PCT}${NBSP}% et ${CEILING_PCT}${NBSP}%`));
  assert.ok(french.includes(`Aide alimentaire = ${AID_PCT}${NBSP}% des frais de la semaine`));
});

test('the dates in llms.txt are the ones in config.js', () => {
  const day = (iso, locale) => new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  const hour = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  assert.ok(english.includes(`Saturday ${day(config.launchAt, 'en-GB')} at ${hour(config.launchAt)}`), 'launch date and time');
  assert.ok(english.includes(`starting on ${day(config.firstPleinAt, 'en-GB')}`), 'first plein');
  assert.ok(english.includes(`Plein #1 is Saturday ${day(config.firstPleinAt, 'en-GB')} at ${hour(config.firstPleinAt)}`));
  assert.ok(french.includes(`samedi ${day(config.launchAt, 'fr-FR')} à ${hour(config.launchAt)}`));
  assert.ok(french.includes(`à partir du ${day(config.firstPleinAt, 'fr-FR')}`));
  assert.ok(french.includes(`samedi ${day(config.firstPleinAt, 'fr-FR')} à ${hour(config.firstPleinAt)}`));
});

test('llms.txt tells assistants what the station never does', () => {
  for (const part of [english, french]) {
    assert.match(part, /\/live\.json/);
    assert.match(part, /\/pas-d-airdrop\.html/);
  }
  assert.match(english, /There is no \$PLEIN airdrop and there will not be one/);
  assert.match(english, /never asks for a seed phrase/);
  assert.match(english, /do not tell anyone to buy, sell or hold it/);
  assert.match(french, /Il n’y a pas d’airdrop \$PLEIN et il n’y en aura pas/);
  assert.match(french, /ne demande jamais une phrase de récupération/);
  assert.ok(!/jamais de V2|never be a V2|never a V2/i.test(llms), 'no promise forever about a V2');
});

test('llms.txt is true before and after the opening, and says no more than the legal notice', () => {
  const fr = french.replaceAll(NBSP, ' ');
  for (const part of [english, french]) {
    assert.ok(!/launched on pump\.fun|lancé sur pump\.fun/.test(part), 'no past-tense launch: the file is read before 15:30 and cached after');
  }
  assert.match(english, /a Solana memecoin on pump\.fun whose opening is set for Saturday/);
  assert.match(fr, /un memecoin Solana dont l’ouverture sur pump\.fun est fixée au samedi/);
  // mentions-legales.html claims "aucun traceur publicitaire", and the card sits in local storage
  assert.match(legal, /aucun cookie et n’utilise aucun traceur publicitaire/);
  assert.match(english, /sets no cookies and no advertising tracker; the loyalty card, once a visitor takes it, is kept in the browser's local storage and never sent to the station/);
  assert.match(fr, /ne dépose aucun cookie ni traceur publicitaire ; la carte de fidélité, une fois prise, reste dans le stockage local du navigateur et n’est jamais envoyée à la station/);
  assert.ok(!/uses no trackers|n’utilise aucun traceur\./.test(llms), 'no blanket "no trackers": that is the lawyer\'s call');
  assert.ok(read('public/js/carte.js').includes('plein.carte'), 'the card really is in local storage');
});

test('llms.txt does not invent a holder count', () => {
  const fr = french.replaceAll(NBSP, ' ');
  assert.match(english, /share held by the ten largest wallets \(holders\.top10Pct\); no holder count is published/);
  assert.match(fr, /part des dix plus gros wallets \(holders\.top10Pct\) : aucun nombre de détenteurs n’est publié/);
  assert.ok(!/Price, holders,|le cours, les détenteurs,/i.test(llms), 'holders are not listed as a number the API gives');
  // the claim holds against the data it describes
  assert.ok(!('holders' in live.dashboard), 'live.json has no holder count');
  assert.match(read('docs/interfaces.md'), /"holders": \{\s*"top10Pct"/, 'docs/interfaces.md: /api/chain gives top10Pct, not a count');
});

test('llms.txt says what is certain about a V2, and no more', () => {
  const fr = french.replaceAll(NBSP, ' ');
  assert.match(english, /no V2: a V2 or a new contract announced anywhere but on the site is fake/);
  assert.match(fr, /pas de V2 : une « V2 » ou un « nouveau contrat » annoncé ailleurs que sur le site est faux/);
  assert.ok(!/none is planned|n’est prévue/.test(llms), 'no hedge');
});

test('the French part of llms.txt keeps French typography', () => {
  assert.deepEqual(typographyFaults(french), []);
  assert.ok(french.includes(`${NBSP}:`) && french.includes(`«${NBSP}`), 'the no-break spaces are really there');
});

// ---- the dev server answers the same paths ---------------------------------------------------

describe('the dev server', () => {
  let server;
  let base;
  const logs = [];

  before(async () => {
    const port = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const { port: free } = probe.address();
        probe.close(() => resolve(free));
      });
    });
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`dev server did not start: ${logs.join('')}`)), 10000);
      const onData = (chunk) => {
        logs.push(String(chunk));
        if (logs.join('').includes('http://localhost')) { clearTimeout(timer); resolve(); }
      };
      server.stdout.on('data', onData);
      server.stderr.on('data', (chunk) => logs.push(String(chunk)));
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error(`dev server exited early (${code}): ${logs.join('')}`)));
    });
  });

  after(() => { server?.kill(); });

  test('the dev server rewrites the seven paths and keeps them unchanged', async () => {
    for (const [paths, page] of [[AIRDROP_PATHS, AIRDROP_PAGE], [V2_PATHS, V2_PAGE]]) {
      for (const path of paths) {
        const response = await fetch(`${base}${path}`, { redirect: 'manual' });
        assert.equal(response.status, 200, `${path} answers 200, not a redirect`);
        assert.match(response.headers.get('content-type'), /^text\/html/);
        assert.equal(await response.text(), html[page], `${path} serves ${page}`);
      }
    }
  });

  test('the dev server answers a path that matches nothing with the 404 page', async () => {
    for (const path of ['/claim/', '/Claim', '/Airdrop', '/claim-plein', '/v3', '/pas-d-airdrop']) {
      const response = await fetch(`${base}${path}`, { redirect: 'manual' });
      assert.equal(response.status, 404, `${path} is a 404, not a redirect`);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      assert.equal(await response.text(), html[NOT_FOUND_PAGE], `${path} serves the 404 page`);
    }
  });

  test('the dev server leaves other paths alone', async () => {
    assert.equal((await fetch(`${base}/claim-your-tokens`)).status, 404);
    assert.equal((await fetch(`${base}/airdrop.html`)).status, 404);
    const direct = await fetch(`${base}${AIRDROP_PAGE}`);
    assert.equal(direct.status, 200);
    assert.equal((await fetch(`${base}/live.json`)).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
  });

  test('the dev server serves llms.txt as plain text, unchanged', async () => {
    const response = await fetch(`${base}/llms.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(await response.text(), llms);
  });
});
