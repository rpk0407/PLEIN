// One on-chain reading of $PLEIN, the same object GET /api/chain serves, taken from here.
//   node scripts/releve.mjs [--json|--markdown] [--mint <mint>] [--rpc <url>]
// Reads public/live.json for the contract and the wallets; --mint reads another coin instead
// (testing only). RPC: --rpc, else SOLANA_RPC_URL, else the public node. Read-only: it never
// signs or sends anything. Exit code 0 unless the inputs are invalid (2).
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { takeReading } from '../api/chain.js';
import { isSolanaAddress } from '../public/js/mint.js';
import { typo } from '../public/js/typo.js';

const NNBSP = ' ';

/** French number, grouped with narrow no-break spaces; a dash when the value was not read. */
export function fr(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const text = Number(value).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return text.replace(/[  ]/g, NNBSP);
}

/** Pretty price: enough digits for a coin that costs a fraction of a cent. */
const price = (value) => (value === null ? '—' : fr(value, value < 0.01 ? 8 : 4));

/**
 * What the creator is owed, with the part that still needs a sweep_creator_fee before a collect can
 * pay it (it sits in the bonding curve or the pool, not in the creator vault). Older readings have
 * no split: the total alone.
 */
export function feesText(vault) {
  const digits = vault.unit === 'SOL' ? 4 : 2;
  const total = `${fr(vault.unclaimed, digits)} ${vault.unit}`;
  const split = typeof vault.toSweep === 'number' && typeof vault.inVault === 'number';
  if (!split || Math.round(vault.toSweep * 10 ** digits) <= 0) return total;
  return `${total} · dont ${fr(vault.toSweep, digits)} ${vault.unit} à balayer d’abord (sweep_creator_fee), ${fr(vault.inVault, digits)} ${vault.unit} réclamables tout de suite`;
}

/** The reading as lines of text; `markdown` adds a title and bullet points. */
export function formatReading(reading, { markdown = false } = {}) {
  const { token, curve, reservoir, creatorVault, holders, market, errors } = reading;
  const lines = [];
  const bullet = (label, text) => lines.push(markdown ? `- **${label}** : ${text}` : `${label} : ${text}`);
  if (markdown) lines.push(`## Relevé on-chain · ${reading.asOf}`, '');
  else lines.push(`Relevé on-chain · ${reading.asOf}`);
  if (!reading.mint) {
    lines.push(markdown ? '_Pas encore de contrat : rien à lire._' : 'Pas encore de contrat : rien à lire.');
  } else {
    bullet('Contrat', reading.mint);
    bullet('Jeton', token
      ? `offre ${fr(token.supply, 6)} · brûlé ${fr(token.burned, 6)} · création ${token.mintAuthority === null ? 'révoquée' : `NON révoquée (${token.mintAuthority})`} · gel ${token.freezeAuthority === null ? 'révoqué' : `NON révoqué (${token.freezeAuthority})`}`
      : '—');
    bullet('Courbe pump.fun', curve ? `${fr(curve.progressPct, 1)} % remplie${curve.complete ? ' · migrée vers PumpSwap' : ''}` : '—');
    bullet('Réservoir', reservoir ? `${reservoir.address} · ${fr(reservoir.usdc)} USDC · ${fr(reservoir.sol, 4)} SOL` : '— (adresse pas encore publiée ou non lue)');
    bullet('Frais du créateur à réclamer', creatorVault ? feesText(creatorVault) : '—');
    bullet('Top 10 des wallets', holders ? `${fr(holders.top10Pct, 1)} % de l’offre` : '—');
    bullet('Marché (DexScreener)', market
      ? `prix ${price(market.priceUsd)} $ · cap. ${fr(market.marketCapUsd, 0)} $ · volume 24 h ${fr(market.volume24hUsd, 0)} $ · ${market.pairUrl ?? '—'}`
      : '—');
  }
  if (errors.length) {
    lines.push('', markdown ? '**Non lu cette fois**' : 'Non lu cette fois :');
    for (const error of errors) lines.push(markdown ? `- ${error}` : `  ${error}`);
  }
  return lines.map(typo).join('\n');
}

function parseArgs(argv) {
  const args = { json: false, markdown: false, mint: undefined, rpc: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--mint') args.mint = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
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
    console.error(`releve: ${error.message}`);
    console.error('usage: node scripts/releve.mjs [--json|--markdown] [--mint <mint>] [--rpc <url>]');
    process.exitCode = 2;
    return;
  }
  const live = JSON.parse(await readFile(fileURLToPath(new URL('../public/live.json', import.meta.url)), 'utf8'));
  const reading = await takeReading({ live, rpcUrl: args.rpc, mint: args.mint });
  console.log(args.json ? JSON.stringify(reading, null, 2) : formatReading(reading, { markdown: args.markdown }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
