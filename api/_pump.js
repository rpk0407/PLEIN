// pump.fun on Solana: program ids, derived addresses and account layouts, read-only.
// Source: pump.fun's public IDLs (github.com/pump-fun/pump-public-docs, idl/pump.json and
// idl/pump_amm.json), read on 17 October 2026. Checked the same day against live mainnet:
//   - the Global account (1 088 bytes, owned by the pump program) decodes field by field, and the
//     PDAs ["global"], ["mint-authority"] and ["__event_authority"] match the addresses recalled;
//   - seven bonding curves (166 bytes each) decode, among them one quoted in USDC (quoteMint =
//     the USDC mint); 5 349 curves carry that mint at the offset used here;
//   - for that USDC curve, the creator vault ["creator-vault", creator] and its USDC token account
//     exist; the node's own listing (getTokenAccountsByOwner) returned the same token account;
//   - for a SOL-quoted and a USDC-quoted PumpSwap pool, the canonical pool address (index 0)
//     exists, and the coin creator's vault ["creator_vault", coin creator] holds the quote asset;
//   - for a coin whose fee sharing was set up, the config ["sharing-config", mint] derived under the
//     FEE program (pump_fees, pfeeUx…) exists, is owned by it and is the coin curve's creator; the
//     same seeds under the pump program give an address that does not exist.
// Account layouts can grow at the end: a decoder stops where the data stops and leaves later fields
// null, so an older account never throws.
// Fees do not go straight into the creator vault. A trade adds the creator's cut to
// BondingCurve.creator_fee (and, after migration, to Pool.creator_fees) and leaves the money in the
// curve's or the pool's own quote account; `sweep_creator_fee` (anyone can send it) moves it into
// the creator vault, and only then can `collect_creator_fee_v2` (or the pool's collect) pay it out.
// The IDL says so in its error `CreatorFeesNotSwept`. So "what the creator is owed" is the vault
// plus those two fields. Seen on 17 October 2026: of 5 413 USDC curves, six had creator_fee > 0, and
// on four the curve's USDC account equalled real quote reserves + creator_fee + protocol_fees to the
// raw unit.
// The creator of a curve is an ARGUMENT of create / create_v2 (only `user` and the mint sign), so a
// curve's `creator` field proves nothing about who ordered the creation: read the creation
// transaction's signers too (readCreation below). Read on a live mainnet coin on 17 October 2026:
// its oldest successful transaction on the curve holds a raw (unparsed) create_v2 instruction of the
// pump program, signed by one wallet and by the mint; the two discriminators are the first 8 bytes
// of sha256("global:create") and sha256("global:create_v2"), checked in test/chain.test.mjs.
// Tier 2: what the creator vaults hold is read, but "claimable in full" comes from the IDL's
// collect and sweep instructions and has not been exercised (nothing here ever signs); nothing has
// been read on a live $PLEIN yet.
import {
  ASSOCIATED_TOKEN_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAM, b58decode, b58encode, findProgramAddress, u16Seed,
} from './_solana.js';

/** part / whole in percent, one decimal, half rounded up (integer arithmetic on raw amounts). */
export function pct1(part, whole) {
  if (whole <= 0n) return null;
  return Number((part * 2000n + whole) / (whole * 2n)) / 10;
}

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'; // PumpSwap, after migration
export const FEE_PROGRAM = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';

/** The coin's supply at creation: 1 000 000 000 tokens, 6 decimals. */
export const INITIAL_SUPPLY_UI = 1_000_000_000;

// ---------------------------------------------------------------- derived addresses

const pda = (seeds, program = PUMP_PROGRAM) => findProgramAddress(seeds, program).address;

export const globalAddress = () => pda(['global']);
export const mintAuthorityAddress = () => pda(['mint-authority']);
export const eventAuthorityAddress = () => pda(['__event_authority']);
export const bondingCurveAddress = (mint) => pda(['bonding-curve', { address: mint }]);
// keyed by the creator wallet, not by the coin: one vault for everything that wallet created
export const creatorVaultAddress = (creator) => pda(['creator-vault', { address: creator }]);
/**
 * The fee-sharing config of a coin. It lives under the FEE program (pump_fees), not under the pump
 * program: the same seeds under the pump program give an address that never exists, so a "no
 * account" read there would prove nothing (that bug was found on 17 October 2026 and fixed here;
 * mcp/tools.mjs used to carry its own copy). Vector read on mainnet the same day: the coin
 * 5jWgS74ATYgdpwbNwkSGSqHft85jG8MCr9VwGoJspump has its config at
 * JEGP5AsEcJur2aNbKUrSEF7jyd46Mshc3gPcurrDcSYV (pinned in test/chain.test.mjs).
 * Tier 2: that no account at this address means no fee sharing.
 */
export const sharingConfigAddress = (mint) => pda(['sharing-config', { address: mint }], FEE_PROGRAM);
export const poolAuthorityAddress = (mint) => pda(['pool-authority', { address: mint }]);
/** The pool pump.fun opens at migration: index 0, owned by the coin's pool authority. */
export const canonicalPoolAddress = (mint, quoteMint) => pda(
  ['pool', u16Seed(0), { address: poolAuthorityAddress(mint) }, { address: mint }, { address: quoteMint }],
  PUMP_AMM_PROGRAM,
);

/** PumpSwap: authority of a coin creator's fee vault (note the underscore, unlike the pump program). */
export const ammCreatorVaultAuthority = (coinCreator) => pda(['creator_vault', { address: coinCreator }], PUMP_AMM_PROGRAM);

// ---------------------------------------------------------------- decoding

// Exported with the two specs below so that a test can build a fixture at run time instead of
// pasting captured account bytes.
export const DISCRIMINATOR = {
  bondingCurve: [23, 183, 248, 55, 96, 216, 172, 96],
  global: [167, 232, 232, 177, 200, 108, 114, 127],
  pool: [241, 154, 109, 4, 17, 177, 109, 188],
};

const SIZES = { u8: 1, bool: 1, u16: 2, u64: 8, i128: 16, pubkey: 32 };
const fixedSize = (type) => (Array.isArray(type) ? SIZES[type[0]] * type[1] : SIZES[type]);

function readOne(view, bytes, at, type) {
  switch (type) {
    case 'u8': return bytes[at];
    case 'bool': return bytes[at] !== 0;
    case 'u16': return view.getUint16(at, true);
    case 'u64': return view.getBigUint64(at, true);
    case 'i128': return (view.getBigInt64(at + 8, true) << 64n) | view.getBigUint64(at, true);
    case 'pubkey': return b58encode(bytes.subarray(at, at + 32));
    default: throw new Error(`unknown type ${type}`);
  }
}

/** Reads fixed-size Borsh fields in order after the 8-byte discriminator; missing tail → null. */
function decodeFields(bytes, spec) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let at = 8;
  for (const [name, type] of spec) {
    const size = fixedSize(type);
    if (at + size > bytes.length) {
      out[name] = null;
    } else if (Array.isArray(type)) {
      out[name] = Array.from({ length: type[1] }, (_, i) => readOne(view, bytes, at + i * SIZES[type[0]], type[0]));
    } else {
      out[name] = readOne(view, bytes, at, type);
    }
    at += size;
  }
  return out;
}

function expectDiscriminator(bytes, expected, label) {
  if (bytes.length < 8 || expected.some((b, i) => bytes[i] !== b)) throw new Error(`not a ${label} account`);
}

export const CURVE_SPEC = [
  ['virtualTokenReserves', 'u64'], ['virtualQuoteReserves', 'u64'],
  ['realTokenReserves', 'u64'], ['realQuoteReserves', 'u64'], ['tokenTotalSupply', 'u64'],
  ['complete', 'bool'], ['creator', 'pubkey'], ['isMayhemMode', 'bool'], ['isCashbackCoin', 'bool'],
  ['quoteMint', 'pubkey'], ['creatorFeeBps', 'u64'], ['canEditCreatorFee', 'bool'],
  ['isHolderReward', 'bool'], ['creatorFee', 'u64'], ['protocolFees', 'u64'], ['depth', 'u8'],
  ['initialVirtualQuoteReserves', 'u64'], ['postCompleteBaseOut', 'u64'], ['postCompleteQuoteIn', 'u64'],
];

/** BondingCurve account (raw amounts as BigInt; 166 bytes today, shorter on older coins). */
export function parseBondingCurve(bytes) {
  expectDiscriminator(bytes, DISCRIMINATOR.bondingCurve, 'bonding curve');
  const curve = decodeFields(bytes, CURVE_SPEC);
  if (curve.complete === null || curve.creator === null) throw new Error('bonding curve account too short');
  return curve;
}

export const GLOBAL_SPEC = [
  ['initialized', 'bool'], ['authority', 'pubkey'], ['feeRecipient', 'pubkey'],
  ['initialVirtualTokenReserves', 'u64'], ['initialVirtualSolReserves', 'u64'],
  ['initialRealTokenReserves', 'u64'], ['tokenTotalSupply', 'u64'], ['feeBasisPoints', 'u64'],
  ['withdrawAuthority', 'pubkey'], ['enableMigrate', 'bool'], ['poolMigrationFee', 'u64'],
  ['creatorFeeBasisPoints', 'u64'], ['feeRecipients', ['pubkey', 7]],
  ['setCreatorAuthority', 'pubkey'], ['adminSetCreatorAuthority', 'pubkey'], ['createV2Enabled', 'bool'],
  ['whitelistPda', 'pubkey'], ['reservedFeeRecipient', 'pubkey'], ['mayhemModeEnabled', 'bool'],
  ['reservedFeeRecipients', ['pubkey', 7]], ['isCashbackEnabled', 'bool'],
  ['buybackFeeRecipients', ['pubkey', 8]], ['buybackBasisPoints', 'u64'],
  ['initialVirtualQuoteReserves', 'u64'], ['whitelistedQuoteMints', ['pubkey', 1]],
  ['creatorFeeConfigurable', 'bool'], ['maxConfigurableCreatorFeeBps', 'u64'],
  ['holderRewardClaimAuthority', 'pubkey'], ['isHolderRewardEnabled', 'bool'], ['maxCurveDepth', 'u8'],
];

/** Global account: the launch parameters every curve starts from. */
export function parseGlobal(bytes) {
  expectDiscriminator(bytes, DISCRIMINATOR.global, 'global');
  return decodeFields(bytes, GLOBAL_SPEC);
}

// PumpSwap pool (idl/pump_amm.json, 17 October 2026). A pool captured the same day (301 bytes) decodes
// to the byte: the layout ends at 287, the 14 bytes after it are zero padding. `creatorFees` is
// the coin creator's cut not yet swept into the creator vault; a pool created before the field existed
// ends earlier and gives null, which the reader counts as nothing waiting.
const POOL_SPEC = [
  ['poolBump', 'u8'], ['index', 'u16'], ['creator', 'pubkey'], ['baseMint', 'pubkey'], ['quoteMint', 'pubkey'],
  ['lpMint', 'pubkey'], ['poolBaseTokenAccount', 'pubkey'], ['poolQuoteTokenAccount', 'pubkey'],
  ['lpSupply', 'u64'], ['coinCreator', 'pubkey'], ['isMayhemMode', 'bool'], ['isCashbackCoin', 'bool'],
  ['virtualQuoteReserves', 'i128'], ['creatorFeeBps', 'u64'], ['canEditCreatorFee', 'bool'],
  ['isHolderReward', 'bool'], ['protocolFees', 'u64'], ['creatorFees', 'u64'],
];

/** PumpSwap pool account: mints, token accounts, the coin creator whose vault collects the fees, and the unswept creator fees. */
export function parsePool(bytes) {
  expectDiscriminator(bytes, DISCRIMINATOR.pool, 'PumpSwap pool');
  const pool = decodeFields(bytes, POOL_SPEC);
  if (pool.coinCreator === null) throw new Error('PumpSwap pool account too short');
  return pool;
}

// ---------------------------------------------------------------- reading a curve

/**
 * Share of the curve's sellable tokens already bought, in percent with one decimal:
 * 100 × (initial real reserves − real reserves left) / initial real reserves, rounded half up. The initial figure
 * comes from the Global account (793 100 000 tokens today), never hard-coded. Independent of the
 * quote asset: it counts tokens only. A completed curve is 100.
 */
export function curveProgressPct(curve, initialRealTokenReserves) {
  if (curve.complete) return 100;
  const initial = initialRealTokenReserves;
  if (!initial || initial <= 0n) return null;
  const left = curve.realTokenReserves > initial ? initial : curve.realTokenReserves;
  return pct1(initial - left, initial);
}

/**
 * Which asset a curve is quoted in. The `quoteMint` field is all zeros on a SOL curve (the
 * IDL says "none = SOL"); anything else is the quote token's mint (USDC on a USDC curve).
 * Tier 2: no USDC-quoted curve has been read live yet.
 */
export function curveQuote(curve) {
  if (curve.quoteMint === null || curve.quoteMint === SYSTEM_PROGRAM) return { kind: 'SOL', mint: null };
  return { kind: 'token', mint: curve.quoteMint };
}

/**
 * Fees waiting in a creator vault, in raw units of the quote asset. Only the vault: whatever the
 * curve (`creatorFee`) or the pool (`creatorFees`) still holds is added by the caller, because
 * it needs a sweep before it can be collected.
 * SOL: the vault's lamports above `rentFloor` (what the node reports for a data-less account,
 * 650 240 lamports on 17 October 2026; read it with getMinimumBalance, never hard-code it).
 * Token quote: the balance of the vault's token account for the quote mint (derive that account
 * with associatedTokenAddress(vault, quoteMint)); a missing account holds nothing.
 * Tier 2: see the header; the vault PDA and the token account are confirmed, a full claim is not.
 */
export function creatorVaultUnclaimed(quote, { vaultAccount, vaultTokenAccount, rentFloor }) {
  if (quote.kind === 'SOL') {
    if (!vaultAccount) return 0n;
    if (typeof rentFloor !== 'bigint') throw new Error('rentFloor is needed to read a SOL vault');
    return vaultAccount.lamports > rentFloor ? vaultAccount.lamports - rentFloor : 0n;
  }
  if (!vaultTokenAccount) return 0n;
  return new DataView(vaultTokenAccount.data.buffer, vaultTokenAccount.data.byteOffset).getBigUint64(64, true);
}

// ---------------------------------------------------------------- fee sharing, token metadata, creation

/** First 8 bytes of a pump_fees SharingConfig account: sha256("account:SharingConfig"). */
export const SHARING_CONFIG_DISCRIMINATOR = [216, 74, 9, 0, 56, 140, 93, 75];

/** True when the bytes start like a SharingConfig account (the owner is checked by the caller). */
export const looksLikeSharingConfig = (bytes) => bytes.length >= 8 && SHARING_CONFIG_DISCRIMINATOR.every((b, i) => bytes[i] === b);

/**
 * pump_fees SharingConfig account (idl/pump_fees.json, read 17 October 2026; decoded to the byte on
 * a live mainnet account the same day): discriminator, bump u8, version u8, status u8 (0 paused, 1
 * active), mint, admin, admin_revoked bool, then a vector of { address, share_bps u16 }. Throws on
 * anything that does not fit. Anyone can send lamports to the address of a config, which makes an
 * account there owned by the system program with no data: the caller must check the owner
 * (FEE_PROGRAM) as well as the discriminator before it calls anything a sharing config.
 * Tier 2: the layout can grow.
 */
export function parseSharingConfig(bytes) {
  if (bytes.length < 80 || !looksLikeSharingConfig(bytes)) throw new Error('not a fee-sharing config account');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint32(76, true);
  if (count > 64 || 80 + count * 34 > bytes.length) throw new Error('fee-sharing config: the list of shareholders does not fit the account');
  const shareholders = [];
  for (let i = 0; i < count; i += 1) {
    const at = 80 + i * 34;
    shareholders.push({ address: b58encode(bytes.subarray(at, at + 32)), shareBps: v.getUint16(at + 32, true) });
  }
  return {
    bump: bytes[8],
    version: bytes[9],
    status: bytes[10] === 1 ? 'active' : bytes[10] === 0 ? 'paused' : `unknown (${bytes[10]})`,
    mint: b58encode(bytes.subarray(11, 43)),
    admin: b58encode(bytes.subarray(43, 75)),
    adminRevoked: bytes[75] !== 0,
    shareholders,
  };
}

const TOKEN_METADATA_EXTENSION = 19;

/**
 * The Token-2022 TokenMetadata extension of a pump.fun mint: update authority (null when none),
 * the mint it names, and the name, symbol and uri. These are what a clone copies and what stays
 * on the coin. Returns null when the mint carries no such extension (a classic mint, or a Token-2022
 * mint without it). Throws when the extension is there and cannot be decoded. Tier 2: the layout is
 * Token-2022's TokenMetadata (update authority, mint, three length-prefixed strings, extra pairs);
 * it was decoded on a live pump.fun mint on 17 October 2026.
 */
export function parseTokenMetadata(bytes) {
  if (bytes.length <= 166 || bytes[165] !== 1) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 166; at + 4 <= bytes.length;) {
    const type = v.getUint16(at, true);
    const length = v.getUint16(at + 2, true);
    if (type === 0) break;
    if (at + 4 + length > bytes.length) {
      if (type === TOKEN_METADATA_EXTENSION) throw new Error('TokenMetadata: the entry is cut short');
      break;
    }
    if (type === TOKEN_METADATA_EXTENSION) {
      const body = bytes.subarray(at + 4, at + 4 + length);
      if (body.length < 64) throw new Error('TokenMetadata: shorter than its fixed part');
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let cursor = 64;
      const text = (label) => {
        if (cursor + 4 > body.length) throw new Error(`TokenMetadata: ${label} is cut short`);
        const size = view.getUint32(cursor, true);
        if (cursor + 4 + size > body.length) throw new Error(`TokenMetadata: ${label} is cut short`);
        const value = decoder.decode(body.subarray(cursor + 4, cursor + 4 + size));
        cursor += 4 + size;
        return value;
      };
      const none = body.subarray(0, 32).every((b) => b === 0);
      return {
        updateAuthority: none ? null : b58encode(body.subarray(0, 32)),
        mint: b58encode(body.subarray(32, 64)),
        name: text('name'),
        symbol: text('symbol'),
        uri: text('uri'),
      };
    }
    at += 4 + length;
  }
  return null;
}

/** Anchor discriminators of the two creation instructions: sha256("global:create") and ("global:create_v2"), first 8 bytes. */
export const CREATE_DISCRIMINATORS = {
  create: [24, 30, 200, 40, 5, 28, 7, 119],
  create_v2: [214, 144, 76, 236, 95, 139, 49, 180],
};

/**
 * Whether a parsed transaction (getTransaction, jsonParsed) creates a coin on the pump program, and
 * who signed it. Pure. Looks for a raw instruction of the pump program, at the top level or inside
 * another instruction, whose data starts with one of the two creation discriminators. Returns
 * { instruction, signers, signersKnown, feePayer, feePayerSigned }, or null when the transaction
 * failed or holds no such instruction. `signers` are the account keys flagged as signers, which is
 * all the node says; with the older string-only key list nobody is known to have signed, and
 * `signersKnown` is false. The mint signs its own creation, so it is among the signers.
 * Tier 2: the instruction discriminators were read on a live mainnet creation transaction on
 * 17 October 2026 and match the IDL's names; pump.fun may add a third creation instruction.
 */
export function readCreation(tx) {
  const message = tx?.transaction?.message;
  if (!message || !tx.meta || tx.meta.err) return null;
  const inner = (tx.meta.innerInstructions || []).flatMap((i) => i?.instructions || []);
  let found = null;
  for (const ix of [...(message.instructions || []), ...inner]) {
    if (ix?.programId !== PUMP_PROGRAM || typeof ix.data !== 'string' || ix.data.length > 4000) continue;
    let head;
    try {
      head = b58decode(ix.data).subarray(0, 8);
    } catch {
      continue;
    }
    for (const [name, discriminator] of Object.entries(CREATE_DISCRIMINATORS)) {
      if (head.length >= 8 && discriminator.every((b, i) => head[i] === b)) found = found ?? name;
    }
  }
  if (!found) return null;
  const keys = message.accountKeys || [];
  const objects = keys.length > 0 && keys.every((k) => k && typeof k === 'object');
  const signers = objects ? keys.filter((k) => k.signer === true).map((k) => k.pubkey) : [];
  return {
    instruction: found,
    signers,
    signersKnown: objects && signers.length > 0,
    feePayer: objects ? keys[0].pubkey : (typeof keys[0] === 'string' ? keys[0] : null),
    feePayerSigned: objects && keys[0].signer === true,
  };
}

/** Label for a program that owns a token account's owner, to explain why it is not a wallet. */
export function programLabel(owner) {
  if (owner === PUMP_PROGRAM) return 'bonding curve';
  if (owner === PUMP_AMM_PROGRAM) return 'PumpSwap pool';
  if (owner === TOKEN_PROGRAM || owner === ASSOCIATED_TOKEN_PROGRAM) return 'token program';
  return 'program';
}
