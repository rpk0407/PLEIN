// The ticket printer ("l'imprimeur"). Checks a filled ticket draft, adds it to public/tickets/ and
// renders the PNG for X and Telegram. Reads and writes files only: nothing here signs or sends.
//
//   node scripts/ticket.mjs out/plein-001-draft.json            check only
//   node scripts/ticket.mjs out/plein-001-draft.json --write    add public/tickets/plein-001.json and index.json
//   options: --draft (structure and arithmetic only; signatures may still be null), --no-png,
//            --dir <tickets dir>, --out <dir>, --now <ISO> (rehearsals), --config-moved
//
// A ticket is valid only if its split equals splitWeek(fees, diesel.price) to the cent, its
// réservoir is the week's fees plus what earlier weeks left in it, and its slices plus the unspent
// remainder add up to the buyback to make (docs/interfaces.md). What earlier weeks left is the
// published record of the week before, to the cent: a ticket may carry less only with the payout
// listed in `adjustments`, and never more. Every signature must be base58 of 64 bytes with a valid
// ed25519 scalar, and must not decode to a working key pair: a pasted key would otherwise be
// published with the ticket. On the latest plein, the ticket's price, week and unit must also be
// the ones in config.js (a mistyped price would print the wrong rate).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { splitWeek } from '../public/js/formula.js';
import { base58Decode } from '../public/js/mint.js';
import { paris, parisInstant } from '../public/js/clock.js';
import { typo } from '../public/js/typo.js';
import {
  MAX_SLICES, SLICES, WEEK_MS, carriedFor, isPleinInstant, loadConfig, parisIso, readPublishedTickets,
} from './plein.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const NB = ' ';
const z2 = (n) => String(n).padStart(2, '0');

// What the site shows of a ticket (public/js/readings.js): a ticket may not carry more, or the
// page would present a cut list as the whole.
export const NOTES_MAX = 6;
export const NOTE_MAX_CHARS = 240;

// --- is this 64-byte value a working ed25519 key pair? ---------------------------------------
// A Solana key pair file holds 32 bytes of seed followed by the 32-byte public key derived from
// it. A transaction signature has the same length and the same base58 look, so shape alone cannot
// tell them apart; the derivation can (a random 64-byte value is a key pair with probability
// 2^-256). Pure BigInt arithmetic of RFC 8032, so nothing here loads a key into a signer.
const P = 2n ** 255n - 19n;
const mod = (a) => { const r = a % P; return r >= 0n ? r : r + P; };
const power = (b, e) => { let r = 1n; let x = mod(b); for (let k = e; k > 0n; k >>= 1n) { if (k & 1n) r = mod(r * x); x = mod(x * x); } return r; };
const inverse = (a) => power(a, P - 2n);
const CURVE_D = mod(-121665n * inverse(121666n));
const BASE = (() => {
  const x = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  const y = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  return [x, y, 1n, mod(x * y)];
})();
function addPoints(a, b) {
  const A = mod((a[1] - a[0]) * (b[1] - b[0]));
  const B = mod((a[1] + a[0]) * (b[1] + b[0]));
  const C = mod(a[3] * 2n * CURVE_D * b[3]);
  const D = mod(a[2] * 2n * b[2]);
  const E = B - A; const F = D - C; const G = D + C; const H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}
function multiply(scalar, point) {
  let acc = [0n, 1n, 1n, 0n];
  let step = point;
  for (let k = scalar; k > 0n; k >>= 1n) {
    if (k & 1n) acc = addPoints(acc, step);
    step = addPoints(step, step);
  }
  return acc;
}

/** The 32-byte ed25519 public key that goes with a 32-byte seed (RFC 8032, section 5.1.5). */
export function edPublic(seed) {
  const h = createHash('sha512').update(seed).digest();
  const a = Buffer.from(h.subarray(0, 32));
  a[0] &= 248; a[31] &= 127; a[31] |= 64;
  let scalar = 0n;
  for (let i = 31; i >= 0; i -= 1) scalar = (scalar << 8n) | BigInt(a[i]);
  const pt = multiply(scalar, BASE);
  const zInv = inverse(pt[2]);
  const x = mod(pt[0] * zInv);
  let y = mod(pt[1] * zInv);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) { out[i] = Number(y & 0xffn); y >>= 8n; }
  out[31] |= Number(x & 1n) << 7;
  return out;
}

/** True when 64 bytes are a seed followed by its own public key, i.e. a usable Solana key pair. */
export function looksLikeKeypair(bytes) {
  if (!bytes || bytes.length !== 64) return false;
  const pub = edPublic(Uint8Array.from(bytes.subarray(0, 32)));
  return pub.every((b, i) => b === bytes[32 + i]);
}

// The order of the ed25519 base point. Every ed25519 signer writes the second half of a signature
// (bytes 32 to 63, little-endian) as a number below it, and Solana rejects any other. About 15 of
// 16 random 64-byte values are above it, and so is a signature with a mistyped character in its
// last few places often enough to be worth the check.
export const SCALAR_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

/** True when bytes 32 to 63 of a 64-byte value, read little-endian, are below the group order. */
export function hasCanonicalScalar(bytes) {
  if (!bytes || bytes.length !== 64) return false;
  let s = 0n;
  for (let i = 63; i >= 32; i -= 1) s = (s << 8n) | BigInt(bytes[i]);
  return s < SCALAR_ORDER;
}

const keypairMemo = new Map(); // the derivation costs about 15 ms; a ticket is checked more than once
const isKeypair = (text, bytes) => {
  if (!keypairMemo.has(text)) keypairMemo.set(text, looksLikeKeypair(bytes));
  return keypairMemo.get(text);
};

// --- validation -------------------------------------------------------------------------------
const TOP_KEYS = [
  'n', 'at', 'diesel', 'unit', 'reservoir', 'fees', 'carried', 'adjustments', 'ratePct', 'buyback', 'aid', 'team',
  'slices', 'unspent', 'burn', 'aidTransfer', 'teamTransfer', 'claim', 'notes',
];
// Money paid out of the réservoir between the last published ticket and this plein (aid or team
// held back by that ticket and paid since). It is the only thing that lets `carried` be lower than
// what that ticket left, and its transaction is on the ticket for anyone to check.
export const ADJUSTMENT_KEYS = ['aid', 'team'];
export const ADJUSTMENTS_MAX = 6;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const decimalsOk = (x, d) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && new RegExp(`^\\d+(\\.\\d{1,${d}})?$`).test(String(x));
const cents = (x) => Math.round(x * 100);
const micro = (x) => Math.round(x * 1e6);
// Free text is published as written, so it may not carry key material or a signature: a run of 80 or
// more base58 characters (a 64-byte key or signature is 87-88; a wallet address, 43-44, is fine),
// 64 or more hex digits (a 32-byte seed), or 32 or more byte values in a list (a key file: 64
// numbers; a seed alone: 32, and a seed is the whole secret). Signatures have their own fields.
const KEY_SHAPED = /[1-9A-HJ-NP-Za-km-z]{80,}|[0-9a-fA-F]{64,}|(?:\d{1,3}\s*,\s*){31,}\d{1,3}/;
const plainText = (s, max) => typeof s === 'string' && s.trim() !== '' && s.length <= max && !/[<>]/.test(s) && !KEY_SHAPED.test(s);

/**
 * Checks a ticket against docs/interfaces.md. `complete: false` accepts null signatures and
 * amounts (a draft) and lists them in `missing`. With `published` (the tickets already in
 * public/tickets/), the ticket for the week before must be among them, and `carried` must match
 * what that ticket left in the réservoir to the cent: lower only by the payouts listed in
 * `adjustments`, never higher, and no note can excuse a difference.
 * Returns { ok, errors, warnings, missing }.
 */
export function validateTicket(t, { firstPleinAt, complete = true, published = null } = {}) {
  const errors = [];
  const warnings = [];
  const missing = [];
  const err = (m) => errors.push(m);
  if (!isObj(t)) return { ok: false, errors: ['the ticket is not a JSON object'], warnings, missing };
  for (const k of Object.keys(t)) if (!TOP_KEYS.includes(k)) err(`unknown field: ${k}`);
  const strictKeys = (v, allowed, label) => { for (const k of Object.keys(v)) if (!allowed.includes(k)) err(`${label}: unknown field ${k}`); };
  const hasNotes = Array.isArray(t.notes) && t.notes.length > 0;

  // when
  let atMs = NaN;
  if (typeof t.at !== 'string' || !Number.isFinite(Date.parse(t.at))) err('at: not a date');
  else {
    atMs = Date.parse(t.at);
    if (parisIso(atMs) !== t.at) err(`at: write it in Paris time with its offset, ${parisIso(atMs)}`);
    if (!isPleinInstant(atMs)) err('at: a plein is a Saturday at 18:00 Paris time');
  }
  if (!Number.isInteger(t.n) || t.n < 1) err('n: a whole number from 1');
  else if (firstPleinAt && Number.isFinite(atMs)) {
    const expected = Math.round((atMs - Date.parse(firstPleinAt)) / WEEK_MS) + 1;
    if (expected !== t.n) err(`n: ${t.n} does not fit the date; Saturday ${t.at.slice(0, 10)} is plein #${expected}`);
  }

  // the figures
  if (t.unit !== 'USDC' && t.unit !== 'SOL') err('unit: USDC or SOL');
  const d = t.diesel;
  let priceOk = false;
  if (!isObj(d)) err('diesel: expected { price, week, source }');
  else {
    strictKeys(d, ['price', 'week', 'source'], 'diesel');
    priceOk = typeof d.price === 'number' && d.price > 0 && Math.abs(d.price * 1e4 - Math.round(d.price * 1e4)) < 1e-6;
    if (!priceOk) err('diesel.price: euros per litre, at most four decimals');
    if (!plainText(d.week, 40)) err('diesel.week: short plain text');
    if (!plainText(d.source, 200)) err('diesel.source: plain text');
  }
  const money = ['reservoir', 'fees', 'ratePct', 'buyback', 'aid', 'team'];
  const moneyOk = money.every((k) => {
    const ok = k === 'ratePct' ? typeof t[k] === 'number' && Number.isFinite(t[k]) : decimalsOk(t[k], 2);
    if (!ok) err(`${k}: ${k === 'ratePct' ? 'a number' : 'an amount with at most two decimals'}`);
    return ok;
  });
  let carriedOk = false;
  if (!isObj(t.carried)) err('carried: expected { aid, buyback, team }, what earlier weeks left in the réservoir (zeros if nothing)');
  else {
    strictKeys(t.carried, ['aid', 'buyback', 'team'], 'carried');
    carriedOk = ['aid', 'buyback', 'team'].every((k) => {
      const ok = decimalsOk(t.carried[k], 2);
      if (!ok) err(`carried.${k}: an amount with at most two decimals`);
      return ok;
    });
  }
  const unspentOk = decimalsOk(t.unspent, 2);
  if (!unspentOk) err('unspent: the buyback not made this week, an amount with at most two decimals (0 if everything was bought)');
  const carriedCents = carriedOk ? { aid: cents(t.carried.aid), buyback: cents(t.carried.buyback), team: cents(t.carried.team) } : null;

  if (moneyOk && carriedOk) {
    const total = cents(t.fees) + carriedCents.aid + carriedCents.buyback + carriedCents.team;
    if (cents(t.reservoir) !== total) {
      err(`reservoir: ${t.reservoir} but fees ${t.fees} plus carried ${(carriedCents.aid + carriedCents.buyback + carriedCents.team) / 100} make ${total / 100}`);
    }
  }
  if (priceOk && moneyOk) {
    try {
      const s = splitWeek(t.fees, d.price);
      if (s.ratePct !== t.ratePct) err(`ratePct: ${t.ratePct} but the rule gives ${s.ratePct}`);
      for (const k of ['buyback', 'aid', 'team']) {
        if (cents(s[k]) !== cents(t[k])) err(`${k}: ${t[k]} but splitWeek gives ${s[k]} for fees of ${t.fees} at ${d.price}`);
      }
    } catch (e) { err(`the split cannot be computed: ${e.message}`); }
  }

  // signatures
  const seen = new Set();
  const checkSig = (label, v) => {
    if (v === null || v === undefined) { if (complete) err(`${label}: signature missing`); else missing.push(label); return; }
    const bytes = typeof v === 'string' && v.length >= 64 && v.length <= 90 ? base58Decode(v) : null;
    if (!bytes || bytes.length !== 64) { err(`${label}: not a transaction signature (base58 text of 64 bytes)`); return; }
    if (isKeypair(v, bytes)) { err(`${label}: this value is a working key pair, not a signature. Do not publish it and treat that key as compromised`); return; }
    if (!hasCanonicalScalar(bytes)) { err(`${label}: not a transaction signature (its second half is not a valid ed25519 scalar: a mistyped character, or something that is not a signature)`); return; }
    if (seen.has(v)) err(`${label}: the same signature is used twice`);
    seen.add(v);
  };
  const checkAmount = (label, v) => {
    if (v === null || v === undefined) { if (complete) err(`${label}: missing`); else missing.push(label); return false; }
    if (!decimalsOk(v, 6) || v <= 0) { err(`${label}: a positive amount with at most six decimals`); return false; }
    return true;
  };

  // the buyback to make: this week's share plus the unspent remainder an earlier week carried over
  const toMakeCents = moneyOk && carriedOk ? cents(t.buyback) + carriedCents.buyback : null;
  const unspentCents = unspentOk ? cents(t.unspent) : 0;
  let boughtMicro = 0;
  let boughtKnown = true;
  let sliceCount = null;
  if (!Array.isArray(t.slices)) err('slices: expected a list');
  else {
    sliceCount = t.slices.length;
    let spentCents = 0;
    t.slices.forEach((s, i) => {
      const label = `slices[${i}]`;
      if (!isObj(s)) { err(`${label}: expected { sig, spent, bought }`); return; }
      strictKeys(s, ['sig', 'spent', 'bought'], label);
      if (!decimalsOk(s.spent, 2) || s.spent <= 0) err(`${label}.spent: a positive amount with at most two decimals`);
      else spentCents += cents(s.spent);
      checkSig(`${label}.sig`, s.sig);
      if (checkAmount(`${label}.bought`, s.bought)) boughtMicro += micro(s.bought); else boughtKnown = false;
    });
    if (t.slices.length > MAX_SLICES) err(`slices: at most ${MAX_SLICES}`);
    if (toMakeCents !== null && unspentOk) {
      if (spentCents + unspentCents !== toMakeCents) {
        err(`slices${unspentCents ? ' plus unspent' : ''} add up to ${(spentCents + unspentCents) / 100} but the buyback to make is ${toMakeCents / 100} (buyback ${t.buyback} plus ${t.carried.buyback} carried)`);
      }
      if (toMakeCents === 0 && t.slices.length > 0) err('slices: no buyback to make this week, so no slices');
      if (toMakeCents > 0 && t.slices.length === 0 && unspentCents === 0) err('slices: a buyback needs at least one slice, or the whole of it in unspent');
    }
    if (t.slices.length > 0 && t.slices.length !== SLICES) warnings.push(`${t.slices.length} slices instead of the published ${SLICES}: say why in the notes.`);
  }
  if (unspentCents > 0 && !hasNotes) err('unspent: part of the buyback was not made; say why in the notes');

  if (sliceCount === 0) {
    if (t.burn !== null && t.burn !== undefined) err('burn: null when nothing was bought this week');
  } else if (sliceCount !== null) {
    if (!isObj(t.burn)) err('burn: expected { sig, amount }');
    else {
      strictKeys(t.burn, ['sig', 'amount'], 'burn');
      checkSig('burn.sig', t.burn.sig);
      if (checkAmount('burn.amount', t.burn.amount) && boughtKnown) {
        const burned = micro(t.burn.amount);
        if (burned < boughtMicro) err('burn.amount: less than the sum of the slices\' bought. All that the station buys is burned; burn the rest before this ticket prints');
        if (burned > boughtMicro) {
          if (hasNotes) warnings.push('burn.amount is more than the sum of the slices\' bought: say what else was burned in the notes.');
          else err('burn.amount: more than the sum of the slices\' bought; say what else was burned in the notes');
        }
      }
    }
  }
  for (const key of ['aidTransfer', 'teamTransfer', 'claim']) {
    const v = t[key];
    if (v === null || v === undefined) continue;
    if (!isObj(v)) { err(`${key}: null or { sig }`); continue; }
    strictKeys(v, ['sig'], key);
    checkSig(`${key}.sig`, v.sig);
  }

  // payouts made since the last ticket, each with its transaction
  const adjusted = { aid: 0, team: 0 };
  let adjustmentsOk = true;
  if (t.adjustments !== undefined) {
    if (!Array.isArray(t.adjustments) || t.adjustments.length > ADJUSTMENTS_MAX) {
      err(`adjustments: a list of up to ${ADJUSTMENTS_MAX} { key, amount, sig }`);
      adjustmentsOk = false;
    } else {
      t.adjustments.forEach((a, i) => {
        const label = `adjustments[${i}]`;
        if (!isObj(a)) { err(`${label}: expected { key, amount, sig }`); adjustmentsOk = false; return; }
        strictKeys(a, ['key', 'amount', 'sig'], label);
        const keyOk = ADJUSTMENT_KEYS.includes(a.key);
        const amountOk = decimalsOk(a.amount, 2) && a.amount > 0;
        if (!keyOk) err(`${label}.key: ${ADJUSTMENT_KEYS.join(' or ')}`);
        if (!amountOk) err(`${label}.amount: a positive amount with at most two decimals`);
        if (keyOk && amountOk) adjusted[a.key] += cents(a.amount); else adjustmentsOk = false;
        checkSig(`${label}.sig`, a.sig);
      });
    }
  }

  // notes: no more than the site shows
  if (t.notes !== undefined) {
    if (!Array.isArray(t.notes) || t.notes.length > NOTES_MAX || !t.notes.every((s) => plainText(s, NOTE_MAX_CHARS))) {
      err(`notes: up to ${NOTES_MAX} short plain-text lines of ${NOTE_MAX_CHARS} characters at most (no < or >, and no signature or key: a transaction goes in its own field)`);
    }
  }
  if (moneyOk && carriedOk) {
    if (t.aid + t.carried.aid > 0 && !t.aidTransfer && !hasNotes) warnings.push('aid: no aidTransfer and no note: say where the aid share is.');
    if (t.team + t.carried.team > 0 && !t.teamTransfer && !hasNotes) warnings.push('team: no teamTransfer and no note: say where the team share is.');
    if (t.teamTransfer && unspentCents > cents(t.buyback)) warnings.push('team: paid while the unspent buyback is larger than one week\'s buyback, against rule 6 of docs/moteur.md section 4 (the team waits). The ticket still prints, being the record of what happened, and the pull request must say why.');
  }

  // What earlier weeks left in the réservoir is the record of the week before, to the cent. This is
  // the one check that keeps "food aid = 10 %, fixed" true across weeks, so notes cannot excuse it:
  // a figure above the record is never right, and a lower one needs the payout's transaction.
  if (published && carriedOk && Number.isInteger(t.n)) {
    const prior = carriedFor(published.filter((p) => p.n !== t.n), t.n);
    const from = prior.from === null ? 'no earlier ticket' : `ticket #${prior.from}`;
    for (const key of ['aid', 'buyback', 'team']) {
      const paid = ADJUSTMENT_KEYS.includes(key) && adjustmentsOk ? adjusted[key] : 0;
      const leaves = `leaves ${prior[key] / 100} in the réservoir`;
      if (carriedCents[key] > prior[key]) {
        err(`carried.${key}: ${t.carried[key]} but ${from} ${leaves}. Carried money can only go down: a higher figure takes money out of the split twice`);
      } else if (paid > prior[key]) {
        err(`adjustments: ${paid / 100} paid out of ${key}, but ${from} ${leaves}`);
      } else if (carriedCents[key] !== prior[key] - paid) {
        err(`carried.${key}: ${t.carried[key]} but ${from} ${leaves}${paid ? `, less ${paid / 100} of adjustments, which makes ${(prior[key] - paid) / 100}` : ''}; fix it, or list the payout made since in adjustments (key, amount, signature of the transaction)`);
      }
    }
    if (t.n > 1 && prior.from !== t.n - 1) {
      err(`n: no ticket is published for plein #${t.n - 1}${prior.from === null ? '' : ` (the last is #${prior.from})`}. Publish it first: whatever that week left in the réservoir would be split a second time`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, missing };
}

/** The ticket with its fields in the documented order, nothing else. */
export function normalizeTicket(t) {
  return {
    n: t.n,
    at: t.at,
    diesel: { price: t.diesel.price, week: t.diesel.week, source: t.diesel.source },
    unit: t.unit,
    reservoir: t.reservoir,
    fees: t.fees,
    carried: { aid: t.carried.aid, buyback: t.carried.buyback, team: t.carried.team },
    // only when something was paid out since the last ticket: the common ticket keeps its shape
    ...(t.adjustments?.length ? { adjustments: t.adjustments.map((a) => ({ key: a.key, amount: a.amount, sig: a.sig })) } : {}),
    ratePct: t.ratePct,
    buyback: t.buyback,
    aid: t.aid,
    team: t.team,
    slices: t.slices.map((s) => ({ sig: s.sig, spent: s.spent, bought: s.bought })),
    unspent: t.unspent,
    burn: t.burn ? { sig: t.burn.sig, amount: t.burn.amount } : null,
    aidTransfer: t.aidTransfer ? { sig: t.aidTransfer.sig } : null,
    teamTransfer: t.teamTransfer ? { sig: t.teamTransfer.sig } : null,
    claim: t.claim ? { sig: t.claim.sig } : null,
    notes: t.notes ?? [],
  };
}

const formatIndex = (tickets) => (tickets.length
  ? `{"tickets": [\n${tickets.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]}\n`
  : '{"tickets": []}\n');

/** Adds public/tickets/plein-NNN.json and its line in index.json. Published tickets are never overwritten. */
export function writeTicket(t, { dir = join(root, 'public/tickets') } = {}) {
  const checked = validateTicket(t, { published: readPublishedTickets(dir) });
  if (!checked.ok) throw new Error(`the ticket is not valid: ${checked.errors.join('; ')}`);
  const name = `plein-${String(t.n).padStart(3, '0')}.json`;
  const file = join(dir, name);
  const indexFile = join(dir, 'index.json');
  const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : { tickets: [] };
  if (!Array.isArray(index.tickets)) throw new Error('index.json has no "tickets" list');
  if (existsSync(file) || index.tickets.some((e) => e.n === t.n)) throw new Error(`plein #${t.n} is already published; published tickets are not overwritten`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(normalizeTicket(t), null, 2)}\n`);
  const tickets = [...index.tickets, { n: t.n, date: t.at.slice(0, 10), path: `/tickets/${name}` }].sort((a, b) => a.n - b.n);
  writeFileSync(indexFile, formatIndex(tickets));
  return { file, indexFile };
}

// --- the PNG ----------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fr = (v, min, max = min) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max }).format(v);
const short = (sig) => `${sig.slice(0, 4)}…${sig.slice(-4)}`;
const FONT_FILES = [
  ['Barlow Condensed', 800, 'normal', 'barlow-condensed-latin-800-normal'],
  ['IBM Plex Mono', 400, 'normal', 'ibm-plex-mono-latin-400-normal'],
  ['IBM Plex Mono', 600, 'normal', 'ibm-plex-mono-latin-600-normal'],
  ['Instrument Serif', 400, 'italic', 'instrument-serif-latin-400-italic'],
  ['Doto', 900, 'normal', 'doto-latin-900-normal'],
];

/** @font-face rules with the brand fonts inlined, so the HTML renders the same anywhere. */
export function fontsCss() {
  return FONT_FILES.map(([family, weight, style, file]) => {
    const data = readFileSync(join(root, 'public/fonts', `${file}.woff2`)).toString('base64');
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${data}) format('woff2')}`;
  }).join('\n');
}

/** Fills scripts/templates/ticket.html: {{x}} is escaped, {{{x}}} is trusted markup built here. */
export function fillTemplate(template, values, raw = {}) {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => { if (!(k in raw)) throw new Error(`template wants {{{${k}}}}`); return raw[k]; })
    .replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in values)) throw new Error(`template wants {{${k}}}`); return esc(values[k]); });
}

const CARD_NOTES = 3; // the card has room for three; the site shows all of them

export function renderTicketHtml(t, { template, fonts = fontsCss(), siteUrl = '' } = {}) {
  const tpl = template ?? readFileSync(join(root, 'scripts/templates/ticket.html'), 'utf8');
  const p = paris(Date.parse(t.at));
  const next = paris(parisInstant(p.y, p.m, p.d + 7, 18, 0));
  const u = `${NB}${t.unit}`;
  const carried = t.carried ?? { aid: 0, buyback: 0, team: 0 };
  const sum2 = (...xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const carriedTotal = sum2(carried.aid, carried.buyback, carried.team);
  const heldAid = sum2(t.aid, carried.aid);
  const amount = (v) => `${fr(v, 2)}${u}`;
  const row = (label, value, cls = '') => `<div class="row"><span>${esc(label)}</span><i></i><b${cls ? ` class="${cls}"` : ''}>${esc(value)}</b></div>`;
  // the split is made on the week's fees; carried money is shown apart so that nobody has to guess
  const baseRows = carriedTotal > 0
    ? [row('RÉSERVOIR', amount(t.reservoir)), row('DONT REPORTÉ', amount(carriedTotal)), row('FRAIS DE LA SEMAINE', amount(t.fees))].join('')
    : row('RÉSERVOIR', amount(t.reservoir));
  // What was bought is the sum of the slices, which is the week's share only when nothing was carried
  // in and nothing left over; otherwise both figures are shown, and the one in LED is what was bought.
  const spent = sum2(...(t.slices ?? []).map((s) => s.spent));
  const unspent = t.unspent ?? 0;
  const buybackDiffers = carried.buyback > 0 || unspent > 0;
  const buybackRows = buybackDiffers
    ? [row('RACHAT DE LA SEMAINE', amount(t.buyback)), row('RACHETÉ', amount(spent), 'led'), unspent > 0 ? row('RELIQUAT REPORTÉ', amount(unspent)) : ''].join('')
    : row('RACHAT', amount(t.buyback), 'led');
  // a transfer that carried money out pays more than the week's share: say how much
  const aidPaidMore = Boolean(t.aidTransfer) && carried.aid > 0;
  const teamPaidMore = Boolean(t.teamTransfer) && carried.team > 0;
  const aidRows = row('AIDE ALIMENTAIRE', amount(t.aid)) + (aidPaidMore ? row('AIDE VERSÉE', amount(heldAid)) : '');
  const teamRows = row('ÉQUIPE', amount(t.team)) + (teamPaidMore ? row('ÉQUIPE VERSÉE', amount(sum2(t.team, carried.team))) : '');
  const values = {
    n: t.n,
    date: `SAM ${z2(p.d)}/${z2(p.m)}`,
    price: `${fr(t.diesel.price, 3, 4)}${NB}€/L`,
    source: t.diesel.source,
    rate: `${fr(t.ratePct, 1)}${NB}%`,
    burned: t.burn?.amount ? fr(Math.floor(t.burn.amount), 0) : '—',
    txBuyback: t.slices.length ? `×${t.slices.length}` : '—',
    txBurn: t.burn?.sig ? short(t.burn.sig) : '—',
    txAid: t.aidTransfer?.sig ? short(t.aidTransfer.sig) : heldAid > 0 ? `réservée · cumul ${fr(heldAid, 2)}${u}` : '—',
    txTeam: t.teamTransfer?.sig ? short(t.teamTransfer.sig) : t.team + carried.team > 0 ? 'reportée' : '—',
    next: `SAMEDI ${z2(next.d)}/${z2(next.m)}`,
    site: siteUrl ? siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'tous les liens Solscan sur le site',
  };
  const lines = (t.notes ?? []).slice(0, CARD_NOTES).map((s) => `<p>${esc(typo(s))}</p>`);
  const more = (t.notes ?? []).length - CARD_NOTES;
  if (more > 0) lines.push(`<p>${esc(typo(more === 1 ? 'et 1 autre note sur le site.' : `et ${more} autres notes sur le site.`))}</p>`);
  // The plain example fits with room to spare; every extra row (about 41 px) or note line (about 24 px)
  // eats it. Past ~50 px of extras the template switches to its tighter spacing, and past ~170 px to
  // the tightest (see the template).
  const extraRows = (carriedTotal > 0 ? 2 : 0) + (buybackDiffers ? 1 : 0) + (unspent > 0 ? 1 : 0) + (aidPaidMore ? 1 : 0) + (teamPaidMore ? 1 : 0);
  const extra = extraRows * 41 + Math.max(0, lines.length - 1) * 24;
  return fillTemplate(tpl, values, {
    fonts, baseRows, buybackRows, aidRows, teamRows, notes: lines.length ? `<div class="notes">${lines.join('')}</div>` : '',
    dense: extra > 170 ? ' dense tight' : extra > 50 ? ' dense' : '',
  });
}
async function renderPngLazy(htmlPath, pngPath) {
  let mod;
  try {
    mod = await import('./_render.mjs');
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes('_render.mjs')) return 'PNG skipped: scripts/_render.mjs is not in the tree yet.';
    throw e;
  }
  try {
    await mod.renderPng(htmlPath, pngPath, { width: 1080, height: 1350 });
    return null;
  } catch (e) {
    return `PNG skipped: ${e.message}`;
  }
}

// --- the ticket against config.js -------------------------------------------------------------

/**
 * Does the ticket's unit, price and week agree with config.js? On the latest plein (now within
 * [at, at + 7 days)) config.js still holds the price frozen at 17:45, since the next survey only
 * arrives early the following week, so a difference is a typo and an error: it would print the wrong
 * rate. Later, or before the plein (a rehearsal), the config may have moved on: a warning.
 * `moved` turns the error into a warning when the founders know config.js has changed since.
 * Returns { errors, warnings }.
 */
export function checkAgainstConfig(t, config, { now = Date.now(), moved = false } = {}) {
  const errors = [];
  const warnings = [];
  const atMs = Date.parse(t?.at);
  const latest = Number.isFinite(atMs) && now >= atMs && now < atMs + WEEK_MS;
  const differences = [];
  if (t?.unit !== config.launchpad?.quote) differences.push(`unit ${t?.unit} differs from launchpad.quote ${config.launchpad?.quote} in config.js`);
  if (t?.diesel?.price !== config.official?.gazole) differences.push(`diesel.price ${t?.diesel?.price} differs from config.js official ${config.official?.gazole}`);
  if (t?.diesel?.week !== config.official?.weekLabel) differences.push(`diesel.week "${t?.diesel?.week}" differs from config.js official "${config.official?.weekLabel}"`);
  for (const d of differences) {
    if (latest && !moved) {
      errors.push(`${d}. The price is frozen at 17:45 and config.js keeps it until the next survey, so this is a typo that would print the wrong rate. Fix the ticket; if config.js has really moved on since this plein, pass --config-moved`);
    } else {
      warnings.push(`${d}: fine if the config has moved on since this plein.`);
    }
  }
  return { errors, warnings };
}

// --- command line -----------------------------------------------------------------------------
const HELP = `usage: node scripts/ticket.mjs <draft.json> [--write] [--draft] [--no-png] [--dir <dir>] [--out <dir>] [--now <ISO>] [--config-moved]
  (no flag)  check the ticket and render the PNG into out/
  --write    also add public/tickets/plein-NNN.json and index.json
  --draft    check structure and arithmetic only; signatures may still be null (no PNG, no write)
  --now <ISO>      pretend it is this instant (rehearsals, tests)
  --config-moved   config.js changed since this plein: a different price, week or unit is a warning, not an error
Exit code 1 when the ticket is invalid.`;

export async function main(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir' || a === '--out' || a === '--now') args[a.slice(2)] = argv[++i];
    else if (['--write', '--draft', '--no-png', '--config-moved', '--help'].includes(a)) args[a.slice(2)] = true;
    else if (a.startsWith('--')) { console.error(`unknown option: ${a}\n\n${HELP}`); return 1; }
    else args._.push(a);
  }
  if (args.help) { console.log(HELP); return 0; }
  if (args._.length !== 1 || (args.dir !== undefined && !args.dir) || (args.out !== undefined && !args.out)) { console.error(HELP); return 1; }
  const now = args.now === undefined ? Date.now() : Date.parse(args.now);
  if (!Number.isFinite(now)) { console.error(`--now is not a date: ${args.now}`); return 1; }

  let ticket;
  try { ticket = JSON.parse(readFileSync(args._[0], 'utf8')); } catch (e) { console.error(`ticket: cannot read ${args._[0]}: ${e.message}`); return 1; }
  const config = loadConfig();
  const ticketsDir = args.dir ? resolve(args.dir) : join(root, 'public/tickets');
  let published;
  try { published = readPublishedTickets(ticketsDir); } catch (e) { console.error(`ticket: ${e.message}`); return 1; }
  const result = validateTicket(ticket, { firstPleinAt: config.firstPleinAt, complete: !args.draft, published });
  if (result.ok) {
    const against = checkAgainstConfig(ticket, config, { now, moved: args['config-moved'] === true });
    result.errors.push(...against.errors);
    result.warnings.push(...against.warnings);
    result.ok = result.errors.length === 0;
  }
  for (const e of result.errors) console.log(`error: ${e}`);
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (!result.ok) { console.log(`INVALID: ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}.`); return 1; }
  if (args.draft) { console.log(`Draft is consistent. Still to fill: ${result.missing.length ? result.missing.join(', ') : 'nothing'}.`); return 0; }
  console.log(`OK: plein #${ticket.n}, ${ticket.slices.length} slices, split matches the rule to the cent.`);

  try {
    if (args.write) {
      const { file, indexFile } = writeTicket(ticket, { dir: args.dir ? resolve(args.dir) : undefined });
      console.log(`written: ${file}, ${indexFile}\nNext: run \`npm run verify:ticket -- ${file}\`, open a pull request, the other founder approves, then publish the PNG and the link.`);
    }
  } catch (e) { console.error(`ticket: ${e.message}`); return 1; }

  if (!args['no-png']) {
    const out = args.out ? resolve(args.out) : join(root, 'out');
    mkdirSync(out, { recursive: true });
    const base = `ticket-${String(ticket.n).padStart(3, '0')}`;
    const htmlPath = join(out, `${base}.html`);
    writeFileSync(htmlPath, renderTicketHtml(ticket, { siteUrl: config.siteUrl }));
    const note = await renderPngLazy(htmlPath, join(out, `${base}.png`));
    console.log(note ?? `PNG: ${join(out, `${base}.png`)}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
