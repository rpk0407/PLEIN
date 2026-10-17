// Re-reads every signature of a weekly ticket on Solana and compares what the chain says with
// what the ticket claims. Read only: it never signs or sends anything.
//   node scripts/verify-ticket.mjs <ticket.json> [--json|--markdown] [--mint <mint>]
//        [--reservoir <address>] [--aid <address>] [--rpc <url>]
// The contract, the réservoir and the aid wallet come from public/live.json; the flags replace
// them (rehearsals on another coin). RPC: --rpc, else SOLANA_RPC_URL, else the public node.
// Exit code: 0 every check passed (warnings allowed), 1 at least one check failed, 2 bad usage.
//
// What is checked, per signature (a transaction is looked up with getTransaction):
//   slices[i]     succeeded; the réservoir paid `spent` of the quote asset and received `bought` of
//                 $PLEIN (token balance changes of its accounts, summed per owner)
//   burn          succeeded; the supply of $PLEIN fell by `amount` (the net change of every token
//                 account of the mint, which is exactly the burned amount in a burn-only transaction)
//   aidTransfer   succeeded; the aid wallet received `aid` of the quote asset
//   claim         succeeded and touches the pump.fun programs
// Tolerance, written down so nobody has to guess: `spent` and `aid` match within 0.01 of the quote
// asset (a ticket rounds money to the cent); `bought` and `burn.amount` within one part per million
// or one raw unit, whichever is larger (they come from an explorer, so they should be exact).
// A transaction block time outside [plein − 15 min, plein + 24 h] is a warning, not a failure.
// Limits: only token balance changes are compared, so a SOL-quoted ticket gets its $PLEIN side
// checked but not its SOL side (native balances move with fees and account rent). Tier 2: nothing
// has been verified against a real $PLEIN ticket yet; the logic is tested on stubbed transactions
// and rehearsed on another coin.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_RPC, USDC_MINT, b58decode, getTransaction, tokenDeltas, toUi,
} from '../api/_solana.js';
import { PUMP_AMM_PROGRAM, PUMP_PROGRAM } from '../api/_pump.js';
import { isSolanaAddress } from '../public/js/mint.js';
import { typo } from '../public/js/typo.js';
import { fr } from './releve.mjs';

export const TOLERANCE = {
  moneyUi: 0.01, // quote asset, for `spent` and `aid`
  partsPerMillion: 1, // $PLEIN amounts: 1 ppm, never less than 1 raw unit
};
const BEFORE_MS = 15 * 60 * 1000;
const AFTER_MS = 24 * 3600 * 1000;
const QUOTE_DECIMALS = 6; // USDC
const DECIMALS = 6; // pump.fun mints; the transaction's own decimals are read and checked too

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isSignature = (v) => {
  if (typeof v !== 'string' || v.length < 64 || v.length > 90) return false;
  try { return b58decode(v).length === 64; } catch { return false; }
};

/** A decimal amount from the ticket as a raw integer (BigInt); null if it is not a finite number. */
export function rawFrom(value, decimals) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return BigInt(Math.round(value * 10 ** decimals));
}

const abs = (x) => (x < 0n ? -x : x);

/** |found − claimed| within the tolerance for a $PLEIN amount (1 ppm of the claim, at least 1 raw unit). */
export function plainMatch(found, claimed) {
  const allowed = (abs(claimed) * BigInt(TOLERANCE.partsPerMillion)) / 1_000_000n;
  return abs(found - claimed) <= (allowed > 1n ? allowed : 1n);
}

/** |found − claimed| within one cent of the quote asset. */
export function moneyMatch(found, claimed) {
  return abs(found - claimed) <= BigInt(Math.round(TOLERANCE.moneyUi * 10 ** QUOTE_DECIMALS));
}

const sumFor = (deltas, owner, mint) => deltas
  .filter((d) => d.mint === mint && (owner === null || d.owner === owner))
  .reduce((total, d) => total + d.delta, 0n);

/** Owners that appear in the transaction's token balances for a mint, with their summed change. */
function perOwner(deltas, mint) {
  const map = new Map();
  for (const d of deltas) if (d.mint === mint && d.owner) map.set(d.owner, (map.get(d.owner) || 0n) + d.delta);
  return map;
}

const keysOf = (tx) => (tx?.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));

function timeNote(tx, atMs) {
  if (!tx?.blockTime || !Number.isFinite(atMs)) return null;
  const t = tx.blockTime * 1000;
  if (t < atMs - BEFORE_MS || t > atMs + AFTER_MS) {
    return `heure du bloc ${new Date(t).toISOString()} hors de la fenêtre du plein (${new Date(atMs).toISOString()} −15 min / +24 h)`;
  }
  return null;
}

// ---------------------------------------------------------------- the checks

/** One buyback slice: the réservoir paid `spent` and received `bought`. Returns { status, found, notes }. */
export function checkSlice(slice, tx, ctx) {
  const notes = [];
  const found = {};
  if (!tx) return { status: 'fail', found, notes: ['transaction introuvable sur ce nœud'] };
  if (tx.meta?.err) return { status: 'fail', found, notes: [`la transaction a échoué : ${JSON.stringify(tx.meta.err)}`] };
  const deltas = tokenDeltas(tx);
  let owner = ctx.reservoir;
  if (!owner) {
    // no published réservoir: take the one wallet that both paid the quote asset and received the coin
    const paid = perOwner(deltas, ctx.quoteMint);
    const got = perOwner(deltas, ctx.mint);
    const candidates = [...got.entries()].filter(([who, amount]) => amount > 0n && (paid.get(who) || 0n) < 0n);
    if (candidates.length !== 1) {
      return { status: 'fail', found, notes: [`aucun wallet unique n’a payé ${ctx.unit} et reçu le jeton (${candidates.length} trouvés) ; donnez --reservoir`] };
    }
    owner = candidates[0][0];
    notes.push(`réservoir non publié : wallet déduit de la transaction (${owner})`);
  }
  found.owner = owner;
  let status = 'ok';
  const decimals = deltas.find((d) => d.mint === ctx.mint)?.decimals ?? DECIMALS;
  const boughtRaw = sumFor(deltas, owner, ctx.mint);
  found.bought = toUi(boughtRaw < 0n ? 0n : boughtRaw, decimals);
  const claimedBought = rawFrom(slice.bought, decimals);
  if (claimedBought === null || !plainMatch(boughtRaw, claimedBought)) {
    status = 'fail';
    notes.push(`jeton reçu : ${fr(toUi(boughtRaw < 0n ? 0n : boughtRaw, decimals), decimals)} sur la chaîne contre ${fr(slice.bought, decimals)} sur le ticket`);
  }
  if (ctx.unit === 'USDC') {
    const spentRaw = -sumFor(deltas, owner, ctx.quoteMint);
    found.spent = toUi(spentRaw < 0n ? 0n : spentRaw, QUOTE_DECIMALS);
    const claimedSpent = rawFrom(slice.spent, QUOTE_DECIMALS);
    if (claimedSpent === null || !moneyMatch(spentRaw, claimedSpent)) {
      status = 'fail';
      notes.push(`USDC payés : ${fr(found.spent, 2)} sur la chaîne contre ${fr(slice.spent, 2)} sur le ticket`);
    }
  } else {
    notes.push(`côté ${ctx.unit} non vérifié (les soldes natifs bougent avec les frais et le loyer des comptes)`);
  }
  const late = timeNote(tx, ctx.atMs);
  if (late) { notes.push(late); if (status === 'ok') status = 'warn'; }
  return { status, found, notes };
}

/** The burn: the mint's supply fell by `amount`. */
export function checkBurn(burn, tx, ctx) {
  const notes = [];
  const found = {};
  if (!tx) return { status: 'fail', found, notes: ['transaction introuvable sur ce nœud'] };
  if (tx.meta?.err) return { status: 'fail', found, notes: [`la transaction a échoué : ${JSON.stringify(tx.meta.err)}`] };
  const deltas = tokenDeltas(tx);
  const decimals = deltas.find((d) => d.mint === ctx.mint)?.decimals ?? DECIMALS;
  const burnedRaw = -sumFor(deltas, null, ctx.mint);
  found.burned = toUi(burnedRaw < 0n ? 0n : burnedRaw, decimals);
  let status = 'ok';
  const claimed = rawFrom(burn.amount, decimals);
  if (burnedRaw <= 0n) {
    status = 'fail';
    notes.push('aucune baisse de l’offre dans cette transaction');
  } else if (claimed === null || !plainMatch(burnedRaw, claimed)) {
    status = 'fail';
    notes.push(`jeton brûlé : ${fr(found.burned, decimals)} sur la chaîne contre ${fr(burn.amount, decimals)} sur le ticket`);
  }
  if (ctx.reservoir) {
    const own = -sumFor(deltas, ctx.reservoir, ctx.mint);
    found.fromReservoir = toUi(own < 0n ? 0n : own, decimals);
    if (burnedRaw > 0n && !plainMatch(own, burnedRaw)) {
      if (status === 'ok') status = 'warn';
      notes.push('le jeton brûlé ne vient pas (en entier) du réservoir publié');
    }
  }
  const late = timeNote(tx, ctx.atMs);
  if (late) { notes.push(late); if (status === 'ok') status = 'warn'; }
  return { status, found, notes };
}

/** The transfer of the aid share: the aid wallet received `aid`. */
export function checkAid(ticket, tx, ctx) {
  const notes = [];
  const found = {};
  if (!tx) return { status: 'fail', found, notes: ['transaction introuvable sur ce nœud'] };
  if (tx.meta?.err) return { status: 'fail', found, notes: [`la transaction a échoué : ${JSON.stringify(tx.meta.err)}`] };
  if (ctx.unit !== 'USDC') return { status: 'ok', found, notes: [`montant en ${ctx.unit} non vérifié ; la transaction a réussi`] };
  const gains = perOwner(tokenDeltas(tx), ctx.quoteMint);
  const claimed = rawFrom(ticket.aid, QUOTE_DECIMALS);
  if (claimed === null || claimed <= 0n) return { status: 'ok', found, notes: ['aucune part d’aide chiffrée sur le ticket ; la transaction a réussi'] };
  if (ctx.aid) {
    const got = gains.get(ctx.aid) || 0n;
    found.received = toUi(got < 0n ? 0n : got, QUOTE_DECIMALS);
    if (!moneyMatch(got, claimed)) return { status: 'fail', found, notes: [`le wallet de l’aide a reçu ${fr(found.received, 2)} USDC contre ${fr(ticket.aid, 2)} sur le ticket`] };
    return { status: 'ok', found, notes };
  }
  const match = [...gains.entries()].find(([, amount]) => amount > 0n && moneyMatch(amount, claimed));
  if (!match) return { status: 'fail', found, notes: [`aucun wallet n’a reçu ${fr(ticket.aid, 2)} USDC dans cette transaction`] };
  found.received = toUi(match[1], QUOTE_DECIMALS);
  found.to = match[0];
  notes.push('wallet de l’aide absent de live.json : destination non vérifiée');
  return { status: 'warn', found, notes };
}

/** The fee claim: it succeeded and went through the pump.fun programs. */
export function checkClaim(tx) {
  if (!tx) return { status: 'fail', found: {}, notes: ['transaction introuvable sur ce nœud'] };
  if (tx.meta?.err) return { status: 'fail', found: {}, notes: [`la transaction a échoué : ${JSON.stringify(tx.meta.err)}`] };
  const keys = keysOf(tx);
  if (!keys.includes(PUMP_PROGRAM) && !keys.includes(PUMP_AMM_PROGRAM)) {
    return { status: 'warn', found: {}, notes: ['la transaction ne touche aucun programme pump.fun connu (réclamée par un autre chemin ?)'] };
  }
  return { status: 'ok', found: {}, notes: [] };
}

// ---------------------------------------------------------------- the whole ticket

/**
 * Verifies a ticket. `fetchTx(signature)` returns a parsed transaction or null (injected so the
 * checks run on stubbed data). Returns { n, mint, unit, reservoir, aid, checks, totals, ok, failures, warnings }.
 */
export async function verifyTicket({ ticket, live = {}, mint, reservoir, aid, fetchTx, gapMs = 0 }) {
  const unit = ticket?.unit;
  const contract = mint ?? live?.contract ?? '';
  const result = { n: ticket?.n ?? null, mint: contract || null, unit: unit ?? null, checks: [], totals: {}, ok: false, failures: 0, warnings: 0 };
  const fail = (id, note) => result.checks.push({ id, status: 'fail', sig: null, found: {}, notes: [note] });
  if (!isObject(ticket)) { fail('ticket', 'le ticket n’est pas un objet JSON'); result.failures = 1; return result; }
  if (unit !== 'USDC' && unit !== 'SOL') fail('unit', 'unit : USDC ou SOL');
  if (!isSolanaAddress(contract)) fail('mint', 'pas de contrat valide dans live.json (ou --mint) : rien à comparer');
  const reservoirWallet = reservoir ?? (isSolanaAddress(live?.wallets?.reservoir) ? live.wallets.reservoir : null);
  const aidWallet = aid ?? (isSolanaAddress(live?.wallets?.aid) ? live.wallets.aid : null);
  if (reservoir !== undefined && !isSolanaAddress(reservoir)) fail('reservoir', '--reservoir n’est pas une adresse Solana');
  if (aid !== undefined && !isSolanaAddress(aid)) fail('aid', '--aid n’est pas une adresse Solana');
  result.reservoir = reservoirWallet;
  result.aid = aidWallet;
  if (result.checks.length) { result.failures = result.checks.length; return result; }

  const atMs = Date.parse(ticket.at);
  const ctx = { mint: contract, unit, quoteMint: USDC_MINT, reservoir: reservoirWallet, aid: aidWallet, atMs };
  const seen = new Set();
  const entries = [];
  (Array.isArray(ticket.slices) ? ticket.slices : []).forEach((slice, i) => entries.push({ id: `slices[${i}]`, kind: 'slice', sig: slice?.sig, item: slice }));
  if (ticket.burn) entries.push({ id: 'burn', kind: 'burn', sig: ticket.burn.sig, item: ticket.burn });
  if (ticket.aidTransfer) entries.push({ id: 'aidTransfer', kind: 'aid', sig: ticket.aidTransfer.sig, item: ticket });
  if (ticket.claim) entries.push({ id: 'claim', kind: 'claim', sig: ticket.claim.sig, item: ticket.claim });

  let spentTotal = 0;
  let boughtTotal = 0;
  for (const [index, entry] of entries.entries()) {
    if (!isSignature(entry.sig)) { result.checks.push({ id: entry.id, status: 'fail', sig: entry.sig ?? null, found: {}, notes: ['signature absente ou mal formée'] }); continue; }
    if (seen.has(entry.sig)) { result.checks.push({ id: entry.id, status: 'fail', sig: entry.sig, found: {}, notes: ['la même signature est utilisée deux fois'] }); continue; }
    seen.add(entry.sig);
    let tx;
    try {
      if (index > 0 && gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
      tx = await fetchTx(entry.sig);
    } catch (error) {
      result.checks.push({ id: entry.id, status: 'fail', sig: entry.sig, found: {}, notes: [`lecture impossible : ${error?.message || error}`] });
      continue;
    }
    const verdict = entry.kind === 'slice' ? checkSlice(entry.item, tx, ctx)
      : entry.kind === 'burn' ? checkBurn(entry.item, tx, ctx)
        : entry.kind === 'aid' ? checkAid(entry.item, tx, ctx)
          : checkClaim(tx);
    if (entry.kind === 'slice' && verdict.status !== 'fail') {
      spentTotal += verdict.found.spent ?? 0;
      boughtTotal += verdict.found.bought ?? 0;
    }
    result.checks.push({ id: entry.id, sig: entry.sig, ...verdict });
  }
  result.totals = {
    spent: unit === 'USDC' ? Math.round(spentTotal * 100) / 100 : null,
    bought: Math.round(boughtTotal * 1e6) / 1e6,
    buyback: ticket.buyback ?? null,
  };
  if (!Array.isArray(ticket.slices) || ticket.slices.length === 0) {
    if (Number(ticket.buyback) > 0) result.checks.push({ id: 'slices', sig: null, status: 'fail', found: {}, notes: ['un rachat sans aucune tranche'] });
  }
  result.failures = result.checks.filter((c) => c.status === 'fail').length;
  result.warnings = result.checks.filter((c) => c.status === 'warn').length;
  result.ok = result.failures === 0;
  return result;
}

// ---------------------------------------------------------------- output

const MARK = { ok: 'OK', warn: 'ATTENTION', fail: 'ÉCHEC' };
const shortSig = (sig) => (sig ? `${sig.slice(0, 6)}…${sig.slice(-6)}` : '—');

export function formatVerification(r, { markdown = false } = {}) {
  const out = [];
  out.push(markdown ? `## Vérification du ticket n° ${r.n ?? '?'}` : `Vérification du ticket n° ${r.n ?? '?'}`);
  const row = (text) => out.push(markdown ? `- ${text}` : `  ${text}`);
  row(`Contrat : ${r.mint ?? '—'} · réservoir : ${r.reservoir ?? 'non publié'} · unité : ${r.unit ?? '—'}`);
  row(`Tolérance : ${fr(TOLERANCE.moneyUi, 2)} sur l’argent, ${TOLERANCE.partsPerMillion} millionième sur le jeton`);
  for (const c of r.checks) {
    row(`${c.id} (${shortSig(c.sig)}) → ${MARK[c.status]}${c.found?.spent !== undefined ? ` · payé ${fr(c.found.spent, 2)}` : ''}${c.found?.bought !== undefined ? ` · reçu ${fr(c.found.bought, 6)}` : ''}${c.found?.burned !== undefined ? ` · brûlé ${fr(c.found.burned, 6)}` : ''}`);
    for (const note of c.notes) out.push(`${markdown ? '  - ' : '      '}${note}`);
  }
  if (r.totals?.bought !== undefined && r.checks.some((c) => c.id.startsWith('slices'))) {
    row(`Somme des tranches lues sur la chaîne : ${r.totals.spent === null ? '—' : `${fr(r.totals.spent, 2)} ${r.unit}`} payés pour ${fr(r.totals.bought, 6)} jetons (ticket : rachat ${fr(r.totals.buyback, 2)})`);
  }
  row(r.ok ? `Verdict : toutes les vérifications passent${r.warnings ? `, ${r.warnings} avertissement(s)` : ''}.` : `Verdict : ${r.failures} vérification(s) en échec. Ne pas publier ce ticket.`);
  return out.map(typo).join('\n');
}

function parseArgs(argv) {
  const args = { json: false, markdown: false, file: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--mint') args.mint = argv[++i];
    else if (arg === '--reservoir') args.reservoir = argv[++i];
    else if (arg === '--aid') args.aid = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
    else if (arg.startsWith('--')) throw new Error(`unknown argument ${arg}`);
    else if (args.file === undefined) args.file = arg;
    else throw new Error('only one ticket file at a time');
  }
  if (!args.file) throw new Error('give the ticket file');
  if (args.json && args.markdown) throw new Error('choose --json or --markdown, not both');
  for (const key of ['mint', 'reservoir', 'aid']) {
    if (args[key] !== undefined && !isSolanaAddress(args[key])) throw new Error(`--${key} is not a Solana address`);
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`verify-ticket: ${error.message}`);
    console.error('usage: node scripts/verify-ticket.mjs <ticket.json> [--json|--markdown] [--mint <mint>] [--reservoir <address>] [--aid <address>] [--rpc <url>]');
    process.exitCode = 2;
    return;
  }
  let ticket;
  try {
    ticket = JSON.parse(await readFile(args.file, 'utf8'));
  } catch (error) {
    console.error(`verify-ticket: cannot read ${args.file}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const live = JSON.parse(await readFile(fileURLToPath(new URL('../public/live.json', import.meta.url)), 'utf8'));
  const url = args.rpc || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const result = await verifyTicket({
    ticket, live, mint: args.mint, reservoir: args.reservoir, aid: args.aid,
    fetchTx: (signature) => getTransaction(url, signature, { retries: 4, timeoutMs: 15000 }),
    gapMs: url === DEFAULT_RPC ? 400 : 0, // the public node throttles bursts
  });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatVerification(result, { markdown: args.markdown }));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
