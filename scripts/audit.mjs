// Launch self-audit of a pump.fun coin, read-only: where it was created, who bought in the same
// block and in the first blocks, who holds the most, which authorities remain, and the state each
// dashboard light could take, with the facts behind it. A person decides what goes in live.json.
//   node scripts/audit.mjs [--markdown|--json] [--mint <mint>] [--rpc <url>]
//        [--max-pages 60] [--max-tx 300] [--early-slots 5]
//   node scripts/audit.mjs --preflight [--markdown|--json] [--rpc <url>] [--creator <address>]
//   node scripts/audit.mjs --ouverture [--mint <mint>] [--markdown|--json] [--write] [--png] [--out <dir>]
//        [--creator <address>] [--declared <file>]
// RPC: --rpc, else SOLANA_RPC_URL, else the public node. Frugal by design: at most --max-pages
// pages of 1 000 signatures and --max-tx transactions are read, and whatever is capped is said in
// the output ("Limites"), because a capped share is a lower bound, not a measure.
//
// The opening ticket (docs/innovations.md, T1). The settings the founders will choose are written
// in scripts/ouverture.declared.json and merged before the coin exists: the commit time is the
// pre-registration. --preflight (about 14:45) reads pump.fun's Global account and the creator
// wallet: is the declared quote asset listed, what the create form may offer, is the wallet a
// funded system account that holds no USDC (so a buy in the creation transaction has nothing to
// spend). --ouverture (right after the creation) reads the coin's mint, curve, the Global account
// and the fee-sharing config account in one call, then the creation transaction and the creator's
// token accounts, and prints one row per declared setting: ✓, ✗, or « non lu » / « non comparé »,
// each with the account and the slot it was read from. An unread field is never ✓. The ticket is
// also a PNG plate (--png, through scripts/_render.mjs) and, only when every row is ✓ and the
// creator wallet came from public/live.json, public/tickets/ouverture.json (--write): addresses and
// slots, no transaction signature, and never listed in tickets/index.json (that list is for the
// weekly pleins).
// The curve's `creator` is an argument of the creation instruction, not proof of who ordered it, so
// the ticket also reads the creation transaction: the creator wallet must have signed it, and a buy
// by any of its signers counts as a creator buy.
// --creator gives the creator wallet to compare with when live.json does not hold it yet (the
// private record of the day, docs/lancement.md D3-b). That comparison is NOT pre-registered: the
// address was not in the repository before the creation. The row, the plate, the markdown and the
// JSON say so, and --write refuses to publish a ticket compared with a typed address: it is run
// again on the branch whose live.json carries wallets.creator.
//
// Exit code: 0 unless the inputs are invalid (2). With --preflight and --ouverture it is 0 only when
// every row is ✓; 1 means a ✗ or a row that could not be read or compared: not a go.
// It never signs or sends anything.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { readHolders, topHolders } from '../api/chain.js';
import {
  DEFAULT_RPC, SYSTEM_PROGRAM, TOKEN_PROGRAM, USDC_MINT, associatedTokenAddress, getMultipleAccounts, getSignatures, getTransaction,
  parseMint, parseMintExtensions, parseTokenAccount, rpc, toUi, tokenDeltas,
} from '../api/_solana.js';
import {
  FEE_PROGRAM, PUMP_PROGRAM, bondingCurveAddress, curveProgressPct, curveQuote, globalAddress, looksLikeSharingConfig, parseBondingCurve,
  parseGlobal, parseSharingConfig, parseTokenMetadata, pct1, programLabel, readCreation, sharingConfigAddress,
} from '../api/_pump.js';
import { paris } from '../public/js/clock.js';
import { isSolanaAddress } from '../public/js/mint.js';
import { typo } from '../public/js/typo.js';
import { fr } from './releve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const DECLARED_PATH = join(root, 'scripts/ouverture.declared.json');
const TEMPLATE_PATH = join(root, 'scripts/templates/ouverture.html');
const TICKET_DIR = join(root, 'public/tickets');

// Thresholds behind the suggested states. TOP10 comes from docs/interfaces.md; BUNDLE is a
// proposal for the founders to confirm (Tier 3: no data yet on what a normal launch looks like).
export const TOP10_WARN_PCT = 30;
export const BUNDLE_WARN_PCT = 5;
const PAGE = 1000;

const short = (text) => (text ? `${text.slice(0, 4)}…${text.slice(-4)}` : '—');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Text written by a stranger (a token name), made harmless to print: no control, format or separator characters. */
const stranger = (text, max = 64) => Array.from(String(text ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}`|]/gu, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

/** The name and ticker of the plan (docs/moteur.md section 3), also in the declaration; a test pins them to the plan of mcp/tools.mjs. */
export const DEFAULT_TOKEN = { name: 'Le Plein', symbol: 'PLEIN' };

/**
 * Raw token amount held in the account at an associated token address. An account there that the
 * token program does not own (anyone can send lamports to an address) holds no tokens.
 */
function heldAmount(account, tokenProgram) {
  if (!account || account.owner !== tokenProgram || account.data.length < 72) return 0n;
  return parseTokenAccount(account.data).amount;
}

// ---------------------------------------------------------------- reading the chain

/**
 * getMultipleAccounts with the slot of the read, which the shared helper drops. One call, so every
 * account comes from the same slot: { slot, accounts } with null for an account that does not exist.
 */
export async function readAccountsAt(url, addresses, opts = {}) {
  const result = await rpc(url, 'getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }], opts);
  if (!result || !Array.isArray(result.value) || result.value.length !== addresses.length) {
    throw new Error('getMultipleAccounts: unexpected answer');
  }
  return {
    slot: result.context?.slot ?? null,
    accounts: result.value.map((v) => (v ? {
      lamports: BigInt(v.lamports), owner: v.owner, data: new Uint8Array(Buffer.from(v.data[0], 'base64')),
    } : null)),
  };
}

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
 * `creator` is the curve's creator; `creatorAliases` are the other wallets that count as the creator:
 * the wallet published or given for the comparison and every signer of the creation transaction
 * (the curve's creator is an argument of the creation instruction, so the signer can be another
 * wallet, and a buy in the creation transaction is paid by a signer).
 */
export function analyseEarlyBuyers({
  transactions, mint, curveAddress, creator, creatorAliases = [], creationSlot, earlySlots,
}) {
  const same = new Map(); // owner → { bought, account }
  const early = new Map();
  const creatorWallets = new Set([creator, ...creatorAliases].filter(Boolean));
  const creatorBuys = { bought: 0n, account: null, accounts: new Set() };
  const add = (map, owner, delta, account) => {
    const row = map.get(owner) || { bought: 0n, account };
    row.bought += delta;
    map.set(owner, row);
  };
  for (const { slot, tx } of transactions) {
    if (!tx?.meta || tx.meta.err) continue;
    for (const d of tokenDeltas(tx)) {
      if (d.mint !== mint || d.delta <= 0n || !d.owner || d.owner === curveAddress) continue;
      if (creatorWallets.has(d.owner)) {
        creatorBuys.bought += d.delta;
        creatorBuys.account = d.account;
        if (d.account) creatorBuys.accounts.add(d.account);
      } else if (slot === creationSlot) add(same, d.owner, d.delta, d.account);
      else if (slot > creationSlot && slot <= creationSlot + earlySlots) add(early, d.owner, d.delta, d.account);
    }
  }
  return { same, early, creator: creatorBuys };
}

// ---------------------------------------------------------------- the declaration

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
 * What scripts/ouverture.declared.json may say. Almost every value is fixed by docs/moteur.md
 * section 3 and CLAUDE.md (no holder rewards, no cashback, no Mayhem mode, no editable or custom
 * creator fee, no fee sharing, no creator buy, the name and the ticker), so a declaration that says
 * anything else is refused instead of being read back: changing the plan is a pull request, not a
 * typo. The quote asset is the one real choice. Strings name where a value comes from: the creator
 * is the wallets.creator of public/live.json (or the address given with --creator, which is not
 * pre-registered), the launch reserves are pump.fun's Global account's.
 */
export const DECLARED_SETTINGS = {
  quote: ['USDC', 'SOL'],
  creator: 'live.wallets.creator',
  tokenName: DEFAULT_TOKEN.name,
  tokenSymbol: DEFAULT_TOKEN.symbol,
  creatorBuy: 0,
  isHolderReward: false,
  isCashbackCoin: false,
  isMayhemMode: false,
  canEditCreatorFee: false,
  creatorFeeBps: 0,
  initialVirtualQuoteReserves: 'global',
  feeSharing: 'none',
  mintAuthority: 'revoked',
  freezeAuthority: 'revoked',
  supplyAtMost: 'curve',
};

/** Checks a parsed declaration file. Returns { ok, errors, settings } (settings null unless ok). */
export function validateDeclared(file) {
  const errors = [];
  if (!isObj(file)) return { ok: false, errors: ['the declaration is not a JSON object'], settings: null };
  if (file.version !== 1) errors.push('version: expected 1');
  const settings = file.settings;
  if (!isObj(settings)) errors.push('settings: expected an object');
  else {
    for (const key of Object.keys(settings)) if (!(key in DECLARED_SETTINGS)) errors.push(`settings.${key}: not a setting the audit reads`);
    for (const [key, allowed] of Object.entries(DECLARED_SETTINGS)) {
      if (!(key in settings)) errors.push(`settings.${key}: missing`);
      else if (Array.isArray(allowed) ? !allowed.includes(settings[key]) : settings[key] !== allowed) {
        errors.push(`settings.${key}: ${JSON.stringify(settings[key])} is not allowed (${Array.isArray(allowed) ? `one of ${allowed.join(', ')}` : `only ${JSON.stringify(allowed)}`})`);
      }
    }
  }
  return { ok: errors.length === 0, errors, settings: errors.length === 0 ? { ...settings } : null };
}

/** Reads and checks the declaration; never throws. { ok, errors, settings, path }. */
export async function loadDeclared(path = DECLARED_PATH) {
  let file;
  try {
    file = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`${basename(path)}: ${error.message}`], settings: null, path };
  }
  return { ...validateDeclared(file), path };
}

// ---------------------------------------------------------------- curve settings

const usdcText = (raw) => `${fr(toUi(raw, 6), raw % 1_000_000n === 0n ? 0 : 6)} USDC`;

/**
 * How the curve was created against what docs/moteur.md (section 3) asks for: the quote asset the
 * founders chose, the published creator wallet, and Holder Rewards, Cashback, Mayhem mode and the
 * editable creator fee all off. The mint must not hold more than the curve created, which also
 * catches any mint the curve does not know about. Pure: rows are { key, label, expected, found,
 * ok, read } with ok true, false, or null when there is nothing to compare (a flag an older account
 * lacks, a creator not published yet); `read` says whether the field itself was read (an unread
 * field is « non lu », a read one with nothing to compare is « non comparé »). A person decides
 * what a false means; nothing is changed. A row with `info: true` is shown and never judged.
 *
 * With `launch` the rows of the opening ticket are added (docs/lancement.md, "the 15:31 check"):
 *   creatorSigned   the creator wallet signed the creation transaction (the curve's `creator` is an
 *                   argument of the creation instruction, so a clone can name the station's wallet);
 *   creatorFeeBps   only 0 passes: any other value may be a custom flat rate that replaces the tiers;
 *   launchReserves  the curve's initialVirtualQuoteReserves against the Global account's, read live;
 *   feeSharing      whether the fee program's sharing config exists at sharingConfigAddress(mint)
 *                   (none expected; an account of another owner is not a config, see below);
 *   creatorBuy      what the creator's wallets bought in the creation block and the next ones, and
 *                   what their token accounts hold now (a holding creator fails the row);
 *   tokenName, tokenSymbol, metadataAuthority   the permanent name and ticker against the
 *                   declaration, and who can still change them (information, not judged).
 * launch = { global, sharing, creatorBuy, creation, metadata, creatorSource, declared, configQuote }:
 *   global     parseGlobal() of the Global account, or null when it could not be read;
 *   sharing    { address, exists, slot, owner, lamports, bytes, isConfig, config, ownsCurve }, or null
 *              when the account was not read. `isConfig` is true only for an account owned by the fee
 *              program that starts with the SharingConfig discriminator: anyone can send lamports to
 *              the address, which makes a system-owned account with no data, and that is not sharing;
 *   creatorBuy { bought, held, complete, fromSlot, toSlot, heldSlot } (raw amounts), or null when
 *              nothing was read. `bought` is null when the creation block was not reached, `held`
 *              is null when the creator's token accounts were not read; a buy of zero counts only
 *              when `complete` is true, and a row is ✓ only when both were read;
 *   creation   { recognized, slot, signers, signersKnown, feePayer }, or null when no creation
 *              transaction was reached; `recognized` is false when none of the transactions read
 *              holds a creation instruction;
 *   metadata   { value: { name, symbol, updateAuthority } | null, problem } from the mint;
 *   creatorSource 'live.json' | 'typed' | null: where the creator wallet to compare with comes from.
 *              A typed address is not pre-registered and the rows say so;
 *   declared   the validated settings of scripts/ouverture.declared.json, or null for the defaults;
 *   configQuote the quote asset of config.js, to flag a declaration that disagrees with it.
 * Tier 2: the fields are the curve's, read from pump.fun's IDL on 17 October 2026; what each mode
 * does on-chain has not been traced, and that no account at the sharing address means no sharing
 * is an inference.
 */
export function checkCurveSettings({ curve, quote = null, liveCreator = null, mintSupply = null, decimals = 6, launch = null }) {
  const rows = [];
  const row = (key, label, expected, found, ok, extra = {}) => rows.push({
    key, label, expected, found, ok, read: ok !== null, ...extra,
  });
  const ui = (raw) => toUi(raw, decimals);
  const want = launch?.declared ?? {};
  const asked = curveQuote(curve);
  const quoteName = asked.kind === 'SOL' ? 'SOL' : asked.mint === USDC_MINT ? 'USDC' : `un jeton inconnu (${asked.mint})`;
  const typed = launch?.creatorSource === 'typed';
  row('quote', 'Monnaie de cotation', quote ?? 'non fixée dans config.js', quoteName, quote ? quoteName === quote : null, { read: true, plate: asked.kind === 'SOL' || asked.mint === USDC_MINT ? quoteName : 'inconnue' });
  row('creator', 'Créateur', liveCreator
    ? `${liveCreator}${typed ? ' (donné avec --creator à la lecture, non déposé dans le dépôt avant la création)' : ''}`
    : 'non publié dans live.json', curve.creator, liveCreator ? curve.creator === liveCreator : null,
  { read: true, plate: typed ? `${short(curve.creator)} (donné)` : short(curve.creator), creatorSource: launch?.creatorSource ?? null });
  if (launch) {
    // who ordered the creation: the curve's `creator` is an argument of the creation instruction, so
    // only the signers of the creation transaction show who held the creator key
    const created = launch.creation ?? null;
    const signedLabel = 'Créé et signé par le wallet créateur';
    const signedExpected = liveCreator ? `signature de ${liveCreator} sur la transaction de création` : 'signature du wallet créateur sur la transaction de création';
    if (!created) {
      row('creatorSigned', signedLabel, signedExpected, 'non lu (création non atteinte dans la limite de lecture)', null, { read: false, plate: 'non lu' });
    } else if (!created.recognized) {
      row('creatorSigned', signedLabel, signedExpected, 'non lu (aucune transaction lue ne contient l’instruction de création)', null, { read: false, plate: 'non lu' });
    } else if (!created.signersKnown) {
      row('creatorSigned', signedLabel, signedExpected, 'non lu (le nœud n’a pas donné les signataires)', null, { read: false, plate: 'non lu' });
    } else if (!liveCreator) {
      row('creatorSigned', signedLabel, signedExpected, `signataires : ${created.signers.map(short).join(', ')} ; aucun wallet créateur à comparer`, null, { read: true, plate: 'non comparé' });
    } else {
      const signed = created.signers.includes(liveCreator);
      row('creatorSigned', signedLabel, signedExpected,
        signed
          ? `a signé la transaction de création${created.feePayer === liveCreator ? ' (payeur des frais)' : ''}`
          : `n’a pas signé la transaction de création (signataires : ${created.signers.map(short).join(', ')})`,
        signed, { read: true, plate: signed ? 'a signé' : 'n’a pas signé' });
    }
  }
  if (launch?.configQuote && quote && launch.configQuote !== quote) {
    row('configQuote', 'Cotation de config.js', quote, launch.configQuote, false, { read: true, plate: launch.configQuote });
  }
  for (const [key, label] of [
    ['isHolderReward', 'Holder Rewards'], ['isCashbackCoin', 'Cashback'], ['isMayhemMode', 'Mode Mayhem'],
    ['canEditCreatorFee', 'Frais du créateur modifiables'],
  ]) {
    const value = curve[key];
    const wanted = want[key] ?? false;
    const found = value === null ? 'non lu' : value ? 'OUI' : 'non';
    row(key, label, wanted ? 'OUI' : 'non', found, value === null ? null : value === wanted, { plate: found });
  }
  if (launch) {
    // the creator fee rate: 0 is what the default schedule reads; anything else may be a custom rate
    const wantedBps = BigInt(want.creatorFeeBps ?? 0);
    const bps = curve.creatorFeeBps;
    row('creatorFeeBps', 'Taux de frais du créateur', `${wantedBps} point de base (barème par défaut)`,
      bps === null ? 'non lu' : `${bps} point${bps > 1n ? 's' : ''} de base`, bps === null ? null : bps === wantedBps,
      { plate: bps === null ? 'non lu' : `${bps} pb` });
    // the launch reserves: the curve's against the Global account's, read live and never hard-coded
    const initial = launch.global?.initialVirtualQuoteReserves ?? null;
    const isUsdc = asked.kind === 'token' && asked.mint === USDC_MINT;
    if (!isUsdc) {
      row('launchReserves', 'Réserves virtuelles de départ', 'celles du compte Global', 'non comparé (pas une courbe USDC)', null, { read: true, plate: 'non comparé' });
    } else if (initial === null || curve.initialVirtualQuoteReserves === null) {
      row('launchReserves', 'Réserves virtuelles de départ', initial === null ? 'celles du compte Global (non lu)' : `${usdcText(initial)} (compte Global)`, 'non lu', null, { read: false, plate: 'non lu' });
    } else {
      row('launchReserves', 'Réserves virtuelles de départ', `${usdcText(initial)} (compte Global)`, usdcText(curve.initialVirtualQuoteReserves),
        curve.initialVirtualQuoteReserves === initial, { plate: usdcText(curve.initialVirtualQuoteReserves) });
    }
    // fee sharing: a separate account under the fee program; none is expected (Tier 2: absent = no sharing).
    // Only an account of the fee program that starts like a sharing config counts as sharing: anyone can
    // send lamports to the address once the mint is public, and that must not block the launch.
    const sharing = launch.sharing ?? null;
    const sharingExpected = 'aucun compte de partage';
    if (!sharing) row('feeSharing', 'Partage des frais', sharingExpected, 'non lu', null, { read: false, plate: 'non lu' });
    else if (!sharing.exists) {
      row('feeSharing', 'Partage des frais', sharingExpected, `aucun compte de partage au slot ${sharing.slot}`, true, { plate: 'aucun compte' });
    } else if (sharing.isConfig) {
      const people = sharing.config
        ? `${sharing.config.shareholders.length} bénéficiaire${sharing.config.shareholders.length === 1 ? '' : 's'} (${sharing.config.shareholders.map((h) => `${short(h.address)} ${h.shareBps / 100} %`).join(', ')}), état ${sharing.config.status}`
        : 'non décodé';
      row('feeSharing', 'Partage des frais', sharingExpected, `compte de partage présent : ${people}`, false, { plate: 'compte présent' });
    } else if (sharing.ownsCurve) {
      row('feeSharing', 'Partage des frais', sharingExpected, 'le créateur de la courbe est cette adresse de partage', false, { plate: 'compte présent' });
    } else if (sharing.owner === SYSTEM_PROGRAM && sharing.bytes === 0) {
      row('feeSharing', 'Partage des frais', sharingExpected,
        `aucun compte du programme de frais au slot ${sharing.slot} (l’adresse a reçu ${fr(Number(sharing.lamports), 0)} lamports d’un tiers : compte du programme système, sans données)`,
        true, { plate: 'aucun compte' });
    } else {
      row('feeSharing', 'Partage des frais', sharingExpected,
        `compte présent, qui n’est pas un compte de partage reconnu (propriétaire : ${sharing.owner}, ${sharing.bytes} octets) : à lire à la main`,
        null, { read: true, plate: 'non comparé' });
    }
    // the creator's own buy: what its wallets bought in the creation block and the next ones, and what
    // their token accounts hold now. A holding creator fails whatever was read of the window.
    const buy = launch.creatorBuy ?? null;
    const buyLabel = 'Achat du créateur à la création';
    if (!buy || (buy.bought === null && buy.held === null)) {
      row('creatorBuy', buyLabel, '0 jeton', 'non lu (création non atteinte dans la limite de lecture)', null, { read: false, plate: 'non lu' });
    } else {
      const bought = buy.bought;
      const held = buy.held;
      const any = (bought ?? 0n) > 0n || (held ?? 0n) > 0n;
      const noun = (raw) => (ui(raw) > 1 ? 'jetons' : 'jeton');
      const boughtText = bought === null
        ? 'achats non lus'
        : `${fr(ui(bought), 0)} ${noun(bought)} acheté${ui(bought) > 1 ? 's' : ''} entre les slots ${buy.fromSlot} et ${buy.toSlot}`;
      const heldText = held === null
        ? 'détention non lue'
        : `${fr(ui(held), 0)} détenu${ui(held) > 1 ? 's' : ''} au slot ${buy.heldSlot ?? '?'}`;
      const incomplete = !any && (!buy.complete || held === null) ? ' (lecture incomplète)' : '';
      // what was bought is mostly what is held: the plate shows the larger of the two, not their sum
      const most = (bought ?? 0n) > (held ?? 0n) ? (bought ?? 0n) : (held ?? 0n);
      row('creatorBuy', buyLabel, '0 jeton', `${boughtText}, ${heldText}${incomplete}`, any ? false : (buy.complete && bought !== null && held !== null) ? true : null,
        { read: bought !== null && held !== null, plate: `${fr(ui(most), 0)} ${noun(most)}` });
    }
  }
  if (mintSupply !== null) {
    const over = mintSupply > curve.tokenTotalSupply;
    row('supply', 'Offre du jeton', 'pas plus que celle de la courbe',
      `${fr(ui(mintSupply), 0)} jetons (courbe : ${fr(ui(curve.tokenTotalSupply), 0)})`, !over, { plate: fr(ui(mintSupply), 0) });
  }
  if (launch) {
    // the name and the ticker are permanent and are what a clone copies; compared character by character
    const meta = launch.metadata ?? null;
    for (const [key, label, field, expected] of [
      ['tokenName', 'Nom du jeton', 'name', want.tokenName ?? DEFAULT_TOKEN.name],
      ['tokenSymbol', 'Ticker du jeton', 'symbol', want.tokenSymbol ?? DEFAULT_TOKEN.symbol],
    ]) {
      if (!meta?.value) {
        row(key, label, expected, `non lu (${meta?.problem ?? 'aucune extension TokenMetadata sur ce jeton'})`, null, { read: false, plate: 'non lu' });
      } else {
        const raw = meta.value[field];
        const shown = stranger(raw, 64);
        row(key, label, expected, `${shown}${shown === raw ? '' : ' (le texte lu contient des caractères invisibles ou des espaces particuliers)'}`, raw === expected, { read: true, plate: shown });
      }
    }
    if (meta?.value) {
      const authority = meta.value.updateAuthority;
      row('metadataAuthority', 'Autorité de mise à jour du nom et du ticker', 'à lire (information)',
        authority ? `détenue par ${authority} : elle peut encore changer le nom, le ticker et l’adresse des métadonnées` : 'aucune : nul ne peut plus les changer',
        null, { info: true, read: true, plate: authority ? short(authority) : 'aucune' });
    }
  }
  return { ok: rows.every((r) => r.ok !== false), allChecked: rows.every((r) => r.info || r.ok === true), rows };
}

// ---------------------------------------------------------------- suggested lights

const light =(state, label, detail, facts) => ({ state, label: typo(label), detail: typo(detail), facts });

/** The six lights as a person could set them in live.json, each with the facts behind them. */
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

/**
 * One read of a coin: the mint, its curve, pump.fun's Global account and the fee-sharing config in a
 * single getMultipleAccounts call (so one slot for all of them), then the creation block, the
 * creator's token accounts and the holders. `quote` is the quote asset to compare with (the
 * declaration's, else config.js's); `configQuote` is config.js's own, to flag a declaration that
 * disagrees with it; `declared` is the validated `settings` of scripts/ouverture.declared.json
 * (loadDeclared), or null for the defaults of docs/moteur.md; `creatorSource` says where
 * live.wallets.creator comes from ('live.json' by default, 'typed' for an address given with
 * --creator, which was not in the repository before the creation). Returns the result object that
 * formatAudit and buildOuverture print.
 *
 * The creation is the oldest SUCCESSFUL transaction of the curve that holds a creation instruction
 * of the pump program, not the oldest signature: a failed attempt leaves a signature too. Without
 * such a transaction the creation is unproven (`creation.confirmed` false) and nothing that depends
 * on it is ✓. The creator's buys are counted for the curve's creator, the wallet given for the
 * comparison and every signer of the creation transaction.
 */
export async function audit({
  live, mint, rpcUrl, quote = null, configQuote = null, declared = null, creatorSource = null, maxPages = 60, maxTx = 300, earlySlots = 5, now = new Date(),
}) {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const opts = { retries: 4, timeoutMs: 15000 };
  const limits = [];
  const result = { asOf: now.toISOString(), mint, rpc: url === DEFAULT_RPC ? 'public node' : 'custom node', limits };

  const curveAddress = bondingCurveAddress(mint);
  const sharingAddress = sharingConfigAddress(mint);
  const first = await readAccountsAt(url, [mint, curveAddress, globalAddress(), sharingAddress], opts);
  const [mintAccount, curveAccount, globalAccount, sharingAccount] = first.accounts;
  if (!mintAccount) throw new Error('no mint account for this address');
  result.read = {
    slot: first.slot,
    accounts: { mint, curve: curveAddress, global: globalAddress(), feeSharing: sharingAddress },
  };
  const token = parseMint(mintAccount.data);
  const curve = curveAccount ? parseBondingCurve(curveAccount.data) : null;
  let globalParsed = null;
  if (!globalAccount) limits.push('compte Global de pump.fun introuvable : réserves de départ et progression de la courbe non lues');
  else {
    try {
      globalParsed = parseGlobal(globalAccount.data);
    } catch (error) {
      limits.push(`compte Global illisible : ${error.message}`);
    }
  }
  const initialReal = globalParsed?.initialRealTokenReserves ?? null;
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
  result.creatorSource = liveCreator ? (creatorSource ?? 'live.json') : null;
  result.creatorCheck = curve && liveCreator ? { curve: curve.creator, liveJson: liveCreator, same: curve.creator === liveCreator } : null;
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
  let scan = null; // what the first transactions showed, set below when the creation block is reached
  if (curve) {
    try {
      const { all, reachedStart, pages } = await allSignatures(url, curveAddress, maxPages, opts);
      if (!reachedStart) {
        limits.push(`création non atteinte : ${all.length} signatures lues sur ${pages} page(s) (--max-pages ${maxPages}), il en reste d’autres plus anciennes`);
        facts.bundleError = 'création non atteinte dans la limite de lecture';
      } else if (!all.length) {
        facts.bundleError = 'aucune transaction trouvée pour la courbe';
      } else {
        // a failed attempt to create the same mint leaves a signature in the curve's history, and created nothing
        const succeeded = [...all].reverse().filter((s) => !s.err);
        if (!succeeded.length) {
          facts.bundleError = 'aucune transaction réussie sur la courbe (que des tentatives échouées)';
        } else {
          const oldest = succeeded[0];
          const window = succeeded.filter((s) => s.slot <= oldest.slot + earlySlots);
          const toRead = window.slice(0, maxTx);
          const capped = window.length > toRead.length;
          if (capped) limits.push(`fenêtre des premiers blocs plafonnée : ${toRead.length} transactions lues sur ${window.length} (--max-tx ${maxTx}) ; les parts sont des minimums`);
          const transactions = (await mapLimit(toRead, url === DEFAULT_RPC ? { workers: 3, gapMs: 800 } : { workers: 8, gapMs: 0 }, async (s) => ({ slot: s.slot, signature: s.signature, tx: await getTransaction(url, s.signature, opts) }))).filter((t) => t.tx);
          if (transactions.length < toRead.length) limits.push(`${toRead.length - transactions.length} transaction(s) introuvables sur le nœud`);
          // the creation transaction: the oldest one read that holds a creation instruction of the pump program
          const created = transactions.find((t) => readCreation(t.tx));
          const creationFacts = created ? readCreation(created.tx) : null;
          const reference = created ?? oldest;
          const creationSlot = reference.slot;
          const stamp = succeeded.find((s) => s.signature === reference.signature) ?? oldest;
          result.creation = {
            slot: creationSlot, time: stamp.blockTime ? new Date(stamp.blockTime * 1000).toISOString() : null, signature: reference.signature,
            signaturesRead: all.length, confirmed: Boolean(created),
          };
          if (!created) limits.push('transaction de création non reconnue : aucune des transactions lues ne contient l’instruction de création de pump.fun ; qui a créé la courbe et ce qu’il a acheté dans le bloc de création ne sont pas prouvés');
          else if (created.slot !== oldest.slot) limits.push(`la première transaction réussie de la courbe (slot ${oldest.slot}) n’est pas la création (slot ${created.slot}) : la fenêtre des premiers blocs ne part pas de la création, les achats ne sont pas prouvés`);
          const aliases = [...new Set([liveCreator, ...(creationFacts?.signers ?? [])])].filter((a) => a && a !== mint);
          const buyers = analyseEarlyBuyers({ transactions, mint, curveAddress, creator, creatorAliases: aliases, creationSlot, earlySlots });
          scan = {
            buyers, creationSlot, aliases, capped, creation: creationFacts && { ...creationFacts, slot: created.slot },
            complete: Boolean(created) && created.slot === oldest.slot && !capped && transactions.length === toRead.length,
          };
          // what the other wallets still hold, from their token accounts (the creator's are read below)
          const accounts = [...new Set([...buyers.same.values(), ...buyers.early.values()].map((r) => r.account).filter(Boolean))];
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
          result.sameBlock = { ...summary(buyers.same), capped };
          result.firstBlocks = { ...summary(buyers.early), slots: earlySlots, capped };
          facts.bundle = { ...result.sameBlock };
        }
      }
    } catch (error) {
      facts.bundleError = `création : ${error.message}`;
      limits.push(facts.bundleError);
    }
  }

  // The creator's holdings, whatever the creation block gave: its wallets' associated token accounts
  // and every account that received one of its buys, read in one call (one slot). Without a window
  // that proves "bought nothing", a creator that holds tokens still fails its row.
  let creatorHeld = null; // { amount, slot, accounts } or null when not read
  if (curve) {
    try {
      const wallets = [...new Set([curve.creator, liveCreator, ...(scan?.aliases ?? [])])].filter((w) => w && w !== mint);
      const accounts = [...new Set([...wallets.map((w) => associatedTokenAddress(w, mint, mintAccount.owner)), ...(scan?.buyers.creator.accounts ?? [])])];
      const read = await readAccountsAt(url, accounts, opts);
      creatorHeld = { slot: read.slot, accounts, amount: read.accounts.reduce((s, a) => s + heldAmount(a, mintAccount.owner), 0n) };
    } catch (error) {
      limits.push(`soldes de jetons du créateur : ${error.message}`);
    }
  }
  const creatorBuy = scan || creatorHeld ? {
    bought: scan ? scan.buyers.creator.bought : null,
    held: creatorHeld ? creatorHeld.amount : null,
    complete: scan ? scan.complete : false,
    fromSlot: scan ? scan.creationSlot : null,
    toSlot: scan ? scan.creationSlot + earlySlots : null,
    heldSlot: creatorHeld?.slot ?? null,
    heldAccounts: creatorHeld?.accounts ?? [],
  } : null;
  if (creatorBuy) {
    result.creatorBuy = {
      bought: scan ? ui(creatorBuy.bought) : null,
      boughtPct: scan ? pctOf(creatorBuy.bought, curve.tokenTotalSupply) : null,
      held: creatorHeld ? ui(creatorHeld.amount) : null,
    };
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
    const amount = (i) => heldAmount(read[i], mintAccount.owner);
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

  // The curve settings are judged last, when every account and the creation block have been read.
  // Each row says where it was read: the curve (or the sharing config) and the slot of the one
  // call above, the mint for the supply and the metadata, the transactions of the first blocks for
  // the creator's signature and buy, and the creator's token accounts for what it holds.
  if (curve) {
    let metadata = { value: null, problem: null };
    try {
      metadata = { value: parseTokenMetadata(mintAccount.data), problem: null };
    } catch (error) {
      metadata = { value: null, problem: error.message };
    }
    let sharing = { address: sharingAddress, exists: false, slot: first.slot };
    if (sharingAccount) {
      // only the fee program's own account that starts like a sharing config is sharing; anyone can send lamports to this address
      const isConfig = sharingAccount.owner === FEE_PROGRAM && looksLikeSharingConfig(sharingAccount.data);
      let config = null;
      if (isConfig) {
        try {
          config = parseSharingConfig(sharingAccount.data);
        } catch {
          config = null;
        }
      }
      sharing = {
        ...sharing, exists: true, owner: sharingAccount.owner, lamports: sharingAccount.lamports, bytes: sharingAccount.data.length,
        isConfig, config, ownsCurve: curve.creator === sharingAddress,
      };
    }
    const creationInfo = scan ? {
      recognized: Boolean(scan.creation), slot: scan.creation?.slot ?? null, signers: scan.creation?.signers ?? [],
      signersKnown: scan.creation?.signersKnown ?? false, feePayer: scan.creation?.feePayer ?? null,
    } : null;
    result.curveSettings = checkCurveSettings({
      curve, quote, liveCreator, mintSupply: token.supply, decimals,
      launch: {
        global: globalParsed, sharing, creatorBuy, creation: creationInfo, metadata, creatorSource: result.creatorSource, declared, configQuote,
      },
    });
    for (const r of result.curveSettings.rows) {
      if (r.key === 'creatorBuy') {
        Object.assign(r, {
          source: 'transactions', account: curveAddress, slot: creatorBuy?.fromSlot ?? null, slotTo: creatorBuy?.toSlot ?? null,
          heldAccounts: creatorBuy?.heldAccounts ?? [], heldSlot: creatorBuy?.heldSlot ?? null,
        });
      } else if (r.key === 'creatorSigned') Object.assign(r, { source: 'transactions', account: curveAddress, slot: creationInfo?.slot ?? null });
      else if (r.key === 'supply') Object.assign(r, { source: 'mint', account: mint, slot: first.slot });
      else if (['tokenName', 'tokenSymbol', 'metadataAuthority'].includes(r.key)) Object.assign(r, { source: 'metadata', account: mint, slot: first.slot });
      else Object.assign(r, { source: 'idl', account: r.key === 'feeSharing' ? sharingAddress : curveAddress, slot: first.slot });
    }
  } else result.curveSettings = null;

  result.suggested = suggestLights(facts);
  return result;
}

// ---------------------------------------------------------------- output

const STATE = { ok: 'OK', warn: 'ATTENTION', pending: 'en attente' };

const SOURCE_TEXT = {
  idl: 'd’après l’IDL',
  mint: 'd’après le format du jeton',
  metadata: 'd’après l’extension TokenMetadata du jeton',
  wallet: 'd’après le compte lu',
  transactions: 'd’après les soldes de jetons des transactions',
};

/** " · lu dans [compte] au slot [n], d'après l'IDL", or '' when the row has no account. */
function whereText(r) {
  if (!r.account) return '';
  const basis = SOURCE_TEXT[r.source] ?? SOURCE_TEXT.idl;
  if (r.source === 'transactions') {
    // what the creator's token accounts hold is a second read, at its own slot
    const held = r.heldAccounts?.length ? `${r.slot == null ? ' · lu dans' : ', puis dans'} les comptes de jetons du créateur (${r.heldAccounts.join(', ')})${r.heldSlot == null ? '' : ` au slot ${r.heldSlot}`}` : '';
    if (r.slot == null && held) return held;
    const span = r.slot == null ? '' : r.slotTo == null || r.slotTo === r.slot ? `, au slot ${r.slot}` : `, du slot ${r.slot} au slot ${r.slotTo}`;
    return ` · lu dans les transactions de ${r.account}${span}, ${basis}${held}`;
  }
  return ` · lu dans ${r.account}${r.slot == null ? '' : ` au slot ${r.slot}`}, ${basis}`;
}

export function formatAudit(r, { markdown = false } = {}) {
  const out = [];
  const h = (text) => out.push(markdown ? `\n### ${text}` : `\n${text}`);
  const row = (text) => out.push(markdown ? `- ${text}` : `  ${text}`);
  out.push(markdown ? `## Audit de lancement · ${r.asOf}` : `Audit de lancement · ${r.asOf}`);
  row(`Contrat : ${r.mint} (nœud : ${r.rpc})`);
  h('Création');
  if (r.creation) {
    row(`bloc ${r.creation.slot}${r.creation.time ? ` · ${r.creation.time}` : ''} · ${r.creation.signaturesRead} transaction(s) sur la courbe depuis${r.creation.confirmed ? '' : ' · ATTENTION : transaction de création non reconnue, ce bloc est celui de la première transaction réussie'}`);
    row(`créateur (courbe) : ${r.curve?.creator ?? '—'}${r.creatorCheck ? (r.creatorCheck.same ? ` · identique à ${r.creatorSource === 'typed' ? 'l’adresse donnée avec --creator' : 'live.json'}` : ` · ATTENTION : ${r.creatorSource === 'typed' ? 'l’adresse donnée avec --creator' : 'live.json'} donne ${r.creatorCheck.liveJson}`) : ''}`);
    row(`achats du créateur (bloc de création et +${r.firstBlocks.slots}) : ${fr(r.creatorBuy.boughtPct, 2)} % de l’offre, ${r.creatorBuy.held === null ? 'détention non lue' : `${fr(r.creatorBuy.held, 0)} jetons encore détenus`}`);
    row(`même bloc que la création : ${r.sameBlock.wallets} wallet(s), ${fr(r.sameBlock.boughtPct, 2)} % achetés, ${fr(r.sameBlock.heldPct, 2)} % encore détenus`);
    row(`blocs +1 à +${r.firstBlocks.slots} : ${r.firstBlocks.wallets} wallet(s), ${fr(r.firstBlocks.boughtPct, 2)} % achetés, ${fr(r.firstBlocks.heldPct, 2)} % encore détenus`);
  } else row('non lue (voir les limites)');
  if (r.curveSettings) {
    h('Réglages de la courbe (attendus à la création, docs/moteur.md)');
    for (const c of r.curveSettings.rows) {
      const verdict = c.info ? 'à lire' : c.ok === true ? 'OK' : c.ok === false ? 'ÉCART' : c.read === false ? 'non lu' : 'non comparé';
      row(`${c.label} : ${c.found} · attendu : ${c.expected} → ${verdict}${whereText(c)}`);
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

// ---------------------------------------------------------------- before the creation: --preflight

/** 'ok', 'fail', 'unread' (not read or nothing to compare with) or 'info' (shown, never judged). */
const statusOf = (r) => (r.info ? 'info' : r.ok === true ? 'ok' : r.ok === false ? 'fail' : 'unread');

const markOf = (r) => {
  const status = statusOf(r);
  if (status === 'ok') return '✓';
  if (status === 'fail') return '✗';
  if (status === 'info') return 'à lire';
  return r.read === false ? '« non lu »' : '« non comparé »';
};

/** One line per row: mark, label, what was found, what was expected, and where it was read. */
const rowLine = (r) => `${markOf(r)} ${r.label} : ${r.found}${r.expected ? ` · attendu : ${r.expected}` : ''}${whereText(r)}`;

const countRows = (rows) => {
  const judged = rows.filter((r) => !r.info);
  return {
    ok: judged.filter((r) => r.ok === true).length,
    fail: judged.filter((r) => r.ok === false).length,
    unread: judged.filter((r) => r.ok === null).length,
    total: judged.length,
  };
};

const verdictOf = (counts) => (counts.fail > 0 ? 'fail' : counts.unread > 0 || counts.total === 0 ? 'incomplete' : 'ok');

/**
 * What can be read before the coin exists (about 14:45): pump.fun's Global account, the same
 * account every curve starts from, and the creator wallet. Is the declaration valid and does it
 * agree with config.js, does the Global account list the declared quote asset, is the creator
 * wallet there to compare with (and is it a funded system account, not a mint or a program account:
 * a mistyped address would otherwise pass), does it hold no USDC (moteur.md section 3: a buy in
 * the creation transaction must have nothing to spend), and what the create form may offer
 * (information: those options stay off). Read-only: one getMultipleAccounts call.
 * Tier 2: that the Global account's list of quote mints is what the create form offers, and that a
 * wallet without USDC cannot fund a buy in the creation transaction (the form may swap SOL into it).
 */
export async function preflight({
  rpcUrl, live = {}, configQuote = null, declared = null, creatorTyped = false, now = new Date(),
}) {
  const url = rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const globalKey = globalAddress();
  const published = isSolanaAddress(live?.wallets?.creator) ? live.wallets.creator : null;
  const usdcAccount = published ? associatedTokenAddress(published, USDC_MINT, TOKEN_PROGRAM) : null;
  const read = await readAccountsAt(url, published ? [globalKey, published, usdcAccount] : [globalKey], { retries: 4, timeoutMs: 15000 });
  const account = read.accounts[0];
  const settings = declared?.ok ? declared.settings : null;
  const rows = [];
  const add = (key, label, expected, found, ok, extra = {}) => rows.push({
    key, label, expected, found, ok, read: ok !== null, ...extra,
  });
  const at = { account: globalKey, slot: read.slot, source: 'idl' };

  add('declared', 'Fichier de déclaration', 'valide', declared?.ok ? `valide (${basename(declared.path)})` : (declared?.errors?.join(' ; ') ?? 'introuvable'), Boolean(declared?.ok), { read: true });
  if (settings) {
    add('configQuote', 'Cotation déclarée et config.js', settings.quote, configQuote ? `config.js : ${configQuote}` : 'config.js : cotation non fixée',
      configQuote ? configQuote === settings.quote : null, { read: configQuote !== null });
  }

  let global = null;
  let problem = null;
  if (!account) problem = 'introuvable';
  else if (account.owner !== PUMP_PROGRAM) problem = `propriétaire inattendu : ${account.owner}`;
  else {
    try {
      global = parseGlobal(account.data);
    } catch (error) {
      problem = error.message;
    }
  }
  add('global', 'Compte Global de pump.fun', 'lu, propriétaire : le programme pump.fun', global ? `lu (${account.data.length} octets)` : problem, Boolean(global), { ...at, read: true });

  if (settings?.quote === 'USDC') {
    const listed = global?.whitelistedQuoteMints ?? null;
    const isListed = listed ? listed.includes(USDC_MINT) : null;
    add('quoteListed', 'USDC parmi les monnaies de cotation acceptées', 'USDC dans la liste du compte Global',
      listed === null ? 'non lu' : isListed ? 'USDC est dans la liste' : `liste lue : ${listed.map(short).join(', ') || 'vide'}`, isListed, { ...at, read: listed !== null });
  } else if (settings?.quote === 'SOL') {
    add('quoteListed', 'SOL, monnaie de cotation', 'SOL est la monnaie native de pump.fun', 'aucune liste à lire', null, { ...at, info: true });
  }

  const initial = global?.initialVirtualQuoteReserves ?? null;
  add('launchReserves', 'Réserves virtuelles de départ (compte Global)', 'comparées à celles de la courbe après la création',
    initial === null ? 'non lu' : usdcText(initial), null, { ...at, info: true, read: initial !== null });
  const onOff = (v) => (v === null || v === undefined ? 'non lu' : v ? 'oui' : 'non');
  add('formOptions', 'Options que le formulaire peut proposer', 'toutes à laisser éteintes',
    global
      ? `Holder Rewards ${onOff(global.isHolderRewardEnabled)}, Cashback ${onOff(global.isCashbackEnabled)}, Mayhem ${onOff(global.mayhemModeEnabled)}, frais du créateur modifiables ${onOff(global.creatorFeeConfigurable)}${global.maxConfigurableCreatorFeeBps != null ? ` (jusqu’à ${global.maxConfigurableCreatorFeeBps} points de base)` : ''}`
      : 'non lu',
    null, { ...at, info: true, read: global !== null });

  // the creator wallet: it must exist, belong to the system program (a wallet) and hold SOL; an address
  // that is a mint or a program account, or that never received anything, is a typing mistake
  const creatorLabel = 'Wallet créateur à comparer';
  const creatorExpected = 'un wallet financé en SOL, publié dans live.json ou donné avec --creator';
  const creatorSource = creatorTyped ? 'donné avec --creator' : 'live.json';
  if (!published) {
    add('creator', creatorLabel, creatorExpected, 'non publié dans live.json', null, { read: false });
  } else {
    const wallet = read.accounts[1];
    const where = { account: published, slot: read.slot, source: 'wallet' };
    if (!wallet) {
      add('creator', creatorLabel, creatorExpected, `${creatorSource} : ${short(published)} · aucun compte : cette adresse n’a jamais reçu de SOL`, false, { ...where, read: true });
    } else if (wallet.owner !== SYSTEM_PROGRAM) {
      add('creator', creatorLabel, creatorExpected, `${creatorSource} : ${short(published)} · ce n’est pas un wallet (propriétaire : ${wallet.owner})`, false, { ...where, read: true });
    } else if (wallet.lamports <= 0n) {
      add('creator', creatorLabel, creatorExpected, `${creatorSource} : ${short(published)} · aucun SOL pour les frais`, false, { ...where, read: true });
    } else {
      add('creator', creatorLabel, creatorExpected, `${creatorSource} : ${short(published)} · ${fr(toUi(wallet.lamports, 9), 3)} SOL`, true, { ...where, read: true });
    }
    // no USDC in the wallet: a buy in the creation transaction would have nothing to spend (USDC quote only)
    if (settings) {
      const usdc = read.accounts[2];
      const spendable = heldAmount(usdc, TOKEN_PROGRAM);
      const usdcWhere = { account: usdcAccount, slot: read.slot, source: 'wallet' };
      if (settings.quote === 'USDC') {
        // an address that is not a funded wallet (a mint, a program account, nothing at all) has no USDC to speak of: nothing is concluded
        const isWallet = Boolean(wallet) && wallet.owner === SYSTEM_PROGRAM && wallet.lamports > 0n;
        const usdcLabel = 'Le wallet créateur ne détient pas d’USDC';
        const usdcExpected = '0 USDC : un achat à la création n’aurait rien à dépenser';
        if (spendable > 0n) add('creatorUsdc', usdcLabel, usdcExpected, usdcText(spendable), false, { ...usdcWhere, read: true });
        else if (!isWallet) add('creatorUsdc', usdcLabel, usdcExpected, 'non lu (cette adresse n’est pas un wallet financé : rien à conclure)', null, { ...usdcWhere, read: false });
        else add('creatorUsdc', usdcLabel, usdcExpected, usdc ? '0 USDC' : 'aucun compte USDC', true, { ...usdcWhere, read: true });
      } else {
        add('creatorUsdc', 'Achat à la création', 'le champ d’achat reste vide', 'avec SOL comme cotation, rien n’empêche un achat : il tient à ce que le champ reste vide', null, { ...usdcWhere, info: true });
      }
    }
  }
  add('node', 'Nœud lu', '', `${url === DEFAULT_RPC ? 'nœud public' : 'nœud personnel'} · slot ${read.slot ?? '—'}`, null, { info: true });

  const counts = countRows(rows);
  return {
    kind: 'preflight', asOf: now.toISOString(), slot: read.slot, rpc: url === DEFAULT_RPC ? 'public node' : 'custom node',
    creatorSource: published ? (creatorTyped ? 'typed' : 'live.json') : null,
    rows: rows.map((r) => ({ ...r, status: statusOf(r) })), counts, verdict: verdictOf(counts),
  };
}

const PREFLIGHT_VERDICT = {
  ok: 'PRÊT : la déclaration est valide, d’accord avec config.js, le compte Global de pump.fun se lit et le wallet créateur est financé en SOL, sans USDC. Ce que le formulaire propose se vérifie à la répétition. Rien n’est créé par ce script.',
  fail: 'PAS PRÊT : au moins une ligne est en écart. Rien ne se crée tant qu’elle n’est pas corrigée ou décidée à découvert.',
  incomplete: 'INCOMPLET : une ligne n’a pas pu être lue ou comparée. Rien n’est acquis tant qu’elle n’est pas ✓.',
};

export function formatPreflight(p, { markdown = false } = {}) {
  const out = [];
  const h = (text) => out.push(markdown ? `\n### ${text}` : `\n${text}`);
  const row = (text) => out.push(markdown ? `- ${text}` : `  ${text}`);
  out.push(markdown ? `## Avant l’ouverture · ${p.asOf}` : `Avant l’ouverture · ${p.asOf}`);
  row(`Verdict : ${PREFLIGHT_VERDICT[p.verdict]}`);
  row(`${p.counts.ok} ligne(s) ✓ sur ${p.counts.total} (nœud : ${p.rpc}, slot ${p.slot ?? '—'})`);
  h('Ce que pump.fun accepte et ce que la déclaration annonce');
  for (const r of p.rows) row(rowLine(r));
  return out.map(typo).join('\n');
}

// ---------------------------------------------------------------- after the creation: the opening ticket

const AUTHORITY_ROWS = [['mint', 'Autorité de création'], ['freeze', 'Autorité de gel']];

/**
 * The opening ticket from one audit() result: every row of the curve settings (each with its
 * account and slot), then the two authorities. `verdict` is 'ok' only when every row is ✓; a row
 * that was not read is never counted as one. Pure.
 */
export function buildOuverture({ result, declared = null }) {
  const read = result.read ?? { slot: null, accounts: {} };
  const rows = [];
  if (!result.curveSettings) {
    rows.push({
      key: 'curve', label: 'Courbe pump.fun', expected: 'une courbe pour ce contrat', found: 'introuvable', ok: false, read: true,
      account: read.accounts.curve ?? null, slot: read.slot, source: 'idl', plate: 'introuvable',
    });
  } else rows.push(...result.curveSettings.rows);
  for (const [key, label] of AUTHORITY_ROWS) {
    const lamp = result.suggested?.[key];
    const state = lamp?.state;
    rows.push({
      key: `${key}Authority`, label, expected: 'révoquée, aucune extension à risque', found: lamp && state !== 'pending' ? lamp.detail : 'non lu',
      ok: state === 'ok' ? true : state === 'warn' ? false : null, read: state === 'ok' || state === 'warn',
      account: read.accounts.mint ?? result.mint, slot: read.slot, source: 'mint', plate: state === 'ok' ? 'révoquée' : state === 'warn' ? 'à examiner' : 'non lu',
    });
  }
  // A row is ✓ only with the account and the slot it was read from: a node that gave no slot cannot
  // vouch for what it showed, and the ticket would have nothing to put after « au slot ».
  // The creator's holding is a second read at its own slot: without it the buy row has no proof of « 0 détenu ».
  for (const [i, r] of rows.entries()) {
    if (r.ok === true && (!r.account || r.slot == null || (r.key === 'creatorBuy' && r.heldSlot == null))) {
      rows[i] = { ...r, ok: null, read: false, found: `${r.found} (slot non lu)` };
    }
  }
  const counts = countRows(rows);
  // the creation slot and time are the creation's only when its transaction was recognized
  const created = result.creation?.confirmed ? result.creation : null;
  return {
    kind: 'ouverture',
    asOf: result.asOf,
    mint: result.mint,
    rpc: result.rpc,
    slot: read.slot,
    creationSlot: created?.slot ?? null,
    createdAt: created?.time ?? null,
    creatorSource: result.creatorSource ?? null,
    addresses: {
      mint: result.mint, bondingCurve: read.accounts.curve ?? null, global: read.accounts.global ?? null,
      feeSharingConfig: read.accounts.feeSharing ?? null, creator: result.curve?.creator ?? null,
    },
    declared: declared ? { ...declared } : null,
    rows: rows.map((r) => ({ ...r, status: statusOf(r) })),
    counts,
    verdict: verdictOf(counts),
    limits: result.limits ?? [],
  };
}

/**
 * What goes into public/tickets/ouverture.json: addresses, slots and the rows, nothing else. No
 * transaction signature (test/no-signing.test.mjs refuses an 86 to 90 character base58 string, and a
 * signature is one), no limits, no node.
 */
export function ouvertureTicket(o) {
  return {
    kind: 'ouverture',
    version: 1,
    asOf: o.asOf,
    verdict: o.verdict,
    slot: o.slot,
    creationSlot: o.creationSlot,
    createdAt: o.createdAt,
    creatorSource: o.creatorSource,
    ...o.addresses,
    declared: o.declared,
    rows: o.rows.map((r) => ({
      key: r.key, label: r.label, status: r.status, expected: r.expected, found: r.found, account: r.account ?? null, slot: r.slot ?? null,
    })),
  };
}

const OUVERTURE_VERDICT = {
  ok: (c) => `TOUT EST LU ET CONFORME : ${c.ok} réglages sur ${c.total}. Une personne ouvre la PR de live.json, l’autre l’approuve.`,
  fail: (c) => `ÉCART : ${c.fail} réglage(s) ne correspondent pas à la déclaration. Ne pas publier ce contrat ; les fondateurs décident à découvert (docs/moteur.md, section 3).`,
  incomplete: (c) => `INCOMPLET : ${c.unread} réglage(s) non lu(s) ou non comparé(s). Rien n’est acquis : les lire à la main sur Solscan, puis relancer.`,
};

/** Where the creator wallet to compare with came from, and what that does and does not prove. */
const CREATOR_SOURCE_TEXT = {
  'live.json': 'Wallet créateur : celui de wallets.creator dans public/live.json ; la date de son commit (git log -S sur la ligne du créateur) dit s’il précède la création.',
  typed: 'Wallet créateur : donné avec --creator à la lecture. Il n’était pas dans le dépôt avant la création : cette comparaison n’est pas pré-enregistrée (docs/lancement.md, D3-b), elle repose sur le relevé privé des deux fondateurs. Le ticket public ne s’écrit pas avec une adresse donnée.',
  none: 'Wallet créateur : aucun à comparer (ni dans live.json, ni avec --creator).',
};

export function formatOuverture(o, { markdown = false } = {}) {
  const out = [];
  const h = (text) => out.push(markdown ? `\n### ${text}` : `\n${text}`);
  const row = (text) => out.push(markdown ? `- ${text}` : `  ${text}`);
  out.push(markdown ? `## TICKET D’OUVERTURE · ${o.asOf}` : `TICKET D’OUVERTURE · ${o.asOf}`);
  row(`Contrat : ${o.mint} (nœud : ${o.rpc}, slot ${o.slot ?? '—'})${o.creationSlot != null ? ` · créé au slot ${o.creationSlot}` : ''}`);
  row(`Verdict : ${OUVERTURE_VERDICT[o.verdict](o.counts)}`);
  // the script cannot know when the declaration was merged; the history of the repository can
  row(`Pré-enregistrement : la date du commit de la déclaration (git log -1 --format=%cI -- scripts/ouverture.declared.json) doit précéder la création${o.createdAt ? ` (${o.createdAt})` : ''}.`);
  row(CREATOR_SOURCE_TEXT[o.creatorSource ?? 'none']);
  h('Réglages déclarés dans scripts/ouverture.declared.json, relus sur la chaîne');
  for (const r of o.rows) row(rowLine(r));
  if (o.limits.length) {
    h('Limites de cette lecture');
    for (const limit of o.limits) row(limit);
  }
  return out.map(typo).join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const z2 = (n) => String(n).padStart(2, '0');
const DAYS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const PLATE_STATE = {
  ok: { cls: 'ok', mark: 'OK' },
  fail: { cls: 'fail', mark: 'ÉCART' },
  unread: { cls: 'unread', mark: '?' },
  info: { cls: 'info', mark: 'INFO' },
};
const PLATE_HEAD = {
  ok: { status: 'Ticket imprimé', verdict: 'TOUT EST LU ET CONFORME', sub: (c) => `${c.ok} réglages sur ${c.total}, relus sur la chaîne` },
  fail: { status: 'Écart : ne pas publier', verdict: 'ÉCART : NE PAS PUBLIER', sub: (c) => `${c.fail} réglage(s) hors déclaration` },
  incomplete: { status: 'Lecture incomplète', verdict: 'LECTURE INCOMPLÈTE', sub: (c) => `${c.unread} réglage(s) non lu(s) ou non comparé(s)` },
};

/**
 * The plate « TICKET D'OUVERTURE » as HTML for scripts/_render.mjs (1080 × 1350), from
 * scripts/templates/ouverture.html with the brand fonts inlined. It carries no plein number: the
 * opening is not a plein. Addresses are shortened on the plate; the site holds the whole address.
 * `template`, `fonts` are for tests.
 */
export async function renderOuvertureHtml(o, { template, fonts } = {}) {
  const { fillTemplate, fontsCss } = await import('./ticket.mjs');
  const tpl = template ?? await readFile(TEMPLATE_PATH, 'utf8');
  const head = PLATE_HEAD[o.verdict];
  const when = paris(Date.parse(o.asOf));
  const rows = o.rows.map((r) => {
    const state = PLATE_STATE[r.status] ?? PLATE_STATE.unread;
    const value = r.status === 'unread' ? (r.read === false ? 'non lu' : 'non comparé') : (r.plate ?? r.found);
    return `<div class="row ${state.cls}"><span class="mark">${state.mark}</span><span class="lab">${esc(typo(r.label))}</span><i></i><b>${esc(typo(String(value)))}</b></div>`;
  }).join('\n        ');
  const limits = o.limits.slice(0, 2).map((text) => `<p>${esc(typo(text.length > 110 ? `${text.slice(0, 107)}…` : text))}</p>`);
  const values = {
    state: o.verdict,
    status: head.status,
    when: `LU LE ${DAYS[when.dow]} ${z2(when.d)}/${z2(when.m)} · ${z2(when.h)}:${z2(when.min)}`,
    verdict: head.verdict,
    verdictSub: head.sub(o.counts),
    mint: short(o.mint),
    curve: short(o.addresses.bondingCurve),
    slot: o.slot == null ? '—' : String(o.slot),
    creationSlot: o.creationSlot == null ? '—' : String(o.creationSlot),
    // the creator wallet is part of the declaration only when it came from the repository
    footer: o.creatorSource === 'live.json'
      ? 'Réglages déclarés dans le dépôt, relus sur la chaîne d’après l’IDL de pump.fun. Adresse complète : sur le site.'
      : 'Réglages déclarés dans le dépôt, relus sur la chaîne d’après l’IDL de pump.fun, sauf le wallet créateur : donné à la lecture, non déposé avant la création. Adresse complète : sur le site.',
  };
  return fillTemplate(tpl, values, {
    fonts: fonts ?? fontsCss(), rows, notes: limits.length ? `<div class="notes">${limits.join('')}</div>` : '',
  });
}

/**
 * public/tickets/ouverture.json. Only when every row is ✓ (a coin created wrong is never
 * published, and the file holds its address), and never over a file that exists. It is not added
 * to tickets/index.json, which lists the weekly pleins.
 */
export async function writeOuvertureTicket(o, { dir = TICKET_DIR } = {}) {
  if (o.verdict !== 'ok') throw new Error('the opening ticket is written only when every row is ✓');
  // an address typed at 15:31 was not in the repository before the creation: the public ticket would
  // present that comparison as if it had been pre-registered
  if (o.creatorSource !== 'live.json') throw new Error('the opening ticket is written only when the creator wallet is the wallets.creator of public/live.json (run it again on the branch whose live.json carries it, without --creator)');
  const file = join(dir, 'ouverture.json');
  if (existsSync(file)) throw new Error(`${file} already exists: a published ticket is not overwritten (remove it by hand if the read must be redone before the merge)`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${JSON.stringify(ouvertureTicket(o), null, 2)}\n`, { flag: 'wx' });
  return file;
}

// ---------------------------------------------------------------- command line

function parseArgs(argv) {
  const args = {
    json: false, markdown: false, maxPages: 60, maxTx: 300, earlySlots: 5, preflight: false, ouverture: false, write: false, png: false,
  };
  const number = (name, value, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return n;
  };
  const text = (name, value) => {
    if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--preflight') args.preflight = true;
    else if (arg === '--ouverture') args.ouverture = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--png') args.png = true;
    else if (arg === '--mint') args.mint = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
    else if (arg === '--creator') args.creator = text(arg, argv[++i]);
    else if (arg === '--declared') args.declared = text(arg, argv[++i]);
    else if (arg === '--out') args.out = text(arg, argv[++i]);
    else if (arg === '--max-pages') args.maxPages = number(arg, argv[++i], 1, 500);
    else if (arg === '--max-tx') args.maxTx = number(arg, argv[++i], 1, 2000);
    else if (arg === '--early-slots') args.earlySlots = number(arg, argv[++i], 1, 500);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.json && args.markdown) throw new Error('choose --json or --markdown, not both');
  if (args.preflight && args.ouverture) throw new Error('choose --preflight or --ouverture, not both');
  if (args.preflight && args.mint !== undefined) throw new Error('--preflight reads the Global account only: it takes no --mint');
  if ((args.write || args.png || args.out !== undefined) && !args.ouverture) throw new Error('--write, --png and --out belong to --ouverture');
  if (args.declared !== undefined && !args.preflight && !args.ouverture) throw new Error('--declared belongs to --preflight and --ouverture');
  if (args.mint !== undefined && !isSolanaAddress(args.mint)) throw new Error('--mint is not a Solana address');
  if (args.creator !== undefined && !isSolanaAddress(args.creator)) throw new Error('--creator is not a Solana address');
  if (args.write && args.creator !== undefined) throw new Error('--write does not take --creator: the public ticket is written from the wallets.creator of public/live.json (an address typed at the time of the read was not in the repository before the creation)');
  return args;
}

const USAGE = [
  'usage: node scripts/audit.mjs [--markdown|--json] [--mint <mint>] [--rpc <url>] [--max-pages n] [--max-tx n] [--early-slots n]',
  '       node scripts/audit.mjs --preflight [--markdown|--json] [--rpc <url>] [--creator <address>] [--declared <file>]',
  '       node scripts/audit.mjs --ouverture [--mint <mint>] [--markdown|--json] [--write] [--png] [--out <dir>] [--creator <address>] [--declared <file>]',
].join('\n');

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`audit: ${error.message}`);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const live = JSON.parse(await readFile(fileURLToPath(new URL('../public/live.json', import.meta.url)), 'utf8'));
  // --creator is for the comparison only (the creator wallet recorded privately, not yet in live.json):
  // it is not pre-registered, and every output says so (creatorSource 'typed')
  const creatorSource = args.creator ? 'typed' : 'live.json';
  if (args.creator) live.wallets = { ...(live.wallets || {}), creator: args.creator };
  const declared = await loadDeclared(args.declared ? resolve(args.declared) : DECLARED_PATH);
  const configQuote = await configuredQuote();

  if (args.preflight) {
    const p = await preflight({ rpcUrl: args.rpc, live, configQuote, declared, creatorTyped: Boolean(args.creator) });
    console.log(args.json ? JSON.stringify(p, null, 2) : formatPreflight(p, { markdown: args.markdown }));
    process.exitCode = p.verdict === 'ok' ? 0 : 1;
    return;
  }

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
  if (args.ouverture && !declared.ok) {
    console.error(`audit: the declaration is not valid (${declared.errors.join('; ')}); the opening ticket reads the coin back against it`);
    process.exitCode = 2;
    return;
  }
  const result = await audit({
    live, mint, rpcUrl: args.rpc, quote: declared.ok ? declared.settings.quote : configQuote, configQuote,
    declared: declared.ok ? declared.settings : null, creatorSource,
    maxPages: args.maxPages, maxTx: args.maxTx, earlySlots: args.earlySlots,
  });
  if (!declared.ok) result.limits.push(`déclaration illisible ou invalide (${declared.errors.join(' ; ')}) : les réglages sont comparés aux valeurs par défaut de docs/moteur.md`);

  if (!args.ouverture) {
    console.log(args.json ? JSON.stringify(result, null, 2) : formatAudit(result, { markdown: args.markdown }));
    return;
  }
  const o = buildOuverture({ result, declared: declared.settings });
  console.log(args.json ? JSON.stringify(o, null, 2) : formatOuverture(o, { markdown: args.markdown }));
  process.exitCode = o.verdict === 'ok' ? 0 : 1;
  // notes go to stderr so that --json and --markdown output stays clean
  if (args.png) {
    const outDir = resolve(args.out ?? join(root, 'out'));
    try {
      await mkdir(outDir, { recursive: true });
      const htmlPath = join(outDir, 'ouverture.html');
      await writeFile(htmlPath, await renderOuvertureHtml(o));
      const { renderPng } = await import('./_render.mjs');
      console.error(`PNG : ${renderPng(htmlPath, join(outDir, 'ouverture.png'), { width: 1080, height: 1350 })}`);
    } catch (error) {
      console.error(`PNG skipped: ${error.message}`);
    }
  }
  if (args.write) {
    try {
      console.error(`écrit : ${await writeOuvertureTicket(o)}`);
    } catch (error) {
      console.error(`audit: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
