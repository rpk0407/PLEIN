// GET /api/chain → one read-only reading of $PLEIN on Solana, for the dashboard.
// The contract and the wallets come from public/live.json on disk, never from the request, so
// this cannot be turned into a free RPC proxy for another mint. Nothing here signs or sends.
// Shape: docs/interfaces.md ("GET /api/chain"). `null` always means "not read".
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSolanaAddress } from '../public/js/mint.js';
import {
  DEFAULT_RPC, SYSTEM_PROGRAM, USDC_MINT, WSOL_MINT, associatedTokenAddress, b58encode, getAccount,
  getMinimumBalance, getMultipleAccounts, parseMint, parseRpcUrl, parseTokenAccount, rpc, toUi,
} from './_solana.js';
import {
  INITIAL_SUPPLY_UI, ammCreatorVaultAuthority, bondingCurveAddress, canonicalPoolAddress, creatorVaultAddress,
  creatorVaultUnclaimed, curveProgressPct, curveQuote, globalAddress, parseBondingCurve, parseGlobal, parsePool, pct1,
} from './_pump.js';

const DEXSCREENER = 'https://api.dexscreener.com/token-pairs/v1/solana/';
const TOP_N = 10;
const LARGEST_ACCOUNTS_SHOWN = 20; // what getTokenLargestAccounts returns at most

const blank = (asOf, mint = null) => ({
  asOf, mint, token: null, curve: null, reservoir: null, creatorVault: null, holders: null, market: null, errors: [],
});

const message = (error) => String(error?.message || error);

// ---------------------------------------------------------------- the blocks

/**
 * Supply and what was burned since creation, in raw integers until the last step. A supply above
 * what the curve says it created cannot come from a burn: pump.fun's Mayhem mode mints a second
 * billion to an agent (a USDC curve read on 17 October 2026 had 2 000 000 000 on the mint and
 * 1 000 000 000 in the curve). Then `burned` is null, not 0: "nothing burned" would be a guess.
 */
export function tokenBlock(mintAccount, curve) {
  const mint = parseMint(mintAccount.data);
  const startRaw = curve ? curve.tokenTotalSupply : BigInt(INITIAL_SUPPLY_UI) * 10n ** BigInt(mint.decimals);
  return {
    supply: toUi(mint.supply, mint.decimals),
    decimals: mint.decimals,
    burned: startRaw >= mint.supply ? toUi(startRaw - mint.supply, mint.decimals) : null,
    mintAuthority: mint.mintAuthority,
    freezeAuthority: mint.freezeAuthority,
  };
}

function reservoirBlock(address, solAccount, usdcAccount) {
  return {
    address,
    usdc: usdcAccount ? toUi(parseTokenAccount(usdcAccount.data).amount, 6) : 0, // no account = no USDC
    sol: solAccount ? toUi(solAccount.lamports, 9) : 0,
  };
}

const isWallet = (program) => program === null || program === SYSTEM_PROGRAM;

/**
 * Owners of the biggest balances, with the owner accounts' programs, so that curves, pools and
 * other programs can be set aside. First the node's own top-20 list (getTokenLargestAccounts);
 * the public node often refuses that method, so on any error the whole holder list is read with
 * getProgramAccounts instead (token accounts of this mint, owner and amount only).
 * Returns { complete, rows: [{ owner, amount }] sorted desc, programOf: Map(owner → program) }.
 */
export async function readHolders(rpcUrl, mint) {
  let rows;
  let complete;
  try {
    const largest = await rpc(rpcUrl, 'getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
    const list = (largest?.value || []).filter((row) => BigInt(row.amount) > 0n);
    const accounts = await getMultipleAccounts(rpcUrl, list.map((row) => row.address));
    rows = [];
    list.forEach((row, i) => {
      if (accounts[i]) rows.push({ owner: parseTokenAccount(accounts[i].data).owner, amount: BigInt(row.amount) });
    });
    complete = (largest?.value || []).length < LARGEST_ACCOUNTS_SHOWN;
  } catch (listError) {
    const mintAccount = await getAccount(rpcUrl, mint);
    if (!mintAccount) throw listError;
    // token accounts start with the mint (32 bytes), then the owner (32) and the amount (8)
    const found = await rpc(rpcUrl, 'getProgramAccounts', [mintAccount.owner, {
      encoding: 'base64',
      dataSlice: { offset: 32, length: 40 },
      filters: [{ memcmp: { offset: 0, bytes: mint } }],
    }], { timeoutMs: 20000, retries: 0 }); // one long attempt: a retry would outlast the 30 s function
    rows = found.map((entry) => {
      const data = Buffer.from(entry.account.data[0], 'base64');
      return { owner: b58encode(data.subarray(0, 32)), amount: data.readBigUInt64LE(32) };
    }).filter((row) => row.amount > 0n);
    complete = true;
  }
  const perOwner = new Map();
  for (const row of rows) perOwner.set(row.owner, (perOwner.get(row.owner) || 0n) + row.amount);
  const sorted = [...perOwner.entries()].sort((x, y) => (x[1] === y[1] ? 0 : x[1] > y[1] ? -1 : 1))
    .map(([owner, amount]) => ({ owner, amount }));
  // look at the owners' programs from the top down until ten wallets are found
  const programOf = new Map();
  let wallets = 0;
  for (let at = 0; at < sorted.length && wallets < TOP_N && at < 300; at += 100) {
    const chunk = sorted.slice(at, at + 100);
    const accounts = await getMultipleAccounts(rpcUrl, chunk.map((row) => row.owner));
    chunk.forEach((row, i) => {
      programOf.set(row.owner, accounts[i]?.owner ?? null);
      if (isWallet(accounts[i]?.owner ?? null)) wallets += 1;
    });
  }
  return { complete, rows: sorted, programOf };
}

/** top10Pct of supply (one decimal), or an error when the list cannot answer. */
export function topHolders({ complete, rows, programOf }, supplyRaw) {
  const wallets = rows.filter((row) => programOf.has(row.owner) && isWallet(programOf.get(row.owner)));
  if (wallets.length < TOP_N && !complete) {
    // the node lists only the 20 largest accounts: with fewer than ten wallets among them, the
    // tenth wallet is hidden below the list and any figure would be a guess
    throw new Error(`fewer than ${TOP_N} wallets among the ${LARGEST_ACCOUNTS_SHOWN} largest accounts`);
  }
  const top = wallets.slice(0, TOP_N);
  const sum = top.reduce((total, row) => total + row.amount, 0n);
  const excluded = new Map();
  for (const row of rows) {
    const program = programOf.get(row.owner);
    if (programOf.has(row.owner) && !isWallet(program)) excluded.set(program, (excluded.get(program) || 0n) + row.amount);
  }
  return { top10Pct: pct1(sum, supplyRaw), wallets: top, excluded };
}

/**
 * What the PumpSwap pool (the one pump.fun opens at migration) owes the coin creator, in raw units
 * of the quote asset: `inVault` is in the creator vault and can be collected, `toSweep` is still in
 * the pool (Pool.creator_fees) until someone sends sweep_creator_fee. A pool too old to have that
 * field has nothing to sweep.
 */
export async function poolVaultBalance(url, mint, poolQuoteMint) {
  const [poolAccount] = await getMultipleAccounts(url, [canonicalPoolAddress(mint, poolQuoteMint)]);
  if (!poolAccount) throw new Error('the curve is complete but its PumpSwap pool is not found');
  const pool = parsePool(poolAccount.data);
  const ata = associatedTokenAddress(ammCreatorVaultAuthority(pool.coinCreator), poolQuoteMint);
  const [account] = await getMultipleAccounts(url, [ata]);
  return { inVault: account ? parseTokenAccount(account.data).amount : 0n, toSweep: pool.creatorFees ?? 0n };
}

/**
 * The coin's own DexScreener pair, as the market block. DexScreener lists every pool a token sits
 * in, on either side (the USDC mint's list holds other coins' pairs), and anyone can open a pool
 * with $PLEIN in it. So a pair counts only if the mint is its base token, its quote is USDC or
 * wrapped SOL, and its address is one pump.fun itself derives for this coin: the bonding curve, or
 * the canonical PumpSwap pool. Once a pool is listed it is where the coin trades, so it comes first;
 * the deepest of its kind otherwise. Nothing qualifies: null, never the deepest pair of the list.
 */
export function marketBlock(body, mint) {
  if (!isSolanaAddress(mint)) return null;
  const pairs = Array.isArray(body) ? body : body?.pairs;
  const venue = new Map([
    [bondingCurveAddress(mint), 0],
    [canonicalPoolAddress(mint, USDC_MINT), 1],
    [canonicalPoolAddress(mint, WSOL_MINT), 1],
  ]);
  const quotes = new Set([USDC_MINT, WSOL_MINT]);
  const list = (pairs || []).filter((p) => p && p.chainId === 'solana' && p.baseToken?.address === mint
    && quotes.has(p.quoteToken?.address) && venue.has(p.pairAddress) && Number(p.priceUsd) > 0);
  if (!list.length) return null;
  list.sort((a, b) => (venue.get(b.pairAddress) - venue.get(a.pairAddress))
    || ((Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0)));
  const pair = list[0];
  const finite = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    source: 'dexscreener',
    priceUsd: Number(pair.priceUsd),
    marketCapUsd: finite(pair.marketCap ?? pair.fdv),
    volume24hUsd: finite(pair.volume?.h24),
    pairUrl: typeof pair.url === 'string' && pair.url.startsWith('https://dexscreener.com/') ? pair.url : null,
  };
}

async function readMarket(mint) {
  const response = await fetch(DEXSCREENER + mint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (response.status === 429) throw new Error('rate limited');
  if (!response.ok) throw new Error(`http ${response.status}`);
  const body = await response.json();
  const block = marketBlock(body, mint);
  if (!block) {
    const listed = (Array.isArray(body) ? body : body?.pairs || []).length;
    throw new Error(listed ? `no pair of its own among the ${listed} listed` : 'no pair listed yet');
  }
  return block;
}

// ---------------------------------------------------------------- the reading

/**
 * One reading. `live` is the parsed public/live.json; `mint` overrides its contract (tests on
 * another coin only). Before launch there is no contract: nothing is called, every block is null.
 * A block that cannot be read stays null and says why in `errors`; the others still count.
 */
export async function takeReading({ live, rpcUrl, mint, now = new Date() } = {}) {
  const asOf = now.toISOString();
  const wanted = mint ?? live?.contract ?? '';
  if (!wanted) return blank(asOf);
  if (!isSolanaAddress(wanted)) {
    const out = blank(asOf);
    out.errors.push('mint: the contract in live.json is not a valid address');
    return out;
  }
  const url = rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const out = blank(asOf, wanted);
  try {
    parseRpcUrl(url);
  } catch (error) {
    // one line instead of one per block; the message is fixed and never quotes the value. DexScreener
    // needs no node, so the market is still read.
    out.errors.push(`rpc: ${message(error)}`);
    try { out.market = await readMarket(wanted); } catch (marketError) { out.errors.push(`market: ${message(marketError)}`); }
    return out;
  }
  let supplyRaw = null;
  const failures = { token: null, curve: null, reservoir: null, creatorVault: null, holders: null, market: null };

  const reservoirWallet = live?.wallets?.reservoir || '';
  const reservoir = isSolanaAddress(reservoirWallet) ? reservoirWallet : null;
  if (reservoirWallet && !reservoir) failures.reservoir = 'malformed address in live.json';
  const curveAddress = bondingCurveAddress(wanted);
  const reservoirAta = reservoir ? associatedTokenAddress(reservoir, USDC_MINT) : null;

  // 1. mint, curve, Global and the reservoir's two accounts in one call, then the creator vault
  const core = (async () => {
    const keys = [wanted, curveAddress, globalAddress(), ...(reservoir ? [reservoir, reservoirAta] : [])];
    const [mintAccount, curveAccount, globalAccount, reservoirSol, reservoirUsdc] = await getMultipleAccounts(url, keys);
    let curve = null;
    if (curveAccount) {
      try { curve = parseBondingCurve(curveAccount.data); } catch (error) { failures.curve = message(error); }
    } else {
      failures.curve = 'no pump.fun bonding curve for this mint';
    }
    if (!mintAccount) failures.token = 'mint account not found';
    else {
      try {
        out.token = tokenBlock(mintAccount, curve);
        supplyRaw = parseMint(mintAccount.data).supply;
        if (out.token.burned === null) out.errors.push('burned: the supply is above what the curve created (Mayhem mode?), not computed');
      } catch (error) { failures.token = message(error); }
    }
    if (curve) {
      let initialReal = null;
      try { initialReal = parseGlobal(globalAccount.data).initialRealTokenReserves; } catch (error) { failures.curve = `launch parameters unreadable: ${message(error)}`; }
      const progressPct = curveProgressPct(curve, initialReal);
      if (progressPct !== null) out.curve = { address: curveAddress, progressPct, complete: curve.complete };
    }
    if (reservoir) {
      try { out.reservoir = reservoirBlock(reservoir, reservoirSol, reservoirUsdc); } catch (error) { failures.reservoir = message(error); }
    }
    if (curve) await readCreatorVault(curve);
  })();

  // Tier 2: what the creator is owed. Three places hold it. (1) The creator vault: SOL is its
  // lamports above the rent floor, USDC its token account; this is what can be collected. (2) The
  // bonding curve itself: a trade adds the creator's cut to BondingCurve.creator_fee and leaves the
  // money in the curve's quote account until a sweep_creator_fee moves it to the vault (read from
  // the IDL; on four of six curves with a non-zero creator_fee the curve's USDC account matched
  // real quote + creator_fee + protocol_fees to the raw unit). (3) After migration the PumpSwap
  // pool's creator vault, plus Pool.creator_fees, which wait for the pool's own sweep. All of it is
  // added to `unclaimed`; `toSweep` is the part that needs a sweep before a collect can pay it.
  // The vault's address is derived from the creator WALLET, not from the coin, so it holds the fees of
  // every coin that wallet created (a SOL curve at 0.0 % progress showed 2.75 SOL on 17 October 2026,
  // which fits that; the cause was not traced). The station's creator wallet should create $PLEIN
  // and nothing else, test coins included. Whether migration empties BondingCurve.creator_fee is not
  // known: if it did not, the curve's share is counted once here and once more in the pool.
  async function readCreatorVault(curve) {
    try {
      const quote = curveQuote(curve);
      const unit = quote.kind === 'SOL' ? 'SOL' : quote.mint === USDC_MINT ? 'USDC' : null;
      if (!unit) throw new Error(`quote asset ${quote.mint} is not handled`);
      const vault = creatorVaultAddress(curve.creator);
      const ata = quote.kind === 'SOL' ? null : associatedTokenAddress(vault, quote.mint);
      const [accounts, rentFloor] = await Promise.all([
        getMultipleAccounts(url, ata ? [vault, ata] : [vault]),
        quote.kind === 'SOL' ? getMinimumBalance(url, 0) : null,
      ]);
      let inVault = creatorVaultUnclaimed(quote, { vaultAccount: accounts[0], vaultTokenAccount: accounts[1], rentFloor });
      let toSweep = curve.creatorFee ?? 0n;
      if (curve.complete) {
        const pool = await poolVaultBalance(url, wanted, quote.kind === 'SOL' ? WSOL_MINT : quote.mint);
        inVault += pool.inVault;
        toSweep += pool.toSweep;
      }
      const decimals = unit === 'SOL' ? 9 : 6;
      out.creatorVault = { unclaimed: toUi(inVault + toSweep, decimals), unit, inVault: toUi(inVault, decimals), toSweep: toUi(toSweep, decimals) };
    } catch (error) {
      failures.creatorVault = message(error);
    }
  }

  // 2. the largest holders, owners checked
  const holders = readHolders(url, wanted);
  // 3. the market
  const market = (async () => { out.market = await readMarket(wanted); })();

  const [coreResult, holdersResult, marketResult] = await Promise.allSettled([core, holders, market]);
  if (coreResult.status === 'rejected') {
    const why = message(coreResult.reason);
    for (const key of ['token', 'curve', 'creatorVault']) failures[key] ||= why;
    if (reservoir) failures.reservoir ||= why;
  }
  if (holdersResult.status === 'rejected') failures.holders = message(holdersResult.reason);
  else if (out.token) {
    try {
      const { top10Pct } = topHolders(holdersResult.value, supplyRaw);
      out.holders = {
        top10Pct,
        excluded: 'token accounts whose owner is not a wallet (curve, pools, programs)',
      };
    } catch (error) {
      failures.holders = message(error);
    }
  } else {
    failures.holders ||= 'supply unknown';
  }
  if (marketResult.status === 'rejected') failures.market = message(marketResult.reason);

  for (const [block, why] of Object.entries(failures)) if (why) out.errors.push(`${block}: ${why}`);
  return out;
}

// ---------------------------------------------------------------- the endpoint

async function readLive() {
  const here = fileURLToPath(new URL('../public/live.json', import.meta.url));
  for (const path of [here, join(process.cwd(), 'public', 'live.json')]) {
    try { return JSON.parse(await readFile(path, 'utf8')); } catch { /* try the next place */ }
  }
  throw new Error('public/live.json not found');
}

// A reading costs about eight RPC calls, a scan of the mint's token accounts when the node will not
// list the largest ones, and a DexScreener call. The edge cache keys on the whole URL, query string
// included, so `?x=1`, `?x=2` ... would each run one. Two guards: any request with a query string is
// sent to the bare path (the handler ignores the query anyway), and a warm instance keeps its last
// reading for a minute, shared by requests that arrive while it is still being taken.
// Tier 2: that Vercel's cache keys on the query string. A rate-limit rule on /api/chain in the
// Vercel Firewall is a setting for the founders, not something this repo can do.
const READING_TTL_MS = 60_000;
let lastReading = null; // { key, at, promise }

/** Forget the kept reading (tests). */
export function clearReadingCache() { lastReading = null; }

/** The reading for `live`: the kept one if it is under a minute old or still being taken, else a new one (`take` is for tests). */
export function sharedReading(live, take = takeReading) {
  const key = `${live?.contract ?? ''}|${live?.wallets?.reservoir ?? ''}`;
  if (lastReading && lastReading.key === key && Date.now() - lastReading.at < READING_TTL_MS) return lastReading.promise;
  const entry = { key, at: Date.now(), promise: take({ live }) };
  lastReading = entry;
  entry.promise.catch(() => { if (lastReading === entry) lastReading = null; }); // a throw is not kept
  return entry.promise;
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, HEAD');
    res.end();
    return;
  }
  if (String(req.url || '').includes('?')) {
    res.statusCode = 308;
    res.setHeader('location', '/api/chain');
    res.setHeader('cache-control', 'public, max-age=3600, s-maxage=3600');
    res.end();
    return;
  }
  try {
    const reading = await sharedReading(await readLive());
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.end(JSON.stringify(reading));
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: 'chain_unavailable', detail: message(error) }));
  }
}
