// The opening ticket (docs/innovations.md, T1): the declaration the founders merge before 15:00, the
// preflight on pump.fun's Global account and the creator wallet, the read-back of every declared
// setting with the account and the slot it came from, the plate and public/tickets/ouverture.json.
// Offline: every fetch is replaced, and the pump.fun accounts are built here from CURVE_SPEC and
// GLOBAL_SPEC, not pasted from captured bytes. Addresses and signatures are made at run time from
// bytes; no real one is in this file.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT, addressBytes, associatedTokenAddress, b58encode,
} from '../api/_solana.js';
import {
  CREATE_DISCRIMINATORS, CURVE_SPEC, DISCRIMINATOR, FEE_PROGRAM, GLOBAL_SPEC, PUMP_PROGRAM, SHARING_CONFIG_DISCRIMINATOR,
  bondingCurveAddress, globalAddress, parseBondingCurve, parseGlobal, sharingConfigAddress,
} from '../api/_pump.js';
import {
  DECLARED_SETTINGS, DEFAULT_TOKEN, audit, buildOuverture, checkCurveSettings, formatOuverture, formatPreflight, loadDeclared,
  ouvertureTicket, preflight, renderOuvertureHtml, validateDeclared, writeOuvertureTicket,
} from '../scripts/audit.mjs';
import { PLAN } from '../mcp/tools.mjs';
import { loadConfig, readPublishedTickets } from '../scripts/plein.mjs';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const script = fileURLToPath(new URL('../scripts/audit.mjs', import.meta.url));
const declaredFile = fileURLToPath(new URL('../scripts/ouverture.declared.json', import.meta.url));

// ---------------------------------------------------------------- fixtures built at run time

const fill = (n, length = 32) => new Uint8Array(length).fill(n);
const addr = (n) => b58encode(fill(n)); // a made-up but well-formed address
const sig = (n) => b58encode(fill(n, 64)); // a made-up transaction signature, built at run time
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const plain = (text) => text.replace(/[  ]/g, ' '); // typo() puts no-break spaces before : and %, and in numbers

const RPC = 'https://rpc.test';
const SLOT = 457_000_000;
const NOW = new Date('2026-10-17T13:31:00Z'); // 15:31 in Paris
const MINT = addr(9);
const CREATOR = addr(11);
const CURVE = bondingCurveAddress(MINT);
const SHARING = sharingConfigAddress(MINT);
const CREATOR_ATA = associatedTokenAddress(CREATOR, MINT, TOKEN_2022_PROGRAM);
const TOKENS = 1_000_000_000_000_000n; // 1 000 000 000 tokens at 6 decimals
const START = 4_292_000_000n; // the launch reserves in USDC raw units, in the Global account and on a curve made from it

const SIZE = { u8: 1, bool: 1, u16: 2, u64: 8, i128: 16, pubkey: 32 };
const sizeOf = (type) => (Array.isArray(type) ? SIZE[type[0]] * type[1] : SIZE[type]);

/** An account as the specs in api/_pump.js lay it out: the discriminator, then the fields in order. */
function encodeAccount(spec, discriminator, values) {
  const out = new Uint8Array(8 + spec.reduce((total, [, type]) => total + sizeOf(type), 0));
  const view = new DataView(out.buffer);
  out.set(discriminator, 0);
  const put = (type, value, at) => {
    if (type === 'u8') out[at] = Number(value ?? 0);
    else if (type === 'bool') out[at] = value ? 1 : 0;
    else if (type === 'u16') view.setUint16(at, Number(value ?? 0), true);
    else if (type === 'u64') view.setBigUint64(at, BigInt(value ?? 0), true);
    else if (type === 'pubkey') out.set(addressBytes(value ?? SYSTEM_PROGRAM), at);
    else throw new Error(`the test encoder does not know ${type}`);
  };
  let at = 8;
  for (const [name, type] of spec) {
    if (Array.isArray(type)) for (let i = 0; i < type[1]; i += 1) put(type[0], values[name]?.[i], at + i * SIZE[type[0]]);
    else put(type, values[name], at);
    at += sizeOf(type);
  }
  return out;
}

const curveValues = (over = {}) => ({
  virtualTokenReserves: 1_073_000_000_000_000n, virtualQuoteReserves: START, realTokenReserves: 793_100_000_000_000n, realQuoteReserves: 0n,
  tokenTotalSupply: TOKENS, complete: false, creator: CREATOR, isMayhemMode: false, isCashbackCoin: false, quoteMint: USDC_MINT,
  creatorFeeBps: 0n, canEditCreatorFee: false, isHolderReward: false, creatorFee: 0n, protocolFees: 0n, depth: 0,
  initialVirtualQuoteReserves: START, postCompleteBaseOut: 0n, postCompleteQuoteIn: 0n, ...over,
});
const curveBytes = (over) => encodeAccount(CURVE_SPEC, DISCRIMINATOR.bondingCurve, curveValues(over));

const globalValues = (over = {}) => ({
  initialized: true, initialVirtualTokenReserves: 1_073_000_000_000_000n, initialRealTokenReserves: 793_100_000_000_000n,
  tokenTotalSupply: TOKENS, initialVirtualQuoteReserves: START, whitelistedQuoteMints: [USDC_MINT],
  isHolderRewardEnabled: true, isCashbackEnabled: true, mayhemModeEnabled: true, creatorFeeConfigurable: true,
  maxConfigurableCreatorFeeBps: 300n, createV2Enabled: true, ...over,
});
const globalBytes = (over) => encodeAccount(GLOBAL_SPEC, DISCRIMINATOR.global, globalValues(over));

const lengthPrefixed = (text) => {
  const encoded = new TextEncoder().encode(text);
  const out = new Uint8Array(4 + encoded.length);
  new DataView(out.buffer).setUint32(0, encoded.length, true);
  out.set(encoded, 4);
  return out;
};
const joined = (parts) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};

/**
 * A Token-2022 mint as pump.fun makes it: 82 bytes, padding up to 165, the account type, a metadata
 * pointer and a TokenMetadata entry with the name, the ticker and a uri. `metadata: false` leaves
 * the TokenMetadata entry out.
 */
function mintBytes({
  supply = TOKENS, mintAuthority = null, freezeAuthority = null, name = DEFAULT_TOKEN.name, symbol = DEFAULT_TOKEN.symbol,
  updateAuthority = null, metadata = true,
} = {}) {
  const head = new Uint8Array(166);
  const view = new DataView(head.buffer);
  if (mintAuthority) { view.setUint32(0, 1, true); head.set(addressBytes(mintAuthority), 4); }
  view.setBigUint64(36, BigInt(supply), true);
  head[44] = 6;
  head[45] = 1;
  if (freezeAuthority) { view.setUint32(46, 1, true); head.set(addressBytes(freezeAuthority), 50); }
  head[165] = 1;
  const pointer = new Uint8Array(4 + 64);
  new DataView(pointer.buffer).setUint16(0, 18, true);
  new DataView(pointer.buffer).setUint16(2, 64, true);
  if (!metadata) return joined([head, pointer]);
  const body = joined([updateAuthority ? addressBytes(updateAuthority) : new Uint8Array(32), addressBytes(MINT), lengthPrefixed(name), lengthPrefixed(symbol), lengthPrefixed('https://meta.example/plein.json'), new Uint8Array(4)]);
  const entry = new Uint8Array(4 + body.length);
  new DataView(entry.buffer).setUint16(0, 19, true);
  new DataView(entry.buffer).setUint16(2, body.length, true);
  entry.set(body, 4);
  return joined([head, pointer, entry]);
}

function tokenAccountBytes({ mint, owner, amount }) {
  const bytes = new Uint8Array(165);
  bytes.set(addressBytes(mint), 0);
  bytes.set(addressBytes(owner), 32);
  new DataView(bytes.buffer).setBigUint64(64, BigInt(amount), true);
  bytes[108] = 1;
  return bytes;
}

/** A pump_fees SharingConfig account: the fields first, zeros after. */
function sharingConfigBytes({ shareholders = [{ address: addr(41), shareBps: 10000 }] } = {}) {
  const out = new Uint8Array(1024);
  out.set(SHARING_CONFIG_DISCRIMINATOR, 0);
  out[8] = 255;
  out[9] = 2;
  out[10] = 1;
  out.set(addressBytes(MINT), 11);
  out.set(addressBytes(addr(40)), 43);
  out[75] = 1;
  const view = new DataView(out.buffer);
  view.setUint32(76, shareholders.length, true);
  shareholders.forEach((h, i) => { out.set(addressBytes(h.address), 80 + i * 34); view.setUint16(80 + i * 34 + 32, h.shareBps, true); });
  return out;
}

const accountValue = ({ owner = SYSTEM_PROGRAM, lamports = 1_000_000, data = new Uint8Array(0) } = {}) => ({
  lamports, owner, data: [b64(data), 'base64'], executable: false,
});
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const methodOff = () => new Response('{"error":"rate limited"}', { status: 429, headers: { 'retry-after': '10', 'x-ratelimit-method-limit': '0' } });

/**
 * A JSON-RPC node that answers getMultipleAccounts from `accounts` at slot SLOT, and the other methods
 * from `methods`. `failAfter` makes every getMultipleAccounts call after that many answer with an error
 * (the first call reads the coin, the next ones the token accounts).
 */
function network({
  accounts = {}, methods = {}, slot = SLOT, failAfter = null,
} = {}) {
  const calls = [];
  let accountCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const { method, params } = JSON.parse(init.body);
    calls.push({ method, params });
    if (method === 'getMultipleAccounts') {
      accountCalls += 1;
      if (failAfter !== null && accountCalls > failAfter) return json({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'node is behind' } });
      return json({ jsonrpc: '2.0', id: 1, result: { context: slot === null ? {} : { slot }, value: params[0].map((key) => accounts[key] ?? null) } });
    }
    const fn = methods[method];
    if (!fn) return json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: `${method} is not stubbed` } });
    const out = fn(params);
    return out instanceof Response ? out : json({ jsonrpc: '2.0', id: 1, result: out });
  };
  return calls;
}

/** The pump program's creation instruction as getTransaction (jsonParsed) shows an instruction it cannot parse: the program id and the data in base58. */
const createInstruction = (name = 'create_v2') => ({ programId: PUMP_PROGRAM, accounts: [], data: b58encode(Uint8Array.from([...CREATE_DISCRIMINATORS[name], 4, 5, 6])) });

/** A transaction as getTransaction returns it, with the token balances before and after. */
function transaction({
  slot, keys, balances, signers = [], instructions = [], inner = [], err = null,
}) {
  const side = (which) => balances.filter((b) => b[which] !== null)
    .map((b) => ({ accountIndex: b.index, mint: b.mint, owner: b.owner, uiTokenAmount: { amount: String(b[which]), decimals: 6 } }));
  return {
    slot, blockTime: 1_790_000_000, version: 0,
    transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey, signer: signers.includes(pubkey), writable: true })), instructions } },
    meta: {
      err, innerInstructions: inner.length ? [{ index: 0, instructions: inner }] : [],
      preTokenBalances: side('pre'), postTokenBalances: side('post'), preBalances: keys.map(() => 0), postBalances: keys.map(() => 0),
    },
  };
}

const DEV_ACCOUNT = addr(31);
const CURVE_ACCOUNT = addr(32);

/**
 * A coin created as declared, on a stubbed chain: the mint (name, ticker, no authority), its curve,
 * pump.fun's Global account, no fee-sharing account, and one creation transaction (the create_v2
 * instruction signed by the creator and the mint) in which the creator buys nothing. Options change
 * one thing at a time: who signs the creation (`signers`) and who owns the dev's tokens (`devOwner`);
 * `devBuy`, the dev's buy inside the creation; `creatorHolds`, tokens the creator holds in its
 * associated account (bought later, outside the window); `failedAttempt`, a failed attempt 20 slots
 * before the creation; `recognized: false`, a creation transaction without the create instruction;
 * `creatorAccount`, any account at the creator's associated address; `sharing`, an account at the sharing address (true:
 * a real config); `mint`, the mint's fields.
 */
function world({
  curve = {}, global = {}, mint = {}, sharing = null, devBuy = 0n, withGlobal = true, withCurve = true, transactions = true, signatures = 1,
  slot = SLOT, signers = [CREATOR, MINT], devOwner = CREATOR, creationSlot = 100, failedAttempt = false, creatorHolds = 0n, recognized = true,
  failAfter = null, creatorAccount = null,
} = {}) {
  const accounts = {
    [MINT]: accountValue({ owner: TOKEN_2022_PROGRAM, data: mintBytes(mint) }),
    [globalAddress()]: withGlobal ? accountValue({ owner: PUMP_PROGRAM, data: globalBytes(global) }) : null,
    [CURVE]: withCurve ? accountValue({ owner: PUMP_PROGRAM, data: curveBytes(curve) }) : null,
    [SHARING]: sharing === true ? accountValue({ owner: FEE_PROGRAM, data: sharingConfigBytes() }) : sharing,
    [DEV_ACCOUNT]: devBuy > 0n ? accountValue({ owner: TOKEN_2022_PROGRAM, data: tokenAccountBytes({ mint: MINT, owner: devOwner, amount: devBuy }) }) : null,
    [CREATOR_ATA]: creatorAccount ?? (creatorHolds > 0n ? accountValue({ owner: TOKEN_2022_PROGRAM, data: tokenAccountBytes({ mint: MINT, owner: CREATOR, amount: creatorHolds }) }) : null),
  };
  const creation = sig(1);
  const attempt = sig(2);
  const keys = [...signers, CURVE_ACCOUNT, DEV_ACCOUNT];
  const balances = [{ index: signers.length, owner: CURVE, mint: MINT, pre: null, post: TOKENS }];
  if (devBuy > 0n) balances.push({ index: signers.length + 1, owner: devOwner, mint: MINT, pre: null, post: devBuy });
  const tx = transaction({ slot: creationSlot, keys, signers, balances, instructions: recognized ? [createInstruction()] : [] });
  return network({
    accounts,
    slot,
    failAfter,
    methods: {
      getTokenLargestAccounts: methodOff,
      getProgramAccounts: () => [{
        pubkey: CURVE_ACCOUNT,
        account: { data: [b64(Uint8Array.from([...addressBytes(CURVE), ...new Uint8Array(new BigUint64Array([TOKENS]).buffer)])), 'base64'] },
      }],
      getSignaturesForAddress: () => [
        ...Array.from({ length: signatures }, () => ({ signature: creation, slot: creationSlot, err: null, blockTime: 1_790_000_000 })),
        ...(failedAttempt ? [{ signature: attempt, slot: creationSlot - 20, err: { InstructionError: [0, 'Custom'] }, blockTime: 1_789_999_980 }] : []),
      ],
      getTransaction: () => (transactions ? tx : null),
    },
  });
}

/** The declared settings as the repository holds them. */
async function declaredSettings() {
  const declared = await loadDeclared();
  assert.equal(declared.ok, true, declared.errors.join('; '));
  return declared.settings;
}

/** Reads the coin back as `--ouverture` does. */
async function ticketFor(options = {}, live = { wallets: { creator: CREATOR } }, audit_ = {}) {
  const declared = await declaredSettings();
  const result = await audit({ live, mint: MINT, rpcUrl: RPC, quote: declared.quote, declared, now: NOW, ...audit_ });
  return { result, o: buildOuverture({ result, declared }), ...options };
}

// the judged rows, in the order of the ticket; metadataAuthority is information and is never judged
const JUDGED = [
  'quote', 'creator', 'creatorSigned', 'isHolderReward', 'isCashbackCoin', 'isMayhemMode', 'canEditCreatorFee', 'creatorFeeBps',
  'launchReserves', 'feeSharing', 'creatorBuy', 'supply', 'tokenName', 'tokenSymbol', 'mintAuthority', 'freezeAuthority',
];
const KEYS = [...JUDGED.slice(0, 14), 'metadataAuthority', ...JUDGED.slice(14)];
const byKey = (o) => Object.fromEntries(o.rows.map((r) => [r.key, r]));
const failing = (o) => o.rows.filter((r) => r.status === 'fail').map((r) => r.key);
const notOk = (o) => o.rows.filter((r) => r.status !== 'ok' && r.status !== 'info').map((r) => r.key);
// the call that reads the creator's token accounts (the top-10 reader makes calls of its own)
const heldRead = (calls) => calls.find((c) => c.method === 'getMultipleAccounts' && c.params[0].includes(CREATOR_ATA));

test('the test encoder writes the layout the decoders read, field by field', () => {
  const curve = parseBondingCurve(curveBytes({ creatorFeeBps: 30n, isHolderReward: true }));
  for (const [name, value] of Object.entries(curveValues({ creatorFeeBps: 30n, isHolderReward: true }))) assert.equal(curve[name], value, name);
  const global = parseGlobal(globalBytes());
  for (const [name, value] of Object.entries(globalValues())) assert.deepEqual(global[name], value, name);
  assert.equal(curveBytes().length, 166, 'the size of a curve on mainnet on 17 October 2026');
  assert.equal(globalBytes().length, 1088, 'and of the Global account');
});

// ---------------------------------------------------------------- the declaration

test('the declaration in the repository is valid, says USDC like config.js, and holds no address', async () => {
  const declared = await loadDeclared();
  assert.equal(declared.ok, true, declared.errors.join('; '));
  assert.deepEqual(Object.keys(declared.settings).sort(), Object.keys(DECLARED_SETTINGS).sort());
  assert.equal(declared.settings.quote, loadConfig().launchpad.quote, 'the quote asset the founders declare is the one the site is written for');
  assert.equal(declared.settings.creator, 'live.wallets.creator', 'the creator comes from live.json, never from this file');
  const text = readFileSync(declaredFile, 'utf8');
  for (const token of text.split(/[\s",:{}[\]]+/)) {
    assert.equal(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token) && !/^[a-zA-Z]+$/.test(token), false, `${token} looks like an address`);
  }
});

test('the declared name and ticker are the plan’s: the same as the launch gate of mcp/tools.mjs, which docs/moteur.md pins', async () => {
  const declared = await declaredSettings();
  assert.deepEqual([declared.tokenName, declared.tokenSymbol], [PLAN.name, PLAN.symbol]);
  assert.deepEqual(DEFAULT_TOKEN, PLAN);
});

test('a declaration may only say what docs/moteur.md section 3 says: anything else is refused, not read back', () => {
  const good = JSON.parse(readFileSync(declaredFile, 'utf8'));
  assert.equal(validateDeclared(good).ok, true);
  assert.equal(validateDeclared({ ...good, settings: { ...good.settings, quote: 'SOL' } }).ok, true, 'SOL is the fallback of docs/moteur.md');
  const mutations = [
    ['creatorFeeBps', 30], ['creatorFeeBps', 300], ['isHolderReward', true], ['isCashbackCoin', true], ['isMayhemMode', true],
    ['canEditCreatorFee', true], ['feeSharing', 'two wallets'], ['creatorBuy', 50], ['quote', 'EUR'], ['mintAuthority', 'creator'],
    ['freezeAuthority', 'creator'], ['creator', addr(11)], ['initialVirtualQuoteReserves', 4_292_000_000], ['supplyAtMost', 2_000_000_000],
    ['tokenName', 'Le Plein 2'], ['tokenSymbol', 'PLEIN2'],
  ];
  for (const [key, value] of mutations) {
    const checked = validateDeclared({ ...good, settings: { ...good.settings, [key]: value } });
    assert.equal(checked.ok, false, `${key} = ${value}`);
    assert.equal(checked.settings, null);
    assert.ok(checked.errors.some((e) => e.startsWith(`settings.${key}:`)), `${key}: ${checked.errors.join('; ')}`);
  }
  const missing = { ...good.settings };
  delete missing.feeSharing;
  assert.ok(validateDeclared({ ...good, settings: missing }).errors.includes('settings.feeSharing: missing'));
  assert.ok(validateDeclared({ ...good, settings: { ...good.settings, airdrop: true } }).errors.includes('settings.airdrop: not a setting the audit reads'));
  assert.ok(validateDeclared({ ...good, version: 2 }).errors.includes('version: expected 1'));
  assert.equal(validateDeclared(null).ok, false);
  assert.equal(validateDeclared([]).ok, false);
  assert.equal(validateDeclared({ version: 1 }).ok, false);
});

test('loadDeclared never throws: a missing or broken file is a failed row, not a crash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-declared-'));
  try {
    const missing = await loadDeclared(join(dir, 'nothing.json'));
    assert.equal(missing.ok, false);
    assert.match(missing.errors[0], /nothing\.json/);
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    assert.equal((await loadDeclared(join(dir, 'broken.json'))).ok, false);
    writeFileSync(join(dir, 'empty.json'), '{}');
    assert.equal((await loadDeclared(join(dir, 'empty.json'))).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the read-back

test('a coin created as declared reads ✓ on every judged row, each with its account and the slot of its read', async () => {
  const calls = world();
  const { result, o } = await ticketFor();
  assert.deepEqual(o.rows.map((r) => r.key), KEYS);
  assert.deepEqual(o.rows.map((r) => r.status), KEYS.map((k) => (k === 'metadataAuthority' ? 'info' : 'ok')), JSON.stringify(o.rows.filter((r) => r.status !== 'ok')));
  assert.equal(o.verdict, 'ok');
  assert.deepEqual(o.counts, { ok: 16, fail: 0, unread: 0, total: 16 });
  assert.deepEqual(result.limits, [], 'nothing was capped, nothing was missing');
  // one call read the mint, the curve, the Global account and the sharing config: one slot for all of them
  const reads = calls.filter((c) => c.method === 'getMultipleAccounts');
  assert.deepEqual(reads[0].params[0], [MINT, CURVE, globalAddress(), SHARING]);
  // the creator's token accounts come from a second read, at its own slot
  assert.deepEqual(heldRead(calls).params[0], [CREATOR_ATA]);
  assert.equal(o.slot, SLOT);
  const rows = byKey(o);
  for (const key of KEYS.filter((k) => k !== 'creatorBuy' && k !== 'creatorSigned')) assert.equal(rows[key].slot, SLOT, key);
  assert.equal(rows.quote.account, CURVE);
  assert.equal(rows.creator.account, CURVE);
  assert.equal(rows.creatorFeeBps.account, CURVE);
  assert.equal(rows.launchReserves.account, CURVE);
  assert.equal(rows.feeSharing.account, SHARING);
  assert.equal(rows.supply.account, MINT);
  assert.equal(rows.tokenName.account, MINT);
  assert.equal(rows.mintAuthority.account, MINT);
  assert.equal(rows.creatorSigned.source, 'transactions');
  assert.equal(rows.creatorSigned.slot, 100, 'the creator signature is read in the creation transaction');
  assert.equal(rows.creatorBuy.source, 'transactions');
  assert.equal(rows.creatorBuy.slot, 100, 'the creator buy is read in the creation block and the next ones');
  assert.equal(rows.creatorBuy.slotTo, 105);
  assert.deepEqual([rows.creatorBuy.heldSlot, rows.creatorBuy.heldAccounts], [SLOT, [CREATOR_ATA]]);
  // the values
  assert.equal(rows.quote.found, 'USDC');
  assert.equal(rows.creator.found, CREATOR);
  assert.equal(rows.creatorSigned.found, 'a signé la transaction de création (payeur des frais)');
  assert.equal(rows.creatorFeeBps.found, '0 point de base');
  assert.equal(plain(rows.launchReserves.found), '4 292 USDC');
  assert.equal(rows.feeSharing.found, `aucun compte de partage au slot ${SLOT}`);
  assert.equal(rows.tokenName.found, 'Le Plein');
  assert.equal(rows.tokenSymbol.found, 'PLEIN');
  assert.equal(rows.metadataAuthority.found, 'aucune : nul ne peut plus les changer');
  assert.equal(o.creationSlot, 100);
  assert.equal(o.createdAt, new Date(1_790_000_000 * 1000).toISOString(), 'the block time of the creation');
  assert.equal(o.creatorSource, 'live.json');
  assert.deepEqual(o.addresses, { mint: MINT, bondingCurve: CURVE, global: globalAddress(), feeSharingConfig: SHARING, creator: CREATOR });
});

test('each wrong setting fails its own row and no other, and the verdict is a fail', async () => {
  const flagged = (flag) => ({ curve: { [flag]: true } });
  const cases = [
    ['quote', { curve: { quoteMint: SYSTEM_PROGRAM } }],
    ['creator', { curve: { creator: addr(12) } }],
    ['creatorSigned', { signers: [addr(70), MINT] }],
    ['isHolderReward', flagged('isHolderReward')],
    ['isCashbackCoin', flagged('isCashbackCoin')],
    ['isMayhemMode', flagged('isMayhemMode')],
    ['canEditCreatorFee', flagged('canEditCreatorFee')],
    ['creatorFeeBps', { curve: { creatorFeeBps: 30n } }],
    ['creatorFeeBps', { curve: { creatorFeeBps: 300n } }],
    ['creatorFeeBps', { curve: { creatorFeeBps: 1n } }],
    ['launchReserves', { curve: { initialVirtualQuoteReserves: 1_000_000_000n } }],
    ['launchReserves', { global: { initialVirtualQuoteReserves: 5_000_000_000n } }],
    ['feeSharing', { sharing: true }],
    ['creatorBuy', { devBuy: 5_000_000n }],
    ['creatorBuy', { creatorHolds: 5_000_000n }],
    ['supply', { mint: { supply: 2_000_000_000_000_000n } }],
    ['tokenName', { mint: { name: 'Le Plein 2' } }],
    ['tokenSymbol', { mint: { symbol: 'PLEIN2' } }],
    ['mintAuthority', { mint: { mintAuthority: addr(13) } }],
    ['freezeAuthority', { mint: { freezeAuthority: addr(13) } }],
  ];
  for (const [key, options] of cases) {
    world(options);
    const { o } = await ticketFor();
    assert.deepEqual(failing(o), [key], `${key} ${JSON.stringify(Object.keys(options))}`);
    assert.equal(o.verdict, 'fail', key);
    assert.equal(o.counts.fail, 1);
    await assert.rejects(() => writeOuvertureTicket(o, { dir: join(tmpdir(), 'plein-never-written') }), /only when every row is ✓/, key);
  }
});

test('a fee rate of 30 is not read as "the default schedule": only 0 passes (docs/moteur.md section 3)', async () => {
  for (const [bps, ok] of [[0n, true], [30n, false], [300n, false]]) {
    world({ curve: { creatorFeeBps: bps } });
    const { o } = await ticketFor();
    const row = byKey(o).creatorFeeBps;
    assert.equal(row.status, ok ? 'ok' : 'fail', `${bps}`);
    assert.equal(row.expected, '0 point de base (barème par défaut)');
  }
});

test('what could not be read or compared is never ✓: the verdict is incomplete and nothing is written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-unread-'));
  try {
    // 1. no creator published: the curve's creator is read, but there is nothing to compare it with
    world();
    const unpublished = (await ticketFor({}, { wallets: {} })).o;
    assert.deepEqual(notOk(unpublished), ['creator', 'creatorSigned']);
    assert.equal(byKey(unpublished).creator.read, true, 'read, not compared');
    assert.equal(unpublished.verdict, 'incomplete');
    assert.equal(unpublished.creatorSource, null);
    assert.match(plain(formatOuverture(unpublished)), /« non comparé » Créateur : /);

    // 2. the creation is out of reach (a full page of signatures and --max-pages 1): the creator's buy and signature are not read
    world({ signatures: 1000 });
    const far = (await ticketFor({}, undefined, { maxPages: 1 })).o;
    assert.deepEqual(notOk(far), ['creatorSigned', 'creatorBuy']);
    assert.deepEqual([byKey(far).creatorBuy.read, byKey(far).creatorBuy.ok], [false, null], 'what the creator holds was read, what it bought was not: so the row is unread');
    assert.deepEqual([byKey(far).creatorSigned.read, byKey(far).creatorSigned.ok], [false, null]);
    assert.equal(far.verdict, 'incomplete');
    assert.equal(far.creationSlot, null, 'no creation slot is claimed when the creation was not reached');
    assert.match(plain(formatOuverture(far)), /« non lu » Achat du créateur à la création : achats non lus/);
    assert.match(plain(formatOuverture(far)), /« non lu » Créé et signé par le wallet créateur/);
    assert.ok(far.limits.some((l) => l.includes('création non atteinte')));

    // 3. the node does not have the creation transaction: "bought nothing" is not proven, nor who signed
    world({ transactions: false });
    const missing = (await ticketFor()).o;
    assert.deepEqual(notOk(missing), ['creatorSigned', 'creatorBuy']);
    assert.match(byKey(missing).creatorBuy.found, /lecture incomplète/);
    assert.equal(missing.verdict, 'incomplete');

    // 4. pump.fun's Global account is gone: the launch reserves have nothing to be compared with
    world({ withGlobal: false });
    const noGlobal = (await ticketFor()).o;
    assert.deepEqual(notOk(noGlobal), ['launchReserves']);
    assert.equal(byKey(noGlobal).launchReserves.expected, 'celles du compte Global (non lu)');
    assert.equal(noGlobal.verdict, 'incomplete');

    // 5. a curve quoted in SOL against a USDC declaration is a ✗, and the reserves are then not compared
    world({ curve: { quoteMint: SYSTEM_PROGRAM } });
    const sol = (await ticketFor()).o;
    assert.deepEqual(failing(sol), ['quote']);
    assert.deepEqual(notOk(sol), ['quote', 'launchReserves']);
    assert.equal(byKey(sol).launchReserves.found, 'non comparé (pas une courbe USDC)');
    assert.equal(sol.verdict, 'fail');

    // 6. the token accounts of the creator cannot be read (the first call answered, the next ones do not)
    world({ failAfter: 1 });
    const blind = await ticketFor();
    assert.deepEqual(notOk(blind.o), ['creatorBuy']);
    assert.match(byKey(blind.o).creatorBuy.found, /détention non lue/);
    assert.ok(blind.result.limits.some((l) => l.startsWith('soldes de jetons du créateur')));

    for (const o of [far, missing, noGlobal, blind.o]) {
      assert.equal(o.counts.ok, o.counts.total - o.counts.unread);
      await assert.rejects(() => writeOuvertureTicket(o, { dir }), /only when every row is ✓/);
    }
    assert.equal(existsSync(join(dir, 'ouverture.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a node that gives no slot cannot vouch for a row: nothing is ✓ without the slot it was read at', async () => {
  world({ slot: null });
  const { o } = await ticketFor();
  assert.equal(o.slot, null);
  assert.deepEqual(notOk(o), JUDGED.filter((k) => k !== 'creatorSigned'), 'every row of the first call is unread, and so is the creator buy, whose holding has no slot; the creation transaction keeps its own slot');
  assert.match(byKey(o).quote.found, /\(slot non lu\)$/);
  assert.equal(byKey(o).creatorSigned.status, 'ok');
  assert.equal(o.verdict, 'incomplete');
  assert.match(plain(formatOuverture(o)), /« non lu » Monnaie de cotation : USDC \(slot non lu\)/);
});

test('a mint with no pump.fun curve is a failed first row, never an empty list of rows that passes', async () => {
  world({ withCurve: false });
  const { o } = await ticketFor();
  assert.equal(o.verdict, 'fail');
  assert.equal(o.rows[0].key, 'curve');
  assert.equal(o.rows[0].status, 'fail');
  assert.equal(o.counts.ok, 2, 'only the two authorities of the mint were read');
});

test('a quote that config.js does not share with the declaration is a row of its own', async () => {
  world();
  const { result } = await ticketFor();
  const declared = await declaredSettings();
  const curve = parseBondingCurve(curveBytes());
  const rows = (configQuote) => checkCurveSettings({ curve, quote: declared.quote, liveCreator: CREATOR, launch: { global: parseGlobal(globalBytes()), sharing: null, creatorBuy: null, declared, configQuote } }).rows;
  assert.equal(rows('USDC').some((r) => r.key === 'configQuote'), false, 'the same quote: no extra row');
  assert.deepEqual(rows('SOL').filter((r) => r.key === 'configQuote').map((r) => [r.ok, r.found]), [[false, 'SOL']]);
  assert.ok(result.curveSettings.rows.every((r) => r.key !== 'configQuote'));
});

test('without the launch rows checkCurveSettings is what it was: the seven settings and nothing else', () => {
  const curve = parseBondingCurve(curveBytes());
  const out = checkCurveSettings({ curve, quote: 'USDC', liveCreator: CREATOR, mintSupply: curve.tokenTotalSupply });
  assert.deepEqual(out.rows.map((r) => r.key), ['quote', 'creator', 'isHolderReward', 'isCashbackCoin', 'isMayhemMode', 'canEditCreatorFee', 'supply']);
  assert.equal(out.allChecked, true);
});

// ---------------------------------------------------------------- who created the coin

test('a failed attempt before the creation does not become the creation: the real one is read, with its buy', async () => {
  // the failed attempt is 20 slots before: with the oldest signature as the creation, the window would be empty
  world({ failedAttempt: true });
  const clean = await ticketFor();
  assert.equal(clean.o.verdict, 'ok', JSON.stringify(clean.o.rows.filter((r) => r.status !== 'ok' && r.status !== 'info')));
  assert.equal(clean.o.creationSlot, 100);
  assert.equal(clean.result.creation.confirmed, true);
  assert.equal(byKey(clean.o).creatorBuy.slot, 100);

  // the creator buys in the real creation: the row is ✗ (it was ✓ « 0 jeton » over an empty window)
  world({ failedAttempt: true, devBuy: 5_000_000n, creationSlot: 120 });
  const bought = await ticketFor();
  assert.deepEqual(failing(bought.o), ['creatorBuy']);
  assert.equal(bought.o.creationSlot, 120);
  assert.equal(bought.o.createdAt, new Date(1_790_000_000 * 1000).toISOString(), 'the time of the creation, not of the failed attempt');
  assert.match(plain(byKey(bought.o).creatorBuy.found), /^5 jetons achetés entre les slots 120 et 125, 5 détenus au slot /);

  // only failed attempts: nothing was created, so nothing is proven
  network({
    accounts: { [MINT]: accountValue({ owner: TOKEN_2022_PROGRAM, data: mintBytes() }), [CURVE]: accountValue({ owner: PUMP_PROGRAM, data: curveBytes() }), [globalAddress()]: accountValue({ owner: PUMP_PROGRAM, data: globalBytes() }) },
    methods: {
      getTokenLargestAccounts: methodOff,
      getProgramAccounts: () => [],
      getSignaturesForAddress: () => [{ signature: sig(2), slot: 80, err: { InstructionError: [0, 'Custom'] }, blockTime: 1_789_999_980 }],
    },
  });
  const failedOnly = await ticketFor();
  assert.equal(failedOnly.o.creationSlot, null);
  assert.deepEqual(notOk(failedOnly.o), ['creatorSigned', 'creatorBuy']);
  assert.equal(failedOnly.o.verdict, 'incomplete');
});

test('what the creator holds is read from its token accounts, not only from the account that took a buy in the window', async () => {
  // tokens bought later, outside the first blocks: the window shows no buy, the associated account holds 5 tokens
  const calls = world({ creatorHolds: 5_000_000n });
  const { o } = await ticketFor();
  assert.deepEqual(failing(o), ['creatorBuy']);
  assert.match(plain(byKey(o).creatorBuy.found), /^0 jeton acheté entre les slots 100 et 105, 5 détenus au slot /);
  assert.equal(byKey(o).creatorBuy.ok, false);
  assert.deepEqual(heldRead(calls).params[0], [CREATOR_ATA]);
  assert.match(plain(formatOuverture(o)), new RegExp(`les comptes de jetons du créateur \\(${CREATOR_ATA}\\) au slot ${SLOT}`));
  // a creator that holds tokens fails even when the window could not be read at all
  world({ creatorHolds: 5_000_000n, signatures: 1000 });
  const far = (await ticketFor({}, undefined, { maxPages: 1 })).o;
  assert.equal(byKey(far).creatorBuy.status, 'fail');
  assert.match(plain(byKey(far).creatorBuy.found), /^achats non lus, 5 détenus au slot /);
  // a stranger who sends lamports to the creator's associated address makes a system account there, not a holding
  world({ creatorAccount: accountValue({ owner: SYSTEM_PROGRAM, lamports: 890_880 }) });
  const griefed = (await ticketFor()).o;
  assert.equal(griefed.verdict, 'ok', 'lamports on the address are not tokens, and they must not break the read');
  assert.match(plain(byKey(griefed).creatorBuy.found), /^0 jeton acheté entre les slots 100 et 105, 0 détenu au slot /);
});

test('the curve’s creator field proves nothing: the creator wallet must have signed the creation, and a signer’s buy is a creator buy', async () => {
  // a clone: its curve names the station wallet, and a stranger signed and paid (the signer is not the creator)
  world({ signers: [addr(70), MINT] });
  const clone = await ticketFor();
  assert.deepEqual(failing(clone.o), ['creatorSigned']);
  assert.equal(byKey(clone.o).creator.status, 'ok', 'the curve does name the station wallet; that alone proved nothing');
  assert.equal(clone.o.verdict, 'fail');
  assert.match(plain(byKey(clone.o).creatorSigned.found), /^n’a pas signé la transaction de création \(signataires : /);
  assert.match(plain(formatOuverture(clone.o)), /✗ Créé et signé par le wallet créateur/);

  // the same clone, with the stranger buying in the creation transaction: that buy is counted as the creator's
  world({ signers: [addr(70), MINT], devOwner: addr(70), devBuy: 5_000_000n });
  const dev = await ticketFor();
  assert.deepEqual(failing(dev.o), ['creatorSigned', 'creatorBuy']);
  assert.match(plain(byKey(dev.o).creatorBuy.found), /^5 jetons achetés/);
  assert.equal(dev.result.sameBlock.wallets, 0, 'a signer of the creation is not a "bundled buyer" either');

  // the creator signed but another wallet paid the fees: still the creator's signature
  world({ signers: [addr(70), CREATOR, MINT] });
  const sponsored = await ticketFor();
  assert.equal(sponsored.o.verdict, 'ok');
  assert.equal(byKey(sponsored.o).creatorSigned.found, 'a signé la transaction de création');

  // the node does not say who signed: unread, never guessed
  world();
  const stubbed = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const response = await stubbed(url, init);
    if (JSON.parse(init.body).method !== 'getTransaction') return response;
    const body = await response.json();
    body.result.transaction.message.accountKeys = body.result.transaction.message.accountKeys.map((k) => k.pubkey);
    return json(body);
  };
  const unknown = await ticketFor();
  assert.deepEqual(notOk(unknown.o), ['creatorSigned']);
  assert.match(byKey(unknown.o).creatorSigned.found, /le nœud n’a pas donné les signataires/);

  // a creation transaction without the create instruction is not recognized: no creation slot, no signature, no zero buy
  world({ recognized: false });
  const wrapped = await ticketFor();
  assert.deepEqual(notOk(wrapped.o), ['creatorSigned', 'creatorBuy']);
  assert.equal(wrapped.o.creationSlot, null);
  assert.equal(wrapped.o.createdAt, null);
  assert.ok(wrapped.o.limits.some((l) => l.includes('transaction de création non reconnue')));
});

// ---------------------------------------------------------------- the fee-sharing account

test('only a sharing config of the fee program is sharing: a stranger’s lamports on the address do not block the launch', async () => {
  // a real config: ✗, with who gets what
  world({ sharing: true });
  const real = await ticketFor();
  assert.deepEqual(failing(real.o), ['feeSharing']);
  assert.match(plain(byKey(real.o).feeSharing.found), /^compte de partage présent : 1 bénéficiaire \(/);

  // someone sent lamports to the address: a system account with no data, which is not sharing
  world({ sharing: accountValue({ owner: SYSTEM_PROGRAM, lamports: 890_880, data: new Uint8Array(0) }) });
  const griefed = await ticketFor();
  assert.equal(griefed.o.verdict, 'ok', JSON.stringify(griefed.o.rows.filter((r) => r.status !== 'ok' && r.status !== 'info')));
  assert.equal(byKey(griefed.o).feeSharing.status, 'ok');
  assert.match(plain(byKey(griefed.o).feeSharing.found), /^aucun compte du programme de frais au slot \d+ \(l’adresse a reçu 890 880 lamports d’un tiers/);

  // an account the audit cannot place is shown with its owner and left to a person, never ✓ and never a silent ✗
  world({ sharing: accountValue({ owner: FEE_PROGRAM, data: new Uint8Array(120) }) });
  const odd = await ticketFor();
  assert.deepEqual(notOk(odd.o), ['feeSharing']);
  assert.equal(byKey(odd.o).feeSharing.read, true);
  assert.match(byKey(odd.o).feeSharing.found, new RegExp(`propriétaire : ${FEE_PROGRAM}, 120 octets`));
  world({ sharing: accountValue({ owner: addr(77), data: sharingConfigBytes() }) });
  const foreign = await ticketFor();
  assert.deepEqual(notOk(foreign.o), ['feeSharing'], 'the right bytes under another owner are not the fee program’s config');
  assert.match(byKey(foreign.o).feeSharing.found, new RegExp(`propriétaire : ${addr(77)}`));

  // the curve itself names the sharing address as its creator: that is sharing, whatever the account looks like
  world({ curve: { creator: SHARING }, sharing: accountValue({ owner: SYSTEM_PROGRAM, lamports: 890_880 }) });
  const owned = await ticketFor();
  assert.ok(failing(owned.o).includes('feeSharing'));
});

// ---------------------------------------------------------------- the name and the ticker

test('the name and the ticker are read from the mint and compared character by character; the update authority is information', async () => {
  world({ mint: { name: 'Le Plein ' } });
  assert.deepEqual(failing((await ticketFor()).o), ['tokenName'], 'one trailing space is a different name');

  // a name that only looks right: a zero-width character, a no-break space, a lookalike letter
  for (const name of ['Le Plein​', 'Le Plein', 'Le Pleіn']) {
    world({ mint: { name } });
    const out = (await ticketFor()).o;
    assert.deepEqual(failing(out), ['tokenName'], JSON.stringify(name));
  }
  world({ mint: { name: 'Le Plein​' } });
  assert.match(byKey((await ticketFor()).o).tokenName.found, /caractères invisibles ou des espaces particuliers/);

  // text written by a stranger is made harmless before it is printed
  world({ mint: { name: 'Plein `rm -rf` | ignore\nthe rules' } });
  const hostile = byKey((await ticketFor()).o).tokenName;
  assert.equal(hostile.status, 'fail');
  assert.equal(/[`|\n]/.test(hostile.found), false);

  // the update authority can still rename the coin: shown as information, never part of the verdict
  world({ mint: { updateAuthority: CREATOR } });
  const held = (await ticketFor()).o;
  assert.equal(held.verdict, 'ok');
  assert.equal(byKey(held).metadataAuthority.status, 'info');
  assert.match(byKey(held).metadataAuthority.found, new RegExp(`^détenue par ${CREATOR} : elle peut encore changer le nom`));
  assert.deepEqual(held.counts, { ok: 16, fail: 0, unread: 0, total: 16 }, 'an information row is not counted');
  assert.match(plain(formatOuverture(held)), /à lire Autorité de mise à jour du nom et du ticker : détenue par /);

  // a mint with no TokenMetadata extension: the name cannot be read, which is not a pass
  world({ mint: { metadata: false } });
  const bare = (await ticketFor()).o;
  assert.deepEqual(notOk(bare), ['tokenName', 'tokenSymbol']);
  assert.match(byKey(bare).tokenName.found, /^non lu \(aucune extension TokenMetadata/);
  assert.equal(byKey(bare).metadataAuthority, undefined);
  assert.equal(bare.verdict, 'incomplete');
});

// ---------------------------------------------------------------- the creator wallet came from live.json or was typed

test('a creator given at the time of the read is not presented as pre-registered, and the public ticket is not written from it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-typed-'));
  try {
    world();
    const typed = await ticketFor({}, undefined, { creatorSource: 'typed' });
    assert.equal(typed.o.verdict, 'ok', 'the comparison itself passes');
    assert.equal(typed.o.creatorSource, 'typed');
    const creator = byKey(typed.o).creator;
    assert.match(creator.expected, /donné avec --creator à la lecture, non déposé dans le dépôt avant la création/);
    assert.equal(creator.plate.endsWith('(donné)'), true);
    const text = plain(formatOuverture(typed.o, { markdown: true }));
    assert.match(text, /- Wallet créateur : donné avec --creator à la lecture\. Il n’était pas dans le dépôt avant la création : cette comparaison n’est pas pré-enregistrée/);
    assert.match(text, /Le ticket public ne s’écrit pas avec une adresse donnée\./);
    const plate = await renderOuvertureHtml(typed.o, { fonts: '' });
    assert.match(plate, /sauf le wallet créateur : donné à la lecture, non déposé avant la création/);
    assert.match(plate, /Créateur<\/span><i><\/i><b>[^<]*\(donné\)<\/b>/);
    await assert.rejects(() => writeOuvertureTicket(typed.o, { dir }), /wallets\.creator of public\/live\.json/);
    assert.equal(existsSync(join(dir, 'ouverture.json')), false);

    // from live.json the same read can be published, and the plate does not hedge about the creator
    world();
    const fromLive = await ticketFor();
    assert.equal(fromLive.o.creatorSource, 'live.json');
    assert.equal(byKey(fromLive.o).creator.expected, CREATOR);
    assert.match(plain(formatOuverture(fromLive.o)), /Wallet créateur : celui de wallets\.creator dans public\/live\.json/);
    assert.doesNotMatch(await renderOuvertureHtml(fromLive.o, { fonts: '' }), /sauf le wallet créateur/);
    assert.equal(ouvertureTicket(fromLive.o).creatorSource, 'live.json');
    await writeOuvertureTicket(fromLive.o, { dir });
    assert.equal(JSON.parse(readFileSync(join(dir, 'ouverture.json'), 'utf8')).creatorSource, 'live.json');

    // no creator at all: nothing to compare, nothing written
    world();
    const none = await ticketFor({}, { wallets: {} });
    assert.equal(none.o.creatorSource, null);
    assert.match(plain(formatOuverture(none.o)), /Wallet créateur : aucun à comparer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the ticket for the ops chat

test('the ticket prints ✓ and where each row was read: the account, the slot and the basis', async () => {
  world();
  const { o } = await ticketFor();
  const text = plain(formatOuverture(o, { markdown: true }));
  const lines = text.split('\n');
  assert.equal(lines[0], `## TICKET D’OUVERTURE · ${NOW.toISOString()}`);
  assert.match(text, /- Verdict : TOUT EST LU ET CONFORME : 16 réglages sur 16\. Une personne ouvre la PR de live\.json, l’autre l’approuve\./);
  assert.match(text, new RegExp(`- Contrat : ${MINT} \\(nœud : custom node, slot ${SLOT}\\) · créé au slot 100`));
  const rowLines = lines.filter((l) => l.startsWith('- ✓'));
  assert.equal(rowLines.length, 16);
  assert.ok(rowLines.includes(`- ✓ Monnaie de cotation : USDC · attendu : USDC · lu dans ${CURVE} au slot ${SLOT}, d’après l’IDL`));
  assert.ok(rowLines.includes(`- ✓ Créé et signé par le wallet créateur : a signé la transaction de création (payeur des frais) · attendu : signature de ${CREATOR} sur la transaction de création · lu dans les transactions de ${CURVE}, au slot 100, d’après les soldes de jetons des transactions`));
  assert.ok(rowLines.includes(`- ✓ Taux de frais du créateur : 0 point de base · attendu : 0 point de base (barème par défaut) · lu dans ${CURVE} au slot ${SLOT}, d’après l’IDL`));
  assert.ok(rowLines.includes(`- ✓ Réserves virtuelles de départ : 4 292 USDC · attendu : 4 292 USDC (compte Global) · lu dans ${CURVE} au slot ${SLOT}, d’après l’IDL`));
  assert.ok(rowLines.includes(`- ✓ Partage des frais : aucun compte de partage au slot ${SLOT} · attendu : aucun compte de partage · lu dans ${SHARING} au slot ${SLOT}, d’après l’IDL`));
  assert.ok(rowLines.includes(`- ✓ Achat du créateur à la création : 0 jeton acheté entre les slots 100 et 105, 0 détenu au slot ${SLOT} · attendu : 0 jeton · lu dans les transactions de ${CURVE}, du slot 100 au slot 105, d’après les soldes de jetons des transactions, puis dans les comptes de jetons du créateur (${CREATOR_ATA}) au slot ${SLOT}`));
  assert.ok(rowLines.some((l) => l.startsWith('- ✓ Offre du jeton : ') && l.endsWith(`lu dans ${MINT} au slot ${SLOT}, d’après le format du jeton`)));
  assert.ok(rowLines.includes(`- ✓ Nom du jeton : Le Plein · attendu : Le Plein · lu dans ${MINT} au slot ${SLOT}, d’après l’extension TokenMetadata du jeton`));
  assert.ok(rowLines.some((l) => l.startsWith('- ✓ Autorité de gel : ') && l.includes(`lu dans ${MINT} au slot ${SLOT}`)));
  // the plain text form carries the same lines
  assert.match(formatOuverture(o), /^TICKET D’OUVERTURE · /);
  // a failure prints ✗ and the rule of docs/moteur.md section 3
  world({ curve: { creatorFeeBps: 30n } });
  const wrong = plain(formatOuverture((await ticketFor()).o, { markdown: true }));
  assert.match(wrong, /- ✗ Taux de frais du créateur : 30 points de base · attendu : 0 point de base \(barème par défaut\)/);
  assert.match(wrong, /- Verdict : ÉCART : 1 réglage\(s\) ne correspondent pas à la déclaration\. Ne pas publier ce contrat/);
  assert.equal(wrong.split('\n').filter((l) => l.startsWith('- ✓')).length, 15);
});

// ---------------------------------------------------------------- public/tickets/ouverture.json

test('the public ticket holds addresses, slots and rows, no signature, and is written once and only when every row is ✓', async () => {
  world();
  const { result, o } = await ticketFor();
  const dir = mkdtempSync(join(tmpdir(), 'plein-ouverture-'));
  try {
    writeFileSync(join(dir, 'index.json'), '{"tickets": []}\n');
    const file = await writeOuvertureTicket(o, { dir });
    assert.equal(file, join(dir, 'ouverture.json'));
    const text = readFileSync(file, 'utf8');
    const ticket = JSON.parse(text);
    assert.deepEqual(ticket, ouvertureTicket(o));
    assert.deepEqual(Object.keys(ticket), [
      'kind', 'version', 'asOf', 'verdict', 'slot', 'creationSlot', 'createdAt', 'creatorSource', 'mint', 'bondingCurve', 'global',
      'feeSharingConfig', 'creator', 'declared', 'rows',
    ]);
    assert.equal(ticket.kind, 'ouverture');
    assert.equal(ticket.verdict, 'ok');
    assert.equal(ticket.mint, MINT);
    assert.equal(ticket.slot, SLOT);
    assert.equal(ticket.creatorSource, 'live.json');
    assert.deepEqual(ticket.declared, await declaredSettings());
    assert.deepEqual(ticket.rows.map((r) => r.key), KEYS);
    for (const row of ticket.rows) {
      assert.deepEqual(Object.keys(row), ['key', 'label', 'status', 'expected', 'found', 'account', 'slot']);
      assert.equal(row.status, row.key === 'metadataAuthority' ? 'info' : 'ok');
      assert.ok(row.account && Number.isInteger(row.slot), row.key);
    }
    // nothing that could be a transaction signature or a key: the guard of test/no-signing.test.mjs would refuse it
    assert.equal(text.includes(result.creation.signature), false, 'the creation signature is not in the ticket');
    assert.equal(/[1-9A-HJ-NP-Za-km-z]{80,}/.test(text), false);
    assert.equal(text.includes('limits'), false);
    assert.equal(text.includes('rpc'), false, 'no node, no URL');
    // the weekly index is left alone, and a reader of the published pleins does not see this ticket
    assert.equal(readFileSync(join(dir, 'index.json'), 'utf8'), '{"tickets": []}\n');
    assert.deepEqual(readPublishedTickets(dir), []);
    // a published ticket is never overwritten
    await assert.rejects(() => writeOuvertureTicket(o, { dir }), /already exists/);
    assert.equal(readFileSync(file, 'utf8'), text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the plate

test('the plate says TICKET D’OUVERTURE, never Plein #0, shows words for every state and shortens the addresses', async () => {
  world();
  const { o } = await ticketFor();
  const html = await renderOuvertureHtml(o, { fonts: '' });
  assert.match(html, /<title>Station \$PLEIN · ticket d’ouverture<\/title>/);
  assert.match(html, /TICKET D’OUVERTURE · SOLANA/);
  assert.match(html, /<span class="plate">OUVERTURE<\/span>/);
  assert.equal(/plein\s*#\s*0/i.test(html), false, 'the opening is not a plein');
  assert.match(html, /<div class="card ok">/);
  assert.equal(html.match(/<div class="row ok">/g).length, 16);
  assert.equal(html.match(/<div class="row info">/g).length, 1, 'the update authority is shown, not judged');
  assert.match(html, /TOUT EST LU ET CONFORME/);
  assert.match(html, /16 réglages sur 16/);
  assert.match(html, /LU LE SAM 17\/10 · 15:31/);
  assert.match(html, /slot 100 · slot 457000000/);
  assert.doesNotMatch(html, /\{\{/, 'every placeholder was filled');
  for (const address of [MINT, CURVE, CREATOR]) assert.equal(html.includes(address), false, 'an address is shortened on the plate');
  assert.ok(html.includes(`${MINT.slice(0, 4)}…${MINT.slice(-4)}`));
  assert.doesNotMatch(html, /class="notes"/, 'nothing was capped, so no limit is printed');
  assert.match(html, /class="foot">Réglages déclarés dans le dépôt, relus sur la chaîne d’après l’IDL de pump\.fun\. Adresse complète/);

  world({ curve: { isHolderReward: true } });
  const wrong = await renderOuvertureHtml((await ticketFor()).o, { fonts: '' });
  assert.match(wrong, /<div class="card fail">/);
  assert.match(wrong, /ÉCART : NE PAS PUBLIER/);
  assert.equal(wrong.match(/<div class="row fail">/g).length, 1);
  assert.match(wrong, /<div class="row fail"><span class="mark">ÉCART<\/span><span class="lab">Holder Rewards<\/span>/);

  world({ transactions: false });
  const partial = await renderOuvertureHtml((await ticketFor()).o, { fonts: '' });
  assert.match(partial, /<div class="card incomplete">/);
  assert.match(partial, /LECTURE INCOMPLÈTE/);
  assert.match(partial, /<div class="row unread"><span class="mark">\?<\/span>/);
  assert.match(partial, /class="notes"/, 'what was missing is printed');

  // text written by someone else is escaped
  const hostile = { ...o, rows: [{ ...o.rows[0], label: '<img src=x onerror=alert(1)>' }, ...o.rows.slice(1)] };
  const escaped = await renderOuvertureHtml(hostile, { fonts: '' });
  assert.equal(escaped.includes('<img'), false);
  assert.ok(escaped.includes('&lt;img'));
  world({ mint: { name: '<b>Le Plein</b>' } });
  const named = await renderOuvertureHtml((await ticketFor()).o, { fonts: '' });
  assert.equal(named.includes('<b>Le Plein'), false);
  assert.ok(named.includes('&lt;b&gt;Le Plein&lt;/b&gt;'));
});

// PLEIN_TEST_PNG=1 renders the plates with the browser on the machine; PLEIN_TEST_PNG_OUT=<dir> keeps the files to look at.
test('the PNG renders at 1080 x 1350 for a good coin, a typed creator, a wrong coin and a partial read', { skip: !process.env.PLEIN_TEST_PNG }, async () => {
  const dir = process.env.PLEIN_TEST_PNG_OUT || mkdtempSync(join(tmpdir(), 'plein-plate-'));
  try {
    const { pngSize, renderPng } = await import('../scripts/_render.mjs');
    const variants = {
      ok: [{}, {}],
      typed: [{}, { creatorSource: 'typed' }],
      wrong: [{ sharing: true, creatorHolds: 5_000_000n, mint: { updateAuthority: CREATOR } }, {}],
      partial: [{ transactions: false, signatures: 1000 }, { maxPages: 1 }],
    };
    // every plate is written first, so that the pages exist even where the browser is slow
    for (const [name, [options, audit_]] of Object.entries(variants)) {
      world(options);
      const { o } = await ticketFor({}, undefined, audit_);
      writeFileSync(join(dir, `ouverture-${name}.html`), await renderOuvertureHtml(o));
    }
    for (const name of Object.keys(variants)) {
      const html = join(dir, `ouverture-${name}.html`);
      const png = renderPng(html, join(dir, `ouverture-${name}.png`), { width: 1080, height: 1350 });
      assert.equal(existsSync(png), true);
      assert.deepEqual(pngSize(readFileSync(png)), { width: 1080, height: 1350 }, name);
    }
  } finally {
    if (!process.env.PLEIN_TEST_PNG_OUT) rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the preflight

/** pump.fun's Global account, and the creator wallet funded with SOL (the way it is on 14:45); `wallet` replaces it. */
const globalNetwork = (over = {}, owner = PUMP_PROGRAM, extra = {}) => network({
  accounts: {
    [globalAddress()]: accountValue({ owner, data: globalBytes(over) }),
    [CREATOR]: accountValue({ owner: SYSTEM_PROGRAM, lamports: 1_500_000_000 }),
    ...extra,
  },
});
const preflightWith = async (extra = {}) => preflight({
  rpcUrl: RPC, live: { wallets: { creator: CREATOR } }, configQuote: 'USDC', declared: await loadDeclared(), now: NOW, ...extra,
});
const rowOf = (p, key) => p.rows.find((r) => r.key === key);

test('the preflight reads pump.fun’s Global account and the creator wallet, and goes only when every judged row is ✓', async () => {
  const calls = globalNetwork();
  const p = await preflightWith();
  assert.equal(p.verdict, 'ok', JSON.stringify(p.rows.filter((r) => r.status !== 'ok' && r.status !== 'info')));
  assert.deepEqual(p.counts, { ok: 6, fail: 0, unread: 0, total: 6 });
  assert.deepEqual(calls.filter((c) => c.method === 'getMultipleAccounts').map((c) => c.params[0]), [[globalAddress(), CREATOR, associatedTokenAddress(CREATOR, USDC_MINT, TOKEN_PROGRAM)]], 'the Global account, the wallet and its USDC account in one call');
  assert.equal(p.slot, SLOT);
  assert.deepEqual(p.rows.map((r) => r.key), ['declared', 'configQuote', 'global', 'quoteListed', 'launchReserves', 'formOptions', 'creator', 'creatorUsdc', 'node']);
  assert.equal(rowOf(p, 'quoteListed').status, 'ok');
  assert.equal(rowOf(p, 'quoteListed').account, globalAddress());
  assert.equal(rowOf(p, 'quoteListed').slot, SLOT);
  assert.equal(rowOf(p, 'creator').account, CREATOR);
  assert.equal(plain(rowOf(p, 'creator').found), `live.json : ${CREATOR.slice(0, 4)}…${CREATOR.slice(-4)} · 1,500 SOL`);
  assert.equal(rowOf(p, 'creatorUsdc').found, 'aucun compte USDC');
  // information, never judged: the reserves read live (not a number written in the script) and what the form may offer
  assert.equal(rowOf(p, 'launchReserves').status, 'info');
  assert.equal(plain(rowOf(p, 'launchReserves').found), '4 292 USDC');
  assert.equal(rowOf(p, 'formOptions').status, 'info');
  assert.equal(plain(rowOf(p, 'formOptions').found), 'Holder Rewards oui, Cashback oui, Mayhem oui, frais du créateur modifiables oui (jusqu’à 300 points de base)');
  // a Global account that starts somewhere else is shown as read
  globalNetwork({ initialVirtualQuoteReserves: 5_000_000_000n });
  assert.equal(plain(rowOf(await preflightWith(), 'launchReserves').found), '5 000 USDC');
  const text = plain(formatPreflight(p, { markdown: true }));
  assert.match(text, /^## Avant l’ouverture · /);
  assert.match(text, /- Verdict : PRÊT : /);
  assert.match(text, /- 6 ligne\(s\) ✓ sur 6/);
  assert.ok(text.includes(`- ✓ USDC parmi les monnaies de cotation acceptées : USDC est dans la liste · attendu : USDC dans la liste du compte Global · lu dans ${globalAddress()} au slot ${SLOT}, d’après l’IDL`));
  assert.match(text, /- à lire Réserves virtuelles de départ \(compte Global\) : 4 292 USDC/);
  assert.doesNotMatch(text, /Nœud lu : .*attendu/, 'a line of information has nothing to be expected');
});

test('the preflight fails when USDC is not listed, when the Global account is wrong or missing, or when the declaration disagrees with config.js', async () => {
  globalNetwork({ whitelistedQuoteMints: [addr(40)] });
  const unlisted = await preflightWith();
  assert.equal(rowOf(unlisted, 'quoteListed').status, 'fail');
  assert.match(rowOf(unlisted, 'quoteListed').found, /^liste lue : /);
  assert.equal(unlisted.verdict, 'fail');

  network({ accounts: { [CREATOR]: accountValue({ lamports: 1_500_000_000 }) } });
  const none = await preflightWith();
  assert.deepEqual([rowOf(none, 'global').status, rowOf(none, 'global').found], ['fail', 'introuvable']);
  assert.equal(rowOf(none, 'quoteListed').status, 'unread', 'nothing was read, nothing is listed');
  assert.equal(none.verdict, 'fail');

  globalNetwork({}, addr(41));
  const foreign = await preflightWith();
  assert.equal(rowOf(foreign, 'global').status, 'fail');
  assert.match(rowOf(foreign, 'global').found, /propriétaire inattendu/);

  globalNetwork();
  const sol = await preflightWith({ configQuote: 'SOL' });
  assert.equal(rowOf(sol, 'configQuote').status, 'fail');
  assert.equal(sol.verdict, 'fail');
  const unset = await preflightWith({ configQuote: null });
  assert.deepEqual([rowOf(unset, 'configQuote').status, rowOf(unset, 'configQuote').read], ['unread', false]);
  assert.equal(unset.verdict, 'incomplete');

  const invalid = await preflightWith({ declared: { ok: false, errors: ['settings.creatorFeeBps: 30 is not allowed'], settings: null, path: declaredFile } });
  assert.equal(rowOf(invalid, 'declared').status, 'fail');
  assert.match(rowOf(invalid, 'declared').found, /creatorFeeBps/);
  assert.equal(rowOf(invalid, 'quoteListed'), undefined, 'no quote asset is declared, so none is looked up');
  assert.equal(rowOf(invalid, 'creatorUsdc'), undefined, 'nor is the USDC of the wallet');
  assert.equal(invalid.verdict, 'fail');
});

test('the preflight does not go without the creator wallet, and an Global account cut short leaves the list unread', async () => {
  globalNetwork();
  const unpublished = await preflightWith({ live: { wallets: { creator: '' } } });
  assert.deepEqual([rowOf(unpublished, 'creator').status, rowOf(unpublished, 'creator').read], ['unread', false]);
  assert.equal(rowOf(unpublished, 'creatorUsdc'), undefined, 'no wallet, no USDC to read');
  assert.equal(unpublished.verdict, 'incomplete');
  assert.equal(unpublished.creatorSource, null);
  assert.match(plain(formatPreflight(unpublished)), /« non lu » Wallet créateur à comparer : non publié dans live\.json/);
  const typed = await preflightWith({ live: { wallets: { creator: CREATOR } }, creatorTyped: true });
  assert.match(rowOf(typed, 'creator').found, /^donné avec --creator : /);
  assert.equal(typed.creatorSource, 'typed');
  assert.equal(typed.verdict, 'ok');

  network({ accounts: { [globalAddress()]: accountValue({ owner: PUMP_PROGRAM, data: globalBytes().slice(0, 140) }), [CREATOR]: accountValue({ lamports: 1_500_000_000 }) } });
  const cut = await preflightWith();
  assert.equal(rowOf(cut, 'global').status, 'ok', 'the account decodes as far as it goes');
  assert.deepEqual([rowOf(cut, 'quoteListed').status, rowOf(cut, 'quoteListed').found], ['unread', 'non lu']);
  assert.equal(cut.verdict, 'incomplete');
});

test('the preflight refuses a creator address that is not a funded wallet without USDC: a mint, an empty address, a wallet that could buy', async () => {
  // a mint typed instead of a wallet: the account exists, but the token program owns it
  globalNetwork({}, PUMP_PROGRAM, { [CREATOR]: accountValue({ owner: TOKEN_2022_PROGRAM, data: mintBytes() }) });
  const mint = await preflightWith();
  assert.equal(rowOf(mint, 'creator').status, 'fail');
  assert.match(plain(rowOf(mint, 'creator').found), new RegExp(`ce n’est pas un wallet \\(propriétaire : ${TOKEN_2022_PROGRAM}\\)`));
  assert.deepEqual([rowOf(mint, 'creatorUsdc').status, rowOf(mint, 'creatorUsdc').read], ['unread', false], 'nothing is concluded about the USDC of an address that is not a wallet');
  assert.equal(mint.verdict, 'fail');

  // an address that never received anything (the 07:30 withdrawal did not land, or a typing mistake)
  network({ accounts: { [globalAddress()]: accountValue({ owner: PUMP_PROGRAM, data: globalBytes() }) } });
  const empty = await preflightWith();
  assert.equal(rowOf(empty, 'creator').status, 'fail');
  assert.match(rowOf(empty, 'creator').found, /aucun compte : cette adresse n’a jamais reçu de SOL/);
  assert.equal(rowOf(empty, 'creatorUsdc').status, 'unread');
  assert.equal(empty.verdict, 'fail');

  // a wallet that holds USDC could pay for a buy in the creation transaction (moteur.md section 3)
  const usdcAccount = associatedTokenAddress(CREATOR, USDC_MINT, TOKEN_PROGRAM);
  globalNetwork({}, PUMP_PROGRAM, { [usdcAccount]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: CREATOR, amount: 25_000_000n }) }) });
  const rich = await preflightWith();
  assert.equal(rowOf(rich, 'creator').status, 'ok');
  assert.equal(rowOf(rich, 'creatorUsdc').status, 'fail');
  assert.equal(plain(rowOf(rich, 'creatorUsdc').found), '25 USDC');
  assert.equal(rowOf(rich, 'creatorUsdc').account, usdcAccount);
  assert.equal(rich.verdict, 'fail');

  // an emptied USDC account is 0, and a stranger’s lamports on the address do not make it a holding
  globalNetwork({}, PUMP_PROGRAM, { [usdcAccount]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: CREATOR, amount: 0n }) }) });
  const emptied = await preflightWith();
  assert.equal(rowOf(emptied, 'creatorUsdc').status, 'ok');
  assert.equal(plain(rowOf(emptied, 'creatorUsdc').found), '0 USDC');
  globalNetwork({}, PUMP_PROGRAM, { [usdcAccount]: accountValue({ owner: SYSTEM_PROGRAM, lamports: 2_039_280 }) });
  assert.equal(rowOf(await preflightWith(), 'creatorUsdc').status, 'ok');
});

test('a SOL declaration has no list to read: the row is information, not a pass', async () => {
  globalNetwork();
  const good = JSON.parse(readFileSync(declaredFile, 'utf8'));
  const declared = { ...validateDeclared({ ...good, settings: { ...good.settings, quote: 'SOL' } }), path: declaredFile };
  const p = await preflightWith({ declared, configQuote: 'SOL' });
  assert.equal(rowOf(p, 'quoteListed').status, 'info');
  assert.equal(rowOf(p, 'creatorUsdc').status, 'info', 'with SOL as the quote nothing but an empty buy field stops a buy');
  assert.equal(p.counts.total, 4);
  assert.equal(p.verdict, 'ok');
});

// ---------------------------------------------------------------- the command line

test('the command line refuses a combination that makes no sense, before it reads anything', () => {
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000 });
  const cases = [
    [['--preflight', '--ouverture'], /choose --preflight or --ouverture, not both/],
    [['--preflight', '--mint', MINT], /takes no --mint/],
    [['--write'], /--write, --png and --out belong to --ouverture/],
    [['--png'], /belong to --ouverture/],
    [['--preflight', '--png'], /belong to --ouverture/],
    [['--declared', 'x.json'], /--declared belongs to --preflight and --ouverture/],
    [['--ouverture', '--mint', 'nope'], /--mint is not a Solana address/],
    [['--ouverture', '--creator', 'nope'], /--creator is not a Solana address/],
    [['--ouverture', '--creator'], /--creator needs a value/],
    [['--ouverture', '--out'], /--out needs a value/],
    [['--ouverture', '--write', '--creator', CREATOR], /--write does not take --creator: the public ticket is written from the wallets\.creator of public\/live\.json/],
    [['--json', '--markdown'], /choose --json or --markdown/],
    [['--unknown'], /unknown argument --unknown/],
  ];
  for (const [args, message] of cases) {
    const out = run(...args);
    assert.equal(out.status, 2, args.join(' '));
    assert.match(out.stderr, message, args.join(' '));
    assert.match(out.stderr, /usage: node scripts\/audit\.mjs/);
  }
});
