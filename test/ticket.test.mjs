// The ticket printer: validation of a filled ticket, the key-pair tripwire on pasted signatures,
// money carried from one week to the next, writing into public/tickets/ (in a temp folder), and
// the HTML the PNG is made from. Signature-shaped strings are made at run time from hashes, never
// written as literals, and no real signature or key is ever in this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitWeek } from '../public/js/formula.js';
import { base58Decode } from '../public/js/mint.js';
import { buildOrder, loadConfig, splitSlices } from '../scripts/plein.mjs';
import {
  ADJUSTMENTS_MAX, NOTES_MAX, SCALAR_ORDER, checkAgainstConfig, edPublic, fillTemplate, hasCanonicalScalar, looksLikeKeypair, normalizeTicket,
  renderTicketHtml, validateTicket, writeTicket,
} from '../scripts/ticket.mjs';

const script = fileURLToPath(new URL('../scripts/ticket.mjs', import.meta.url));
const FIRST_PLEIN = '2026-10-24T18:00:00+02:00';
const SECOND_PLEIN = '2026-10-31T18:00:00+01:00';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const NB = ' '; // no-break space: before % € : and between a number and its unit
const NNBSP = ' '; // narrow no-break space: Intl's thousands separator in French
const ZERO = { aid: 0, buyback: 0, team: 0 };

function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  for (; n > 0n; n /= 58n) out = ALPHABET[Number(n % 58n)] + out;
  for (const b of bytes) { if (b !== 0) break; out = `1${out}`; }
  return out;
}
/**
 * 64 pseudo-random bytes shaped like a transaction signature. Real signatures have their second
 * half (read little-endian, so ending in byte 63) below the group order; clearing the top nibble of
 * byte 63 does the same here.
 */
function sigBytes(label) {
  const bytes = Buffer.from(createHash('sha512').update(`test signature ${label}`).digest());
  bytes[63] &= 0x0f;
  return bytes;
}
const sigOf = (label) => base58Encode(sigBytes(label));

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * A complete ticket. Defaults to the example week (3 412,00 at 2,356), twelve slices, everything
 * paid out. `unspent` is the buyback not made this week; `carried` is what earlier weeks left in
 * the réservoir; `aidPaid` / `teamPaid` false leave those shares in the réservoir; `adjustments`
 * lists payouts made since the last ticket.
 */
function makeTicket({
  n = 1, at = FIRST_PLEIN, price = 2.356, fees = 3412, carried = ZERO, unspent = 0, slices = 12,
  aidPaid = true, teamPaid = true, notes = ['Frais de la semaine réclamés le 23 octobre.'], adjustments = undefined,
} = {}) {
  const split = splitWeek(fees, price);
  const toMake = Math.round(split.buyback * 100) + Math.round(carried.buyback * 100) - Math.round(unspent * 100);
  const parts = toMake > 0 ? splitSlices(toMake, Math.min(slices, toMake)) : [];
  const bought = parts.map((c, i) => 1000000 + i * 1000 + 0.123456);
  const total = Math.round(bought.reduce((a, b) => a + b * 1e6, 0)) / 1e6;
  const tag = `plein ${n}`;
  return {
    n,
    at,
    diesel: { price, week: '2 oct.', source: 'Relevé hebdomadaire officiel du 2 octobre 2026' },
    unit: 'USDC',
    reservoir: round2(fees + carried.aid + carried.buyback + carried.team),
    fees,
    carried: { ...carried },
    ...(adjustments ? { adjustments } : {}),
    ratePct: split.ratePct,
    buyback: split.buyback,
    aid: split.aid,
    team: split.team,
    slices: parts.map((c, i) => ({ sig: sigOf(`${tag} slice ${i}`), spent: c / 100, bought: bought[i] })),
    unspent,
    burn: parts.length ? { sig: sigOf(`${tag} burn`), amount: total } : null,
    aidTransfer: aidPaid ? { sig: sigOf(`${tag} aid`) } : null,
    teamTransfer: teamPaid ? { sig: sigOf(`${tag} team`) } : null,
    claim: { sig: sigOf(`${tag} claim`) },
    notes,
  };
}
const goodTicket = (opts) => makeTicket(opts);
const check = (t, extra = {}) => validateTicket(t, { firstPleinAt: FIRST_PLEIN, ...extra });
const withChange = (change, opts) => { const t = makeTicket(opts); change(t); return t; };
const errorsOf = (change, extra, opts) => check(withChange(change, opts), extra).errors.join(' | ');

/** Plein #1 left the aid and team shares in the réservoir and 100 USDC of the buyback unbought. */
const firstWeekHeldBack = () => makeTicket({ unspent: 100, aidPaid: false, teamPaid: false, notes: ['Aide et équipe gardées au réservoir. Reliquat de 100 USDC, Jupiter indisponible.'] });
const HELD = { aid: 341.2, buyback: 100, team: 1463.75 };

test('the test signatures look like the real thing: 87 or 88 base58 characters, 64 bytes, a valid scalar half', () => {
  const sig = sigOf('shape');
  assert.ok(sig.length >= 86 && sig.length <= 88, `length ${sig.length}`);
  const bytes = base58Decode(sig);
  assert.equal(bytes.length, 64);
  assert.equal(hasCanonicalScalar(bytes), true);
  assert.equal(looksLikeKeypair(bytes), false);
});

test('a complete ticket for the example week is valid', () => {
  const r = check(goodTicket());
  assert.deepEqual(r, { ok: true, errors: [], warnings: [], missing: [] });
});

test('the split must equal splitWeek to the cent', () => {
  assert.match(errorsOf((t) => { t.team = 1463.76; }), /team: 1463\.76 but splitWeek gives 1463\.75/);
  assert.match(errorsOf((t) => { t.buyback = 1607.06; }), /buyback: 1607\.06 but splitWeek gives 1607\.05/);
  assert.match(errorsOf((t) => { t.aid = 341.19; }), /aid: 341\.19 but splitWeek gives 341\.2/);
  assert.match(errorsOf((t) => { t.ratePct = 46.6; }), /ratePct: 46\.6 but the rule gives 47\.1/);
  assert.match(errorsOf((t) => { t.fees = 3412.01; t.reservoir = 3412.01; }), /buyback|aid|team/);
  assert.match(errorsOf((t) => { t.diesel.price = 2.3283; }), /ratePct: 47\.1 but the rule gives 46\.6/);
  assert.match(errorsOf((t) => { t.fees = 3412.005; }), /fees: an amount with at most two decimals/);
  assert.match(errorsOf((t) => { t.reservoir = 3412.005; }), /reservoir: an amount with at most two decimals/);
});

test('the réservoir is the week\'s fees plus what earlier weeks left in it, to the cent', () => {
  assert.match(errorsOf((t) => { t.reservoir = 3412.01; }), /reservoir: 3412\.01 but fees 3412 plus carried 0 make 3412/);
  assert.match(errorsOf((t) => { t.carried.aid = 5; }), /reservoir: 3412 but fees 3412 plus carried 5 make 3417/);
  const carried = makeTicket({ carried: HELD, unspent: 0, notes: ['Report de la semaine 1.'] });
  assert.equal(carried.reservoir, 5316.95);
  assert.equal(check(carried).ok, true, check(carried).errors.join('; '));
});

test('the slices must add up to the buyback, to the cent', () => {
  assert.match(errorsOf((t) => { t.slices[0].spent = 133.93; }), /slices add up to 1607\.06 but the buyback to make is 1607\.05/);
  assert.match(errorsOf((t) => { t.slices.pop(); }), /slices add up/);
  assert.match(errorsOf((t) => { t.slices[3].spent = 0; }), /slices\[3\]\.spent/);
  assert.match(errorsOf((t) => { t.slices = []; t.burn = null; }), /a buyback needs at least one slice/);
});

test('slices and the unspent remainder together make the buyback to make; an unspent remainder needs a note', () => {
  const partial = makeTicket({ unspent: 100 });
  const r = check(partial);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(partial.slices.reduce((a, s) => a + Math.round(s.spent * 100), 0), 150705);
  assert.match(errorsOf((t) => { t.unspent = 99; }, undefined, { unspent: 100 }), /slices plus unspent add up to 1606\.05 but the buyback to make is 1607\.05/);
  assert.match(errorsOf((t) => { t.notes = []; }, undefined, { unspent: 100 }), /unspent: part of the buyback was not made; say why in the notes/);
  // the whole buyback unspent: no slice, no burn
  const none = makeTicket({ unspent: 1607.05 });
  assert.deepEqual(none.slices, []);
  assert.equal(none.burn, null);
  assert.equal(check(none).ok, true, check(none).errors.join('; '));
  // a negative or fractional-cent remainder is no remainder
  assert.match(errorsOf((t) => { t.unspent = -1; }), /unspent: the buyback not made/);
  assert.match(errorsOf((t) => { t.unspent = 0.001; }), /unspent: the buyback not made/);
});

test('twelve slices are the published rule; other counts are allowed with a warning', () => {
  const eleven = goodTicket({ slices: 11 });
  const r = check(eleven);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.match(r.warnings.join(' '), /11 slices instead of the published 12/);
  assert.equal(check(goodTicket({ slices: 24 })).ok, true);
  assert.match(errorsOf((t) => { t.slices.push({ ...t.slices[0], sig: sigOf('extra') }); }, undefined, { slices: 48 }), /slices: at most 48/);
});

test('a ticket is dated a Saturday 18:00 Paris, with its offset, and numbered from the first plein', () => {
  assert.match(errorsOf((t) => { t.at = '2026-10-24T18:00:00+01:00'; }), /at: write it in Paris time/);
  assert.match(errorsOf((t) => { t.at = '2026-10-24T18:00:00Z'; }), /at: write it in Paris time/);
  assert.match(errorsOf((t) => { t.at = '2026-10-25T18:00:00+01:00'; }), /Saturday at 18:00/);
  assert.match(errorsOf((t) => { t.at = '2026-10-24T19:00:00+02:00'; }), /Saturday at 18:00/);
  assert.match(errorsOf((t) => { t.at = 'next saturday'; }), /at: not a date/);
  assert.match(errorsOf((t) => { t.n = 2; }), /Saturday 2026-10-24 is plein #1/);
  assert.match(errorsOf((t) => { t.n = 0; }), /n: a whole number/);
  const second = makeTicket({ n: 2, at: SECOND_PLEIN });
  assert.deepEqual(check(second).errors, []);
});

test('every signature is base58 of 64 bytes, present, and used once', () => {
  const good = sigOf('x');
  const bytes = base58Decode(good);
  const short = base58Encode(bytes.subarray(0, 63));
  const long = base58Encode(Uint8Array.from([1, ...bytes]));
  assert.match(errorsOf((t) => { t.slices[0].sig = short; }), /slices\[0\]\.sig: not a transaction signature/);
  assert.match(errorsOf((t) => { t.slices[0].sig = long; }), /slices\[0\]\.sig: not a transaction signature/);
  assert.match(errorsOf((t) => { t.slices[0].sig = `${good.slice(0, 40)}0${good.slice(41)}`; }), /not a transaction signature/); // 0 is not base58
  assert.match(errorsOf((t) => { t.slices[0].sig = `https://solscan.io/tx/${good}`; }), /not a transaction signature/);
  assert.match(errorsOf((t) => { t.burn.sig = ` ${good}`; }), /burn\.sig/);
  assert.match(errorsOf((t) => { t.burn.sig = 12345; }), /burn\.sig/);
  assert.match(errorsOf((t) => { t.slices[1].sig = t.slices[0].sig; }), /slices\[1\]\.sig: the same signature is used twice/);
  assert.match(errorsOf((t) => { t.claim.sig = t.burn.sig; }), /claim\.sig: the same signature/);
  assert.match(errorsOf((t) => { t.teamTransfer.sig = t.aidTransfer.sig; }), /teamTransfer\.sig: the same signature/);
  assert.match(errorsOf((t) => { t.slices[0].sig = null; }), /slices\[0\]\.sig: signature missing/);
  assert.match(errorsOf((t) => { t.burn.sig = null; }), /burn\.sig: signature missing/);
});

test('a signature whose second half is not a valid scalar is a typo, not a signature', () => {
  const bytes = Buffer.from(sigBytes('typo'));
  assert.equal(hasCanonicalScalar(bytes), true);
  bytes[63] = 0xff; // the top byte of the little-endian scalar: far above the group order
  assert.equal(hasCanonicalScalar(bytes), false);
  assert.match(errorsOf((t) => { t.slices[2].sig = base58Encode(bytes); }), /slices\[2\]\.sig: not a transaction signature \(its second half is not a valid ed25519 scalar/);
  // the boundary: the order itself is out, one below it is in
  const at = Buffer.alloc(64);
  const put = (v) => { for (let i = 32; i < 64; i += 1) { at[i] = Number(v & 0xffn); v >>= 8n; } };
  put(SCALAR_ORDER);
  assert.equal(hasCanonicalScalar(at), false);
  put(SCALAR_ORDER - 1n);
  assert.equal(hasCanonicalScalar(at), true);
  assert.equal(hasCanonicalScalar(new Uint8Array(63)), false);
});

test('a pasted key pair is refused as a signature, whatever field it is in', () => {
  // RFC 8032 test vector 1: a public example, not a key anyone uses
  const seed = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex');
  const pub = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  const pair = base58Encode(Buffer.concat([seed, pub]));
  assert.ok(pair.length >= 86 && pair.length <= 88, 'shaped like a signature');
  assert.equal(looksLikeKeypair(base58Decode(pair)), true);
  assert.equal(looksLikeKeypair(base58Decode(sigOf('not a key'))), false);
  const setters = [
    (t) => { t.slices[5].sig = pair; }, (t) => { t.burn.sig = pair; }, (t) => { t.aidTransfer.sig = pair; },
    (t) => { t.teamTransfer.sig = pair; }, (t) => { t.claim.sig = pair; },
  ];
  for (const set of setters) assert.match(errorsOf(set), /working key pair, not a signature/);
  // a draft is no safer: the pair is refused there too
  assert.match(errorsOf((t) => { t.burn.sig = pair; }, { complete: false }), /working key pair/);
});

test('ed25519 public keys match the RFC 8032 test vectors', () => {
  const hex = (u8) => Buffer.from(u8).toString('hex');
  assert.equal(hex(edPublic(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'))),
    'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  assert.equal(hex(edPublic(Buffer.from('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', 'hex'))),
    '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c');
  assert.equal(looksLikeKeypair(new Uint8Array(63)), false);
  assert.equal(looksLikeKeypair(null), false);
});

test('bought and burned amounts are positive with at most six decimals; all that is bought must be burned', () => {
  assert.match(errorsOf((t) => { t.slices[0].bought = 0; }), /slices\[0\]\.bought/);
  assert.match(errorsOf((t) => { t.slices[0].bought = 1.1234567; }), /slices\[0\]\.bought/);
  assert.match(errorsOf((t) => { t.slices[0].bought = null; }), /slices\[0\]\.bought: missing/);
  assert.match(errorsOf((t) => { t.burn.amount = -1; }), /burn\.amount/);
  assert.match(errorsOf((t) => { t.burn.amount -= 1; }), /burn\.amount: less than the sum of the slices' bought/);
  assert.match(errorsOf((t) => { t.burn.amount += 1; t.notes = []; }), /burn\.amount: more than the sum of the slices' bought; say what else was burned/);
  const over = check(withChange((t) => { t.burn.amount += 1; }));
  assert.equal(over.ok, true, over.errors.join('; '));
  assert.match(over.warnings.join(' '), /more than the sum/);
  assert.match(errorsOf((t) => { t.burn = null; }), /burn: expected \{ sig, amount \}/);
});

test('a draft may still have empty signatures; a ticket to print may not', () => {
  const draft = goodTicket();
  draft.slices.forEach((s) => { s.sig = null; s.bought = null; });
  draft.burn = { sig: null, amount: null };
  draft.aidTransfer = { sig: null };
  draft.teamTransfer = { sig: null };
  draft.claim = { sig: null };
  const asDraft = check(draft, { complete: false });
  assert.equal(asDraft.ok, true, asDraft.errors.join('; '));
  assert.equal(asDraft.missing.length, 12 * 2 + 2 + 3); // slice sigs and bought, burn sig and amount, aid, team and claim
  assert.equal(check(draft).ok, false);
  assert.equal(check(draft).errors.length, 12 * 2 + 2 + 3);
});

test('aid, team and claim can be null; a share left in the réservoir with no note draws a warning', () => {
  const t = goodTicket();
  t.aidTransfer = null; t.teamTransfer = null; t.claim = null;
  const withNote = check(t);
  assert.equal(withNote.ok, true);
  assert.deepEqual(withNote.warnings, []); // the note explains it
  t.notes = [];
  assert.match(check(t).warnings.join(' '), /aid: no aidTransfer and no note/);
  assert.match(check(t).warnings.join(' '), /team: no teamTransfer and no note/);
  delete t.aidTransfer; delete t.teamTransfer; delete t.claim; delete t.notes;
  assert.equal(check(t).ok, true);
  assert.match(errorsOf((t2) => { t2.aidTransfer = {}; }), /aidTransfer\.sig: signature missing/);
  assert.match(errorsOf((t2) => { t2.aidTransfer = 'done'; }), /aidTransfer: null or \{ sig \}/);
});

test('the team waits while the unspent buyback is larger than one week\'s buyback', () => {
  const t = makeTicket({ unspent: 1607.05, notes: ['Rien acheté, Jupiter indisponible.'] });
  assert.equal(check(t).warnings.length, 0, 'equal to one week is not larger');
  const bigger = makeTicket({ unspent: 1700, carried: { aid: 0, buyback: 100, team: 0 }, notes: ['Presque rien acheté.'] });
  assert.match(check(bigger).warnings.join(' '), /team: paid while the unspent buyback is larger than one week's buyback/);
});

test('an empty week prints a ticket with no slices and no burn', () => {
  const zero = makeTicket({ fees: 0 });
  assert.deepEqual(zero.slices, []);
  assert.equal(zero.burn, null);
  assert.deepEqual(check({ ...zero, aidTransfer: null, teamTransfer: null }), { ok: true, errors: [], warnings: [], missing: [] });
  assert.match(check({ ...zero, burn: { sig: sigOf('b'), amount: 1 } }).errors.join(), /burn: null when nothing was bought this week/);
  assert.match(check({ ...zero, slices: [{ sig: sigOf('s'), spent: 1, bought: 1 }] }).errors.join(), /no buyback to make this week, so no slices/);
});

test('nothing outside the documented shape gets through', () => {
  assert.match(errorsOf((t) => { t.extra = 'x'; }), /unknown field: extra/);
  assert.match(errorsOf((t) => { t.slices[0].memo = 'x'; }), /slices\[0\]: unknown field memo/);
  assert.match(errorsOf((t) => { t.diesel.url = 'x'; }), /diesel: unknown field url/);
  assert.match(errorsOf((t) => { t.burn.note = 'x'; }), /burn: unknown field note/);
  assert.match(errorsOf((t) => { t.carried.other = 1; }), /carried: unknown field other/);
  assert.match(errorsOf((t) => { t.notes = ['<script>alert(1)</script>']; }), /notes:/);
  assert.match(errorsOf((t) => { t.notes = Array(NOTES_MAX + 1).fill('x'); }), /notes:/);
  assert.match(errorsOf((t) => { t.notes = ['x'.repeat(241)]; }), /notes:/);
  // free text is published as written: no signature, key or long hash in it, but a wallet address is fine
  const pair = base58Encode(Buffer.concat([Buffer.alloc(32, 7), Buffer.alloc(32, 9)]));
  assert.match(errorsOf((t) => { t.notes = [`Voir ${sigOf('note')}`]; }), /notes: .*no signature or key/);
  assert.match(errorsOf((t) => { t.notes = [pair]; }), /notes:/);
  assert.match(errorsOf((t) => { t.notes = ['a'.repeat(64)]; }), /notes:/, '32 bytes as hex');
  assert.match(errorsOf((t) => { t.diesel.source = `Relevé ${sigOf('source')}`; }), /diesel\.source/);
  assert.deepEqual(check(withChange((t) => { t.notes = [`Aide envoyée à ${base58Encode(sigBytes('wallet').subarray(0, 32))}.`]; })).errors, []);
  // keys written as a list of byte values (a key file holds 64 numbers, a seed alone 32 and is the
  // whole secret): built here at run time, never written out. 31 numbers pass, 32 do not.
  const bytes = (count) => Array.from({ length: count }, (_, i) => String(i % 10));
  assert.match(errorsOf((t) => { t.notes = [`[${bytes(32).join(', ')}]`]; }), /notes: .*no signature or key/, 'a 32-byte seed as a list');
  assert.match(errorsOf((t) => { t.notes = [bytes(32).join(',')]; }), /notes:/, 'with no spaces');
  assert.match(errorsOf((t) => { t.notes = [`[${bytes(64).join(', ')}]`]; }), /notes:/, 'a 64-byte key pair as a list');
  assert.match(errorsOf((t) => { t.diesel.source = bytes(40).join(', '); }), /diesel\.source/);
  assert.deepEqual(check(withChange((t) => { t.notes = [`Tranches : ${bytes(31).join(', ')}.`]; })).errors, [], '31 numbers are not a key');
  assert.deepEqual(check(withChange((t) => { t.notes = ['Tranches de 18, 19, 20 et 21 heures, soit 12 ventes de 133,92 USDC.']; })).errors, []);
  assert.match(errorsOf((t) => { t.unit = 'EUR'; }), /unit/);
  assert.match(errorsOf((t) => { t.diesel.price = 2.35831; }), /diesel\.price/);
  assert.match(errorsOf((t) => { t.diesel.source = ''; }), /diesel\.source/);
  for (const bad of [null, [], 'ticket', 3]) assert.equal(validateTicket(bad).ok, false);
});

test('a ticket in the first, shorter shape (no fees, carried or unspent) is refused with a reason', () => {
  const old = makeTicket();
  delete old.fees; delete old.carried; delete old.unspent; delete old.teamTransfer;
  const r = check(old);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' | '), /fees: an amount with at most two decimals/);
  assert.match(r.errors.join(' | '), /carried: expected \{ aid, buyback, team \}/);
  assert.match(r.errors.join(' | '), /unspent: the buyback not made this week/);
});

test('carried money must match what the last earlier ticket leaves in the réservoir, whatever the notes say', () => {
  const first = firstWeekHeldBack();
  assert.equal(check(first).ok, true, check(first).errors.join('; '));
  // plein 2 carries what plein 1 held back, and pays it all out
  const second = makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, notes: ['Report de la semaine 1 versé.'] });
  const ok = check(second, { published: [first] });
  assert.equal(ok.ok, true, ok.errors.join('; '));
  assert.deepEqual(ok.warnings, []);
  // forgetting to carry the aid share would split it a second time
  const forgot = makeTicket({ n: 2, at: SECOND_PLEIN, carried: { ...HELD, aid: 0 }, notes: [] });
  assert.match(check(forgot, { published: [first] }).errors.join(' | '), /carried\.aid: 0 but ticket #1 leaves 341\.2 in the réservoir; fix it, or list the payout made since in adjustments/);
  // a note does not excuse it, even one that looks like an explanation: the held aid would be split again
  // (the team gets 145.01 instead of 130.20 of it, and 10 % of the aid is no longer fixed)
  for (const note of ['Frais réclamés.', 'Aide versée le 26 octobre.']) {
    const explained = makeTicket({ n: 2, at: SECOND_PLEIN, carried: { ...HELD, aid: 0 }, notes: [note] });
    const r = check(explained, { published: [first] });
    assert.equal(r.ok, false, note);
    assert.match(r.errors.join(' | '), /carried\.aid: 0 but ticket #1 leaves 341\.2/);
  }
  // a carry above the record is never right: ticket #1 paid everything out, so nothing can be carried
  const paidOut = makeTicket({ notes: ['Tout versé.'] });
  const inflated = makeTicket({ n: 2, at: SECOND_PLEIN, fees: 2412, carried: { aid: 0, buyback: 0, team: 1000 }, notes: ['Frais réclamés.'] });
  assert.equal(inflated.reservoir, 3412);
  const r = check(inflated, { published: [paidOut] });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' | '), /carried\.team: 1000 but ticket #1 leaves 0 in the réservoir\. Carried money can only go down/);
  // even with a payout listed, a figure above the record stays an error
  const higher = makeTicket({ n: 2, at: SECOND_PLEIN, fees: 3012, carried: { aid: 0, buyback: 0, team: 400 }, adjustments: [{ key: 'team', amount: 100, sig: sigOf('adj') }] });
  assert.match(check(higher, { published: [paidOut] }).errors.join(' | '), /carried\.team: 400 but ticket #1 leaves 0/);
  // a first ticket carries nothing
  assert.match(errorsOf((t) => { t.carried.team = 10; t.reservoir = 3422; }, { published: [] }, { notes: [] }), /carried\.team: 10 but no earlier ticket leaves 0/);
  // re-checking a ticket that is itself published does not compare it with itself
  assert.equal(check(first, { published: [first] }).ok, true);
  // without the published tickets there is nothing to compare with
  assert.equal(check(forgot).ok, true);
});

test('a plein with no published ticket for the week before is an error, not a warning', () => {
  const first = firstWeekHeldBack();
  const third = makeTicket({ n: 3, at: '2026-11-07T18:00:00+01:00', carried: HELD, notes: ['Report.'] });
  assert.match(check(third, { published: [first] }).errors.join(' | '), /n: no ticket is published for plein #2 \(the last is #1\)\. Publish it first/);
  const second = makeTicket({ n: 2, at: SECOND_PLEIN });
  assert.match(check(second, { published: [] }).errors.join(' | '), /n: no ticket is published for plein #1\. Publish it first/);
  assert.equal(check(makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, notes: ['Report.'] }), { published: [first] }).ok, true);
});

test('a payout made since the last ticket lowers the carry, and only with its transaction listed', () => {
  const first = firstWeekHeldBack(); // leaves aid 341.20, buyback 100, team 1 463.75
  const paid = (adjustments, carried, extra = {}) => makeTicket({ n: 2, at: SECOND_PLEIN, carried, adjustments, notes: ['Report.'], ...extra });
  // the aid was paid out on the Wednesday: 341.20 off the aid carry, the transaction on the ticket
  const wednesday = paid([{ key: 'aid', amount: 341.2, sig: sigOf('wednesday aid') }], { aid: 0, buyback: 100, team: 1463.75 });
  const r = check(wednesday, { published: [first] });
  assert.equal(r.ok, true, r.errors.join('; '));
  // part of it, or both shares, add up
  assert.equal(check(paid([{ key: 'aid', amount: 41.2, sig: sigOf('a') }, { key: 'aid', amount: 100, sig: sigOf('b') }], { aid: 200, buyback: 100, team: 1463.75 }), { published: [first] }).ok, true);
  assert.equal(check(paid([{ key: 'aid', amount: 341.2, sig: sigOf('a') }, { key: 'team', amount: 1463.75, sig: sigOf('b') }], { aid: 0, buyback: 100, team: 0 }), { published: [first] }).ok, true);
  // the figures must agree to the cent
  const short = check(paid([{ key: 'aid', amount: 100, sig: sigOf('a') }], { aid: 0, buyback: 100, team: 1463.75 }), { published: [first] });
  assert.match(short.errors.join(' | '), /carried\.aid: 0 but ticket #1 leaves 341\.2 in the réservoir, less 100 of adjustments, which makes 241\.2; fix it/);
  // more than was held cannot have been paid
  assert.match(check(paid([{ key: 'aid', amount: 500, sig: sigOf('a') }], { aid: 0, buyback: 100, team: 1463.75 }), { published: [first] }).errors.join(' | '), /adjustments: 500 paid out of aid, but ticket #1 leaves 341\.2/);
  // before the first plein nothing was held
  assert.match(check(paid([{ key: 'aid', amount: 10, sig: sigOf('a') }], ZERO, { n: 1, at: FIRST_PLEIN }), { published: [] }).errors.join(' | '), /adjustments: 10 paid out of aid, but no earlier ticket leaves 0/);
  // the shape: aid or team (the buyback has its own fields), a positive amount, a real signature, used once
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'buyback', amount: 1, sig: sigOf('a') }]; }), /adjustments\[0\]\.key: aid or team/);
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'aid', amount: 0, sig: sigOf('a') }]; }), /adjustments\[0\]\.amount: a positive amount with at most two decimals/);
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'aid', amount: 1.005, sig: sigOf('a') }]; }), /adjustments\[0\]\.amount/);
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'aid', amount: 1, sig: 'nope' }]; }), /adjustments\[0\]\.sig: not a transaction signature/);
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'aid', amount: 1, sig: t.claim.sig }]; }), /adjustments\[0\]\.sig: the same signature is used twice/);
  assert.match(errorsOf((t) => { t.adjustments = [{ key: 'aid', amount: 1, sig: sigOf('a'), memo: 'x' }]; }), /adjustments\[0\]: unknown field memo/);
  assert.match(errorsOf((t) => { t.adjustments = 'paid'; }), /adjustments: a list of up to 6/);
  assert.equal(ADJUSTMENTS_MAX, 6);
  assert.match(errorsOf((t) => { t.adjustments = Array.from({ length: ADJUSTMENTS_MAX + 1 }, (_, i) => ({ key: 'aid', amount: 1, sig: sigOf(`n${i}`) })); }), /adjustments: a list of up to 6/);
  assert.match(errorsOf((t) => { t.adjustments = [null]; }), /adjustments\[0\]: expected \{ key, amount, sig \}/);
  // a draft may leave the transaction to fill in
  const draft = paid([{ key: 'aid', amount: 341.2, sig: null }], { aid: 0, buyback: 100, team: 1463.75 });
  const d = check(draft, { published: [first], complete: false });
  assert.equal(d.ok, true, d.errors.join('; '));
  assert.deepEqual(d.missing, ['adjustments[0].sig']);
  assert.equal(check(draft, { published: [first] }).ok, false);
  // and it is kept in the written ticket, only when there is one
  assert.deepEqual(normalizeTicket(wednesday).adjustments, [{ key: 'aid', amount: 341.2, sig: wednesday.adjustments[0].sig }]);
  assert.equal('adjustments' in normalizeTicket(goodTicket()), false);
  assert.equal('adjustments' in normalizeTicket({ ...goodTicket(), adjustments: [] }), false);
});

test('normalizing keeps the documented order and drops nothing that is documented', () => {
  const t = goodTicket();
  assert.deepEqual(Object.keys(normalizeTicket(t)), [
    'n', 'at', 'diesel', 'unit', 'reservoir', 'fees', 'carried', 'ratePct', 'buyback', 'aid', 'team', 'slices', 'unspent',
    'burn', 'aidTransfer', 'teamTransfer', 'claim', 'notes',
  ]);
  const bare = goodTicket(); delete bare.notes; delete bare.claim; delete bare.teamTransfer;
  assert.deepEqual(normalizeTicket(bare).notes, []);
  assert.equal(normalizeTicket(bare).claim, null);
  assert.equal(normalizeTicket(bare).teamTransfer, null);
});

test('writing adds the ticket and its index line, in order, and never overwrites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-tickets-'));
  try {
    writeFileSync(join(dir, 'index.json'), '{"tickets": []}\n');
    const first = goodTicket();
    const { file } = writeTicket(first, { dir });
    assert.ok(file.endsWith('plein-001.json'));
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(stored, normalizeTicket(first));
    assert.equal(check(stored).ok, true, 'what is written validates again');
    // the record is continuous: plein 3 waits for plein 2
    assert.throws(() => writeTicket(makeTicket({ n: 3, at: '2026-11-07T18:00:00+01:00' }), { dir }), /no ticket is published for plein #2/);
    assert.equal(existsSync(join(dir, 'plein-003.json')), false);
    writeTicket(makeTicket({ n: 2, at: SECOND_PLEIN }), { dir });
    writeTicket(makeTicket({ n: 3, at: '2026-11-07T18:00:00+01:00' }), { dir });
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    assert.deepEqual(index, { tickets: [
      { n: 1, date: '2026-10-24', path: '/tickets/plein-001.json' },
      { n: 2, date: '2026-10-31', path: '/tickets/plein-002.json' },
      { n: 3, date: '2026-11-07', path: '/tickets/plein-003.json' },
    ] });
    assert.throws(() => writeTicket(first, { dir }), /already published/);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).n, 1);
    assert.throws(() => writeTicket(withChange((t) => { t.team = 1; }, { n: 4, at: '2026-11-14T18:00:00+01:00' }), { dir }), /the ticket is not valid: .*team: 1 but splitWeek gives/);
    assert.equal(existsSync(join(dir, 'plein-004.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writing checks carried money against the tickets already published in that folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-tickets-'));
  try {
    writeTicket(firstWeekHeldBack(), { dir });
    const forgot = makeTicket({ n: 2, at: SECOND_PLEIN, carried: ZERO, notes: [] });
    assert.throws(() => writeTicket(forgot, { dir }), /carried\.aid: 0 but ticket #1 leaves 341\.2/);
    assert.equal(existsSync(join(dir, 'plein-002.json')), false);
    writeTicket(makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, notes: ['Report versé.'] }), { dir });
    assert.equal(existsSync(join(dir, 'plein-002.json')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every ticket published in the repository is listed once and still validates', () => {
  const dir = new URL('../public/tickets/', import.meta.url);
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.ok(Array.isArray(index.tickets));
  assert.deepEqual(index.tickets.map((e) => e.n), index.tickets.map((e) => e.n).sort((a, b) => a - b));
  const { firstPleinAt } = loadConfig();
  const tickets = index.tickets.map((entry) => JSON.parse(readFileSync(new URL(`.${entry.path.slice('/tickets'.length)}`, dir), 'utf8')));
  for (const [i, entry] of index.tickets.entries()) {
    assert.equal(entry.path, `/tickets/plein-${String(entry.n).padStart(3, '0')}.json`);
    const ticket = tickets[i];
    assert.equal(ticket.n, entry.n);
    assert.equal(ticket.at.slice(0, 10), entry.date);
    assert.deepEqual(validateTicket(ticket, { firstPleinAt, published: tickets }).errors, []);
  }
  assert.equal(new Set(index.tickets.map((e) => e.n)).size, index.tickets.length);
});

test('the plein.mjs draft, once the founders fill the signatures, is a valid ticket: the two scripts agree', async () => {
  const config = {
    launchAt: '2026-10-17T15:30:00+02:00', firstPleinAt: FIRST_PLEIN, launchpad: { quote: 'USDC' },
    official: { gazole: 2.356, weekLabel: '2 oct.', source: 'Relevé hebdomadaire officiel du 2 octobre 2026' },
  };
  const now = Date.parse('2026-10-24T15:55:00+02:00');
  const order = await buildOrder({ config, live: { contract: '', wallets: {} }, now, reservoir: 3412, noQuotes: true, tickets: [] });
  const draft = JSON.parse(JSON.stringify(order.draft));
  assert.equal(check(draft, { complete: false }).ok, true);
  assert.equal(check(draft).ok, false, 'not printable until the signatures are in');
  // the founders' part: signatures, and what they received and burned
  draft.slices.forEach((s, i) => { s.sig = sigOf(`draft slice ${i}`); s.bought = 1000 + i + 0.5; });
  draft.burn = { sig: sigOf('draft burn'), amount: draft.slices.reduce((a, s) => a + s.bought, 0) };
  draft.aidTransfer = { sig: sigOf('draft aid') };
  draft.teamTransfer = { sig: sigOf('draft team') };
  draft.claim = { sig: sigOf('draft claim') };
  draft.notes = ['Frais réclamés à 17 h 48.'];
  const filled = check(draft);
  assert.equal(filled.ok, true, filled.errors.join('; '));
  // and the week after: whatever the first ticket left is carried by the next order, which validates too
  const heldBack = firstWeekHeldBack();
  const next = await buildOrder({
    config, live: { contract: '', wallets: {} }, now: Date.parse('2026-10-31T15:55:00+01:00'), reservoir: 6000, noQuotes: true, tickets: [heldBack],
  });
  assert.deepEqual(next.carried, HELD);
  assert.equal(next.fees, 4095.05); // 6 000 less the 1 904,95 held over
  assert.equal(check(next.draft, { complete: false, published: [heldBack] }).ok, true, check(next.draft, { complete: false, published: [heldBack] }).errors.join('; '));
});

test('the card is the example ticket in French typography, with only a short form of each signature', () => {
  const t = goodTicket();
  const html = renderTicketHtml(t, { fonts: '/* fonts */' });
  assert.doesNotMatch(html, /\{\{/);
  const parts = [
    'PLEIN #1', 'SAM 24/10 · 18:00', `47,1${NB}%`, `2,356${NB}€/L`, `3${NNBSP}412,00${NB}USDC`, `1${NNBSP}607,05${NB}USDC`,
    `341,20${NB}USDC`, `1${NNBSP}463,75${NB}USDC`, 'SAMEDI 31/10', '×12',
  ];
  for (const part of parts) assert.ok(html.includes(part), `card has "${part}"`);
  assert.doesNotMatch(html, /DONT REPORTÉ|RELIQUAT REPORTÉ|RACHETÉ/, 'nothing carried, nothing to show');
  assert.ok(html.includes('<div class="card">'), 'the plain example keeps the roomy layout');
  const short = (sig) => `${sig.slice(0, 4)}…${sig.slice(-4)}`;
  for (const sig of [t.burn.sig, t.aidTransfer.sig, t.teamTransfer.sig]) {
    assert.ok(html.includes(short(sig)), 'short form shown');
    assert.ok(!html.includes(sig), 'the full signature is on the site, not on the card');
  }
  const burned = new Intl.NumberFormat('fr-FR').format(Math.floor(t.burn.amount));
  assert.ok(html.includes(burned), `burned amount ${burned}`);
  assert.ok(html.includes('Frais de la semaine réclamés le 23 octobre.'));
});

test('the card shows the carried money apart, the unspent remainder, and what stays in the réservoir', () => {
  const t = makeTicket({
    n: 2, at: SECOND_PLEIN, carried: HELD, unspent: 50, aidPaid: false, teamPaid: false,
    notes: ['Une.', 'Deux.', 'Trois.', 'Quatre : fin.'],
  });
  assert.equal(check(t, { published: [firstWeekHeldBack()] }).ok, true, check(t, { published: [firstWeekHeldBack()] }).errors.join('; '));
  const html = renderTicketHtml(t, { fonts: '' });
  assert.ok(html.includes('<div class="card dense tight">'), 'the tallest ticket switches to the tightest spacing');
  assert.ok(html.includes(`5${NNBSP}316,95${NB}USDC`), 'the whole réservoir');
  assert.ok(html.includes('DONT REPORTÉ') && html.includes(`1${NNBSP}904,95${NB}USDC`), 'carried 341.20 + 100 + 1463.75 = 1 904,95');
  assert.ok(html.includes('FRAIS DE LA SEMAINE') && html.includes(`3${NNBSP}412,00${NB}USDC`));
  assert.ok(html.includes('RELIQUAT REPORTÉ') && html.includes(`50,00${NB}USDC`));
  // the week's share is one line and what was bought another: 1 607,05 + 100 carried - 50 left over = 1 657,05
  assert.ok(html.includes('RACHAT DE LA SEMAINE') && html.includes(`1${NNBSP}607,05${NB}USDC`));
  assert.ok(html.includes('RACHETÉ') && html.includes(`<b class="led">1${NNBSP}657,05${NB}USDC</b>`), 'the LED line is what was bought');
  assert.ok(!html.includes('AIDE VERSÉE') && !html.includes('ÉQUIPE VERSÉE'), 'nothing was paid out, so no paid-out lines');
  assert.ok(html.includes(`réservée · cumul 682,40${NB}USDC`), 'the aid share held in the réservoir, with the carried part');
  assert.ok(html.includes('reportée'), 'the team share held back');
  assert.ok(html.includes('Trois.') && !html.includes('Quatre'), 'three notes on the card');
  assert.ok(html.includes('et 1 autre note sur le site.'));
  assert.ok(html.includes('SAMEDI 07/11'));
  // notes get French typography: no-break space before the colon, none of the ASCII kind
  assert.ok(renderTicketHtml({ ...t, notes: ['Frais : réclamés !'] }, { fonts: '' }).includes(`Frais${NB}: réclamés${NB}!`));
});

test('the card says how much a transfer paid when it also paid the carried part, and what was really bought', () => {
  // plein 2 pays out the aid and the team share of plein 1, held back, together with its own
  const paid = makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, notes: ['Report versé.'] });
  assert.equal(check(paid, { published: [firstWeekHeldBack()] }).ok, true);
  const html = renderTicketHtml(paid, { fonts: '' });
  assert.ok(html.includes('<div class="card dense tight">'));
  assert.ok(html.includes('AIDE ALIMENTAIRE') && html.includes(`341,20${NB}USDC`), 'the week\'s share');
  assert.ok(html.includes('AIDE VERSÉE') && html.includes(`682,40${NB}USDC`), 'what the aid transfer moved: 341.20 + 341.20');
  assert.ok(html.includes('ÉQUIPE VERSÉE') && html.includes(`2${NNBSP}927,50${NB}USDC`), 'what the team transfer moved: 1 463.75 × 2');
  assert.ok(html.includes(`<b class="led">1${NNBSP}707,05${NB}USDC</b>`), 'bought: the week\'s 1 607.05 and the 100 carried');
  assert.ok(html.includes('RACHAT DE LA SEMAINE'));
  assert.doesNotMatch(html, /RELIQUAT REPORTÉ/);
  // the same week with the transfers held back says "réservée" and shows no paid-out line
  const held = renderTicketHtml(makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, aidPaid: false, teamPaid: false, notes: ['Report.'] }), { fonts: '' });
  assert.doesNotMatch(held, /AIDE VERSÉE|ÉQUIPE VERSÉE/);
  // nothing carried, nothing left over: the card keeps its original single line, in LED
  const plain = renderTicketHtml(goodTicket(), { fonts: '' });
  assert.ok(plain.includes(`<b class="led">1${NNBSP}607,05${NB}USDC</b>`));
  assert.doesNotMatch(plain, /RACHETÉ|RACHAT DE LA SEMAINE|AIDE VERSÉE|ÉQUIPE VERSÉE/);
  assert.equal((plain.match(/class="led"/g) ?? []).length, 1);
  // money left over but nothing carried: the share and what was bought are told apart
  const partial = renderTicketHtml(makeTicket({ unspent: 100, notes: ['Reliquat.'] }), { fonts: '' });
  assert.ok(partial.includes('RACHAT DE LA SEMAINE') && partial.includes(`<b class="led">1${NNBSP}507,05${NB}USDC</b>`) && partial.includes('RELIQUAT REPORTÉ'));
  assert.ok(partial.includes('<div class="card dense">'), 'two extra rows: tighter, not the tightest');
  // nothing bought at all prints a zero, not a dash
  const none = renderTicketHtml(makeTicket({ unspent: 1607.05, notes: ['Rien acheté.'] }), { fonts: '' });
  assert.ok(none.includes(`<b class="led">0,00${NB}USDC</b>`));
});

test('the card escapes what it prints, and the template fills only the placeholders it names', () => {
  const t = goodTicket();
  t.aidTransfer = null; t.notes = ['Fonds & frais "bloqués"'];
  const html = renderTicketHtml(t, { fonts: '', template: '<p>{{txAid}}</p>{{{notes}}}<i>{{source}}</i>' });
  assert.match(html, /<p>réservée · cumul 341,20 USDC<\/p>/);
  assert.ok(html.includes('Fonds &amp; frais &quot;bloqués&quot;'));
  assert.throws(() => fillTemplate('{{nope}}', {}), /template wants/);
  assert.throws(() => fillTemplate('{{{nope}}}', {}), /template wants/);
  assert.equal(fillTemplate('{{a}}|{{{b}}}', { a: '<&>' }, { b: '<b>' }), '&lt;&amp;&gt;|<b>');
  const hostile = renderTicketHtml({ ...goodTicket(), diesel: { price: 2.356, week: '2 oct.', source: '<img src=x onerror=1>' } }, { fonts: '' });
  assert.ok(!hostile.includes('<img src=x'), 'the source line is escaped');
});

test('the real template has no placeholder the script does not fill, and no remote request', () => {
  for (const t of [goodTicket(), makeTicket({ n: 2, at: SECOND_PLEIN, carried: HELD, unspent: 50, aidPaid: false, teamPaid: false }), makeTicket({ fees: 0 })]) {
    const html = renderTicketHtml(t);
    assert.doesNotMatch(html, /\{\{/);
    assert.match(html, /@font-face\{font-family:'Barlow Condensed'/);
    assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, 'no remote request: fonts are inlined');
  }
  const html = renderTicketHtml(goodTicket(), { fonts: '' });
  for (const label of ['RÉSERVOIR', 'RACHAT', 'AIDE ALIMENTAIRE', 'ÉQUIPE', 'TX RACHAT', 'TX BURN', 'TX AIDE', 'TX ÉQUIPE', 'PROCHAIN PLEIN']) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('PROCHAIN PLEIN&nbsp;:'), 'non-breaking space before the colon in the template');
});

test('on the latest plein a price, week or unit that is not config.js\'s is an error; before it or a week later, a warning', () => {
  const config = { launchpad: { quote: 'USDC' }, official: { gazole: 2.356, weekLabel: '2 oct.' } };
  const at = Date.parse(FIRST_PLEIN);
  const WEEK = 7 * 24 * 3600 * 1000;
  assert.deepEqual(checkAgainstConfig(goodTicket(), config, { now: at + 3600e3 }), { errors: [], warnings: [] });
  const wrongPrice = withChange((t) => { t.diesel.price = 2.3283; });
  const r = checkAgainstConfig(wrongPrice, config, { now: at + 3600e3 });
  assert.equal(r.errors.length, 1);
  assert.deepEqual(r.warnings, []);
  assert.match(r.errors[0], /^diesel\.price 2\.3283 differs from config\.js official 2\.356\. The price is frozen at 17:45 and config\.js keeps it until the next survey/);
  assert.match(r.errors[0], /pass --config-moved/);
  assert.match(checkAgainstConfig(withChange((t) => { t.diesel.week = '9 oct.'; }), config, { now: at + 1 }).errors.join(), /diesel\.week "9 oct\." differs from config\.js official "2 oct\."/);
  assert.match(checkAgainstConfig(withChange((t) => { t.unit = 'SOL'; }), config, { now: at + 1 }).errors.join(), /unit SOL differs from launchpad\.quote USDC/);
  assert.equal(checkAgainstConfig(withChange((t) => { t.unit = 'SOL'; t.diesel.price = 1.5; t.diesel.week = 'x'; }), config, { now: at + 1 }).errors.length, 3, 'each difference on its own');
  // the window is [at, at + 7 days): the instant of the plein is in, the next one is out; before it is a rehearsal
  assert.equal(checkAgainstConfig(wrongPrice, config, { now: at }).errors.length, 1);
  assert.equal(checkAgainstConfig(wrongPrice, config, { now: at + WEEK - 1 }).errors.length, 1);
  for (const now of [at + WEEK, at - 1]) {
    const later = checkAgainstConfig(wrongPrice, config, { now });
    assert.deepEqual(later.errors, []);
    assert.match(later.warnings.join(), /diesel\.price 2\.3283 differs from config\.js official 2\.356: fine if the config has moved on since this plein/);
  }
  // the founders know config.js has moved on: a warning, said out loud
  const moved = checkAgainstConfig(wrongPrice, config, { now: at + 3600e3, moved: true });
  assert.deepEqual(moved.errors, []);
  assert.equal(moved.warnings.length, 1);
  // a ticket with no readable date is never "the latest plein"
  assert.deepEqual(checkAgainstConfig({ ...wrongPrice, at: 'x' }, config, { now: at }).errors, []);
});

test('a draft that holds part of the buyback back is a valid ticket once filled, and the next order carries the rest', async () => {
  const config = {
    launchAt: '2026-10-17T15:30:00+02:00', firstPleinAt: FIRST_PLEIN, launchpad: { quote: 'USDC' },
    official: { gazole: 2.356, weekLabel: '2 oct.', source: 'Relevé hebdomadaire officiel du 2 octobre 2026' },
  };
  const live = { contract: '', wallets: {} };
  const order = await buildOrder({ config, live, now: Date.parse('2026-10-24T15:55:00+02:00'), reservoir: 3412, noQuotes: true, tickets: [], hour: '1000' });
  const draft = JSON.parse(JSON.stringify(order.draft));
  assert.equal(draft.unspent, 607.05);
  assert.equal(draft.notes.length, 1, 'the order wrote the note that unspent requires');
  assert.equal(check(draft, { complete: false }).ok, true);
  draft.slices.forEach((s, i) => { s.sig = sigOf(`part slice ${i}`); s.bought = 500 + i + 0.25; });
  draft.burn = { sig: sigOf('part burn'), amount: draft.slices.reduce((a, s) => a + s.bought, 0) };
  draft.aidTransfer = { sig: sigOf('part aid') };
  draft.teamTransfer = { sig: sigOf('part team') };
  draft.claim = { sig: sigOf('part claim') };
  const filled = check(draft);
  assert.equal(filled.ok, true, filled.errors.join('; '));
  assert.equal(draft.slices.reduce((a, s) => a + Math.round(s.spent * 100), 0), 100000);
  // the week after: the 607.05 not bought is carried into the buyback, never split again
  const next = await buildOrder({ config, live, now: Date.parse('2026-10-31T15:55:00+01:00'), reservoir: 4019.05, noQuotes: true, tickets: [draft] });
  assert.deepEqual(next.carried, { aid: 0, buyback: 607.05, team: 0 });
  assert.equal(next.fees, 3412);
  assert.equal(next.toBuy, 2214.1);
  const r = check(next.draft, { complete: false, published: [draft] });
  assert.equal(r.ok, true, r.errors.join('; '));
  // a team held back by rule 6 comes through as a null transfer, with its note, and still validates
  const waits = await buildOrder({ config, live, now: Date.parse('2026-10-24T15:55:00+02:00'), reservoir: 3412, noQuotes: true, tickets: [], hour: '0' });
  assert.equal(waits.teamWaits, false, 'one week\'s buyback is not larger than one week\'s buyback');
  const heavy = JSON.parse(JSON.stringify(waits.draft));
  assert.deepEqual(check(heavy, { complete: false }).errors, []);
});

test('command line: checks a file, writes only with --write, and fails on an invalid ticket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plein-cli-'));
  try {
    const good = join(dir, 'good.json');
    const bad = join(dir, 'bad.json');
    writeFileSync(good, JSON.stringify(goodTicket()));
    writeFileSync(bad, JSON.stringify(withChange((t) => { t.team = 1; })));
    const tickets = join(dir, 'tickets');
    const noBrowser = { ...process.env, CHROME_PATH: join(dir, 'no-such-browser') }; // the suite never launches a real one
    // pinned to a date long after the example plein, so the config check is a warning here whatever config.js holds today
    const runAt = (now, ...args) => spawnSync(process.execPath, [script, '--now', now, ...args], { encoding: 'utf8', env: noBrowser });
    const run = (...args) => runAt('2027-03-01T12:00:00+01:00', ...args);
    const dry = run(good, '--no-png', '--dir', tickets, '--out', dir);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /OK: plein #1, 12 slices/);
    assert.equal(existsSync(join(tickets, 'plein-001.json')), false, 'a check alone writes nothing');
    const wrote = run(good, '--write', '--no-png', '--dir', tickets, '--out', dir);
    assert.equal(wrote.status, 0, wrote.stdout + wrote.stderr);
    assert.equal(existsSync(join(tickets, 'plein-001.json')), true);
    const again = run(good, '--write', '--no-png', '--dir', tickets, '--out', dir);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already published/);
    const invalid = run(bad, '--write', '--no-png', '--dir', join(dir, 'other'), '--out', dir);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stdout, /error: team: 1 but splitWeek gives/);
    assert.match(invalid.stdout, /INVALID: \d+ errors?\./);
    assert.equal(existsSync(join(dir, 'other')), false);
    assert.equal(run(join(dir, 'missing.json')).status, 1);
    assert.equal(run().status, 1);
    assert.equal(run('--bogus').status, 1);
    // without --no-png the HTML is written next to the PNG, and a missing browser only skips the PNG
    const rendered = run(good, '--dir', join(dir, 'tickets-2'), '--out', join(dir, 'cards'));
    assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
    assert.equal(existsSync(join(dir, 'cards', 'ticket-001.html')), true);
    assert.match(rendered.stdout, /PNG skipped: no Chrome or Edge found/);
    // --draft accepts what is not filled yet
    const draft = goodTicket();
    draft.burn = { sig: null, amount: null };
    const draftFile = join(dir, 'draft.json');
    writeFileSync(draftFile, JSON.stringify(draft));
    const d = run(draftFile, '--draft', '--dir', tickets);
    assert.equal(d.status, 0, d.stdout);
    assert.match(d.stdout, /Still to fill: burn\.sig, burn\.amount/);
    // an unreadable published index stops the check instead of guessing what is carried
    const broken = join(dir, 'broken');
    mkdirSync(broken);
    writeFileSync(join(broken, 'index.json'), '{"tickets": [{"n": 1, "date": "2026-10-24", "path": "/tickets/plein-001.json"}]}');
    const stuck = run(good, '--no-png', '--dir', broken);
    assert.equal(stuck.status, 1);
    assert.match(stuck.stderr, /cannot read the published ticket/);
    // the price, week and unit must be config.js's on the plein's own week; a price of 1.5 is not the config's
    const typo = join(dir, 'typo.json');
    writeFileSync(typo, JSON.stringify(makeTicket({ price: 1.5 })));
    const evening = '2026-10-24T19:05:00+02:00';
    const wrong = runAt(evening, typo, '--no-png', '--dir', tickets);
    assert.equal(wrong.status, 1);
    assert.match(wrong.stdout, /error: diesel\.price 1\.5 differs from config\.js official/);
    assert.match(wrong.stdout, /INVALID: \d+ errors?\./);
    const moved = runAt(evening, typo, '--no-png', '--dir', tickets, '--config-moved');
    assert.equal(moved.status, 0, moved.stdout + moved.stderr);
    assert.match(moved.stdout, /warning: diesel\.price 1\.5 differs from config\.js official/);
    for (const [label, when] of [['before the plein (a rehearsal)', '2026-10-17T10:00:00+02:00'], ['a week later', '2026-10-31T18:00:00+01:00']]) {
      const r = runAt(when, typo, '--no-png', '--dir', tickets);
      assert.equal(r.status, 0, `${label}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /warning: diesel\.price 1\.5 differs/);
    }
    assert.equal(runAt('not a date', good, '--dir', tickets).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Rendering needs Chrome or Edge; run it on demand: PLEIN_TEST_PNG=1 npm test
test('the PNG renders at 1080 x 1350', { skip: !process.env.PLEIN_TEST_PNG }, async () => {
  const { renderPng } = await import('../scripts/_render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'plein-png-'));
  try {
    const html = join(dir, 'ticket.html');
    writeFileSync(html, renderTicketHtml(goodTicket()));
    const png = renderPng(html, join(dir, 'ticket.png'), { width: 1080, height: 1350 });
    assert.ok(readFileSync(png).length > 10000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
