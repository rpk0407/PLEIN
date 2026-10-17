// The fact sheet and the legal notice: the fee tables are pinned to what pump.fun published, the
// dates the script prints are right, and the two pages keep French typography.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { frWhen, frDay, quoteAsset, coinUrl, nextReadDelay, planSlots, paint } from '../public/js/fiche.js';
import { parisInstant } from '../public/js/clock.js';
import { TIERS, CURVE, NON_CANONICAL, PLATFORM_FEE_PCT, PLATFORM_FEE_REFERRAL_PCT, GRADUATION_COST_SOL } from '../public/js/fees.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fiche = read('public/fiche-plein.html');
const mentions = read('public/mentions-legales.html');
const config = (() => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('public/config.js'), sandbox);
  return sandbox.window.PLEIN_CONFIG;
})();

// pump.fun/docs/fees, read on 17 October 2026 (Tier 2 until the first ticket shows them on-chain).
// [from, to, creator %, protocol %, liquidity %] of the canonical pool, by market cap.
const tiers = (bounds, creators, first) => creators.map((c, i) => [
  bounds[i], bounds[i + 1] ?? Infinity, c, ...(i === 0 ? first : [0.05, 0.20]),
]);
const PUBLISHED = {
  USDC: tiers(
    [0, 59000, 300000, 500000, 700000, 900000, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6, 8e6, 9e6, 10e6, 11e6, 12e6, 13e6, 14e6, 15e6, 16e6, 17e6, 18e6, 19e6, 20e6],
    [0.30, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.28, 0.25, 0.23, 0.20, 0.18, 0.15, 0.13, 0.10, 0.08, 0.05],
    [0.93, 0.02],
  ),
  SOL: tiers(
    [0, 420, 1470, 2460, 3440, 4420, 9820, 14740, 19650, 24560, 29470, 34380, 39300, 44210, 49120, 54030, 58940, 63860, 68770, 73681, 78590, 83500, 88400, 93330, 98240],
    [0.30, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.275, 0.25, 0.225, 0.20, 0.175, 0.15, 0.125, 0.10, 0.075, 0.05],
    [0.93, 0.02],
  ),
};

const thousandths = (x) => Math.round(x * 1000);
const plain = (html) => html.replaceAll('&nbsp;', ' ');
const number = (text) => Number(plain(text).replace(/[^\d,]/g, '').replace(',', '.'));

function printedTiers(quote) {
  const block = fiche.match(new RegExp(`<div data-quote-table="${quote}"[^>]*>([\\s\\S]*?)</details>`))?.[1];
  assert.ok(block, `a ${quote} tier table is on the page`);
  return [...block.matchAll(/<tr><td>(.*?)<\/td><td[^>]*>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)].map((m) => {
    const label = plain(m[1]);
    const nums = label.match(/[\d ]+\d/g).map((s) => Number(s.replace(/ /g, '')));
    const range = label.startsWith('Moins') ? [0, nums[0]] : label.startsWith('Plus') ? [nums[0], Infinity] : [nums[0], nums[1]];
    return { range, creator: number(m[2]), rest: number(m[3]), total: number(m[4]) };
  });
}

for (const quote of ['USDC', 'SOL']) {
  test(`the ${quote} fee table prints what pump.fun published`, () => {
    const printed = printedTiers(quote);
    const published = PUBLISHED[quote];
    assert.equal(printed.length, 25);
    printed.forEach((row, i) => {
      const [from, to, creator, protocol, liquidity] = published[i];
      assert.deepEqual(row.range, [from, to], `row ${i + 1} range`);
      assert.equal(thousandths(row.creator), thousandths(creator), `row ${i + 1} station share`);
      assert.equal(thousandths(row.rest), thousandths(protocol + liquidity), `row ${i + 1} pump.fun + liquidity`);
      assert.equal(thousandths(row.total), thousandths(creator + protocol + liquidity), `row ${i + 1} total`);
    });
  });
}

test('the fiche tables and the site’s fee data (public/js/fees.js) say the same thing', () => {
  for (const quote of ['USDC', 'SOL']) {
    assert.deepEqual(
      TIERS[quote].map((t) => [t.from, t.to, thousandths(t.creator), thousandths(t.protocol), thousandths(t.lp)]),
      PUBLISHED[quote].map(([from, to, c, p, l]) => [from, to, thousandths(c), thousandths(p), thousandths(l)]),
      quote,
    );
  }
  assert.deepEqual([CURVE.creator, CURVE.protocol, CURVE.lp, CURVE.total], [0.3, 0.95, 0, 1.25]);
  assert.deepEqual([NON_CANONICAL.creator, NON_CANONICAL.protocol, NON_CANONICAL.lp], [0, 0.05, 0.25]);
  assert.deepEqual([PLATFORM_FEE_PCT, PLATFORM_FEE_REFERRAL_PCT, GRADUATION_COST_SOL], [0.45, 0.4, 0.015]);
});

test('the fiche states the bonding-curve and non-canonical figures', () => {
  const text = plain(fiche);
  assert.match(text, /1,25 %<\/strong> de frais : 0,30 % pour la station \(le créateur\), 0,95 % pour pump\.fun, 0 % pour la liquidité/);
  assert.match(text, /0 % \(0,05 % pour pump\.fun, 0,25 % pour la liquidité\)/);
  assert.match(text, /frais de plateforme de 0,45 %<\/strong> \(0,40 % avec un code de parrainage\)/);
  assert.match(text, /migration coûte 0,015 SOL/);
});

test('nothing left over from the Jupiter Studio launch, and both pages stay out of search engines', () => {
  for (const page of [fiche, mentions]) {
    assert.doesNotMatch(page, /anti-sniper|Jupiter Studio/i);
    assert.match(page, /<meta name="robots" content="noindex">/);
  }
  assert.doesNotMatch(plain(fiche), /Lancement : sur Jupiter/);
  assert.match(plain(fiche), /Holder Rewards/);
});

test('the script prints dates as Paris clocks show them', () => {
  assert.equal(frWhen(Date.parse('2026-10-17T15:30:00+02:00')), 'samedi 17 octobre 2026 à 15:30');
  assert.equal(frWhen(Date.parse('2026-10-24T18:00:00+02:00')), 'samedi 24 octobre 2026 à 18:00');
  assert.equal(frWhen(Date.parse('2026-12-05T18:00:00+01:00')), 'samedi 5 décembre 2026 à 18:00');
  assert.equal(frWhen(parisInstant(2027, 5, 1, 9, 5)), 'samedi 1er mai 2027 à 09:05');
  assert.equal(frWhen(Date.parse('2026-10-17T13:30:00Z')), 'samedi 17 octobre 2026 à 15:30', 'a UTC instant is read in Paris');
  assert.equal(frWhen(NaN), '');
});

test('the script prints the day alone the same way, for the intro', () => {
  assert.equal(frDay(Date.parse('2026-10-24T18:00:00+02:00')), '24 octobre 2026');
  assert.equal(frDay(parisInstant(2027, 5, 1, 9, 5)), '1er mai 2027');
  assert.equal(frDay(Date.parse('2026-10-30T23:30:00Z')), '31 octobre 2026', 'a UTC evening is already the next day in Paris');
  assert.equal(frDay(NaN), '');
  assert.equal(frDay(undefined), '');
});

test('the HTML fallbacks agree with config.js, so a failing script prints the same dates', () => {
  assert.equal(frWhen(Date.parse(config.launchAt)), 'samedi 17 octobre 2026 à 15:30');
  assert.equal(frWhen(Date.parse(config.firstPleinAt)), 'samedi 24 octobre 2026 à 18:00');
  assert.match(fiche, /data-launch="when">samedi 17 octobre 2026 à 15:30</);
  assert.match(fiche, /data-first-plein>samedi 24 octobre 2026 à 18:00</);
  assert.match(fiche, new RegExp(`data-first-plein-day>${frDay(Date.parse(config.firstPleinAt))}<`), 'the intro names the same day');
  assert.match(fiche, new RegExp(`data-launchpad="name">${config.launchpad.name.replace('.', '\\.')}<`));
  assert.match(fiche, new RegExp(`data-launchpad="quote">${config.launchpad.quote}<`));
  assert.match(read('public/js/fiche.js'), new RegExp(config.launchAt.replace(/[+.]/g, '\\$&')), 'the script falls back to the same opening');
});

test('the quote asset picks a table, and an unknown one picks none', () => {
  assert.equal(quoteAsset({ quote: 'USDC' }), 'USDC');
  assert.equal(quoteAsset({ quote: 'SOL' }), 'SOL');
  assert.equal(quoteAsset({ quote: 'EURC' }), null);
  assert.equal(quoteAsset(undefined), null);
  assert.ok(['USDC', 'SOL'].includes(config.launchpad.quote));
});

test('the coin link needs a pump.fun base and a well-formed contract', () => {
  const lp = { coinUrl: 'https://pump.fun/coin/' };
  const mint = '11111111111111111111111111111111';
  assert.equal(coinUrl(lp, mint), `https://pump.fun/coin/${mint}`);
  assert.equal(coinUrl(lp, ''), null);
  assert.equal(coinUrl(lp, 'not-an-address'), null);
  assert.equal(coinUrl({ coinUrl: 'https://evil.example/coin/' }, mint), null);
  assert.equal(coinUrl({}, mint), null);
});

test('an open fiche re-reads live.json: fast around the opening, slowly otherwise', () => {
  const open = Date.parse('2026-10-17T15:30:00+02:00');
  const minute = 60_000;
  assert.equal(nextReadDelay(open - 60 * minute, open, false), 5 * minute, 'long before the opening');
  assert.equal(nextReadDelay(open - 5 * minute - 1, open, false), 5 * minute, 'just outside the five-minute window');
  assert.equal(nextReadDelay(open - 5 * minute, open, false), 15_000, 'five minutes before');
  assert.equal(nextReadDelay(open - 1, open, false), 15_000, 'the last moment before the opening');
  assert.equal(nextReadDelay(open, open, false), minute, 'open, contract not yet published');
  assert.equal(nextReadDelay(open + 90 * minute, open, false), minute);
  assert.equal(nextReadDelay(open + minute, open, true), 5 * minute, 'contract on the page: a slow check for a correction');
  assert.equal(nextReadDelay(Date.now(), NaN, false), minute, 'an unreadable opening time never stops the reads');
});

test('every hook the script fills exists on the page', () => {
  for (const hook of [
    'data-ca', 'data-coin', 'data-launch="when"', 'data-first-plein', 'data-first-plein-day', 'data-launchpad="name"', 'data-launchpad="quote"',
    'data-quote-table="USDC"', 'data-quote-table="SOL"', 'data-official="formula"', 'data-official="team"', 'data-official="source"',
    ...['creator', 'reservoir', 'aid', 'founder1', 'founder2'].map((w) => `data-wallet="${w}"`),
  ]) assert.ok(fiche.includes(hook), `${hook} is in fiche-plein.html`);
});

test('the loyalty card is described as worthless and local, in both pages', () => {
  const f = plain(fiche);
  assert.match(f, /Elle ne vaut rien et ne promet rien/);
  assert.match(f, /stockage local de ton navigateur, jamais envoyée/);
  assert.match(f, /Une carte pleine ne gagne rien/);
  const m = plain(mentions);
  assert.match(m, /plein\.carte/);
  assert.match(m, /ne dépend d’aucun achat de \$PLEIN/);
});

test('the legal notice names the third parties the page really calls', () => {
  const m = plain(mentions);
  assert.match(m, /pump\.fun, un service indépendant/);
  assert.match(m, /plugin\.jup\.ag/);
  assert.match(m, /DexScreener/);
  assert.match(m, /serveur de la station, pas par ton navigateur/);
  assert.match(m, /data\.economie\.gouv\.fr/, 'Mon Plein: the feed the server calls');
  assert.match(m, /api\.mainnet-beta\.solana\.com/, 'the default RPC node, as api/_solana.js has it');
  assert.match(mentions, /todo">\[[^\]]*Jupiter écrit-il dans le stockage local/, 'what the Jupiter module stores is flagged as unverified');
});

// French typography in the markup: a non-breaking space before : ; ! ? % € » and after «, and
// between a number and its unit or its thousands.
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ');
for (const [name, page] of [['fiche-plein.html', fiche], ['mentions-legales.html', mentions]]) {
  test(`${name} keeps French typography`, () => {
    const t = text(page);
    const bad = [
      ['space before : ; ! ? % € »', / [:;!?%€»]/g],
      ['space after «', /« /g],
      ['number then unit', /\d (?:USDC|USD|SOL|L\b|€|%|×)/g],
      ['thousands separated by a plain space', /\d \d{3}(?!\d)/g],
    ];
    for (const [what, re] of bad) {
      const hits = [...t.matchAll(re)].map((m) => t.slice(Math.max(0, m.index - 25), m.index + 25).replace(/\s+/g, ' '));
      assert.deepEqual(hits, [], what);
    }
  });
}

// ---------------------------------------------------------------- what an open page does when live.json changes

const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // any well-formed address will do; it is not the coin's
const OTHER = '11111111111111111111111111111111';
const OPEN = Date.parse('2026-10-17T15:30:00+02:00');
const pump = { name: 'pump.fun', coinUrl: 'https://pump.fun/coin/' };
const at = (live, now = OPEN + 60_000, launchpad = pump) => planSlots(live, { now, launchAt: OPEN, launchpad });

// Just enough of a page element for paint(): a dataset, a textContent that clears children, replaceChildren.
class Slot {
  constructor(text) { this.dataset = {}; this.child = null; this.own = text; }
  get textContent() { return this.child ? this.child.textContent : this.own; }
  set textContent(value) { this.child = null; this.own = value; }
  replaceChildren(node) { this.child = node; }
}
const doc = { createElement: (tag) => ({ tag }) };

test('the contract appears from the opening on, and only if it is well-formed', () => {
  assert.equal(at({ contract: MINT }, OPEN - 1).contract, null, 'not before the opening');
  assert.deepEqual(at({ contract: MINT }).contract, { href: `https://solscan.io/token/${MINT}`, text: MINT });
  assert.deepEqual(at({ contract: MINT }).coin, { href: `https://pump.fun/coin/${MINT}`, text: 'Ouvrir sur pump.fun' });
  assert.equal(at({ contract: '' }).contract, null);
  assert.equal(at({ contract: 'not-an-address' }).contract, null);
  assert.equal(at({ contract: `${MINT} ` }).contract, null, 'a stray space is refused');
  assert.equal(at({}).contract, null);
  assert.equal(at(null).contract, null);
  assert.equal(at({ contract: MINT }, OPEN + 60_000, { coinUrl: 'https://evil.example/' }).coin, null, 'a foreign coin page is never linked');
  assert.equal(planSlots({ contract: MINT }, { now: OPEN + 60_000, launchAt: NaN, launchpad: pump }).contract, null, 'an unreadable opening time shows nothing');
});

test('a wallet shows only its own well-formed address', () => {
  const plan = at({ wallets: { creator: MINT, reservoir: 'oops', aid: '', constructor: MINT } });
  assert.deepEqual(plan.wallet('creator'), { href: `https://solscan.io/account/${MINT}`, text: MINT });
  assert.equal(plan.wallet('reservoir'), null, 'malformed');
  assert.equal(plan.wallet('aid'), null, 'empty');
  assert.equal(plan.wallet('founder1'), null, 'missing');
  assert.equal(at({}).wallet('creator'), null, 'no wallets block');
  assert.equal(at({ wallets: [MINT] }).wallet('creator'), null, 'a list is not a wallet map');
});

test('a contract that appears and is then withdrawn takes the open page back to its printed text', () => {
  const ca = new Slot('publié ici à l’ouverture');
  const coin = new Slot('publiée avec le contrat');
  const wallet = new Slot('publié à l’ouverture');
  const render = (live) => {
    const plan = at(live);
    paint(ca, plan.contract, doc);
    paint(coin, plan.coin, doc);
    paint(wallet, plan.wallet('creator'), doc);
  };

  render({ contract: '', wallets: { creator: '' } });
  assert.equal(ca.textContent, 'publié ici à l’ouverture', 'before the contract: the fallback');

  render({ contract: MINT, wallets: { creator: OTHER } });
  assert.equal(ca.textContent, MINT);
  assert.equal(ca.child.href, `https://solscan.io/token/${MINT}`);
  assert.equal(coin.child.href, `https://pump.fun/coin/${MINT}`);
  assert.equal(wallet.textContent, OTHER);

  render({ contract: OTHER, wallets: { creator: OTHER } });
  assert.equal(ca.textContent, OTHER, 'a corrected contract replaces the old one');
  assert.equal(coin.child.href, `https://pump.fun/coin/${OTHER}`);

  render({ contract: '', wallets: { creator: 'broken' } });
  assert.equal(ca.textContent, 'publié ici à l’ouverture', 'a withdrawn contract is not left next to "Le seul"');
  assert.equal(ca.child, null);
  assert.equal(coin.textContent, 'publiée avec le contrat');
  assert.equal(wallet.textContent, 'publié à l’ouverture', 'a malformed wallet is taken down too');

  render({ contract: MINT, wallets: { creator: OTHER } });
  assert.equal(ca.textContent, MINT, 'and it can come back');
});

test('a read that changes nothing leaves the link alone, so a selection is not lost', () => {
  const slot = new Slot('publié à l’ouverture');
  const entry = { href: `https://solscan.io/account/${MINT}`, text: MINT };
  paint(slot, entry, doc);
  const first = slot.child;
  paint(slot, { ...entry }, doc);
  assert.equal(slot.child, first, 'same address: same node');
  paint(slot, null, doc);
  paint(slot, null, doc);
  assert.equal(slot.textContent, 'publié à l’ouverture', 'restoring twice is harmless');
});

// ---------------------------------------------------------------- what the page promises

test('the fiche prose about the scale starts with the first tier, for both quote assets', () => {
  const pct = (x) => x.toFixed(2).replace('.', ',');
  const cap = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  for (const [quote, unit] of [['USDC', 'USD'], ['SOL', 'SOL']]) {
    const [first, second] = TIERS[quote];
    const last = TIERS[quote].at(-1);
    const block = plain(fiche).match(new RegExp(`<div data-quote-table="${quote}"[^>]*>([\\s\\S]*?)<details`))?.[1];
    assert.ok(block, `${quote} intro paragraph`);
    assert.ok(
      block.includes(`${pct(first.creator)} % sous ${cap(first.to)} ${unit}, de ${pct(second.creator)} % de ${cap(second.from)} à ${cap(second.to)} ${unit}`),
      `${quote}: the sentence gives the first tier (${pct(first.creator)} %) before the second`,
    );
    assert.ok(block.includes(`jusqu’à ${pct(last.creator)} % au-delà de ${cap(last.from)} ${unit}`), `${quote}: and ends where the schedule ends`);
  }
});

test('the fiche promises nothing about the opening that the team cannot yet keep', () => {
  const f = plain(fiche);
  // the multisig, its signers and the key-loss procedure are due before the first plein, not the opening
  assert.doesNotMatch(f, /publiés? avant l’ouverture/);
  assert.match(f, /outil, signataires et seuil, publiés avant le premier plein/);
  assert.match(f, /procédure de secours sont publiés avant le premier plein/);
  assert.match(fiche, /data-wallet="reservoir">publié avant le premier plein</);
  assert.match(fiche, /data-wallet="creator">publié à l’ouverture</, 'the creator wallet receives fees from the opening, so it is due then');
  for (const page of [fiche, mentions]) assert.doesNotMatch(plain(page), /Projet à compléter avant l’ouverture/);
});

test('the team’s buy at creation is a stated decision, so "0 %" cannot stand for the whole story', () => {
  const f = plain(fiche);
  assert.match(f, /Jetons réservés à l’équipe :<\/strong> 0 %\. Ni prévente, ni investisseurs, ni allocation/);
  assert.match(f, /Achat de l’équipe à la création :<\/strong> <span class="todo">\[à décider avant l’ouverture : « Aucun\. », ou le montant acheté sur la courbe avec sa transaction Solscan/);
});

test('the pump line says what is known and flags what a real swap must still show', () => {
  const f = plain(fiche);
  assert.doesNotMatch(f, /n’ajoute aucun frais/, 'the old claim is gone');
  assert.match(f, /Le site ne prend aucune commission en plus : la pompe est réglée sans frais de parrainage/);
  // the station's own creator share is part of what applies, and the coin may still be on the curve, not a pool
  assert.match(f, /S’appliquent les frais de la courbe ou de la pool canonique \(dont la part de la station, comme pour tout échange\), ceux de Jupiter \(d’après Jupiter : 0,50 % sur un jeton de moins de 24 h, puis 0,10 %\) et ceux du réseau Solana/);
  assert.doesNotMatch(f, /S’appliquent les frais de la pool,/, 'not "the pool" alone: the coin starts on the curve');
  assert.match(f, /todo">\[à confirmer par un premier échange réel : le frais de Jupiter affiché avant la signature, et si la pompe compte pour pump\.fun comme une interface tierce\]/);
  assert.match(f, /pump\.fun indique ne pas les prélever sur Terminal ni sur les interfaces tierces/);
  assert.equal(config.jupiter.referralFeeBps, 0, 'what the fiche says matches config.js');
  assert.equal(config.jupiter.referralAccount, '');
});

test('on launch day the fiche does not suggest a buyback tonight', () => {
  const f = plain(fiche);
  // there is no plein on launch day: the intro names the first one, and the figure is "the last survey", not "this week"
  assert.match(f, /Chaque samedi à 18:00, à partir du <span data-first-plein-day>24 octobre 2026<\/span>, une part des frais/);
  assert.match(f, /Au dernier relevé publié : <strong data-official="formula">/);
  assert.doesNotMatch(f, /Cette semaine :/);
  assert.ok(Date.parse(config.firstPleinAt) > Date.parse(config.launchAt), 'the first plein is after the opening');
});
