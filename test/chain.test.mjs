// The chain readers, offline: base58 and program-derived addresses against vectors that were
// checked on mainnet on 17 October 2026, pump.fun accounts decoded from captured buffers (at the
// bottom of this file), the top-10 filter, the RPC helper, GET /api/chain on a stubbed network,
// the launch audit and the ticket check on stubbed transactions. No test reaches the network:
// every fetch is replaced. Real signatures and keys never appear here; the ones used are built at
// run time from bytes.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { clearReadingCache, marketBlock, poolVaultBalance, readHolders, sharedReading, takeReading, tokenBlock, topHolders } from '../api/chain.js';
import {
  ASSOCIATED_TOKEN_PROGRAM, BAD_RPC_URL, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC_MINT, WSOL_MINT,
  addressBytes, associatedTokenAddress, b58decode, b58encode, findProgramAddress, getMultipleAccounts,
  isOnCurve, lamportDelta, parseMint, parseMintExtensions, parseRpcUrl, parseTokenAccount, rpc, scrubRpcUrl, tokenDeltas, toUi,
} from '../api/_solana.js';
import {
  PUMP_AMM_PROGRAM, PUMP_PROGRAM, ammCreatorVaultAuthority, bondingCurveAddress,
  canonicalPoolAddress, creatorVaultAddress, creatorVaultUnclaimed, curveProgressPct, curveQuote,
  eventAuthorityAddress, globalAddress, mintAuthorityAddress, parseBondingCurve, parseGlobal, parsePool, pct1,
} from '../api/_pump.js';
import {
  BUNDLE_WARN_PCT, TOP10_WARN_PCT, analyseEarlyBuyers, audit, checkCurveSettings, formatAudit, suggestLights,
} from '../scripts/audit.mjs';
import { formatReading, fr } from '../scripts/releve.mjs';
import {
  checkBurn, checkClaim, checkSlice, formatVerification, moneyMatch, plainMatch, rawFrom, verifyTicket,
} from '../scripts/verify-ticket.mjs';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; clearReadingCache(); });

// ---------------------------------------------------------------- helpers

const hex = (text) => Uint8Array.from(text.match(/../g).map((h) => parseInt(h, 16)));
const fill = (n, length = 32) => new Uint8Array(length).fill(n);
const addr = (n) => b58encode(fill(n)); // a made-up but well-formed address
const sig = (n) => b58encode(fill(n, 64)); // a made-up transaction signature, built at run time
const MINT = addr(9);
const RESERVOIR = addr(5);
const RPC = 'https://rpc.test';

/** The fixtures at the bottom are base64 split in pieces, so that no long run of characters sits in the file. */
function bytesOf(parts) {
  return new Uint8Array(Buffer.from(parts.join(''), 'base64'));
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function mintBytes({ supply, decimals = 6, mintAuthority = null, freezeAuthority = null }) {
  const bytes = new Uint8Array(82);
  const view = new DataView(bytes.buffer);
  if (mintAuthority) { view.setUint32(0, 1, true); bytes.set(addressBytes(mintAuthority), 4); }
  view.setBigUint64(36, BigInt(supply), true);
  bytes[44] = decimals;
  bytes[45] = 1;
  if (freezeAuthority) { view.setUint32(46, 1, true); bytes.set(addressBytes(freezeAuthority), 50); }
  return bytes;
}

/** A Token-2022 mint: the 82 bytes, padding up to 165, the account type, then type/length/data entries. */
function token2022MintBytes(extensions, opts = { supply: 1_000_000_000_000_000n }) {
  const base = mintBytes(opts);
  const entries = extensions.map(([type, length]) => {
    const entry = new Uint8Array(4 + length);
    new DataView(entry.buffer).setUint16(0, type, true);
    new DataView(entry.buffer).setUint16(2, length, true);
    return entry;
  });
  const out = new Uint8Array(166 + entries.reduce((total, e) => total + e.length, 0));
  out.set(base, 0);
  out[165] = 1;
  let at = 166;
  for (const entry of entries) { out.set(entry, at); at += entry.length; }
  return out;
}

function tokenAccountBytes({ mint, owner, amount }) {
  const bytes = new Uint8Array(165);
  bytes.set(addressBytes(mint), 0);
  bytes.set(addressBytes(owner), 32);
  new DataView(bytes.buffer).setBigUint64(64, BigInt(amount), true);
  bytes[108] = 1;
  return bytes;
}

// byte offsets of the curve's flags (the layout in api/_pump.js); a test below checks them by decoding
const FLAG_AT = { isMayhemMode: 81, isCashbackCoin: 82, canEditCreatorFee: 123, isHolderReward: 124 };

/** A captured bonding curve with the named flags switched on. */
function flagCurve(bytes, ...names) {
  const out = Uint8Array.from(bytes);
  for (const name of names) out[FLAG_AT[name]] = 1;
  return out;
}

/** A captured bonding curve with the creator, the complete flag or the two fee counters replaced. */
function patchCurve(bytes, { creator, complete, creatorFee, protocolFees }) {
  const out = Uint8Array.from(bytes);
  const view = new DataView(out.buffer);
  if (creator) out.set(addressBytes(creator), 49);
  if (complete !== undefined) out[48] = complete ? 1 : 0;
  if (creatorFee !== undefined) view.setBigUint64(125, BigInt(creatorFee), true);
  if (protocolFees !== undefined) view.setBigUint64(133, BigInt(protocolFees), true);
  return out;
}

/** A captured PumpSwap pool with its quote mint, coin creator and fee counters replaced. */
function patchPool(bytes, { baseMint, quoteMint, coinCreator, creatorFees, protocolFees }) {
  const out = Uint8Array.from(bytes);
  const view = new DataView(out.buffer);
  if (baseMint) out.set(addressBytes(baseMint), 11 + 32);
  if (quoteMint) out.set(addressBytes(quoteMint), 11 + 64);
  if (coinCreator) out.set(addressBytes(coinCreator), 211);
  if (protocolFees !== undefined) view.setBigUint64(271, BigInt(protocolFees), true);
  if (creatorFees !== undefined) view.setBigUint64(279, BigInt(creatorFees), true);
  return out;
}

const accountValue = ({ owner = SYSTEM_PROGRAM, lamports = 1_000_000, data = new Uint8Array(0) } = {}) => ({
  lamports, owner, data: [b64(data), 'base64'], executable: false,
});
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const methodOff = () => new Response('{"error":"rate limited"}', {
  status: 429, headers: { 'retry-after': '10', 'x-ratelimit-method-limit': '0' },
});

/**
 * Replaces fetch with a tiny JSON-RPC node and a DexScreener. `accounts` maps an address to an
 * account value; `methods` maps a method to a function of its params (return a Response to
 * control the HTTP answer); `dex` is a body, a Response or a function. Returns the call log.
 */
function network({ accounts = {}, methods = {}, dex } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith('https://api.dexscreener.com/')) {
      calls.push({ dex: href });
      if (dex === undefined) return new Response('{}', { status: 404 });
      const out = typeof dex === 'function' ? dex(href) : dex;
      return out instanceof Response ? out : json(out);
    }
    const { method, params } = JSON.parse(init.body);
    calls.push({ method, params });
    if (method === 'getMultipleAccounts') {
      return json({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value: params[0].map((key) => accounts[key] ?? null) } });
    }
    const fn = methods[method];
    if (!fn) return json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: `${method} is not stubbed` } });
    const out = fn(params);
    return out instanceof Response ? out : json({ jsonrpc: '2.0', id: 1, result: out });
  };
  return calls;
}

// ---------------------------------------------------------------- base58

test('base58 matches well-known vectors and keeps leading zeros', () => {
  const text = (s) => new TextEncoder().encode(s);
  assert.equal(b58encode(text('Hello World!')), '2NEpo7TZRRrLZSi2U');
  assert.equal(b58encode(text('The quick brown fox jumps over the lazy dog.')), 'USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z');
  assert.equal(b58encode(Uint8Array.of(0, 0, 1)), '112');
  assert.equal(b58encode(new Uint8Array(0)), '');
  assert.deepEqual([...b58decode('112')], [0, 0, 1]);
  assert.deepEqual([...b58decode('2NEpo7TZRRrLZSi2U')], [...text('Hello World!')]);
  assert.equal(b58encode(new Uint8Array(32)), SYSTEM_PROGRAM, 'the system program is 32 zero bytes');
});

test('base58 round trips 32-byte and 64-byte values and rejects what is not base58', () => {
  for (let n = 0; n < 60; n += 1) {
    const bytes = Uint8Array.from({ length: n % 2 ? 32 : 64 }, (_, i) => (i * 31 + n * 7 + (i % 5 === 0 ? 0 : 3)) & 0xff);
    assert.deepEqual([...b58decode(b58encode(bytes))], [...bytes]);
  }
  for (const bad of ['0', 'O', 'I', 'l', 'abc+', 'ab c']) assert.throws(() => b58decode(bad), /not base58/);
  assert.equal(addressBytes(USDC_MINT).length, 32);
  assert.equal(b58encode(addressBytes(USDC_MINT)), USDC_MINT);
  assert.throws(() => addressBytes('1111'), /32-byte/);
  assert.equal(MINT.length >= 32 && MINT.length <= 44, true);
});

// ---------------------------------------------------------------- ed25519 and derived addresses

test('the curve check agrees with RFC 8032 public keys and the base point', () => {
  // keys from the RFC 8032 test vectors 1 and 2 are valid curve points by construction
  assert.equal(isOnCurve(hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')), true);
  assert.equal(isOnCurve(hex('3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c')), true);
  assert.equal(isOnCurve(hex(`58${'66'.repeat(31)}`)), true, 'the base point, y = 4/5');
  assert.equal(isOnCurve(new Uint8Array(32)), true, 'y = 0 gives x² = −1, a square');
  assert.equal(isOnCurve(Uint8Array.of(1, ...new Uint8Array(31))), true, 'y = 1 is the identity');
  assert.equal(isOnCurve(new Uint8Array(31)), false, 'only 32 bytes can be a point');
  // and the PDAs that exist on mainnet are off the curve, as they must be
  for (const pda of [globalAddress(), mintAuthorityAddress(), eventAuthorityAddress()]) assert.equal(isOnCurve(addressBytes(pda)), false);
});

test('pump.fun program addresses derive to the values read on mainnet', () => {
  assert.equal(PUMP_PROGRAM, '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  assert.equal(globalAddress(), '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
  assert.equal(mintAuthorityAddress(), 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM');
  assert.equal(eventAuthorityAddress(), 'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
  assert.equal(findProgramAddress(['global'], PUMP_PROGRAM).bump, 255);
});

test('bonding curve addresses derive to the accounts that exist on mainnet', () => {
  // the first has bump 254: the search had to skip an on-curve candidate at 255. DexScreener
  // lists this coin's pump.fun pair under this very address.
  const dave = findProgramAddress(['bonding-curve', { address: 'FFniEJ37B19JQTbRNirG5DSCdLbx1Z5JE77rzhqthGuX' }], PUMP_PROGRAM);
  assert.deepEqual(dave, { address: '4vmnMovJBsuf7LfNZAU1ZAVA5VMZ78rLEQZ3tB3JQ41T', bump: 254 });
  assert.equal(bondingCurveAddress('8MEv6GMEq57dVx4AwksuEeehQYXTSPJVEeHAFmqxpump'), '78FUixksLJYKYQfizXkZWLKURbmsFHGE4ztsBBhZJerz');
  assert.equal(bondingCurveAddress('GatUtjrT1viodATZEZ6zgwTS4crJB3Uw4L11ho3wpump'), 'J95ZnvQBhszJAhPQCC5PNvFpdY25MHiTndUr3CKXYsJz');
});

test('associated token accounts: classic and Token-2022, matching what the node listed', () => {
  // the vault of a creator and its USDC account (getTokenAccountsByOwner returned this address)
  assert.equal(associatedTokenAddress('8sbz5Ns1sH8zRa3axAPUQkAE72rEqoQfytbXoAeC7vDu', USDC_MINT), 'Hcfjot9gnusHFuMmmWXN6oCU5Tm2YgJxQWvcPDNeEAHT');
  // a Token-2022 mint (every pump.fun coin): the curve's own token account
  const curve = '4vmnMovJBsuf7LfNZAU1ZAVA5VMZ78rLEQZ3tB3JQ41T';
  const mint = 'FFniEJ37B19JQTbRNirG5DSCdLbx1Z5JE77rzhqthGuX';
  assert.equal(associatedTokenAddress(curve, mint, TOKEN_2022_PROGRAM), 'Dh13Y1khfQEn3TJ7BesBA2nKaQ6qW5cf1mofqityit5M');
  assert.notEqual(associatedTokenAddress(curve, mint, TOKEN_PROGRAM), associatedTokenAddress(curve, mint, TOKEN_2022_PROGRAM));
  assert.equal(ASSOCIATED_TOKEN_PROGRAM, 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
});

test('PumpSwap: the canonical pool and the coin creator vault match mainnet', () => {
  assert.equal(canonicalPoolAddress('GatUtjrT1viodATZEZ6zgwTS4crJB3Uw4L11ho3wpump', WSOL_MINT), '4tdRCWr91wecmjg8Ed22qBhJMhtsm7D6ZVqy8rbSVZ1m');
  assert.equal(canonicalPoolAddress('DtcicPCKTKeAh7TDEzTym3hXeoHAoMiBdYJhMYxZpump', USDC_MINT), 'B4Cp45PGifVM5FAXfh6AeV8QZ3eUNQnqGBw7KuC7MHnB');
  assert.equal(PUMP_AMM_PROGRAM, 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
  // the underscore seed is not the hyphen the pump program uses
  const creator = addr(3);
  assert.notEqual(ammCreatorVaultAuthority(creator), creatorVaultAddress(creator));
  assert.equal(ammCreatorVaultAuthority(creator), findProgramAddress(['creator_vault', { address: creator }], PUMP_AMM_PROGRAM).address);
});

// ---------------------------------------------------------------- amounts

test('raw amounts become UI numbers without float noise', () => {
  assert.equal(toUi(999_123_456_123_456n, 6), 999123456.123456);
  assert.equal(toUi(1n, 6), 0.000001);
  assert.equal(toUi(1_000_000_000_000_000n, 6), 1_000_000_000);
  assert.equal(toUi(650_240n, 9), 0.00065024);
  assert.equal(toUi(7n, 0), 7);
  assert.equal(toUi(0n, 6), 0);
});

test('percentages round half up to one decimal on integers', () => {
  assert.equal(pct1(1n, 3n), 33.3);
  assert.equal(pct1(1n, 8n), 12.5);
  assert.equal(pct1(5n, 800n), 0.6, '0.625 → 0.6');
  assert.equal(pct1(1n, 1600n), 0.1, '0.0625 % rounds to 0.1');
  assert.equal(pct1(1n, 4000n), 0, '0.025 % rounds to 0.0');
  assert.equal(pct1(0n, 10n), 0);
  assert.equal(pct1(1n, 0n), null);
});

// ---------------------------------------------------------------- pump.fun accounts, from captured buffers

test('the Global account decodes and its layout fills the 1 088 bytes exactly', () => {
  assert.equal(GLOBAL.length, 1088);
  const g = parseGlobal(GLOBAL);
  assert.equal(g.initialized, true);
  assert.equal(g.initialRealTokenReserves, 793_100_000_000_000n, '793 100 000 tokens at 6 decimals');
  assert.equal(g.initialVirtualTokenReserves, 1_073_000_000_000_000n);
  assert.equal(g.tokenTotalSupply, 1_000_000_000_000_000n);
  assert.deepEqual(g.whitelistedQuoteMints, [USDC_MINT], 'USDC is a whitelisted quote asset');
  assert.equal(g.maxCurveDepth !== null, true, 'the last field of the layout is still inside the account');
  assert.throws(() => parseGlobal(CURVE_USDC), /not a global account/);
});

test('a USDC-quoted curve decodes, and its token reserves agree with the Global account', () => {
  const g = parseGlobal(GLOBAL);
  const c = parseBondingCurve(CURVE_USDC);
  assert.equal(c.complete, false);
  assert.equal(c.tokenTotalSupply, g.tokenTotalSupply);
  assert.equal(c.quoteMint, USDC_MINT);
  assert.equal(c.initialVirtualQuoteReserves, 4_292_000_000n, '4 292 USDC of virtual quote reserves at the start');
  // two different accounts, one invariant: virtual − real token reserves never changes
  assert.equal(c.virtualTokenReserves - c.realTokenReserves, g.initialVirtualTokenReserves - g.initialRealTokenReserves);
  assert.deepEqual(curveQuote(c), { kind: 'token', mint: USDC_MINT });
  assert.equal(creatorVaultAddress(c.creator), '8sbz5Ns1sH8zRa3axAPUQkAE72rEqoQfytbXoAeC7vDu');
  assert.equal(curveProgressPct(c, g.initialRealTokenReserves), 20, '634 445 435 of 793 100 000 tokens left');
});

test('a SOL-quoted and a completed curve decode too', () => {
  const g = parseGlobal(GLOBAL);
  const sol = parseBondingCurve(CURVE_SOL);
  assert.deepEqual(curveQuote(sol), { kind: 'SOL', mint: null });
  assert.equal(sol.quoteMint, SYSTEM_PROGRAM);
  assert.equal(sol.virtualTokenReserves - sol.realTokenReserves, g.initialVirtualTokenReserves - g.initialRealTokenReserves);
  assert.equal(curveProgressPct(sol, g.initialRealTokenReserves), 0.8);
  const done = parseBondingCurve(CURVE_DONE);
  assert.equal(done.complete, true);
  assert.equal(done.realTokenReserves, 0n);
  assert.equal(curveProgressPct(done, g.initialRealTokenReserves), 100);
});

test('curve progress: complete is 100, an unknown start is unknown, a stray balance is capped', () => {
  const c = parseBondingCurve(CURVE_USDC);
  assert.equal(curveProgressPct({ ...c, complete: true }, null), 100);
  assert.equal(curveProgressPct(c, null), null);
  assert.equal(curveProgressPct(c, 0n), null);
  assert.equal(curveProgressPct({ ...c, realTokenReserves: 900_000_000_000_000n }, 793_100_000_000_000n), 0, 'more left than the start never goes negative');
  assert.equal(curveProgressPct({ ...c, realTokenReserves: 396_550_000_000_000n }, 793_100_000_000_000n), 50);
});

test('decoders refuse the wrong account type and stop at the end of the data', () => {
  assert.throws(() => parseBondingCurve(GLOBAL), /not a bonding curve/);
  assert.throws(() => parseBondingCurve(new Uint8Array(4)), /not a bonding curve/);
  assert.throws(() => parseBondingCurve(CURVE_USDC.slice(0, 40)), /too short/);
  const old = parseBondingCurve(CURVE_USDC.slice(0, 81)); // an older layout ends after the creator
  assert.equal(old.creator, parseBondingCurve(CURVE_USDC).creator);
  assert.equal(old.quoteMint, null, 'fields beyond the data are null, not guessed');
  const cut = parseGlobal(GLOBAL.slice(0, 100)); // ends inside tokenTotalSupply
  assert.equal(cut.initialRealTokenReserves, 793_100_000_000_000n);
  assert.equal(cut.feeBasisPoints, null);
});

test('a PumpSwap pool decodes: mints, index and the coin creator behind its fee vault', () => {
  const pool = parsePool(POOL_SOL);
  assert.equal(pool.index, 0);
  assert.equal(pool.baseMint, 'GatUtjrT1viodATZEZ6zgwTS4crJB3Uw4L11ho3wpump');
  assert.equal(pool.quoteMint, WSOL_MINT);
  assert.equal(ammCreatorVaultAuthority(pool.coinCreator), 'HAbzFuPofgjXsy316CRmWp5kgZJyXvjjPGSepNbPps8w');
  assert.throws(() => parsePool(CURVE_USDC), /not a PumpSwap pool/);
});

test('a PumpSwap pool also decodes the fees it has not yet swept to the creator vault', () => {
  // POOL_SOL is 301 bytes: 287 of layout, then 14 bytes of zero padding
  const pool = parsePool(POOL_SOL);
  assert.equal(pool.virtualQuoteReserves, 17_528_435_160n, 'an i128 that fits in 64 bits');
  assert.equal(pool.creatorFeeBps, 0n);
  assert.equal(pool.canEditCreatorFee, false);
  assert.equal(pool.isHolderReward, false);
  assert.equal(pool.protocolFees, 1_437_701n);
  assert.equal(pool.creatorFees, 54_632_427n, '0.054632427 SOL waiting for a sweep');
  assert.ok(POOL_SOL.subarray(287).every((b) => b === 0), 'nothing but padding after the last field');
  // a pool that ends before the fee counters existed: the earlier fields stand, the counters are null
  const old = parsePool(POOL_SOL.slice(0, 245));
  assert.equal(old.coinCreator, pool.coinCreator);
  assert.equal(old.creatorFees, null, 'not read is not zero: the reader decides what that means');
  // an i128 is signed: -5 is all ones above the low 64 bits
  const negative = Uint8Array.from(POOL_SOL);
  const view = new DataView(negative.buffer);
  view.setBigUint64(245, 2n ** 64n - 5n, true);
  view.setBigInt64(253, -1n, true);
  assert.equal(parsePool(negative).virtualQuoteReserves, -5n);
  assert.equal(parsePool(negative).creatorFees, 54_632_427n, 'the fields after it do not move');
});

test('a bonding curve with creator fees not yet swept: the counters decode', () => {
  assert.equal(parseBondingCurve(CURVE_USDC).creatorFee, 0n);
  assert.equal(parseBondingCurve(CURVE_SOL).creatorFee, 1_007_839n, 'a captured SOL curve holds 0.001007839 SOL of creator fee');
  assert.equal(parseBondingCurve(CURVE_SOL).protocolFees, 297_629n);
  const c = parseBondingCurve(patchCurve(CURVE_USDC, { creatorFee: 4_160_694n, protocolFees: 9_000_000n }));
  assert.equal(c.creatorFee, 4_160_694n);
  assert.equal(c.protocolFees, 9_000_000n);
  assert.equal(c.depth !== null, true, 'the fields after them are untouched');
  assert.equal(parseBondingCurve(CURVE_USDC.slice(0, 125)).creatorFee, null, 'an older, shorter curve has no counter');
});

test('unclaimed creator fees: SOL above the rent floor, tokens from the vault account', () => {
  const sol = { kind: 'SOL', mint: null };
  assert.equal(creatorVaultUnclaimed(sol, { vaultAccount: null, rentFloor: 650_240n }), 0n);
  assert.equal(creatorVaultUnclaimed(sol, { vaultAccount: { lamports: 650_240n, data: new Uint8Array(0) }, rentFloor: 650_240n }), 0n, 'exactly the floor = nothing');
  assert.equal(creatorVaultUnclaimed(sol, { vaultAccount: { lamports: 4_070_386n, data: new Uint8Array(0) }, rentFloor: 650_240n }), 3_420_146n);
  assert.equal(creatorVaultUnclaimed(sol, { vaultAccount: { lamports: 100n, data: new Uint8Array(0) }, rentFloor: 650_240n }), 0n, 'below the floor never goes negative');
  assert.throws(() => creatorVaultUnclaimed(sol, { vaultAccount: { lamports: 5n, data: new Uint8Array(0) } }), /rentFloor/);
  const token = { kind: 'token', mint: USDC_MINT };
  assert.equal(creatorVaultUnclaimed(token, { vaultTokenAccount: null }), 0n);
  const account = { data: tokenAccountBytes({ mint: USDC_MINT, owner: addr(2), amount: 2_309_898n }) };
  assert.equal(creatorVaultUnclaimed(token, { vaultTokenAccount: account }), 2_309_898n);
});

// ---------------------------------------------------------------- SPL layouts

test('mint and token accounts decode; a Token-2022 mint lists its extensions', () => {
  const mint = parseMint(mintBytes({ supply: 999_123_456_123_456n, mintAuthority: addr(1), freezeAuthority: null }));
  assert.equal(mint.supply, 999_123_456_123_456n);
  assert.equal(mint.decimals, 6);
  assert.equal(mint.mintAuthority, addr(1));
  assert.equal(mint.freezeAuthority, null);
  assert.deepEqual(parseTokenAccount(tokenAccountBytes({ mint: MINT, owner: RESERVOIR, amount: 42n })), { mint: MINT, owner: RESERVOIR, amount: 42n });
  assert.throws(() => parseMint(new Uint8Array(10)), /too short/);

  assert.deepEqual(parseMintExtensions(mintBytes({ supply: 1n })), [], 'a classic mint has none');
  const pumpLike = parseMintExtensions(token2022MintBytes([[18, 64], [19, 183]]));
  assert.deepEqual(pumpLike.map((e) => [e.name, e.risky]), [['MetadataPointer', false], ['TokenMetadata', false]]);
  const risky = parseMintExtensions(token2022MintBytes([[18, 64], [12, 32], [1, 108]]));
  assert.deepEqual(risky.filter((e) => e.risky).map((e) => e.name), ['PermanentDelegate', 'TransferFeeConfig']);
  assert.equal(parseMintExtensions(token2022MintBytes([[77, 4]]))[0].risky, true, 'an unknown extension is flagged, never waved through');
  const truncated = token2022MintBytes([[18, 64]]).slice(0, 166 + 20);
  assert.deepEqual(parseMintExtensions(truncated), [], 'a cut entry is dropped');
});

function swapTransaction({ slot = 100, blockTime = 1_790_000_000, err = null, keys, balances, lamports }) {
  const accountKeys = keys.map((pubkey) => ({ pubkey, signer: false, writable: true }));
  const side = (which) => balances
    .filter((b) => b[which] !== null)
    .map((b) => ({ accountIndex: b.index, mint: b.mint, owner: b.owner, uiTokenAmount: { amount: String(b[which]), decimals: b.decimals ?? 6 } }));
  return {
    slot, blockTime, version: 0,
    transaction: { message: { accountKeys } },
    meta: {
      err, preTokenBalances: side('pre'), postTokenBalances: side('post'),
      preBalances: lamports?.pre ?? keys.map(() => 0), postBalances: lamports?.post ?? keys.map(() => 0),
    },
  };
}

test('token balance changes: accounts that appear or vanish count from or to zero', () => {
  const tx = swapTransaction({
    keys: ['payer', 'usdcAcct', 'plainAcct', 'curveAcct'],
    balances: [
      { index: 1, owner: RESERVOIR, mint: USDC_MINT, pre: 100_000_000, post: 67_500_000 },
      { index: 2, owner: RESERVOIR, mint: MINT, pre: null, post: 1_234_567 }, // opened in this transaction
      { index: 3, owner: addr(8), mint: MINT, pre: 9_000_000, post: null }, // closed in this transaction
    ],
    lamports: { pre: [10, 0, 0, 0], post: [4, 0, 0, 0] },
  });
  const deltas = tokenDeltas(tx);
  const find = (owner, mint) => deltas.find((d) => d.owner === owner && d.mint === mint);
  assert.equal(find(RESERVOIR, USDC_MINT).delta, -32_500_000n);
  assert.equal(find(RESERVOIR, MINT).delta, 1_234_567n);
  assert.equal(find(addr(8), MINT).delta, -9_000_000n);
  assert.equal(find(RESERVOIR, MINT).account, 'plainAcct');
  assert.equal(lamportDelta(tx, 'payer'), -6n);
  assert.equal(lamportDelta(tx, 'nobody'), null);
  assert.deepEqual(tokenDeltas({}), []);
});

// ---------------------------------------------------------------- the RPC helper

test('rpc: one retry on a 5xx answer, then the result', async () => {
  let n = 0;
  const calls = network({ methods: { getSlot: () => { n += 1; return n === 1 ? new Response('busy', { status: 503 }) : 7; } } });
  assert.equal(await rpc(RPC, 'getSlot'), 7);
  assert.equal(calls.length, 2);
});

test('rpc: a method the node never serves fails at once, without waiting for retry-after', async () => {
  const calls = network({ methods: { getTokenLargestAccounts: methodOff } });
  const started = Date.now();
  await assert.rejects(() => rpc(RPC, 'getTokenLargestAccounts', ['x']), (error) => error.methodOff === true && error.status === 429);
  assert.equal(calls.length, 1);
  assert.ok(Date.now() - started < 1000, 'it did not sleep ten seconds');
});

test('rpc: a plain 429 is retried once; a JSON-RPC error is not retried; a dead network is reported', async () => {
  let tries = 0;
  let calls = network({ methods: { getSlot: () => { tries += 1; return new Response('slow down', { status: 429 }); } } });
  await assert.rejects(() => rpc(RPC, 'getSlot'), /rate limited/);
  assert.equal(tries, 2);

  calls = network({ methods: { getSlot: () => json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad params' } }) } });
  await assert.rejects(() => rpc(RPC, 'getSlot'), (error) => error.message === 'bad params' && error.code === -32602);
  assert.equal(calls.length, 1);

  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => rpc(RPC, 'getSlot', [], { retries: 0 }), /rpc unreachable/);
});

test('getMultipleAccounts splits 100 addresses per call, keeps the order and returns null for a missing account', async () => {
  const addresses = Array.from({ length: 150 }, (_, i) => b58encode(Uint8Array.from({ length: 32 }, (_, j) => (i + j * 3) & 0xff)));
  const present = { [addresses[0]]: accountValue({ lamports: 5 }), [addresses[120]]: accountValue({ owner: PUMP_PROGRAM, lamports: 9, data: Uint8Array.of(1, 2, 3) }) };
  const calls = network({ accounts: present });
  const out = await getMultipleAccounts(RPC, addresses);
  assert.deepEqual(calls.map((c) => c.params[0].length), [100, 50]);
  assert.equal(out.length, 150);
  assert.equal(out[0].lamports, 5n);
  assert.equal(out[1], null);
  assert.equal(out[120].owner, PUMP_PROGRAM);
  assert.deepEqual([...out[120].data], [1, 2, 3]);
});

// ---------------------------------------------------------------- the top 10

const tokens = (million) => BigInt(million) * 1_000_000_000_000n; // million tokens, 6 decimals

test('top 10: only wallets count; curve, pool and other programs are set aside and named', () => {
  const rows = [
    { owner: 'curve', amount: tokens(400) }, { owner: 'pool', amount: tokens(60) },
    ...Array.from({ length: 12 }, (_, i) => ({ owner: `w${i}`, amount: tokens(50 - 3 * i) })),
  ].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  const programOf = new Map([['curve', PUMP_PROGRAM], ['pool', PUMP_AMM_PROGRAM], ...Array.from({ length: 12 }, (_, i) => [`w${i}`, i === 3 ? SYSTEM_PROGRAM : null])]);
  const out = topHolders({ complete: true, rows, programOf }, tokens(1000));
  assert.deepEqual(out.wallets.map((w) => w.owner), Array.from({ length: 10 }, (_, i) => `w${i}`));
  assert.equal(out.top10Pct, 36.5, '365 million of 1 000 million');
  assert.equal(out.excluded.get(PUMP_PROGRAM), tokens(400));
  assert.equal(out.excluded.get(PUMP_AMM_PROGRAM), tokens(60));
});

test('top 10: an owner whose program is unknown is not counted, and a short list is not guessed', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ owner: `w${i}`, amount: tokens(50 - i) }));
  const known = new Map(rows.slice(0, 10).map((r) => [r.owner, null]));
  const out = topHolders({ complete: true, rows, programOf: known }, tokens(1000));
  assert.equal(out.wallets.length, 10, 'the two unchecked owners stay out');
  // the node's 20-account list with fewer than ten wallets in it hides the tenth wallet: no figure
  const few = new Map(rows.slice(0, 6).map((r) => [r.owner, null]));
  assert.throws(() => topHolders({ complete: false, rows: rows.slice(0, 6), programOf: few }, tokens(1000)), /fewer than 10 wallets/);
  // a complete list may simply have fewer than ten holders
  assert.equal(topHolders({ complete: true, rows: rows.slice(0, 6), programOf: few }, tokens(1000)).wallets.length, 6);
});

// the holders of a stubbed coin: a curve, a pool, twelve wallets (one owning two token accounts)
function holdersScenario() {
  const curve = bondingCurveAddress(MINT);
  const pool = addr(99);
  const wallet = (i) => addr(20 + i);
  const entries = [
    { owner: curve, amount: tokens(400) }, { owner: pool, amount: tokens(60) },
    { owner: wallet(0), amount: tokens(30) }, { owner: wallet(0), amount: tokens(20) }, // 50 in two accounts
    ...Array.from({ length: 11 }, (_, i) => ({ owner: wallet(i + 1), amount: tokens(50 - 3 * (i + 1)) })),
    { owner: addr(70), amount: 0n }, // an emptied account
  ];
  const accounts = {
    [curve]: accountValue({ owner: PUMP_PROGRAM, data: CURVE_USDC }),
    [pool]: accountValue({ owner: PUMP_AMM_PROGRAM }),
    [wallet(3)]: accountValue({ owner: SYSTEM_PROGRAM, lamports: 2_039_280 }), // a funded wallet
  };
  const tokenAccounts = entries.map((e, i) => ({ address: addr(120 + i), ...e }));
  return { entries, accounts, tokenAccounts, expectedPct: pct1(tokens(365), tokens(1000)) };
}

test('holders via getProgramAccounts when the node will not list the largest accounts', async () => {
  const s = holdersScenario();
  const calls = network({
    accounts: { ...s.accounts, [MINT]: accountValue({ owner: TOKEN_2022_PROGRAM, data: mintBytes({ supply: tokens(1000) }) }) },
    methods: {
      getTokenLargestAccounts: methodOff,
      getProgramAccounts: ([program, options]) => {
        assert.equal(program, TOKEN_2022_PROGRAM, 'the mint account says which token program to scan');
        assert.deepEqual(options.filters, [{ memcmp: { offset: 0, bytes: MINT } }]);
        assert.deepEqual(options.dataSlice, { offset: 32, length: 40 });
        return s.tokenAccounts.map((t) => ({
          pubkey: t.address,
          account: { data: [b64(Uint8Array.from([...addressBytes(t.owner), ...new Uint8Array(new BigUint64Array([t.amount]).buffer)])), 'base64'] },
        }));
      },
    },
  });
  const holders = await readHolders(RPC, MINT);
  assert.equal(holders.complete, true);
  assert.equal(holders.rows.find((r) => r.owner === addr(20)).amount, tokens(50), 'two accounts of one owner add up');
  assert.equal(holders.rows.some((r) => r.owner === addr(70)), false, 'empty accounts are dropped');
  const out = topHolders(holders, tokens(1000));
  assert.equal(out.top10Pct, s.expectedPct);
  assert.equal(out.wallets[0].owner, addr(20));
  assert.equal(calls.filter((c) => c.method === 'getTokenLargestAccounts').length, 1, 'tried once, not retried');
});

test('holders via getTokenLargestAccounts when the node serves it: a short list is complete', async () => {
  const s = holdersScenario();
  const tokenAccountValues = {};
  for (const t of s.tokenAccounts) tokenAccountValues[t.address] = accountValue({ owner: TOKEN_2022_PROGRAM, data: tokenAccountBytes({ mint: MINT, owner: t.owner, amount: t.amount }) });
  network({
    accounts: { ...s.accounts, ...tokenAccountValues },
    methods: {
      getTokenLargestAccounts: () => ({
        context: { slot: 1 },
        value: s.tokenAccounts.map((t) => ({ address: t.address, amount: String(t.amount), decimals: 6 })),
      }),
    },
  });
  const holders = await readHolders(RPC, MINT);
  assert.equal(holders.complete, true, 'fewer than 20 accounts listed = the whole list');
  assert.equal(topHolders(holders, tokens(1000)).top10Pct, s.expectedPct);
});

// ---------------------------------------------------------------- DexScreener

// by default a pair is the coin's own pump.fun curve pair, as DexScreener lists it (checked on 17
// October 2026 for a USDC curve: pairAddress = the curve address, base = the coin, quote = USDC)
const pair = (extra) => ({
  chainId: 'solana', pairAddress: bondingCurveAddress(MINT), baseToken: { address: MINT }, quoteToken: { address: USDC_MINT },
  priceUsd: '0.0000812', marketCap: 81200, volume: { h24: 154000 }, liquidity: { usd: 5000 }, url: 'https://dexscreener.com/solana/abc', ...extra,
});

test('the market block takes the deepest solana pair of the coin and refuses what it cannot trust', () => {
  const body = [
    pair({ liquidity: { usd: 100 }, priceUsd: '1', url: 'https://dexscreener.com/solana/small' }),
    pair({ liquidity: { usd: 90000 }, priceUsd: '0.0002', marketCap: 200000, url: 'https://dexscreener.com/solana/deep' }),
    pair({ chainId: 'base', liquidity: { usd: 9e9 } }),
    pair({ priceUsd: '0', liquidity: { usd: 9e9 } }),
  ];
  assert.deepEqual(marketBlock(body, MINT), {
    source: 'dexscreener', priceUsd: 0.0002, marketCapUsd: 200000, volume24hUsd: 154000, pairUrl: 'https://dexscreener.com/solana/deep',
  });
  assert.equal(marketBlock({ pairs: [pair({ url: 'https://evil.example/x' })] }, MINT).pairUrl, null, 'only dexscreener.com links pass');
  assert.equal(marketBlock({ pairs: [pair({ marketCap: undefined, fdv: 7 })] }, MINT).marketCapUsd, 7, 'fully diluted value stands in');
  assert.equal(marketBlock({ pairs: [pair({ marketCap: undefined, fdv: undefined, volume: undefined })] }, MINT).volume24hUsd, null);
  assert.equal(marketBlock([], MINT), null);
  assert.equal(marketBlock(null, MINT), null);
  assert.equal(marketBlock({ pairs: [pair({ chainId: 'base' })] }, MINT), null);
});

test('the market block never takes a pair that is not the coin\'s own: quote side, look-alike pools, odd quotes', () => {
  const own = pair({ liquidity: { usd: 100 }, priceUsd: '0.0001', url: 'https://dexscreener.com/solana/own' });
  // DexScreener lists the pairs of a token on either side: the USDC mint's list has other coins' pairs
  const usdcSide = pair({
    pairAddress: addr(50), baseToken: { address: addr(51) }, quoteToken: { address: MINT },
    liquidity: { usd: 9e9 }, priceUsd: '4.5', marketCap: 2.1e9, url: 'https://dexscreener.com/solana/other',
  });
  assert.equal(marketBlock([usdcSide], MINT), null, 'the mint is the quote token there');
  assert.equal(marketBlock([usdcSide, own], MINT).priceUsd, 0.0001);
  // anyone can open a pool with this coin as the base token, and make it look deeper than the curve
  const lookAlike = pair({ pairAddress: addr(52), liquidity: { usd: 9e9 }, priceUsd: '77', marketCap: 7.7e10, url: 'https://dexscreener.com/solana/fake' });
  assert.equal(marketBlock([lookAlike], MINT), null, 'a pool pump.fun did not open is not the market');
  assert.equal(marketBlock([lookAlike, own], MINT).pairUrl, 'https://dexscreener.com/solana/own');
  // a canonical address but a quote nobody asked for
  assert.equal(marketBlock([pair({ quoteToken: { address: addr(53) } })], MINT), null);
  assert.equal(marketBlock([pair({ baseToken: undefined })], MINT), null);
  assert.equal(marketBlock([pair({ pairAddress: undefined })], MINT), null);
  // another coin's body asked for this mint, or no mint at all
  assert.equal(marketBlock([own], addr(54)), null);
  assert.equal(marketBlock([own]), null);
  assert.equal(marketBlock([own], 'not-an-address'), null);
});

test('the market block: once the pool is listed it wins over the curve pair, in USDC or in SOL', () => {
  const curveSide = pair({ liquidity: { usd: 100000 }, priceUsd: '0.001', url: 'https://dexscreener.com/solana/curve' });
  const usdcPool = pair({ pairAddress: canonicalPoolAddress(MINT, USDC_MINT), liquidity: { usd: 5000 }, priceUsd: '0.002', url: 'https://dexscreener.com/solana/pool' });
  assert.equal(marketBlock([curveSide, usdcPool], MINT).pairUrl, 'https://dexscreener.com/solana/pool', 'depth does not outrank the venue');
  const solPool = pair({ pairAddress: canonicalPoolAddress(MINT, WSOL_MINT), quoteToken: { address: WSOL_MINT }, priceUsd: '0.003', url: 'https://dexscreener.com/solana/solpool' });
  assert.equal(marketBlock([solPool, curveSide], MINT).priceUsd, 0.003);
  assert.equal(marketBlock([curveSide], MINT).priceUsd, 0.001, 'a pool not indexed yet: the curve pair still answers');
});

// ---------------------------------------------------------------- GET /api/chain

const MARKET_BODY = [pair({})];

/** A complete stubbed network for MINT: a USDC curve, a reservoir with 1 234,56 USDC and 0,12 SOL, 12 holders. */
function fullNetwork({ curveBytes = CURVE_USDC, supply = 999_123_456_123_456n, dex = MARKET_BODY, extra = {}, methods = {} } = {}) {
  const s = holdersScenario();
  const curve = parseBondingCurve(curveBytes);
  const vault = creatorVaultAddress(curve.creator);
  const accounts = {
    ...s.accounts,
    [MINT]: accountValue({ owner: TOKEN_2022_PROGRAM, data: mintBytes({ supply }) }),
    [bondingCurveAddress(MINT)]: accountValue({ owner: PUMP_PROGRAM, data: curveBytes }),
    [globalAddress()]: accountValue({ owner: PUMP_PROGRAM, data: GLOBAL }),
    [RESERVOIR]: accountValue({ lamports: 120_000_000 }),
    [associatedTokenAddress(RESERVOIR, USDC_MINT)]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: RESERVOIR, amount: 1_234_560_000n }) }),
    [associatedTokenAddress(vault, USDC_MINT)]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: vault, amount: 12_340_000n }) }),
    ...extra,
  };
  const calls = network({
    accounts,
    dex,
    methods: {
      getTokenLargestAccounts: methodOff,
      getProgramAccounts: () => s.tokenAccounts.map((t) => ({
        pubkey: t.address,
        account: { data: [b64(Uint8Array.from([...addressBytes(t.owner), ...new Uint8Array(new BigUint64Array([t.amount]).buffer)])), 'base64'] },
      })),
      ...methods,
    },
  });
  return { calls, s, vault };
}

const LIVE = { contract: MINT, wallets: { reservoir: RESERVOIR } };

test('before the opening: no contract, every block null, and not one network call', async () => {
  const calls = network();
  globalThis.fetch = async (...args) => { calls.push(args); throw new Error('the network must not be touched before the opening'); };
  const reading = await takeReading({ live: { contract: '', wallets: { reservoir: '' } }, rpcUrl: RPC, now: new Date('2026-10-17T13:31:05Z') });
  assert.deepEqual(reading, {
    asOf: '2026-10-17T13:31:05.000Z', mint: null, token: null, curve: null, reservoir: null,
    creatorVault: null, holders: null, market: null, errors: [],
  });
  assert.equal(calls.length, 0);
  assert.equal((await takeReading({ live: {}, rpcUrl: RPC })).mint, null, 'a live.json with no contract field is the same');
});

test('a malformed contract in live.json is refused before any call', async () => {
  const calls = network();
  const reading = await takeReading({ live: { contract: 'not-an-address' }, rpcUrl: RPC });
  assert.equal(reading.mint, null);
  assert.deepEqual(reading.errors, ['mint: the contract in live.json is not a valid address']);
  assert.equal(calls.length, 0);
});

test('a full reading: every block of the documented shape, from the chain and DexScreener', async () => {
  const { calls } = fullNetwork();
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC, now: new Date('2026-10-17T13:31:05Z') });
  assert.deepEqual(Object.keys(reading), ['asOf', 'mint', 'token', 'curve', 'reservoir', 'creatorVault', 'holders', 'market', 'errors']);
  assert.equal(reading.asOf, '2026-10-17T13:31:05.000Z');
  assert.equal(reading.mint, MINT);
  assert.deepEqual(reading.token, { supply: 999123456.123456, decimals: 6, burned: 876543.876544, mintAuthority: null, freezeAuthority: null });
  assert.deepEqual(reading.curve, { address: bondingCurveAddress(MINT), progressPct: 20, complete: false });
  assert.deepEqual(reading.reservoir, { address: RESERVOIR, usdc: 1234.56, sol: 0.12 });
  assert.deepEqual(reading.creatorVault, { unclaimed: 12.34, unit: 'USDC', inVault: 12.34, toSweep: 0 });
  assert.deepEqual(reading.holders,{ top10Pct: pct1(tokens(365), 999_123_456_123_456n), excluded: 'token accounts whose owner is not a wallet (curve, pools, programs)' });
  assert.deepEqual(reading.market, { source: 'dexscreener', priceUsd: 0.0000812, marketCapUsd: 81200, volume24hUsd: 154000, pairUrl: 'https://dexscreener.com/solana/abc' });
  assert.deepEqual(reading.errors, []);
  assert.ok(calls.some((c) => c.dex === `https://api.dexscreener.com/token-pairs/v1/solana/${MINT}`), 'the DexScreener endpoint read on 17 October 2026');
});

test('a reading with no reservoir wallet yet leaves that block null and says nothing is wrong', async () => {
  fullNetwork();
  const reading = await takeReading({ live: { contract: MINT, wallets: { reservoir: '' } }, rpcUrl: RPC });
  assert.equal(reading.reservoir, null);
  assert.deepEqual(reading.errors, []);
  assert.equal(reading.token.supply, 999123456.123456);
  fullNetwork();
  const bad = await takeReading({ live: { contract: MINT, wallets: { reservoir: 'oops' } }, rpcUrl: RPC });
  assert.equal(bad.reservoir, null);
  assert.deepEqual(bad.errors, ['reservoir: malformed address in live.json']);
});

test('one block failing leaves the others standing, with the reason in errors', async () => {
  fullNetwork({ dex: new Response('boom', { status: 500 }) });
  const marketDown = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(marketDown.market, null);
  assert.deepEqual(marketDown.errors, ['market: http 500']);
  assert.equal(marketDown.token.supply, 999123456.123456);
  assert.equal(marketDown.holders.top10Pct, 36.5);

  fullNetwork({ dex: new Response('slow', { status: 429 }) });
  assert.deepEqual((await takeReading({ live: LIVE, rpcUrl: RPC })).errors, ['market: rate limited']);

  fullNetwork({ dex: { pairs: [] } });
  assert.deepEqual((await takeReading({ live: LIVE, rpcUrl: RPC })).errors, ['market: no pair listed yet']);

  fullNetwork({ methods: { getProgramAccounts: () => json({ jsonrpc: '2.0', id: 1, error: { code: -32010, message: 'too many accounts' } }) } });
  const holdersDown = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(holdersDown.holders, null);
  assert.deepEqual(holdersDown.errors, ['holders: too many accounts']);
  assert.equal(holdersDown.creatorVault.unclaimed, 12.34);
  assert.equal(holdersDown.market.priceUsd, 0.0000812);
});

test('a mint with no pump.fun curve still reads its token, holders and market', async () => {
  fullNetwork({ extra: { [bondingCurveAddress(MINT)]: null } });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(reading.curve, null);
  assert.equal(reading.creatorVault, null);
  assert.equal(reading.token.burned, 876543.876544, '1 000 000 000 minus the supply when no curve says otherwise');
  assert.deepEqual(reading.errors, ['curve: no pump.fun bonding curve for this mint']);
});

test('a missing mint account fails the token block, not the whole reading', async () => {
  fullNetwork({ extra: { [MINT]: null } });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(reading.token, null);
  assert.ok(reading.errors.includes('token: mint account not found'));
  assert.ok(reading.errors.some((e) => e.startsWith('holders:')));
  assert.equal(reading.market.priceUsd, 0.0000812);
});

test('--mint overrides the contract of live.json (rehearsals on another coin)', async () => {
  const { calls } = fullNetwork();
  const reading = await takeReading({ live: { contract: addr(77), wallets: {} }, mint: MINT, rpcUrl: RPC });
  assert.equal(reading.mint, MINT);
  assert.ok(!calls.some((c) => JSON.stringify(c).includes(addr(77))), 'the contract of live.json was never read');
});

test('burned counts down from what the curve says was minted, in integers', () => {
  const curve = parseBondingCurve(CURVE_USDC);
  const block = tokenBlock({ data: mintBytes({ supply: 999_999_999_999_999n }) }, curve);
  assert.equal(block.burned, 0.000001, 'one raw unit is not rounded away');
  assert.equal(tokenBlock({ data: mintBytes({ supply: 1_000_000_000_000_000n }) }, curve).burned, 0);
  assert.equal(tokenBlock({ data: mintBytes({ supply: 1_000_000_000_000_001n }) }, curve).burned, null, 'a larger supply is not a burn, and not "0 burned" either');
  assert.equal(tokenBlock({ data: mintBytes({ supply: 900_000_000_000_000n }) }, null).burned, 100_000_000);
  assert.equal(tokenBlock({ data: mintBytes({ supply: 1_000_000_000_000_001n }) }, null).burned, null, 'without a curve the 1 000 000 000 default is the ceiling too');
});

// a Mayhem-mode curve read on 17 October 2026 had 2 000 000 000 on the mint and 1 000 000 000 in the curve
test('a supply above what the curve created gives burned null with a reason; the rest of the reading stands', async () => {
  fullNetwork({ supply: 2_000_000_000_000_000n });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC, now: new Date('2026-10-17T13:31:05Z') });
  assert.equal(reading.token.supply, 2_000_000_000);
  assert.equal(reading.token.burned, null);
  assert.deepEqual(reading.errors, ['burned: the supply is above what the curve created (Mayhem mode?), not computed']);
  assert.equal(reading.holders.top10Pct, pct1(tokens(365), 2_000_000_000_000_000n), 'holder shares follow the mint supply');
  assert.equal(reading.curve.progressPct, 20);
  assert.equal(reading.market.priceUsd, 0.0000812);
  const text = formatReading(reading);
  assert.match(text, /brûlé —/, 'the page and the report show a dash, not a zero');
});

// the same coin after migration: the fees now land in the PumpSwap pool's creator vault
test('after migration the owed fees add the PumpSwap creator vault and what the pool has not swept', async () => {
  const curveBytes = patchCurve(CURVE_USDC, { complete: true });
  const creatorOfPool = addr(41);
  const poolAddress = canonicalPoolAddress(MINT, USDC_MINT);
  const poolBytes = patchPool(POOL_SOL, { baseMint: MINT, quoteMint: USDC_MINT, coinCreator: creatorOfPool, protocolFees: 700_000n, creatorFees: 1_500_000n });
  const ammVault = ammCreatorVaultAuthority(creatorOfPool);
  const extra = {
    [poolAddress]: accountValue({ owner: PUMP_AMM_PROGRAM, data: poolBytes }),
    [associatedTokenAddress(ammVault, USDC_MINT)]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: ammVault, amount: 2_108_591_390n }) }),
  };
  fullNetwork({ curveBytes, extra });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.deepEqual(reading.curve, { address: bondingCurveAddress(MINT), progressPct: 100, complete: true });
  assert.deepEqual(
    reading.creatorVault,
    { unclaimed: 2122.43139, unit: 'USDC', inVault: 2120.93139, toSweep: 1.5 },
    '2 108,591390 in the pool vault + 12,34 in the curve vault can be collected; the pool still holds 1,50 to sweep',
  );

  // what the curve itself still holds is owed too (migration is not known to empty it)
  fullNetwork({ curveBytes: patchCurve(CURVE_USDC, { complete: true, creatorFee: 500_000n }), extra });
  const both = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.deepEqual(both.creatorVault, { unclaimed: 2122.93139, unit: 'USDC', inVault: 2120.93139, toSweep: 2 });

  // a complete curve whose pool cannot be found is an error, not a quietly smaller number
  fullNetwork({ curveBytes });
  const missing = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(missing.creatorVault, null);
  assert.deepEqual(missing.errors, ['creatorVault: the curve is complete but its PumpSwap pool is not found']);
});

test('poolVaultBalance keeps the vault balance and the unswept fees apart; a missing vault account is zero', async () => {
  const at = canonicalPoolAddress(MINT, WSOL_MINT);
  network({ accounts: { [at]: accountValue({ owner: PUMP_AMM_PROGRAM, data: Uint8Array.from(POOL_SOL) }) } });
  assert.deepEqual(await poolVaultBalance(RPC, MINT, WSOL_MINT), { inVault: 0n, toSweep: 54_632_427n });
  // a pool whose layout ends before the fee counters existed has nothing to sweep
  network({ accounts: { [at]: accountValue({ owner: PUMP_AMM_PROGRAM, data: POOL_SOL.slice(0, 245) }) } });
  assert.deepEqual(await poolVaultBalance(RPC, MINT, WSOL_MINT), { inVault: 0n, toSweep: 0n });
});

test('a SOL-quoted coin: the vault lamports above the rent floor, and the curve fee still to sweep', async () => {
  const solCurve = patchCurve(CURVE_SOL, {});
  const creator = parseBondingCurve(solCurve).creator;
  const { calls } = fullNetwork({
    curveBytes: solCurve,
    extra: { [creatorVaultAddress(creator)]: accountValue({ lamports: 4_070_386 }) },
    methods: { getMinimumBalanceForRentExemption: ([length]) => { assert.equal(length, 0); return 650_240; } },
  });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  // the captured curve holds 1 007 839 lamports of creator fee on top of the 3 420 146 in the vault
  assert.deepEqual(reading.creatorVault, { unclaimed: 0.004427985, unit: 'SOL', inVault: 0.003420146, toSweep: 0.001007839 });
  assert.ok(calls.some((c) => c.method === 'getMinimumBalanceForRentExemption'));
});

// seen on a live USDC curve on 17 October 2026: 4.160694 USDC of creator fee in the curve against
// 0.876988 in the creator vault. Reading only the vault understated what is owed by 82 %.
test('creator fees still in the curve are counted, and shown apart from what can be collected', async () => {
  const curveBytes = patchCurve(CURVE_USDC, { creatorFee: 4_160_694n });
  const vault = creatorVaultAddress(parseBondingCurve(curveBytes).creator);
  const vaultAta = associatedTokenAddress(vault, USDC_MINT);
  fullNetwork({
    curveBytes,
    extra: { [vaultAta]: accountValue({ owner: TOKEN_PROGRAM, data: tokenAccountBytes({ mint: USDC_MINT, owner: vault, amount: 876_988n }) }) },
  });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.deepEqual(reading.creatorVault, { unclaimed: 5.037682, unit: 'USDC', inVault: 0.876988, toSweep: 4.160694 });

  // nothing swept yet, so no vault account at all: everything is still in the curve
  fullNetwork({ curveBytes, extra: { [vaultAta]: null } });
  const unswept = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.deepEqual(unswept.creatorVault, { unclaimed: 4.160694, unit: 'USDC', inVault: 0, toSweep: 4.160694 });

  // and a curve that has no creator fee leaves the old figure alone
  fullNetwork();
  assert.deepEqual((await takeReading({ live: LIVE, rpcUrl: RPC })).creatorVault, { unclaimed: 12.34, unit: 'USDC', inVault: 12.34, toSweep: 0 });
});

test('a coin quoted in another token is not guessed at', async () => {
  const bytes = Uint8Array.from(CURVE_USDC);
  bytes.set(addressBytes(addr(61)), 83);
  fullNetwork({ curveBytes: bytes });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(reading.creatorVault, null);
  assert.match(reading.errors[0], /^creatorVault: quote asset .* is not handled$/);
  assert.equal(reading.curve.progressPct, 20, 'the progress is counted in tokens, whatever the quote asset');
});

test('a DexScreener list with no pair of the coin\'s own leaves the market null and says why; the rest stands', async () => {
  // the list of a token that is only ever the quote side of other coins' pools, plus a deeper look-alike
  const usdcSide = pair({ pairAddress: addr(50), baseToken: { address: addr(51) }, quoteToken: { address: MINT }, liquidity: { usd: 9e9 }, priceUsd: '4.5' });
  const lookAlike = pair({ pairAddress: addr(52), liquidity: { usd: 9e9 }, priceUsd: '77' });
  fullNetwork({ dex: [usdcSide, lookAlike] });
  const reading = await takeReading({ live: LIVE, rpcUrl: RPC });
  assert.equal(reading.market, null);
  assert.deepEqual(reading.errors, ['market: no pair of its own among the 2 listed']);
  assert.equal(reading.token.supply, 999123456.123456);
  assert.equal(reading.holders.top10Pct, 36.5);
});

// ---------------------------------------------------------------- the node's URL

test('a node URL that does not parse is never quoted: not by rpc(), not in the reading, not in the JSON', async () => {
  const secret = 'LEAKED-VALUE-123';
  const noScheme = `mainnet.helius-rpc.com/?api-key=${secret}`;
  globalThis.fetch = async () => { throw new Error('the network must not be touched'); };
  await assert.rejects(() => rpc(noScheme, 'getSlot'), (error) => error.name === 'RpcError' && error.message === BAD_RPC_URL);
  await assert.rejects(() => rpc(`http://node.example/?api-key=${secret}`, 'getSlot'), (error) => error.message === BAD_RPC_URL, 'plain http only for a node on this machine');
  await assert.rejects(() => rpc(`ftp://node.example/${secret}`, 'getSlot'), (error) => error.message === BAD_RPC_URL);
  await assert.rejects(() => rpc('', 'getSlot'), (error) => error.message === BAD_RPC_URL);
  assert.equal(parseRpcUrl('https://rpc.test/v2/abc').protocol, 'https:');
  assert.equal(parseRpcUrl('http://127.0.0.1:8899').port, '8899', 'a local validator is fine');
  assert.equal(parseRpcUrl('http://localhost:8899').hostname, 'localhost');
  assert.equal(parseRpcUrl('http://[::1]:8899').hostname, '[::1]');
  assert.throws(() => parseRpcUrl('http://[::2]:8899'), /not a valid https URL/);

  // the reading says it once, still reads what needs no node, and the whole JSON is free of the key
  fullNetwork();
  const reading = await takeReading({ live: LIVE, rpcUrl: noScheme });
  assert.deepEqual(reading.errors, [`rpc: ${BAD_RPC_URL}`]);
  assert.equal(reading.token, null);
  assert.equal(reading.market.priceUsd, 0.0000812);
  assert.ok(!JSON.stringify(reading).includes(secret));

  // the same through the environment variable, which is how the workflows and Vercel set it
  const before = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = noScheme;
  try {
    fullNetwork();
    const viaEnv = await takeReading({ live: LIVE });
    assert.deepEqual(viaEnv.errors, [`rpc: ${BAD_RPC_URL}`]);
    assert.ok(!JSON.stringify(viaEnv).includes(secret));
  } finally {
    if (before === undefined) delete process.env.SOLANA_RPC_URL; else process.env.SOLANA_RPC_URL = before;
  }
});

test('the key of a working node URL never reaches an error either: query, path and credentials are scrubbed', async () => {
  const secret = 'LEAKED-VALUE-123';
  for (const url of [`https://node.test/?api-key=${secret}`, `https://node.test/v2/${secret}`, `https://worker:${secret}@node.test/`]) {
    globalThis.fetch = async (target) => { throw new TypeError(`connect ECONNREFUSED ${target}`); };
    await assert.rejects(() => rpc(url, 'getSlot', [], { retries: 0 }), (error) => /^rpc unreachable: connect ECONNREFUSED/.test(error.message) && !error.message.includes(secret));
    network({ methods: { getSlot: () => json({ jsonrpc: '2.0', id: 1, error: { code: -1, message: `bad request for ${url}` } }) } });
    await assert.rejects(() => rpc(url, 'getSlot'), (error) => error.message.startsWith('bad request for ') && !error.message.includes(secret));
    network({ methods: { getSlot: () => new Response(`${url} is down`, { status: 502 }) } });
    await assert.rejects(() => rpc(url, 'getSlot', [], { retries: 0 }), (error) => error.message === 'rpc http 502');
  }
  assert.equal(scrubRpcUrl('failed: https://node.test/v2/abcd1234efgh?x=1', 'https://node.test/v2/abcd1234efgh?x=1'), 'failed: <rpc>');
  assert.equal(scrubRpcUrl('GET /v2/abcd1234efgh failed', 'https://node.test/v2/abcd1234efgh'), 'GET <rpc> failed');
  assert.equal(scrubRpcUrl('rate limited', 'https://api.mainnet-beta.solana.com'), 'rate limited', 'a plain node URL has nothing to hide');
  assert.equal(scrubRpcUrl('oops mainnet.helius-rpc.com/?api-key=abcdef', 'mainnet.helius-rpc.com/?api-key=abcdef'), 'oops <rpc>', 'even a value that is not a URL');
});

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b ?? ''; };
  return res;
}

test('the endpoint serves the documented shape with the edge cache header, and ignores the request', async () => {
  const calls = network();
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body }); throw new Error('offline'); };
  const res = fakeRes();
  await handler({ method: 'GET', url: '/api/chain', query: { mint: addr(77), rpc: 'https://evil.example' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
  assert.match(res.headers['content-type'], /^application\/json/);
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body), ['asOf', 'mint', 'token', 'curve', 'reservoir', 'creatorVault', 'holders', 'market', 'errors']);
  assert.ok(!JSON.stringify(calls).includes(addr(77)), 'the mint in the query was never read');
  assert.ok(!JSON.stringify(calls).includes('evil.example'), 'the node in the query was never called');
  assert.notEqual(body.mint, addr(77));
});

test('a request with a query string is sent to the bare path and costs no reading', async () => {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('offline'); };
  for (const method of ['GET', 'HEAD']) {
    for (const url of ['/api/chain?x=1', `/api/chain?mint=${addr(77)}`, '/api/chain?']) {
      const res = fakeRes();
      await handler({ method, url }, res);
      assert.equal(res.statusCode, 308, url);
      assert.equal(res.headers.location, '/api/chain');
      assert.equal(res.body, '', 'no reading in the answer');
      assert.match(res.headers['cache-control'], /s-maxage=3600/, 'the redirect itself is cached');
    }
  }
  assert.equal(calls.length, 0);
  const bare = fakeRes();
  await handler({ method: 'GET', url: '/api/chain' }, bare);
  assert.equal(bare.statusCode, 200, 'the bare path is not redirected again');
});

test('a warm instance keeps its reading for a minute, shares one in flight, and keeps no failure', async () => {
  let taken = 0;
  const take = async () => { taken += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { n: taken }; };
  const live = { contract: MINT, wallets: { reservoir: RESERVOIR } };
  const [a, b] = await Promise.all([sharedReading(live, take), sharedReading(live, take)]);
  assert.equal(taken, 1, 'two requests at once, one reading');
  assert.strictEqual(a, b);
  assert.deepEqual(await sharedReading(live, take), { n: 1 });
  assert.equal(taken, 1, 'the next request within the minute reads nothing');

  await sharedReading({ ...live, contract: addr(8) }, take);
  assert.equal(taken, 2, 'another contract is another reading');

  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 61_000;
    assert.deepEqual(await sharedReading({ ...live, contract: addr(8) }, take), { n: 3 });
  } finally {
    Date.now = realNow;
  }

  clearReadingCache();
  let failed = 0;
  const failing = async () => { failed += 1; throw new Error('node down'); };
  await assert.rejects(() => sharedReading(live, failing), /node down/);
  await assert.rejects(() => sharedReading(live, failing), /node down/);
  assert.equal(failed, 2, 'a failed reading is tried again, not kept');
});

test('the endpoint answers GET and HEAD only', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const res = fakeRes();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
});

// ---------------------------------------------------------------- releve

test('the reading as text: dashes for what was not read, French numbers and spacing', () => {
  const before = formatReading({ asOf: '2026-10-17T13:31:05.000Z', mint: null, errors: [] });
  assert.match(before, /Pas encore de contrat/);
  const full = formatReading({
    asOf: '2026-10-17T13:31:05.000Z', mint: MINT,
    token: { supply: 999123456.123456, decimals: 6, burned: 876543.876544, mintAuthority: null, freezeAuthority: null },
    curve: { address: 'x', progressPct: 63.2, complete: false },
    reservoir: { address: RESERVOIR, usdc: 1234.56, sol: 0.12 },
    creatorVault: { unclaimed: 12.34, unit: 'USDC' },
    holders: { top10Pct: 21.4, excluded: '' },
    market: null,
    errors: ['market: http 500'],
  });
  assert.match(full, /Courbe pump\.fun : 63,2 %/);
  assert.match(full, /Top 10 des wallets : 21,4 %/);
  assert.match(full, /création révoquée/);
  assert.match(full, /Marché \(DexScreener\) : —/);
  assert.match(full, /market: http 500/);
  assert.equal(fr(null), '—');
  assert.equal(fr(1234.5), '1 234,50');
  assert.match(formatReading({ asOf: 'now', mint: MINT, token: { supply: 1, decimals: 6, burned: 0, mintAuthority: addr(1), freezeAuthority: null }, errors: [] }, { markdown: true }), /NON révoquée/);
});

test('the fees line tells the founders when a sweep must come before the claim', () => {
  // typo() puts no-break spaces before units and colons: compare with plain ones
  const line = (creatorVault) => formatReading({ asOf: 'now', mint: MINT, creatorVault, errors: [] })
    .split('\n').find((l) => l.startsWith('Frais du créateur')).replace(/[  ]/g, ' ');
  const swept = line({ unclaimed: 5.037682, unit: 'USDC', inVault: 0.876988, toSweep: 4.160694 });
  assert.match(swept, /5,04 USDC/);
  assert.match(swept, /dont 4,16 USDC à balayer d’abord \(sweep_creator_fee\)/);
  assert.match(swept, /0,88 USDC réclamables tout de suite/);
  assert.doesNotMatch(line({ unclaimed: 12.34, unit: 'USDC', inVault: 12.34, toSweep: 0 }), /balayer/, 'nothing to sweep, nothing said');
  assert.doesNotMatch(line({ unclaimed: 12.34, unit: 'USDC', inVault: 12.34, toSweep: 0.000001 }), /balayer/, 'a millionth of a dollar is not worth a warning');
  assert.doesNotMatch(line({ unclaimed: 12.34, unit: 'USDC' }), /balayer/, 'a reading from before the split has the total only');
  assert.match(line({ unclaimed: 0.004427985, unit: 'SOL', inVault: 0.003420146, toSweep: 0.001007839 }), /dont 0,0010 SOL à balayer/);
  assert.match(line(null), /—/);
});

// ---------------------------------------------------------------- the launch audit

const NOW = new Date('2026-10-17T14:30:00Z');

test('early buyers: same block and the next blocks apart, the creator and the curve set aside', () => {
  const curve = bondingCurveAddress(MINT);
  const creator = addr(11);
  const buy = (slot, who, amount, extra = {}) => ({
    slot,
    tx: swapTransaction({
      slot, keys: ['p', `acct-${who}`, 'curveAcct'],
      balances: [
        { index: 1, owner: who, mint: MINT, pre: 0, post: amount },
        { index: 2, owner: curve, mint: MINT, pre: 900_000_000, post: 900_000_000 - amount },
      ],
      ...extra,
    }),
  });
  const out = analyseEarlyBuyers({
    mint: MINT, curveAddress: curve, creator, creationSlot: 100, earlySlots: 5,
    transactions: [
      buy(100, creator, 10_000_000), buy(100, addr(12), 20_000_000), buy(100, addr(13), 5_000_000),
      buy(100, addr(12), 1_000_000), // the same wallet again in the same block
      buy(102, addr(14), 7_000_000), buy(105, addr(15), 3_000_000), buy(106, addr(16), 9_000_000), // 106 is outside +5
      buy(100, addr(17), 4_000_000, { err: { InstructionError: [0, 'Custom'] } }), // a failed buy changed nothing
    ],
  });
  assert.equal(out.same.size, 2);
  assert.equal(out.same.get(addr(12)).bought, 21_000_000n);
  assert.equal(out.same.has(creator), false);
  assert.equal(out.creator.bought, 10_000_000n);
  assert.deepEqual([...out.early.keys()].sort(), [addr(14), addr(15)].sort());
  assert.equal(out.early.has(addr(16)), false);
  assert.equal([...out.same.keys()].includes(curve), false);
});

test('the lights: a fact is stated only when it is true, and pending says why', () => {
  const base = { mintAuthority: null, freezeAuthority: null, top10Pct: 21.4, excludedFacts: ['bonding curve (6EF8…wF6P) : 70,0 % de l’offre, exclu'], bundle: { wallets: 2, boughtPct: 2.5, heldPct: 2, capped: false }, teamPct: 0, teamFacts: ['creator ERXV…KxnA : 0,00 % de l’offre'], curveComplete: false, curveProgress: 20, extensions: ['MetadataPointer', 'TokenMetadata'], riskyExtensions: [] };
  const ok = suggestLights(base);
  assert.deepEqual(Object.keys(ok), ['mint', 'freeze', 'top10', 'bundles', 'team', 'lp']);
  assert.deepEqual([ok.mint.state, ok.freeze.state, ok.top10.state, ok.bundles.state, ok.team.state, ok.lp.state], ['ok', 'ok', 'ok', 'ok', 'ok', 'pending']);
  assert.equal(ok.mint.label, 'Création révoquée');
  assert.equal(ok.top10.label, 'Top 10 des wallets : 21,4 %');
  assert.ok(ok.mint.facts.some((f) => f.includes('MetadataPointer')));

  const warn = suggestLights({ ...base, mintAuthority: addr(1), top10Pct: TOP10_WARN_PCT + 0.1, bundle: { ...base.bundle, boughtPct: BUNDLE_WARN_PCT + 0.1 }, teamPct: 0.4, riskyExtensions: ['PermanentDelegate'], extensions: ['PermanentDelegate'] });
  assert.equal(warn.mint.state, 'warn');
  assert.equal(warn.mint.label, 'Autorité de création', 'no "revoked" label while it is not');
  assert.equal(warn.freeze.state, 'warn', 'revoked authorities do not make a permanent delegate harmless');
  assert.match(warn.freeze.detail, /PermanentDelegate/);
  assert.equal(warn.top10.state, 'warn');
  assert.equal(warn.bundles.state, 'warn');
  assert.equal(warn.team.state, 'warn');
  assert.equal(suggestLights({ ...base, top10Pct: TOP10_WARN_PCT }).top10.state, 'ok', 'exactly the threshold is still fine');

  const blind = suggestLights({ mintAuthority: undefined, freezeAuthority: undefined, excludedFacts: [], top10Error: 'détenteurs : rate limited', bundle: null, bundleError: 'création non atteinte', teamPct: null });
  assert.deepEqual(Object.values(blind).map((l) => l.state), ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  assert.match(blind.top10.facts[0], /rate limited/);
  const done = suggestLights({ ...base, curveComplete: true });
  assert.equal(done.lp.state, 'pending', 'the liquidity lock is for a person to confirm on-chain');
  assert.match(done.lp.detail, /Solscan/);
});

/** A stubbed chain with a creation block (creator, two bundled buyers), one sniper next block and a later buyer. */
function auditNetwork({ transactionsFail = false, supply = 1_000_000_000_000_000n, flags = [] } = {}) {
  const creator = addr(11);
  const curve = bondingCurveAddress(MINT);
  const curveBytes = flagCurve(patchCurve(CURVE_USDC, { creator }), ...flags);
  const sigs = { late: sig(1), sniper: sig(2), b: sig(3), a: sig(4), dev: sig(5) };
  const acct = { dev: addr(31), a: addr(32), b: addr(33), sniper: addr(34) };
  const owners = { dev: creator, a: addr(12), b: addr(13), sniper: addr(14) };
  const buyTx = (slot, who, amount) => swapTransaction({
    slot, keys: ['payer', acct[who], 'curveAcct'],
    balances: [
      { index: 1, owner: owners[who], mint: MINT, pre: null, post: amount },
      { index: 2, owner: curve, mint: MINT, pre: 500_000_000_000, post: 500_000_000_000 - amount },
    ],
  });
  const txs = {
    [sigs.dev]: buyTx(100, 'dev', 10_000_000_000_000), // 10 million tokens
    [sigs.a]: buyTx(100, 'a', 20_000_000_000_000), [sigs.b]: buyTx(100, 'b', 5_000_000_000_000),
    [sigs.sniper]: buyTx(102, 'sniper', 7_000_000_000_000),
  };
  const held = { [acct.dev]: 10_000_000_000_000n, [acct.a]: 20_000_000_000_000n, [acct.b]: 0n, [acct.sniper]: 7_000_000_000_000n };
  const accounts = {
    [MINT]: accountValue({ owner: TOKEN_2022_PROGRAM, data: token2022MintBytes([[18, 64], [19, 183]], { supply }) }),
    [curve]: accountValue({ owner: PUMP_PROGRAM, data: curveBytes }),
    [globalAddress()]: accountValue({ owner: PUMP_PROGRAM, data: GLOBAL }),
  };
  for (const who of Object.keys(acct)) accounts[acct[who]] = accountValue({ owner: TOKEN_2022_PROGRAM, data: tokenAccountBytes({ mint: MINT, owner: owners[who], amount: held[acct[who]] }) });
  const s = holdersScenario();
  Object.assign(accounts, s.accounts, { [curve]: accounts[curve] }); // the curve account is also the pool-less owner of 400 million
  const calls = network({
    accounts,
    methods: {
      getTokenLargestAccounts: methodOff,
      getProgramAccounts: () => s.tokenAccounts.map((t) => ({
        pubkey: t.address,
        account: { data: [b64(Uint8Array.from([...addressBytes(t.owner), ...new Uint8Array(new BigUint64Array([t.amount]).buffer)])), 'base64'] },
      })),
      getSignaturesForAddress: ([address]) => {
        assert.equal(address, curve);
        return [
          { signature: sigs.late, slot: 400, err: null, blockTime: 1_790_000_100 },
          { signature: sigs.sniper, slot: 102, err: null, blockTime: 1_790_000_001 },
          { signature: sigs.b, slot: 100, err: null, blockTime: 1_790_000_000 },
          { signature: sigs.a, slot: 100, err: null, blockTime: 1_790_000_000 },
          { signature: sigs.dev, slot: 100, err: null, blockTime: 1_790_000_000 },
        ];
      },
      getTransaction: ([signature]) => (transactionsFail ? null : txs[signature] ?? null),
    },
  });
  return { calls, creator, sigs };
}

test('the audit reads the creation block, bundled and early buyers, what they still hold, and suggests the lights', async () => {
  const { calls, creator, sigs } = auditNetwork();
  const result = await audit({ live: { wallets: { creator: addr(11) } }, mint: MINT, rpcUrl: RPC, now: NOW });
  assert.equal(result.creation.slot, 100);
  assert.equal(result.creation.signature, sigs.dev);
  assert.equal(result.curve.creator, creator);
  assert.deepEqual(result.creatorCheck, { curve: creator, liveJson: creator, same: true });
  // bought is counted against the 1 000 000 000 tokens minted, held against today's supply
  assert.equal(result.sameBlock.wallets, 2);
  assert.equal(result.sameBlock.boughtPct, 2.5);
  assert.equal(result.sameBlock.heldPct, 2);
  assert.equal(result.firstBlocks.wallets, 1);
  assert.equal(result.firstBlocks.boughtPct, 0.7);
  assert.equal(result.creatorBuy.boughtPct, 1);
  assert.equal(result.creatorBuy.held, 10_000_000);
  assert.deepEqual(result.token.extensions, ['MetadataPointer', 'TokenMetadata']);
  assert.equal(result.top10.pct, 36.5);
  assert.equal(result.top10.listComplete, true);
  assert.deepEqual(result.suggested.bundles.state, 'ok');
  assert.equal(result.suggested.top10.state, 'warn', '36,5 % is above the 30 % line');
  assert.equal(result.suggested.mint.state, 'ok');
  assert.equal(calls.filter((c) => c.method === 'getTransaction').length, 4, 'the later buyer, outside the window, was not read');
  assert.deepEqual(result.limits, []);
  const text = formatAudit(result);
  assert.match(text, /même bloc que la création : 2 wallet\(s\)/);
  assert.match(text, /identique à live\.json/);
  assert.match(text, /extensions Token-2022 : MetadataPointer, TokenMetadata/);
});

test('the audit says what it capped, and a creation it could not reach is pending, not zero', async () => {
  auditNetwork();
  const capped = await audit({ live: {}, mint: MINT, rpcUrl: RPC, maxTx: 2, now: NOW });
  assert.equal(capped.sameBlock.capped, true);
  assert.ok(capped.limits.some((l) => l.includes('--max-tx 2') && l.includes('minimums')));

  auditNetwork();
  const shortPages = await audit({ live: {}, mint: MINT, rpcUrl: RPC, maxPages: 1, now: NOW });
  assert.equal(shortPages.creation?.slot, 100, 'five signatures fit in one page, so the start is reached');

  auditNetwork({ transactionsFail: true });
  const missing = await audit({ live: {}, mint: MINT, rpcUrl: RPC, now: NOW });
  assert.ok(missing.limits.some((l) => l.includes('introuvables')));
});

test('the audit flags a creator in live.json that is not the curve creator', async () => {
  auditNetwork();
  const result = await audit({ live: { wallets: { creator: addr(66) } }, mint: MINT, rpcUrl: RPC, now: NOW });
  assert.equal(result.creatorCheck.same, false);
  assert.match(formatAudit(result), /ATTENTION : live\.json donne/);
});

test('the curve flags sit at the offsets the test helper flips', () => {
  for (const name of Object.keys(FLAG_AT)) {
    const base = parseBondingCurve(CURVE_USDC);
    const flipped = parseBondingCurve(flagCurve(CURVE_USDC, name));
    assert.equal(base[name], false, `${name} is off in the captured curve`);
    assert.equal(flipped[name], true, `${name} is the byte at ${FLAG_AT[name]}`);
    for (const other of Object.keys(FLAG_AT)) if (other !== name) assert.equal(flipped[other], false);
  }
});

test('curve settings: quote asset, creator, the four flags off, and a mint that holds no more than the curve made', () => {
  const curve = parseBondingCurve(patchCurve(CURVE_USDC, { creator: addr(11) }));
  const supply = curve.tokenTotalSupply;
  const good = checkCurveSettings({ curve, quote: 'USDC', liveCreator: addr(11), mintSupply: supply });
  assert.equal(good.ok, true);
  assert.equal(good.allChecked, true);
  assert.deepEqual(good.rows.map((r) => r.key), ['quote', 'creator', 'isHolderReward', 'isCashbackCoin', 'isMayhemMode', 'canEditCreatorFee', 'supply']);
  assert.ok(good.rows.every((r) => r.ok === true));

  // a burn lowers the supply: still fine
  assert.equal(checkCurveSettings({ curve, quote: 'USDC', liveCreator: addr(11), mintSupply: supply - 1n }).allChecked, true);

  // each wrong setting fails on its own row and no other
  const wrong = (opts) => checkCurveSettings({ curve, quote: 'USDC', liveCreator: addr(11), mintSupply: supply, ...opts });
  const failed = (result) => result.rows.filter((r) => r.ok === false).map((r) => r.key);
  assert.deepEqual(failed(wrong({ quote: 'SOL' })), ['quote']);
  assert.deepEqual(failed(wrong({ liveCreator: addr(12) })), ['creator']);
  assert.deepEqual(failed(wrong({ mintSupply: supply + 1n })), ['supply']);
  for (const name of Object.keys(FLAG_AT)) {
    const flagged = parseBondingCurve(flagCurve(patchCurve(CURVE_USDC, { creator: addr(11) }), name));
    const result = checkCurveSettings({ curve: flagged, quote: 'USDC', liveCreator: addr(11), mintSupply: supply });
    assert.deepEqual(failed(result), [name]);
    assert.equal(result.ok, false);
    assert.equal(result.rows.find((r) => r.key === name).found, 'OUI');
  }

  // a SOL curve, a curve quoted in an unknown token, and things that cannot be compared
  assert.deepEqual(failed(checkCurveSettings({ curve: parseBondingCurve(CURVE_SOL), quote: 'USDC', mintSupply: supply })), ['quote']);
  assert.equal(checkCurveSettings({ curve: parseBondingCurve(CURVE_SOL), quote: 'SOL' }).rows[0].ok, true);
  const strange = { ...curve, quoteMint: addr(50) };
  const odd = checkCurveSettings({ curve: strange, quote: 'USDC' });
  assert.equal(odd.rows[0].ok, false);
  assert.match(odd.rows[0].found, /jeton inconnu/);
  const unknown = checkCurveSettings({ curve: { ...curve, isMayhemMode: null }, quote: null });
  assert.equal(unknown.ok, true, 'nothing to compare is not a failure');
  assert.equal(unknown.allChecked, false, 'but it is not "all conform" either');
  assert.deepEqual(unknown.rows.filter((r) => r.ok === null).map((r) => r.key), ['quote', 'creator', 'isMayhemMode']);
});

// typo() puts no-break spaces before : ; ! ? and %, so these checks read the text with plain spaces
const plain = (text) => text.replace(/[  ]/g, ' ');

test('the audit of a Mayhem-mode coin shows the gaps and says on which base each share is counted', async () => {
  auditNetwork({ supply: 2_000_000_000_000_000n, flags: ['isMayhemMode'] });
  const result = await audit({ live: { wallets: { creator: addr(11) } }, mint: MINT, rpcUrl: RPC, quote: 'USDC', now: NOW });
  assert.equal(result.curveSettings.ok, false);
  assert.deepEqual(result.curveSettings.rows.filter((r) => r.ok === false).map((r) => r.key), ['isMayhemMode', 'supply']);
  assert.equal(result.token.supply, 2_000_000_000);
  assert.equal(result.sameBlock.boughtPct, 2.5, 'bought shares count against the 1 000 000 000 the curve created');
  assert.equal(result.sameBlock.heldPct, 1, 'held shares count against the mint supply');
  assert.equal(result.limits.length, 1);
  assert.match(plain(result.limits[0]), /Mayhem/);
  assert.match(plain(result.limits[0]), /2 000 000 000/);
  const text = plain(formatAudit(result));
  assert.match(text, /Mode Mayhem : OUI · attendu : non → ÉCART/);
  assert.match(text, /Offre du jeton : 2 000 000 000 jetons \(courbe : 1 000 000 000\)/);
  assert.match(text, /Au moins un écart/);
});

test('the audit of a coin made as asked shows every setting conform and no limit', async () => {
  auditNetwork();
  const result = await audit({ live: { wallets: { creator: addr(11) } }, mint: MINT, rpcUrl: RPC, quote: 'USDC', now: NOW });
  assert.equal(result.curveSettings.allChecked, true);
  assert.deepEqual(result.limits, []);
  const text = plain(formatAudit(result, { markdown: true }));
  assert.match(text, /### Réglages de la courbe/);
  assert.match(text, /Tous les réglages sont conformes\./);
  // no quote given (the config could not be read): the settings are shown but the quote is not compared
  auditNetwork();
  const unasked = await audit({ live: {}, mint: MINT, rpcUrl: RPC, now: NOW });
  assert.equal(unasked.curveSettings.allChecked, false);
  assert.equal(unasked.curveSettings.ok, true);
  assert.match(plain(formatAudit(unasked)), /Aucun écart ; certains réglages n’ont pas pu être comparés\./);
});

// ---------------------------------------------------------------- the ticket check

const T0 = Date.parse('2026-10-24T16:00:00Z'); // Saturday 18:00 Paris
const quoteOf = (usdc) => Math.round(usdc * 1e6);

/** A buyback slice: the reservoir pays `usdc` and receives `plein`; the curve takes the other side. */
function sliceTx({ usdc, plein, blockTime = T0 / 1000 + 600, owner = RESERVOIR, err = null }) {
  return swapTransaction({
    blockTime, err, keys: ['payer', 'resUsdc', 'resPlein', 'curveUsdc', 'cuvePlein'],
    balances: [
      { index: 1, owner, mint: USDC_MINT, pre: quoteOf(500), post: quoteOf(500 - usdc) },
      { index: 2, owner, mint: MINT, pre: null, post: plein },
      { index: 3, owner: addr(70), mint: USDC_MINT, pre: 0, post: quoteOf(usdc) },
      { index: 4, owner: addr(70), mint: MINT, pre: plein + 1000, post: 1000 },
    ],
  });
}

function burnTx({ amount, from = RESERVOIR, blockTime = T0 / 1000 + 3600 }) {
  return swapTransaction({
    blockTime, keys: ['payer', 'resPlein'],
    balances: [{ index: 1, owner: from, mint: MINT, pre: amount + 5, post: 5 }],
  });
}

function ticketOf() {
  return {
    n: 1, at: '2026-10-24T18:00:00+02:00', unit: 'USDC', reservoir: 100, ratePct: 46.6, buyback: 57.5, aid: 10, team: 32.5,
    slices: [
      { sig: sig(41), spent: 32.5, bought: 1_234_567.123456 },
      { sig: sig(42), spent: 25, bought: 1_000_000.5 },
    ],
    burn: { sig: sig(43), amount: 2_234_567.623456 },
    aidTransfer: { sig: sig(44) },
    claim: { sig: sig(45) },
  };
}

function ticketChain(overrides = {}) {
  const t = ticketOf();
  const aidTx = swapTransaction({
    blockTime: T0 / 1000 + 4000, keys: ['payer', 'aidAcct'],
    balances: [{ index: 1, owner: addr(80), mint: USDC_MINT, pre: 0, post: quoteOf(10) }],
  });
  const claimTx = { ...swapTransaction({ blockTime: T0 / 1000 - 86400, keys: ['payer', PUMP_PROGRAM], balances: [] }) };
  const txs = {
    [t.slices[0].sig]: sliceTx({ usdc: 32.5, plein: 1_234_567_123_456 }),
    [t.slices[1].sig]: sliceTx({ usdc: 25, plein: 1_000_000_500_000 }),
    [t.burn.sig]: burnTx({ amount: 2_234_567_623_456 }),
    [t.aidTransfer.sig]: aidTx,
    [t.claim.sig]: claimTx,
    ...overrides,
  };
  return { t, fetchTx: async (s) => txs[s] ?? null, txs };
}

const LIVE_T = { contract: MINT, wallets: { reservoir: RESERVOIR, aid: addr(80) } };

test('a ticket that matches the chain passes, signature by signature', async () => {
  const { t, fetchTx } = ticketChain();
  const r = await verifyTicket({ ticket: t, live: LIVE_T, fetchTx });
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => c.status !== 'ok')));
  assert.deepEqual(r.checks.map((c) => [c.id, c.status]), [
    ['slices[0]', 'ok'], ['slices[1]', 'ok'], ['burn', 'ok'], ['aidTransfer', 'ok'], ['claim', 'ok'],
  ]);
  assert.deepEqual(r.checks[0].found, { owner: RESERVOIR, bought: 1234567.123456, spent: 32.5 });
  assert.equal(r.checks[2].found.burned, 2234567.623456);
  assert.deepEqual(r.totals, { spent: 57.5, bought: 2234567.623456, buyback: 57.5 });
  assert.equal(r.failures, 0);
  const text = formatVerification(r);
  assert.match(text, /Verdict : toutes les vérifications passent/);
  assert.match(text, /Tolérance : 0,01 sur l’argent/);
});

test('a wrong amount, a failed or missing transaction, a reused signature, a foreign wallet all fail', async () => {
  const t = ticketOf();
  t.slices[0].spent = 33.5; // a euro off
  t.slices[1].bought = 1_000_005; // five tokens off, more than a millionth
  const { fetchTx } = ticketChain();
  const wrong = await verifyTicket({ ticket: t, live: LIVE_T, fetchTx });
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.checks.slice(0, 2).map((c) => c.status), ['fail', 'fail']);
  assert.match(wrong.checks[0].notes.join(' '), /USDC payés : 32,50 sur la chaîne contre 33,50 sur le ticket/);
  assert.match(wrong.checks[1].notes.join(' '), /jeton reçu/);

  const second = ticketOf();
  const failed = ticketChain({ [second.slices[0].sig]: sliceTx({ usdc: 32.5, plein: 1_234_567_123_456, err: { InstructionError: [2, 'Custom'] } }) });
  assert.match((await verifyTicket({ ticket: second, live: LIVE_T, fetchTx: failed.fetchTx })).checks[0].notes[0], /a échoué/);

  const gone = ticketChain({ [second.slices[1].sig]: null });
  assert.match((await verifyTicket({ ticket: second, live: LIVE_T, fetchTx: gone.fetchTx })).checks[1].notes[0], /introuvable/);

  const twice = ticketOf();
  twice.slices[1].sig = twice.slices[0].sig;
  const dup = await verifyTicket({ ticket: twice, live: LIVE_T, fetchTx: ticketChain().fetchTx });
  assert.match(dup.checks[1].notes[0], /deux fois/);

  const otherWallet = ticketChain({ [second.slices[0].sig]: sliceTx({ usdc: 32.5, plein: 1_234_567_123_456, owner: addr(90) }) });
  assert.equal((await verifyTicket({ ticket: second, live: LIVE_T, fetchTx: otherWallet.fetchTx })).checks[0].status, 'fail', 'someone else bought, not the réservoir');

  const broken = ticketOf();
  broken.burn.sig = 'not-a-signature';
  assert.match((await verifyTicket({ ticket: broken, live: LIVE_T, fetchTx: ticketChain().fetchTx })).checks[2].notes[0], /absente ou mal formée/);

  const unreadable = await verifyTicket({ ticket: ticketOf(), live: LIVE_T, fetchTx: async () => { throw new Error('rate limited'); } });
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.checks[0].notes[0], /lecture impossible : rate limited/);
});

test('tolerance: a cent on money, a millionth on the coin, nothing looser', () => {
  assert.equal(moneyMatch(32_500_000n, 32_510_000n), true, 'one cent');
  assert.equal(moneyMatch(32_500_000n, 32_520_000n), false, 'two cents');
  const claim = 2_000_000_000_000n; // two million tokens: a millionth is two tokens
  assert.equal(plainMatch(claim - 2_000_000n, claim), true, 'one millionth of the claim');
  assert.equal(plainMatch(claim + 2_000_000n, claim), true);
  assert.equal(plainMatch(claim - 2_000_001n, claim), false);
  assert.equal(plainMatch(10n, 11n), true, 'always one raw unit');
  assert.equal(plainMatch(10n, 12n), false);
  assert.equal(rawFrom(1234567.123456, 6), 1_234_567_123_456n);
  assert.equal(rawFrom(0.1 + 0.2, 6), 300_000n);
  assert.equal(rawFrom(NaN, 6), null);
  assert.equal(rawFrom('1', 6), null);
});

test('a burn must lower the supply by the claimed amount, from the réservoir', () => {
  const ctx = { mint: MINT, reservoir: RESERVOIR, unit: 'USDC', quoteMint: USDC_MINT, atMs: T0 };
  assert.equal(checkBurn({ amount: 100 }, burnTx({ amount: 100_000_000 }), ctx).status, 'ok');
  assert.equal(checkBurn({ amount: 100 }, burnTx({ amount: 99_000_000 }), ctx).status, 'fail');
  assert.match(checkBurn({ amount: 100 }, sliceTx({ usdc: 1, plein: 100_000_000 }), ctx).notes[0], /aucune baisse de l’offre/, 'a buy is not a burn');
  const foreign = checkBurn({ amount: 100 }, burnTx({ amount: 100_000_000, from: addr(90) }), ctx);
  assert.equal(foreign.status, 'warn');
  assert.match(foreign.notes.join(' '), /ne vient pas/);
  assert.equal(checkBurn({ amount: 100 }, null, ctx).status, 'fail');
});

test('a block outside the plein window is a warning; the claim must touch pump.fun', () => {
  const ctx = { mint: MINT, reservoir: RESERVOIR, unit: 'USDC', quoteMint: USDC_MINT, atMs: T0 };
  const early = sliceTx({ usdc: 10, plein: 5_000_000, blockTime: T0 / 1000 - 3600 });
  const verdict = checkSlice({ spent: 10, bought: 5 }, early, ctx);
  assert.equal(verdict.status, 'warn');
  assert.match(verdict.notes.join(' '), /hors de la fenêtre/);
  assert.equal(checkSlice({ spent: 10, bought: 5 }, sliceTx({ usdc: 10, plein: 5_000_000 }), ctx).status, 'ok');
  const other = swapTransaction({ keys: ['payer', 'someProgram'], balances: [] });
  assert.equal(checkClaim(other).status, 'warn');
  assert.equal(checkClaim(swapTransaction({ keys: ['payer', PUMP_AMM_PROGRAM], balances: [] })).status, 'ok');
  assert.equal(checkClaim(swapTransaction({ keys: ['payer'], balances: [], err: { InstructionError: [0, 'x'] } })).status, 'fail');
});

test('with no published réservoir the buyer is the one wallet that paid and received; ambiguity is a failure', async () => {
  const t = ticketOf();
  const { fetchTx } = ticketChain();
  const inferred = await verifyTicket({ ticket: t, live: { contract: MINT, wallets: {} }, fetchTx });
  assert.equal(inferred.checks[0].status, 'ok');
  assert.match(inferred.checks[0].notes[0], /wallet déduit/);
  assert.equal(inferred.checks[2].status, 'ok', 'a burn needs no wallet');
  assert.match(inferred.checks[3].notes.join(' '), /destination non vérifiée/, 'no aid wallet either');
  assert.equal(inferred.checks[3].status, 'warn');

  const twoBuyers = swapTransaction({
    keys: ['p', 'a', 'b', 'c', 'd'],
    balances: [
      { index: 1, owner: addr(91), mint: USDC_MINT, pre: 100, post: 50 }, { index: 2, owner: addr(91), mint: MINT, pre: null, post: 10 },
      { index: 3, owner: addr(92), mint: USDC_MINT, pre: 100, post: 50 }, { index: 4, owner: addr(92), mint: MINT, pre: null, post: 10 },
    ],
  });
  const ambiguous = await verifyTicket({ ticket: t, live: { contract: MINT, wallets: {} }, fetchTx: async () => twoBuyers });
  assert.equal(ambiguous.checks[0].status, 'fail');
  assert.match(ambiguous.checks[0].notes[0], /donnez --reservoir/);
});

test('the aid share must reach the aid wallet; a SOL ticket gets its coin side checked only', async () => {
  const t = ticketOf();
  t.aid = 12;
  const { fetchTx } = ticketChain();
  const short = await verifyTicket({ ticket: t, live: LIVE_T, fetchTx });
  assert.equal(short.checks[3].status, 'fail');
  assert.match(short.checks[3].notes[0], /le wallet de l’aide a reçu 10,00 USDC contre 12,00/);

  const sol = ticketOf();
  sol.unit = 'SOL';
  const solRun = await verifyTicket({ ticket: sol, live: LIVE_T, fetchTx });
  assert.equal(solRun.checks[0].status, 'ok', 'the coin side is checked');
  assert.match(solRun.checks[0].notes.join(' '), /côté SOL non vérifié/, 'and the SOL side says it was not');
  assert.match(solRun.checks[3].notes.join(' '), /montant en SOL non vérifié/);
});

test('input problems are reported as failures, not thrown', async () => {
  const noMint = await verifyTicket({ ticket: ticketOf(), live: {}, fetchTx: async () => null });
  assert.equal(noMint.ok, false);
  assert.match(noMint.checks[0].notes[0], /pas de contrat valide/);
  const notObject = await verifyTicket({ ticket: [], live: LIVE_T, fetchTx: async () => null });
  assert.equal(notObject.ok, false);
  const badFlag = await verifyTicket({ ticket: ticketOf(), live: LIVE_T, reservoir: 'nope', fetchTx: async () => null });
  assert.match(badFlag.checks[0].notes[0], /--reservoir/);
  const noSlices = ticketOf();
  noSlices.slices = [];
  const none = await verifyTicket({ ticket: noSlices, live: LIVE_T, fetchTx: ticketChain().fetchTx });
  assert.ok(none.checks.some((c) => c.id === 'slices' && c.status === 'fail'));
});

// ---------------------------------------------------------------- captured account buffers
// Read from mainnet on 17 October 2026 with getMultipleAccounts (base64). Account data changes
// with every trade, so these are a frozen snapshot, not a claim about today:
//   GLOBAL      the pump.fun Global account
//   CURVE_USDC  a USDC-quoted bonding curve, 20 % bought
//   CURVE_SOL   a SOL-quoted bonding curve, just opened
//   CURVE_DONE  a bonding curve that has migrated
//   POOL_SOL    the PumpSwap pool of that migrated coin
// GLOBAL: 4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf (1088 bytes, owner 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P)
const GLOBAL = bytesOf([
  'p+joschscn8B07uMqzQc4FKEV/LDgX0yeEQZY9zVX+1YuiTJmd2sAqpK',
  'wvjQ3Vy8l+MonBl8tQYqVPPZVrnOblEV+WVnqlyz5gAQ2EfjzwMAAKwj',
  '/AYAAAAAeMX7UdECAACAxqR+jQMAXwAAAAAAAAAf6nQ58860xO9Lucx7',
  '7kChpiYXG2hBX+3tQLeolW+E5wHB4eQAAAAAAAUAAAAAAAAAYIzMHfzp',
  'YbQ7d5wZFQWm4tO/RdWk20YYrXbILWF1RTVjg3MADqIssmTTSv9koEte',
  '+r+7dN3NBImXsZgVR9fREIOEdCkuZ1qUtDbssKmYiUIyioPdxiM4ApYS',
  'Z8XNYRfLjRgaDISfqTem80re0wge+VcAqssMm7PZCaS5FHUnpOutEeak',
  '/ClEpPqCUb74FUJuG/soxrZkZndgfGrZ9WamRteqj7Bg2CkbTE1HXa/3',
  'Yslr3A2s6zbAEurRLtOpSEFh4ATIfOuY+lzkf4A4Bv0seUXSlSSVmuwA',
  '3tl4FPOPeEYf6nQ58860xO9Lucx77kChpiYXG2hBX+3tQLeolW+E5wch',
  'XZlAeTaU4RYGbORZuBj9+bugx7QbeD+joSDKQZUyAaKLX9JqtHmmqcxs',
  'v2sLI+thiFo3HgEgrKkTvu89E4p46JMUH7GOnxV02BDheOGeMGBOMXWq',
  'Lkoy38hgByfRBwkBNYRTYlYJT5EoGRJ++k5Ea0MzcheT0Th2+arb89x9',
  'C19udQGCIPlCZ3ADI3tNa0U3WbSlxpC1nDXZuxh6CQy9KjOYep67E2eZ',
  'q1mSWxPl3Iswgd8AXbQnwUePpG/4w0egdOlUPz43otBGInrdy06cd0xE',
  'JYxD7fJKqKrh8AIUZlvaTDjNbbdDj1m0CLuew7TKnorR8fJGU8SZtXls',
  'INv5sy3dnuo/ObNyEVxxhHwYRc+lNsaFB04DDkTQId4++eNcTLeA8I7i',
  '/uhL7ERqV3gl2mjUOfqKXaOwxc/1D2P0VGsBQ55lEMA9ZfrZMeidBL4L',
  'tw1Rlx9RxBX7NEwH20GfISICI1UWqRcTTGdYjEk4IK4VXulmZVd6wbcY',
  '2kfdzyoFDuan4iBou4hkCqV/kJMIxh/vcRoBY/WnVcBwvIYNH2NnIHzs',
  '2lvMbLHq8PFtaEBFZrGNVtJIGssxcDJlbpBVHHhElkH4SVjcc6dqhdh1',
  'b1XALNrKiboZMnkMNoqxV+ktc8VLlrXJMZQeRupL4uDjESd0T8a3TPtF',
  'Xv6vi9VxeSztRPwfePlKM9CQnF5rX7AhVwrY262N6P2z0g7RzZnrjk6H',
  'cBV+6+tnimVduZs39rEybHZX25DPuKh6vvjHtvLIaYgTAAAAAAAAALnS',
  '/wAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQEsAQAA',
  'AAAAAPbjY/aFP8BoR4dSDPaZvZ0/rDjsLVijekDffE1+UZWPAQI=',
]);

// CURVE_USDC: 4vmnMovJBsuf7LfNZAU1ZAVA5VMZ78rLEQZ3tB3JQ41T (166 bytes, owner 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P)
const CURVE_USDC = bytesOf([
  'F7f4N2DYrGAYU92ilz8DAOp7NiwBAAAAGLvKVgZBAgDqwmMsAAAAAACA',
  'xqR+jQMAAMdwVzs2BzlqpGmwqXeGo4T2AuDRXvVWwb390xSnJMjHAADG',
  '+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAC50v8AAAAAAAAAAAAAAAAAAAAAAAAAAA==',
]);

// CURVE_SOL: 78FUixksLJYKYQfizXkZWLKURbmsFHGE4ztsBBhZJerz (166 bytes, owner 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P)
const CURVE_SOL = bytesOf([
  'F7f4N2DYrGBCZqye1skDAMEFSwcHAAAAQs6ZUkXLAgDBWScLAAAAAACA',
  'xqR+jQMAAEcl63S1cfrIlka2tlvJiciSY4Qz0Xx3cwfwbTdsyulaAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADf',
  'YA8AAAAAAJ2KBAAAAAAAAACsI/wGAAAAAAAAAAAAAAAAAAAAAAAAAA==',
]);

// CURVE_DONE: J95ZnvQBhszJAhPQCC5PNvFpdY25MHiTndUr3CKXYsJz (166 bytes, owner 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P)
const CURVE_DONE = bytesOf([
  'F7f4N2DYrGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA',
  'xqR+jQMAASih+KeMM4J86mF0HYqPoejTJ9xHFTwI2uz1me9lvTIcAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAACsI/wGAAAAAAAAAAAAAAAAAAAAAAAAAA==',
]);

// POOL_SOL: 4tdRCWr91wecmjg8Ed22qBhJMhtsm7D6ZVqy8rbSVZ1m (301 bytes, owner pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA)
const POOL_SOL = bytesOf([
  '8ZptBBGxbbz+AAAaJb85bb/z4iyFepdmKEuET7N9aYgm9kr442ul/S6C',
  'TueNriOeyV+kDMnyDsYD08lF+3CDtW6gM1JiCPVYo3bvBpuIV/6rgYT7',
  'aH9jRhjANdrEOdwa6ztVmKDwAAAAAAEya8xOIuoMVrGnE3n2wCzkh9HD',
  'QJ7Zs+kt1DOPDA8jz10kN0Zeuf3MdIOmXBEaYKK6c8F0Y2+4eUGvlPHh',
  'qFzSso/MpjM/1dcl4cDOoANKBVM+VwCQRktis6grZM0PsnrsQmtZ0AMA',
  'ACih+KeMM4J86mF0HYqPoejTJ9xHFTwI2uz1me9lvTIcAADYscYUBAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAXwFQAAAAAA659BAwAAAAAAAAAAAAAA',
  'AAAAAAAAAA==',
]);

