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
//     exists, and the coin creator's vault ["creator_vault", coin creator] holds the quote asset.
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
// Tier 2: what the creator vaults hold is read, but "claimable in full" comes from the IDL's
// collect and sweep instructions and has not been exercised (nothing here ever signs); nothing has
// been read on a live $PLEIN yet.
import {
  ASSOCIATED_TOKEN_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAM, b58encode, findProgramAddress, u16Seed,
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
export const sharingConfigAddress = (mint) => pda(['sharing-config', { address: mint }]);
export const poolAuthorityAddress = (mint) => pda(['pool-authority', { address: mint }]);
/** The pool pump.fun opens at migration: index 0, owned by the coin's pool authority. */
export const canonicalPoolAddress = (mint, quoteMint) => pda(
  ['pool', u16Seed(0), { address: poolAuthorityAddress(mint) }, { address: mint }, { address: quoteMint }],
  PUMP_AMM_PROGRAM,
);

/** PumpSwap: authority of a coin creator's fee vault (note the underscore, unlike the pump program). */
export const ammCreatorVaultAuthority = (coinCreator) => pda(['creator_vault', { address: coinCreator }], PUMP_AMM_PROGRAM);

// ---------------------------------------------------------------- decoding

const DISCRIMINATOR = {
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

const CURVE_SPEC = [
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

const GLOBAL_SPEC = [
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

/** Label for a program that owns a token account's owner, to explain why it is not a wallet. */
export function programLabel(owner) {
  if (owner === PUMP_PROGRAM) return 'bonding curve';
  if (owner === PUMP_AMM_PROGRAM) return 'PumpSwap pool';
  if (owner === TOKEN_PROGRAM || owner === ASSOCIATED_TOKEN_PROGRAM) return 'token program';
  return 'program';
}
