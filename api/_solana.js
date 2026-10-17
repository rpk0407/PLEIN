// Read-only Solana helpers: base58, program-derived addresses, associated token accounts and a
// small JSON-RPC client. Nothing in here builds a transaction or holds a key; it only looks.
// Files starting with _ are not endpoints.
import { createHash } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((ch, i) => [ch, i]));

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

// ---------------------------------------------------------------- base58

/** Bytes → base58 text. */
export function b58encode(bytes) {
  const input = Uint8Array.from(bytes);
  const digits = [];
  for (const byte of input) {
    let carry = byte;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let k = 0; k < input.length && input[k] === 0; k += 1) out += '1';
  for (let q = digits.length - 1; q >= 0; q -= 1) out += ALPHABET[digits[q]];
  return out;
}

/** Base58 text → bytes; throws on a character outside the alphabet. */
export function b58decode(text) {
  const bytes = [];
  for (const ch of String(text)) {
    let carry = INDEX.get(ch);
    if (carry === undefined) throw new Error(`not base58: ${JSON.stringify(ch)}`);
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; k < text.length && text[k] === '1'; k += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

/** An address as 32 bytes; throws if it is not one. */
export function addressBytes(address) {
  const bytes = b58decode(address);
  if (bytes.length !== 32) throw new Error(`not a 32-byte address: ${address}`);
  return bytes;
}

// ---------------------------------------------------------------- ed25519 curve check

const P = (1n << 255n) - 19n;
const D = ((((-121665n * modPow(121666n, P - 2n, P)) % P) + P) % P); // −121665 / 121666 mod p

function modPow(base, exponent, modulus) {
  let result = 1n;
  let b = ((base % modulus) + modulus) % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/**
 * True when 32 bytes decode to a point on the ed25519 curve (such an address could have a
 * signing key, so it can never be a program-derived address). Same test the runtime applies:
 * read y (the top bit is only the sign of x, ignored here), then x² = (y² − 1) / (d·y² + 1)
 * must have a square root in the field. Verified in test/chain.test.mjs against known vectors.
 */
export function isOnCurve(bytes) {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let i = 31; i >= 0; i -= 1) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  y %= P;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  if (v === 0n) return u === 0n;
  // u/v is a square exactly when u·v is (v² is always one); Euler's criterion
  const uv = (u * v) % P;
  if (uv === 0n) return true; // x = 0
  return modPow(uv, (P - 1n) / 2n, P) === 1n;
}

// ---------------------------------------------------------------- derived addresses

const enc = new TextEncoder();
const seedBytes = (item) => (typeof item === 'string' ? enc.encode(item) : new Uint8Array(item));

/** Little-endian u16 seed, as the programs use for indexes. */
export const u16Seed = (n) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff);

/**
 * Program-derived address: the first bump from 255 down for which
 * sha256(seeds, bump, program id, "ProgramDerivedAddress") is off the curve.
 * A seed is a string (UTF-8), a byte array, or the base58 address wrapped as { address }.
 */
export function findProgramAddress(seeds, programId) {
  const program = addressBytes(programId);
  const parts = seeds.map((s) => (s && typeof s === 'object' && 'address' in s ? addressBytes(s.address) : seedBytes(s)));
  for (const part of parts) if (part.length > 32) throw new Error('seed longer than 32 bytes');
  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = createHash('sha256');
    for (const part of parts) hash.update(part);
    hash.update(Uint8Array.of(bump));
    hash.update(program);
    hash.update(enc.encode('ProgramDerivedAddress'));
    const candidate = new Uint8Array(hash.digest());
    if (!isOnCurve(candidate)) return { address: b58encode(candidate), bump };
  }
  throw new Error('no bump found');
}

/** Associated token account of an owner (a wallet or a PDA) for a mint. */
export function associatedTokenAddress(owner, mint, tokenProgram = TOKEN_PROGRAM) {
  return findProgramAddress(
    [{ address: owner }, { address: tokenProgram }, { address: mint }],
    ASSOCIATED_TOKEN_PROGRAM,
  ).address;
}

// ---------------------------------------------------------------- amounts

/** Raw integer amount → number in UI units: the exact decimal text is parsed once, so no float noise. */
export function toUi(raw, decimals) {
  const value = BigInt(raw);
  if (decimals === 0) return Number(value);
  const scale = 10n ** BigInt(decimals);
  return Number(`${value / scale}.${String(value % scale).padStart(decimals, '0')}`);
}

// ---------------------------------------------------------------- JSON-RPC

export class RpcError extends Error {
  constructor(message, { code = null, status = null, retryAfterMs = null, methodOff = false } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.methodOff = methodOff; // the node answers 429 to this method every time, waiting is pointless
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const BAD_RPC_URL = 'SOLANA_RPC_URL is not a valid https URL';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The node's URL as a URL object, or an RpcError with a fixed message. Paid nodes carry the key in
 * the query or the path, and what throws here ends up in public JSON and in the founders' chat, so
 * the bad value itself is never quoted (a copy without "https://" is the usual mistake). http is
 * accepted only for a node on this machine (a local validator).
 */
export function parseRpcUrl(url) {
  let target;
  try { target = new URL(String(url)); } catch { throw new RpcError(BAD_RPC_URL); }
  const local = target.protocol === 'http:' && LOOPBACK.has(target.hostname);
  if (target.protocol !== 'https:' && !local) throw new RpcError(BAD_RPC_URL);
  return target;
}

/** Text with the node's URL, and the parts of it that may be a key, replaced by <rpc>. */
export function scrubRpcUrl(text, url) {
  let out = String(text);
  let target;
  try { target = new URL(String(url)); } catch { /* the raw text is still removed below */ }
  const secrets = [String(url)];
  if (target) {
    secrets.push(target.href, target.username, target.password);
    if (target.pathname.length > 1) secrets.push(target.pathname);
    if (target.search.length > 1) secrets.push(target.search);
    for (const value of target.searchParams.values()) secrets.push(value);
  }
  // the longest first, so that a whole URL goes before the pieces of it
  for (const secret of [...new Set(secrets)].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join('<rpc>');
  }
  return out;
}

/**
 * One JSON-RPC call with an 8 s timeout and, by default, one retry on 429, 5xx or a network
 * failure (`retries` raises it for long scripts).
 * Returns the `result`; throws RpcError otherwise. No error message carries the node's URL.
 */
export async function rpc(url, method, params = [], opts = {}) {
  parseRpcUrl(url); // a bad URL fails here, once, with a fixed message
  try {
    return await rpcAttempts(url, method, params, opts);
  } catch (error) {
    if (error instanceof RpcError) error.message = scrubRpcUrl(error.message, url);
    throw error;
  }
}

async function rpcAttempts(url, method, params, { timeoutMs = 8000, retries = 1 }) {
  for (let attempt = 0; ; attempt += 1) {
    let status = null;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      if (response.status === 429 || response.status >= 500) {
        const seconds = Number(response.headers.get('retry-after'));
        // the public node sends "x-ratelimit-method-limit: 0" for methods it does not serve on the
        // free tier (getTokenLargestAccounts, seen 17 October 2026): no retry, the caller falls back
        const methodOff = response.status === 429 && response.headers.get('x-ratelimit-method-limit') === '0';
        throw new RpcError(methodOff ? 'method not served by this node' : response.status === 429 ? 'rate limited' : `rpc http ${response.status}`, {
          status, methodOff, retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : null,
        });
      }
      if (!response.ok) throw new RpcError(`rpc http ${response.status}`, { status });
      const body = await response.json();
      if (body.error) throw new RpcError(String(body.error.message || 'rpc error'), { code: body.error.code ?? null, status });
      return body.result;
    } catch (error) {
      const retryable = error instanceof RpcError
        ? !error.methodOff && (error.status === 429 || error.status >= 500)
        : true; // timeout or network failure
      if (!retryable || attempt >= retries) {
        if (error instanceof RpcError) throw error;
        throw new RpcError(error?.name === 'TimeoutError' ? 'rpc timeout' : `rpc unreachable: ${error?.message || error}`, { status });
      }
      // wait for what the node asks, else back off 0.4 s, 0.8 s, 1.6 s … up to 5 s
      await sleep(error?.retryAfterMs ?? Math.min(5000, 400 * 2 ** attempt));
    }
  }
}

/** Decoded account: { lamports, owner, data (bytes), executable } or null when it does not exist. */
function decodeAccount(value) {
  if (!value) return null;
  const [b64] = value.data;
  return {
    lamports: BigInt(value.lamports),
    owner: value.owner,
    data: new Uint8Array(Buffer.from(b64, 'base64')),
    executable: Boolean(value.executable),
  };
}

/**
 * Accounts for many addresses in as few calls as possible (the node allows 100 per call).
 * Same order as `addresses`; null for an account that does not exist.
 */
export async function getMultipleAccounts(url, addresses, opts = {}) {
  const out = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100);
    const result = await rpc(url, 'getMultipleAccounts', [chunk, { encoding: 'base64', commitment: 'confirmed' }], opts);
    if (!result || !Array.isArray(result.value) || result.value.length !== chunk.length) {
      throw new RpcError('getMultipleAccounts: unexpected answer');
    }
    out.push(...result.value.map(decodeAccount));
  }
  return out;
}

/** Rent-exempt minimum in lamports for an account with `dataLength` bytes, as the node reports it. */
export async function getMinimumBalance(url, dataLength, opts = {}) {
  return BigInt(await rpc(url, 'getMinimumBalanceForRentExemption', [dataLength], opts));
}

/** One account or null. */
export async function getAccount(url, address, opts = {}) {
  return (await getMultipleAccounts(url, [address], opts))[0];
}

// ---------------------------------------------------------------- SPL token layouts

const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const readU64 = (bytes, at) => view(bytes).getBigUint64(at, true);
const readKey = (bytes, at) => b58encode(bytes.subarray(at, at + 32));

/**
 * SPL Token / Token-2022 mint: the first 82 bytes have the same layout in both programs
 * (Token-2022 appends extensions after them).
 */
export function parseMint(bytes) {
  if (bytes.length < 82) throw new Error('mint account too short');
  const v = view(bytes);
  const hasMintAuthority = v.getUint32(0, true) === 1;
  const hasFreezeAuthority = v.getUint32(46, true) === 1;
  return {
    mintAuthority: hasMintAuthority ? readKey(bytes, 4) : null,
    supply: readU64(bytes, 36),
    decimals: bytes[44],
    initialized: bytes[45] === 1,
    freezeAuthority: hasFreezeAuthority ? readKey(bytes, 50) : null,
  };
}

// Token-2022 mint extensions: names by type number, from the program's ExtensionType list.
// Tier 2: only 18 and 19 were seen on live pump.fun mints (17 October 2026, five mints); the other
// numbers are as recalled from spl-token-2022 and are used only to warn, never to reassure.
export const MINT_EXTENSION_NAMES = {
  1: 'TransferFeeConfig', 3: 'MintCloseAuthority', 4: 'ConfidentialTransferMint', 6: 'DefaultAccountState',
  9: 'NonTransferable', 10: 'InterestBearingConfig', 12: 'PermanentDelegate', 14: 'TransferHook',
  16: 'ConfidentialTransferFeeConfig', 18: 'MetadataPointer', 19: 'TokenMetadata', 20: 'GroupPointer',
  21: 'TokenGroup', 22: 'GroupMemberPointer', 23: 'TokenGroupMember', 24: 'ConfidentialMintBurn',
  25: 'ScaledUiAmountConfig', 26: 'PausableConfig',
};
/** Extensions that let someone take, freeze, tax or reprice tokens even when both authorities are revoked. */
export const RISKY_MINT_EXTENSIONS = new Set([1, 3, 4, 6, 9, 10, 12, 14, 16, 24, 25, 26]);

/**
 * Extensions of a Token-2022 mint, as [{ type, name, risky, length }]. A classic mint (82 bytes)
 * has none. After the 82-byte mint come padding up to 165, one account-type byte (1 = mint), then
 * entries of type (u16), length (u16) and data. Unknown types keep a name like "extension 7".
 */
export function parseMintExtensions(bytes) {
  if (bytes.length <= 166 || bytes[165] !== 1) return [];
  const v = view(bytes);
  const out = [];
  for (let at = 166; at + 4 <= bytes.length;) {
    const type = v.getUint16(at, true);
    const length = v.getUint16(at + 2, true);
    if (type === 0 || at + 4 + length > bytes.length) break; // padding or a truncated entry
    out.push({ type, name: MINT_EXTENSION_NAMES[type] || `extension ${type}`, risky: RISKY_MINT_EXTENSIONS.has(type) || !(type in MINT_EXTENSION_NAMES), length }); // unknown = to be looked at
    at += 4 + length;
  }
  return out;
}

/** SPL token account: mint, owner, raw amount. */
export function parseTokenAccount(bytes) {
  if (bytes.length < 72) throw new Error('token account too short');
  return { mint: readKey(bytes, 0), owner: readKey(bytes, 32), amount: readU64(bytes, 64) };
}

// ---------------------------------------------------------------- transactions (read-only)

/** Signatures that touched an address, newest first, as { signature, slot, err, blockTime }. */
export async function getSignatures(url, address, { before, limit = 1000 } = {}, opts = {}) {
  const options = { limit, commitment: 'confirmed' };
  if (before) options.before = before;
  return rpc(url, 'getSignaturesForAddress', [address, options], opts);
}

// A node refuses a transaction whose version is above the one declared (a version-1 transaction
// made it answer with an error on 17 October 2026, when this said 0). The field is a ceiling, and
// the node accepts any higher number, so say the highest a byte can hold.
const TX_VERSION_CEILING = 255;

/** One confirmed transaction with parsed instructions and balance metadata; null if unknown. */
export async function getTransaction(url, signature, opts = {}) {
  return rpc(url, 'getTransaction', [signature, {
    encoding: 'jsonParsed', maxSupportedTransactionVersion: TX_VERSION_CEILING, commitment: 'confirmed',
  }], opts);
}

/**
 * Token balance change per (owner, mint) in one transaction, from its pre/post token balances.
 * An account missing before counts as 0 before, one missing after as 0 after.
 * Returns [{ owner, mint, delta (BigInt raw), decimals, account (token account address) }].
 */
export function tokenDeltas(tx) {
  const keys = (tx?.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const meta = tx?.meta;
  if (!meta) return [];
  const byAccount = new Map();
  const note = (entry, side) => {
    const slot = byAccount.get(entry.accountIndex) || { pre: 0n, post: 0n };
    slot[side] = BigInt(entry.uiTokenAmount.amount);
    slot.owner = entry.owner ?? slot.owner ?? null;
    slot.mint = entry.mint;
    slot.decimals = entry.uiTokenAmount.decimals;
    byAccount.set(entry.accountIndex, slot);
  };
  for (const entry of meta.preTokenBalances || []) note(entry, 'pre');
  for (const entry of meta.postTokenBalances || []) note(entry, 'post');
  return [...byAccount.entries()].map(([index, s]) => ({
    owner: s.owner, mint: s.mint, decimals: s.decimals, delta: s.post - s.pre, account: keys[index] ?? null,
  }));
}

/** Lamport change of one account in a transaction (fees included), or null if it is not in it. */
export function lamportDelta(tx, address) {
  const keys = (tx?.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const index = keys.indexOf(address);
  if (index < 0 || !tx.meta) return null;
  return BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index]);
}
