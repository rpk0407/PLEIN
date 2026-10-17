// Launch self-audit of a pump.fun coin, read-only: where it was created, who bought in the same
// block and in the first blocks, who holds the most, which authorities remain, and the state each
// dashboard light could take, with the facts behind it. A person decides what goes in live.json.
//   node scripts/audit.mjs [--markdown|--json] [--mint <mint>] [--rpc <url>]
//        [--max-pages 60] [--max-tx 300] [--early-slots 5]
// RPC: --rpc, else SOLANA_RPC_URL, else the public node. Frugal by design: at most --max-pages
// pages of 1 000 signatures and --max-tx transactions are read, and whatever is capped is said in
// the output ("Limites"), because a capped share is a lower bound, not a measure.
// Exit code 0 unless the inputs are invalid (2). It never signs or sends anything.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { readHolders, topHolders } from '../api/chain.js';
import {
  DEFAULT_RPC, USDC_MINT, associatedTokenAddress, getAccount, getMultipleAccounts, getSignatures, getTransaction,
  parseMint, parseMintExtensions, parseTokenAccount, toUi, tokenDeltas,
} from '../api/_solana.js';
import {
  bondingCurveAddress, curveProgressPct, curveQuote, globalAddress, parseBondingCurve, parseGlobal, pct1, programLabel,
} from '../api/_pump.js';
import { isSolanaAddress } from '../public/js/mint.js';
import { typo } from '../public/js/typo.js';
import { fr } from './releve.mjs';

// Thresholds behind the suggested states. TOP10 comes from docs/interfaces.md; BUNDLE is a
// proposal for the founders to confirm (Tier 3: no data yet on what a normal launch looks like).
export const TOP10_WARN_PCT = 30;
export const BUNDLE_WARN_PCT = 5;
const PAGE = 1000;

const short = (text) => (text ? `${text.slice(0, 4)}…${text.slice(-4)}` : '—');

// ---------------------------------------------------------------- reading the chain

/** All signatures of an address, oldest last, up to maxPages pages. */
async function allSignatures(url, address, maxPages, opts) {
  const all = [];
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await getSignatures(url, address, { before, limit: PAGE }, opts);
    all.push(...batch);
    if (batch.length < PAGE) return { all, reachedStart: true, pages: page + 1 };
    before = batch[batch.length - 1].signature;
  }
  return { all, reachedStart: false, pages: maxPages };
}

/**
 * Runs `worker` over `items` with a few calls in flight at once, each worker resting `gapMs`
 * between calls. The public node allows about 40 calls per 10 s to one method, so on it the
 * default is 3 workers × 0.8 s.
 */
async function mapLimit(items, { workers, gapMs }, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await worker(items[i], i);
      if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }));
  return out;
}

/**
 * Buyers of the coin in the first blocks. A buyer is an owner whose balance of the mint rose in
 * a successful transaction; the bonding curve itself and the creator are set aside (the creator
 * is shown on its own). Pure: takes parsed transactions, so it is tested without a network.
 * `transactions`: [{ slot, tx }] in any order.
 */
export function analyseEarlyBuyers({ transactions, mint, curveAddress, creator, creationSlot, earlySlots }) {
  const same = new Map(); // owner → { bought, account }
  const early = new Map();
  const creatorBuys = { bought: 0n, account: null };
  const add = (map, owner, delta, account) => {
    const row = map.get(owner) || { bought: 0n, account };
    row.bought += delta;
    map.set(owner, row);
  };
  for (const { slot, tx } of transactions) {
    if (!tx?.meta || tx.meta.err) continue;
    for (const d of tokenDeltas(tx)) {
      if (d.mint !== mint || d.delta <= 0n || !d.owner || d.owner === curveAddress) continue;
      if (d.owner === creator) {
        creatorBuys.bought += d.delta;
        creatorBuys.account = d.account;
      } else if (slot === creationSlot) add(same, d.owner, d.delta, d.account);
      else if (slot > creationSlot && slot <= creationSlot + earlySlots) add(early, d.owner, d.delta, d.account);
    }
  }
  return { same, early, creator: creatorBuys };
}

// ---------------------------------------------------------------- curve settings

/** The quote asset the founders chose (launchpad.quote in public/config.js); null when unreadable. */
async function configuredQuote() {
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(await readFile(fileURLToPath(new URL('../public/config.js', import.meta.url)), 'utf8'), sandbox);
    const quote = sandbox.window.PLEIN_CONFIG?.launchpad?.quote;
    return quote === 'USDC' || quote === 'SOL' ? quote : null;
  } catch {
    return null;
  }
}

/**
 * How the curve was created against what docs/moteur.md (section 3) asks for: the quote asset the
 * founders chose, the published creator wallet, and Holder Rewards, Cashback, Mayhem mode and the
 * editable creator fee all off. The mint must not hold more than the curve created, which also
 * catches any mint the curve does not know about. Pure: rows are { key, label, expected, found,
 * ok } with ok true, false, or null when there is nothing to compare (a flag an older account
 * lacks, a creator not published yet). A person decides what a false means; nothing is changed.
 * Tier 2: the flags are the curve fields read from pump.fun's IDL on 17 October 2026; what each
 * mode does on-chain has not been traced.
 */
export function checkCurveSettings({ curve, quote = null, liveCreator = null, mintSupply = null, decimals = 6 }) {
  const rows = [];
  const row = (key, label, expected, found, ok) => rows.push({ key, label, expected, found, ok });
  const asked = curveQuote(curve);
  const quoteName = asked.kind === 'SOL' ? 'SOL' : asked.mint === USDC_MINT ? 'USDC' : `un jeton inconnu (${asked.mint})`;
  row('quote', 'Monnaie de cotation', quote ?? 'non fixée dans config.js', quoteName, quote ? quoteName === quote : null);
  row('creator', 'Créateur', liveCreator ?? 'non publié dans live.json', curve.creator, liveCreator ? curve.creator === liveCreator : null);
  for (const [key, label] of [
    ['isHolderReward', 'Holder Rewards'], ['isCashbackCoin', 'Cashback'], ['isMayhemMode', 'Mode Mayhem'],
    ['canEditCreatorFee', 'Frais du créateur modifiables'],
  ]) {
    const value = curve[key];
    row(key, label, 'non', value === null ? 'non lu' : value ? 'OUI' : 'non', value === null ? null : !value);
  }
  if (mintSupply !== null) {
    const over = mintSupply > curve.tokenTotalSupply;
    row('supply', 'Offre du jeton', 'pas plus que celle de la courbe',
      `${fr(toUi(mintSupply, decimals), 0)} jetons (courbe : ${fr(toUi(curve.tokenTotalSupply, decimals), 0)})`, !over);
  }
  return { ok: rows.every((r) => r.ok !== false), allChecked: rows.every((r) => r.ok === true), rows };
}

// ---------------------------------------------------------------- suggested lights

const light =(state, label, detail, facts) => ({ state, label: typo(label), detail: typo(detail), facts });

/** The six lights as a person could set them in live.json, each with the facts behind it. */
export function suggestLights(f) {
  const lights = {};
  // mint authority and freeze authority; a Token-2022 extension that can take, freeze or tax
  // tokens (permanent delegate, transfer fee, hook …) keeps the light from saying "revoked"
  const risky = f.riskyExtensions || [];
  for (const [key, authority, okLabel, openLabel, okDetail] of [
    ['mint', f.mintAuthority, 'Création révoquée', 'Autorité de création', 'plus aucune adresse ne peut créer de jetons'],
    ['freeze', f.freezeAuthority, 'Gel révoqué', 'Autorité de gel', 'plus aucune adresse ne peut geler un wallet'],
  ]) {
    const extensionFact = f.extensions === undefined ? [] : [`extensions Token-2022 : ${f.extensions.length ? f.extensions.join(', ') : 'aucune'}`];
    if (authority === undefined) lights[key] = light('pending', openLabel, 'non lu', ['jeton illisible']);
    else if (authority !== null) lights[key] = light('warn', openLabel, `encore détenue par ${authority}`, [`autorité = ${authority}`, ...extensionFact]);
    else if (risky.length) lights[key] = light('warn', openLabel, `autorité révoquée, mais extension à examiner : ${risky.join(', ')}`, ['autorité = aucune (lue sur le compte du jeton)', ...extensionFact]);
    else lights[key] = light('ok', okLabel, okDetail, ['autorité = aucune (lue sur le compte du jeton)', ...extensionFact]);
  }
  // top 10
  if (f.top10Pct == null) {
    lights.top10 = light('pending', 'Top 10 des wallets', 'non mesuré', [f.top10Error || 'liste des détenteurs illisible']);
  } else {
    const state = f.top10Pct <= TOP10_WARN_PCT ? 'ok' : 'warn';
    lights.top10 = light(state, `Top 10 des wallets : ${fr(f.top10Pct, 1)} %`, 'wallets uniquement, courbe et pools exclus', [
      `10 plus gros wallets = ${fr(f.top10Pct, 1)} % de l’offre (seuil ${TOP10_WARN_PCT} %)`,
      ...f.excludedFacts,
    ]);
  }
  // bundles: same-block buyers
  if (f.bundle == null) {
    lights.bundles = light('pending', 'Achats groupés', 'création non atteinte dans la limite de lecture', [f.bundleError || 'non mesuré']);
  } else {
    const state = f.bundle.boughtPct <= BUNDLE_WARN_PCT ? 'ok' : 'warn';
    lights.bundles = light(state, `Achats groupés : ${fr(f.bundle.boughtPct, 1)} %`, 'achetés dans le bloc de création, créateur exclu', [
      `${f.bundle.wallets} wallet(s) ont acheté dans le bloc de création : ${fr(f.bundle.boughtPct, 2)} % de l’offre`,
      `encore détenu aujourd’hui : ${fr(f.bundle.heldPct, 2)} % de l’offre`,
      `seuil proposé ${BUNDLE_WARN_PCT} % (à confirmer par les fondateurs)`,
      ...(f.bundle.capped ? ['lecture plafonnée : valeur minimale, pas une mesure'] : []),
    ]);
  }
  // team tokens, known wallets only
  if (f.teamPct == null) {
    lights.team = light('pending', 'Jetons de l’équipe', 'non mesuré', ['soldes illisibles']);
  } else {
    lights.team = light(f.teamPct === 0 ? 'ok' : 'warn', `Jetons de l’équipe : ${fr(f.teamPct, 2)} %`, 'wallets connus de live.json et créateur', [
      ...f.teamFacts,
      'limite : seuls les wallets publiés et leur compte de jeton associé sont lus, pas les wallets cachés',
    ]);
  }
  // liquidity: a person confirms it on-chain after the migration
  lights.lp = f.curveComplete
    ? light('pending', 'Verrouillage de la liquidité', 'à vérifier à la main sur Solscan (Tier 2)', ['courbe terminée, pool PumpSwap ouverte : le statut des jetons de liquidité n’est pas lu ici'])
    : light('pending', 'Verrouillage de la liquidité', 'pas de pool avant la migration', [f.curveProgress == null ? 'courbe non lue' : `courbe remplie à ${fr(f.curveProgress, 1)} %`]);
  return lights;
}

// ---------------------------------------------------------------- the audit

export async function audit({ live, mint, rpcUrl, quote = null, maxPages = 60, maxTx = 300, earlySlots = 5, now = new Date() }) {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const opts = { retries: 4, timeoutMs: 15000 };
  const limits = [];
  const result = { asOf: now.toISOString(), mint, rpc: url === DEFAULT_RPC ? 'public node' : 'custom node', limits };

  const curveAddress = bondingCurveAddress(mint);
  const [mintAccount, curveAccount, globalAccount] = await getMultipleAccounts(url, [mint, curveAddress, globalAddress()], opts);
  if (!mintAccount) throw new Error('no mint account for this address');
  const token = parseMint(mintAccount.data);
  const curve = curveAccount ? parseBondingCurve(curveAccount.data) : null;
  const initialReal = globalAccount ? parseGlobal(globalAccount.data).initialRealTokenReserves : null;
  const decimals = token.decimals;
  const ui = (raw) => toUi(raw, decimals);
  const pctOf = (raw, whole = token.supply) => pct1(raw, whole);
  if (!curve) limits.push('pas de courbe pump.fun pour ce contrat : création, achats groupés et équipe lus sans la courbe');
  result.token = {
    supply: ui(token.supply), decimals, mintAuthority: token.mintAuthority, freezeAuthority: token.freezeAuthority,
  };
  const extensions = parseMintExtensions(mintAccount.data);
  result.token.extensions = extensions.map((e) => e.name);
  result.curve = curve ? { address: curveAddress, complete: curve.complete, creator: curve.creator } : null;
  const creator = curve?.creator ?? live?.wallets?.creator ?? null;
  const liveCreator = isSolanaAddress(live?.wallets?.creator) ? live.wallets.creator : null;
  result.creatorCheck = curve && liveCreator ? { curve: curve.creator, liveJson: liveCreator, same: curve.creator === liveCreator } : null;
  result.curveSettings = curve ? checkCurveSettings({ curve, quote, liveCreator, mintSupply: token.supply, decimals }) : null;
  if (curve && token.supply > curve.tokenTotalSupply) {
    // bought shares below count against what the curve created, held shares and the top 10 against
    // the mint's supply: with extra tokens minted outside the curve the two bases differ
    limits.push(`le jeton compte ${fr(ui(token.supply), 0)} unités pour ${fr(ui(curve.tokenTotalSupply), 0)} créées par la courbe (mode Mayhem ?) : les parts achetées sont comptées sur l’offre de la courbe, les parts détenues et le top 10 sur l’offre du jeton, et le bloc de création peut inclure les jetons créés hors courbe`);
  }

  // top 10 wallets
  const facts = {
    mintAuthority: token.mintAuthority, freezeAuthority: token.freezeAuthority, excludedFacts: [],
    curveComplete: Boolean(curve?.complete), curveProgress: null,
    extensions: extensions.map((e) => e.name), riskyExtensions: extensions.filter((e) => e.risky).map((e) => e.name),
  };
  try {
    const holders = await readHolders(url, mint);
    const top = topHolders(holders, token.supply);
    facts.top10Pct = top.top10Pct;
    facts.excludedFacts = [...top.excluded.entries()].map(([program, amount]) => `${programLabel(program)} (${short(program)}) : ${fr(pctOf(amount), 1)} % de l’offre, exclu`);
    result.top10 = {
      pct: top.top10Pct,
      wallets: top.wallets.map((w) => ({ owner: w.owner, amount: ui(w.amount), pct: pctOf(w.amount) })),
      listComplete: holders.complete,
    };
    if (!holders.complete) limits.push('liste des détenteurs limitée aux 20 plus gros comptes (le nœud refuse la lecture complète)');
  } catch (error) {
    facts.top10Error = `détenteurs : ${error.message}`;
    limits.push(facts.top10Error);
  }
  if (curve) facts.curveProgress = curveProgressPct(curve, initialReal);

  // creation slot and the first blocks
  if (curve) {
    try {
      const { all, reachedStart, pages } = await allSignatures(url, curveAddress, maxPages, opts);
      if (!reachedStart) {
        limits.push(`création non atteinte : ${all.length} signatures lues sur ${pages} page(s) (--max-pages ${maxPages}), il en reste d’autres plus anciennes`);
        facts.bundleError = 'création non atteinte dans la limite de lecture';
      } else if (!all.length) {
        facts.bundleError = 'aucune transaction trouvée pour la courbe';
      } else {
        const ascending = [...all].reverse();
        const creation = ascending[0];
        result.creation = { slot: creation.slot, time: creation.blockTime ? new Date(creation.blockTime * 1000).toISOString() : null, signature: creation.signature, signaturesRead: all.length };
        const window = ascending.filter((s) => !s.err && s.slot <= creation.slot + earlySlots);
        const toRead = window.slice(0, maxTx);
        if (window.length > toRead.length) limits.push(`fenêtre des premiers blocs plafonnée : ${toRead.length} transactions lues sur ${window.length} (--max-tx ${maxTx}) ; les parts sont des minimums`);
        const transactions = (await mapLimit(toRead, url === DEFAULT_RPC ? { workers: 3, gapMs: 800 } : { workers: 8, gapMs: 0 }, async (s) => ({ slot: s.slot, tx: await getTransaction(url, s.signature, opts) }))).filter((t) => t.tx);
        if (transactions.length < toRead.length) limits.push(`${toRead.length - transactions.length} transaction(s) introuvables sur le nœud`);
        const buyers = analyseEarlyBuyers({ transactions, mint, curveAddress, creator, creationSlot: creation.slot, earlySlots });
        // what those wallets still hold, from their token accounts
        const accounts = [...new Set([...buyers.same.values(), ...buyers.early.values(), buyers.creator].map((r) => r.account).filter(Boolean))];
        const current = new Map();
        if (accounts.length) {
          const read = await getMultipleAccounts(url, accounts, opts);
          accounts.forEach((address, i) => current.set(address, read[i] ? parseTokenAccount(read[i].data).amount : 0n));
        }
        const total0 = curve.tokenTotalSupply;
        const summary = (map) => {
          const bought = [...map.values()].reduce((s, r) => s + r.bought, 0n);
          const held = [...map.values()].reduce((s, r) => s + (current.get(r.account) ?? 0n), 0n);
          return {
            wallets: map.size, boughtPct: pctOf(bought, total0), heldPct: pctOf(held), bought: ui(bought), held: ui(held),
          };
        };
        const capped = window.length > toRead.length;
        result.sameBlock = { ...summary(buyers.same), capped };
        result.firstBlocks = { ...summary(buyers.early), slots: earlySlots, capped };
        result.creatorBuy = {
          bought: ui(buyers.creator.bought), boughtPct: pctOf(buyers.creator.bought, total0),
          held: ui(current.get(buyers.creator.account) ?? 0n),
        };
        facts.bundle = { ...result.sameBlock };
      }
    } catch (error) {
      facts.bundleError = `création : ${error.message}`;
      limits.push(facts.bundleError);
    }
  }

  // team: the creator and the founders' published wallets, associated token accounts only
  try {
    const wallets = {};
    if (creator) wallets.creator = creator;
    for (const key of ['founder1', 'founder2']) if (isSolanaAddress(live?.wallets?.[key])) wallets[key] = live.wallets[key];
    const reservoir = isSolanaAddress(live?.wallets?.reservoir) ? live.wallets.reservoir : null;
    const names = Object.keys(wallets);
    const atas = [...names.map((n) => associatedTokenAddress(wallets[n], mint, mintAccount.owner)),
      ...(reservoir ? [associatedTokenAddress(reservoir, mint, mintAccount.owner)] : [])];
    const read = atas.length ? await getMultipleAccounts(url, atas, opts) : [];
    const amount = (i) => (read[i] ? parseTokenAccount(read[i].data).amount : 0n);
    let total = 0n;
    facts.teamFacts = names.map((name, i) => {
      total += amount(i);
      return `${name} ${short(wallets[name])} : ${fr(pctOf(amount(i)), 2)} % de l’offre`;
    });
    if (!names.length) facts.teamFacts.push('aucun wallet connu à lire');
    if (reservoir) facts.teamFacts.push(`réservoir ${short(reservoir)} : ${fr(pctOf(amount(names.length)), 2)} % de l’offre (non compté : c’est la cuve du rachat)`);
    facts.teamPct = names.length ? pctOf(total) : null;
    result.team = { wallets: Object.fromEntries(names.map((n, i) => [n, { address: wallets[n], pct: pctOf(amount(i)) }])), totalPct: facts.teamPct };
  } catch (error) {
    limits.push(`équipe : ${error.message}`);
  }

  result.suggested = suggestLights(facts);
  return result;
}

// ---------------------------------------------------------------- output

const STATE = { ok: 'OK', warn: 'ATTENTION', pending: 'en attente' };

export function formatAudit(r, { markdown = false } = {}) {
  const out = [];
  const h = (text) => out.push(markdown ? `\n### ${text}` : `\n${text}`);
  const row = (text) => out.push(markdown ? `- ${text}` : `  ${text}`);
  out.push(markdown ? `## Audit de lancement · ${r.asOf}` : `Audit de lancement · ${r.asOf}`);
  row(`Contrat : ${r.mint} (nœud : ${r.rpc})`);
  h('Création');
  if (r.creation) {
    row(`bloc ${r.creation.slot}${r.creation.time ? ` · ${r.creation.time}` : ''} · ${r.creation.signaturesRead} transaction(s) sur la courbe depuis`);
    row(`créateur (courbe) : ${r.curve?.creator ?? '—'}${r.creatorCheck ? (r.creatorCheck.same ? ' · identique à live.json' : ` · ATTENTION : live.json donne ${r.creatorCheck.liveJson}`) : ''}`);
    row(`achats du créateur (bloc de création et +${r.firstBlocks.slots}) : ${fr(r.creatorBuy.boughtPct, 2)} % de l’offre, ${fr(r.creatorBuy.held, 0)} jetons encore détenus`);
    row(`même bloc que la création : ${r.sameBlock.wallets} wallet(s), ${fr(r.sameBlock.boughtPct, 2)} % achetés, ${fr(r.sameBlock.heldPct, 2)} % encore détenus`);
    row(`blocs +1 à +${r.firstBlocks.slots} : ${r.firstBlocks.wallets} wallet(s), ${fr(r.firstBlocks.boughtPct, 2)} % achetés, ${fr(r.firstBlocks.heldPct, 2)} % encore détenus`);
  } else row('non lue (voir les limites)');
  if (r.curveSettings) {
    h('Réglages de la courbe (attendus à la création, docs/moteur.md)');
    for (const c of r.curveSettings.rows) {
      row(`${c.label} : ${c.found} · attendu : ${c.expected} → ${c.ok === true ? 'OK' : c.ok === false ? 'ÉCART' : 'non comparé'}`);
    }
    row(r.curveSettings.ok
      ? (r.curveSettings.allChecked ? 'Tous les réglages sont conformes.' : 'Aucun écart ; certains réglages n’ont pas pu être comparés.')
      : 'Au moins un écart : une personne décide si ce contrat est publié (docs/moteur.md).');
  }
  h('Autorités');
  row(`création : ${r.token.mintAuthority ?? 'aucune (révoquée)'} · gel : ${r.token.freezeAuthority ?? 'aucune (révoqué)'}`);
  row(`extensions Token-2022 : ${r.token.extensions.length ? r.token.extensions.join(', ') : 'aucune'}`);
  h('Top 10 des wallets');
  if (r.top10) {
    row(`${fr(r.top10.pct, 1)} % de l’offre`);
    for (const w of r.top10.wallets) row(`${w.owner} · ${fr(w.pct, 2)} %`);
  } else row('non mesuré');
  h('Voyants suggérés (une personne décide, puis édite live.json)');
  for (const [key, l] of Object.entries(r.suggested)) {
    row(`${key} → ${STATE[l.state]} · « ${l.label} » · ${l.detail}`);
    for (const fact of l.facts) out.push(`${markdown ? '  - ' : '      '}${fact}`);
  }
  if (r.limits.length) {
    h('Limites de cette lecture');
    for (const limit of r.limits) row(limit);
  }
  return out.map(typo).join('\n');
}

function parseArgs(argv) {
  const args = { json: false, markdown: false, maxPages: 60, maxTx: 300, earlySlots: 5 };
  const number = (name, value, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--mint') args.mint = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
    else if (arg === '--max-pages') args.maxPages = number(arg, argv[++i], 1, 500);
    else if (arg === '--max-tx') args.maxTx = number(arg, argv[++i], 1, 2000);
    else if (arg === '--early-slots') args.earlySlots = number(arg, argv[++i], 1, 500);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.json && args.markdown) throw new Error('choose --json or --markdown, not both');
  if (args.mint !== undefined && !isSolanaAddress(args.mint)) throw new Error('--mint is not a Solana address');
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`audit: ${error.message}`);
    console.error('usage: node scripts/audit.mjs [--markdown|--json] [--mint <mint>] [--rpc <url>] [--max-pages n] [--max-tx n] [--early-slots n]');
    process.exitCode = 2;
    return;
  }
  const live = JSON.parse(await readFile(fileURLToPath(new URL('../public/live.json', import.meta.url)), 'utf8'));
  const mint = args.mint ?? live.contract;
  if (!mint) {
    console.log(args.json ? JSON.stringify({ mint: null }) : 'Pas encore de contrat : rien à auditer.');
    return;
  }
  if (!isSolanaAddress(mint)) {
    console.error('audit: the contract in live.json is not a valid address');
    process.exitCode = 2;
    return;
  }
  const result = await audit({
    live, mint, rpcUrl: args.rpc, quote: await configuredQuote(), maxPages: args.maxPages, maxTx: args.maxTx, earlySlots: args.earlySlots,
  });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatAudit(result, { markdown: args.markdown }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
