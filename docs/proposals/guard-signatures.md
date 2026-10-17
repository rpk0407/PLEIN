# Guard amendment: ticket signatures

> **Status: proposal, not applied.** `test/no-signing.test.mjs` is unchanged. Non-negotiable 1 says the
> guard is never loosened, so the founders decide, in writing (section 7).
> Written on 17 October 2026 for idea #12 of `docs/innovations.md` (goal 2.6 in `docs/objectifs.md`).
> It has to be merged by Thursday 22 October: the first ticket prints on Saturday 24 October at 19:05.
> Revised the same day after the review by `controleur-technique`: the exemption is cut back to what was
> pre-approved (`sig` values in `public/tickets/*.json`, nothing else), the guard imports nothing from the
> repository, section 7 says what GitHub can and cannot enforce, and section 8 lists the wording that changes.

## The ask, in a few lines

1. Today the guard reports every base58 string of 86 to 90 characters. A transaction signature has 87 or
   88, so the first ticket turns the `test` check red (the one `docs/infrastructure.md` makes required)
   and cannot merge.
2. Proposal: inside `public/tickets/*.json` only (the files `scripts/ticket.mjs` writes), a string is set
   aside when it is the value of a `"sig"` key, **and** it decodes to 64 bytes whose second half is a
   canonical ed25519 scalar, **and** it is not a working key pair.
3. Everything else is checked exactly as today: every other place in those files, every other file (a
   Sunday report or a draft in `out/` with a full signature stays red), the signing words, seed phrases,
   hex, base64 and number arrays.
4. The guard stays self-contained: it imports `node:` built-ins and nothing from this repository. It carries
   its own copies of four small helpers, and a second, new test file fails if a copy drifts from the printer.
5. It checks more in one respect (it now decodes and tests what it sets aside) and reports less in another
   (signature-shaped values at one position in one folder). Section 5 says plainly what that trade is. The
   founders approve by pasting one paragraph (section 7).

## 1. What breaks today

A signature is 64 bytes in base58, the same length and look as a Solana key pair file, which the first
rule of the guard exists to catch. The guard cannot tell them apart by shape, so it reports both.

Measured on 17 October 2026 in scratch copies of the repository (not in the repository itself):

- 300 signatures made by Node's OpenSSL, an independent ed25519 signer, were 87 or 88 characters long, and
  every one passed the three tests the amendment uses (64 bytes, canonical second half, not a key pair).
- A ticket written by the real printer (`writeTicket`, the example week of the tests: fees 3412 USDC, diesel
  2.356, 16 signature fields) gave **1 hit** with today's guard: `public/tickets/plein-001.json`,
  "64-byte base58 secret".
- `docs/infrastructure.md` makes `test` a required check, so that pull request cannot merge.

## 2. The rule

| | Set aside (not reported) | Still reported, as today |
| --- | --- | --- |
| **Files** | `public/tickets/*.json`, directly in that folder: what `scripts/ticket.mjs` writes (`plein-NNN.json`, `index.json`) | every other file, and every path near it: a nested folder (`public/tickets/archive/x.json`), `public/tickets/x.md`, `public/tickets-old/`, `public/tickets.json`, drafts in `out/`, reports in `docs/releves/` |
| **Position** | the value of a `"sig"` key: the whole value, nothing else in the string | the same string anywhere else in the same file: another key, a note, a link (a `solscan.io/tx/` link too), plain text, a list under `sig`, single quotes |
| **Value** | exactly 64 bytes, second half below the ed25519 group order (every real signature has this; about 15 in 16 random 64-byte values do not), **not** a working key pair (`looksLikeKeypair`, RFC 8032) | a working key pair in any position; a 65-byte or non-canonical value under `sig` |
| **Untouched** | | `SIGNING_WORDS`, the seed-phrase, hex, base64 and number-array shapes, the base58 rule everywhere else, `KEY_SHAPES` themselves |

What this leaves red, on purpose:

- **A Sunday report, or any doc, with a full signature or a Solscan transaction link.** `releveur` writes
  `/tickets/plein-NNN.json`, or the short form `abcd…wxyz` that the printed ticket uses. Nothing in its job
  needs the full string: the site builds its Solscan links at run time from the ticket
  (`public/js/readings.js`), and the printer never stores one. If a report ever needs full links, that is
  a separate diff with its own approval line, proposed when the need is real.
- **A draft in `out/`.** It is in `.gitignore`, so CI never sees it; a local `npm test` does, and goes red
  while a draft with signatures sits there. Section 8 lists the wording this makes false and how to
  work with it.

`test/mcp.test.mjs` compares the guard's text with `mcp/_keyshapes.mjs`; the diff does not edit any line
that test looks at, and the full suite confirms it (section 10).

## 3. The diff

Apply it from the repository root. It changes one file and adds one: `test/no-signing.test.mjs` (changed)
and `test/guard-parity.test.mjs` (new). It applies cleanly to the files as they stand on 17 October
(section 10). To review it, read these and skip the rest, which is tests (section 4): the comment block
above `ALPHABET`, which says why the helpers are copies; `SIGNATURE_FILE`; `SIG_FIELD`;
`isTicketSignature`; `setAsideSignatures`; and the two changed lines in `scan()`. The helpers between
`ALPHABET` and `hasCanonicalScalar` are copies of code that exists and is already tested elsewhere:
`test/guard-parity.test.mjs` shows that they agree with it.

```diff
diff --git a/test/guard-parity.test.mjs b/test/guard-parity.test.mjs
new file mode 100644
index 0000000..949f8d0
--- /dev/null
+++ b/test/guard-parity.test.mjs
@@ -0,0 +1,102 @@
+// The guard (test/no-signing.test.mjs) imports nothing from this repository, so that no other module
+// can switch it off. It therefore carries its own copies of base58Decode (public/js/mint.js) and of
+// edPublic, looksLikeKeypair and hasCanonicalScalar (scripts/ticket.mjs). This file fails when a copy
+// stops agreeing with its original: a drift alarm, not a part of the guard, which works without it.
+// Importing the guard also runs the guard's own tests once more inside this file (about a second).
+// Signature-shaped values are made at run time; the only literals are the two public RFC 8032 test
+// vectors, kept in halves.
+import { test } from 'node:test';
+import assert from 'node:assert/strict';
+import { createHash } from 'node:crypto';
+
+// A module that ends the process when it is imported (a stray exit call at its top) would end this file
+// with fewer tests run and a green exit code. The exit handler below turns that into a failure.
+const TESTS = 4;
+let finished = 0;
+process.on('exit', () => { if (finished < TESTS) process.exitCode = 1; });
+const guard = await import('./no-signing.test.mjs');
+const { base58Decode } = await import('../public/js/mint.js');
+const { SCALAR_ORDER, edPublic, hasCanonicalScalar, looksLikeKeypair } = await import('../scripts/ticket.mjs');
+
+const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
+function base58Encode(bytes) {
+  let n = 0n;
+  for (const b of bytes) n = (n << 8n) | BigInt(b);
+  let out = '';
+  for (; n > 0n; n /= 58n) out = ALPHABET[Number(n % 58n)] + out;
+  for (const b of bytes) { if (b !== 0) break; out = `1${out}`; }
+  return out;
+}
+const hex = (bytes) => Buffer.from(bytes).toString('hex');
+const VECTORS = [
+  ['9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'],
+  ['4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'],
+];
+// 64 pseudo-random bytes; the odd ones have a second half below the group order, so both branches are used
+function sample(i) {
+  const bytes = Buffer.from(createHash('sha512').update(`guard parity ${i}`).digest());
+  if (i % 2) bytes[63] &= 0x0f;
+  return bytes;
+}
+// 64 bytes whose second half (bytes 32 to 63, little-endian) is the number `scalar`
+function withScalar(scalar) {
+  const bytes = Buffer.alloc(64, 7);
+  let s = scalar;
+  for (let i = 32; i < 64; i += 1) { bytes[i] = Number(s & 0xffn); s >>= 8n; }
+  return bytes;
+}
+
+test('the guard decodes base58 like public/js/mint.js: signatures, short values, leading ones, bad characters', () => {
+  const texts = ['', '1', '11', '2', 'z', '1112', 'abc', 'O', '0', 'l', 'I', 'a b', '😀'];
+  for (let i = 0; i < 20; i += 1) texts.push(base58Encode(sample(i)), base58Encode(sample(i).subarray(0, 32)));
+  for (const text of texts) assert.deepEqual(guard.base58Decode(text), base58Decode(text), JSON.stringify(text));
+  finished += 1;
+});
+
+test('the guard derives the same public key as scripts/ticket.mjs on RFC 8032 test vectors 1 and 2, and tells a key pair the same way', () => {
+  for (const [first, second] of VECTORS) {
+    const head = Buffer.from(first, 'hex');
+    assert.equal(hex(guard.edPublic(head)), second);
+    assert.equal(hex(edPublic(head)), second);
+    const pair = Buffer.concat([head, Buffer.from(second, 'hex')]);
+    assert.equal(guard.looksLikeKeypair(pair), true);
+    assert.equal(looksLikeKeypair(pair), true);
+    pair[63] ^= 1;
+    assert.equal(guard.looksLikeKeypair(pair), false);
+    assert.equal(looksLikeKeypair(pair), false);
+  }
+  finished += 1;
+});
+
+test('on 20 pseudo-random 64-byte values, and 5 key pairs made from them, the guard and the printer agree', () => {
+  let canonical = 0;
+  for (let i = 0; i < 20; i += 1) {
+    const bytes = sample(i);
+    assert.equal(guard.hasCanonicalScalar(bytes), hasCanonicalScalar(bytes), `scalar ${i}`);
+    assert.equal(guard.looksLikeKeypair(bytes), looksLikeKeypair(bytes), `key pair ${i}`);
+    if (hasCanonicalScalar(bytes)) canonical += 1;
+  }
+  assert.ok(canonical >= 10, `${canonical} of 20 pass the scalar test`);
+  for (let i = 0; i < 5; i += 1) {
+    const head = sample(i).subarray(0, 32);
+    const pair = Buffer.concat([head, edPublic(head)]);
+    assert.equal(guard.looksLikeKeypair(pair), true, `guard, pair ${i}`);
+    assert.equal(looksLikeKeypair(pair), true, `printer, pair ${i}`);
+  }
+  finished += 1;
+});
+
+test('the group order is the same number and the edge of the rule is in the same place; a wrong length is refused by both', () => {
+  assert.equal(guard.SCALAR_ORDER, SCALAR_ORDER);
+  for (const [scalar, expected] of [[0n, true], [SCALAR_ORDER - 1n, true], [SCALAR_ORDER, false], [SCALAR_ORDER + 1n, false], [2n ** 256n - 1n, false]]) {
+    assert.equal(guard.hasCanonicalScalar(withScalar(scalar)), expected, `guard, ${scalar}`);
+    assert.equal(hasCanonicalScalar(withScalar(scalar)), expected, `printer, ${scalar}`);
+  }
+  for (const wrong of [null, new Uint8Array(63), new Uint8Array(65)]) {
+    assert.equal(guard.hasCanonicalScalar(wrong), false);
+    assert.equal(hasCanonicalScalar(wrong), false);
+    assert.equal(guard.looksLikeKeypair(wrong), false);
+    assert.equal(looksLikeKeypair(wrong), false);
+  }
+  finished += 1;
+});
diff --git a/test/no-signing.test.mjs b/test/no-signing.test.mjs
index 0bd65e5..472e90e 100644
--- a/test/no-signing.test.mjs
+++ b/test/no-signing.test.mjs
@@ -5,10 +5,13 @@
 //
 // It is a tripwire, not a proof: it catches the usual names and shapes, and code review still
 // has to read anything that touches a wallet.
+// It imports node: built-ins and nothing from this repository, so that no other module can switch it off.
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
-import { readdirSync, readFileSync, statSync } from 'node:fs';
-import { extname, join, relative } from 'node:path';
+import { createHash } from 'node:crypto';
+import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import { dirname, extname, join, relative, sep } from 'node:path';
 import { fileURLToPath } from 'node:url';
 
 const root = fileURLToPath(new URL('..', import.meta.url));
@@ -49,6 +52,112 @@ function hasSeedPhrase(text) {
   return [...text.matchAll(SEED_RUN)].some((m) => SEED_COUNTS.has(m[1].split(' ').length));
 }
 
+// Ticket signatures. A transaction signature is 64 bytes of base58, 87 or 88 characters: the shape
+// the first rule above exists to catch in a secret key. Every ticket carries some, on purpose. So in
+// the ticket files only (public/tickets/*.json, which scripts/ticket.mjs writes), a string is set
+// aside before the shapes are tried, and only when all of this holds:
+//   - it is the value of a "sig" key;
+//   - it decodes to exactly 64 bytes whose second half is a canonical ed25519 scalar (every real
+//     signature has one; about 15 in 16 random 64-byte values do not);
+//   - it is not a working key pair: a 64-byte secret as Solana writes it is a seed followed by the
+//     public key derived from it, and a signature never is.
+// That is the shape of a signature, not proof that it is one; the chain says (npm run verify:ticket).
+// Everything else in those files, and everything in every other file, is checked as before. The
+// signing words, the seed phrase, hex, base64 and number-array shapes are not touched.
+//
+// The helpers below are copies, on purpose: of base58Decode (public/js/mint.js) and of edPublic,
+// looksLikeKeypair and hasCanonicalScalar (scripts/ticket.mjs, RFC 8032). This file reads nothing
+// from the rest of the repository, so no change made there for another reason can switch it off.
+// test/guard-parity.test.mjs fails when a copy stops agreeing with its original.
+const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
+export function base58Decode(text) {
+  const bytes = [];
+  for (const ch of text) {
+    let carry = ALPHABET.indexOf(ch);
+    if (carry < 0) return null;
+    for (let j = 0; j < bytes.length; j += 1) {
+      carry += bytes[j] * 58;
+      bytes[j] = carry & 0xff;
+      carry >>= 8;
+    }
+    while (carry > 0) {
+      bytes.push(carry & 0xff);
+      carry >>= 8;
+    }
+  }
+  for (let k = 0; k < text.length && text[k] === '1'; k += 1) bytes.push(0);
+  return Uint8Array.from(bytes.reverse());
+}
+
+const P = 2n ** 255n - 19n;
+const mod = (a) => { const r = a % P; return r >= 0n ? r : r + P; };
+const power = (b, e) => { let r = 1n; let x = mod(b); for (let k = e; k > 0n; k >>= 1n) { if (k & 1n) r = mod(r * x); x = mod(x * x); } return r; };
+const inverse = (a) => power(a, P - 2n);
+const CURVE_D = mod(-121665n * inverse(121666n));
+const BASE = (() => {
+  const x = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
+  const y = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
+  return [x, y, 1n, mod(x * y)];
+})();
+function addPoints(a, b) {
+  const A = mod((a[1] - a[0]) * (b[1] - b[0]));
+  const B = mod((a[1] + a[0]) * (b[1] + b[0]));
+  const C = mod(a[3] * 2n * CURVE_D * b[3]);
+  const D = mod(a[2] * 2n * b[2]);
+  const E = B - A; const F = D - C; const G = D + C; const H = B + A;
+  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
+}
+function multiply(scalar, point) {
+  let acc = [0n, 1n, 1n, 0n];
+  let step = point;
+  for (let k = scalar; k > 0n; k >>= 1n) {
+    if (k & 1n) acc = addPoints(acc, step);
+    step = addPoints(step, step);
+  }
+  return acc;
+}
+export function edPublic(seed) {
+  const h = createHash('sha512').update(seed).digest();
+  const a = Buffer.from(h.subarray(0, 32));
+  a[0] &= 248; a[31] &= 127; a[31] |= 64;
+  let scalar = 0n;
+  for (let i = 31; i >= 0; i -= 1) scalar = (scalar << 8n) | BigInt(a[i]);
+  const pt = multiply(scalar, BASE);
+  const zInv = inverse(pt[2]);
+  const x = mod(pt[0] * zInv);
+  let y = mod(pt[1] * zInv);
+  const out = new Uint8Array(32);
+  for (let i = 0; i < 32; i += 1) { out[i] = Number(y & 0xffn); y >>= 8n; }
+  out[31] |= Number(x & 1n) << 7;
+  return out;
+}
+export function looksLikeKeypair(bytes) {
+  if (!bytes || bytes.length !== 64) return false;
+  const pub = edPublic(Uint8Array.from(bytes.subarray(0, 32)));
+  return pub.every((b, i) => b === bytes[32 + i]);
+}
+export const SCALAR_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;
+export function hasCanonicalScalar(bytes) {
+  if (!bytes || bytes.length !== 64) return false;
+  let s = 0n;
+  for (let i = 63; i >= 32; i -= 1) s = (s << 8n) | BigInt(bytes[i]);
+  return s < SCALAR_ORDER;
+}
+
+const SIGNATURE_FILE = /^public\/tickets\/[^/]+\.json$/;
+const SIG_FIELD = new RegExp(`("sig"\\s*:\\s*")([${B58}]{86,90})(")`, 'g');
+const signatureMemo = new Map(); // the key pair derivation costs a few milliseconds, and the tests below repeat signatures
+function isTicketSignature(run) {
+  if (!signatureMemo.has(run)) {
+    const bytes = base58Decode(run);
+    signatureMemo.set(run, bytes !== null && bytes.length === 64 && hasCanonicalScalar(bytes) && !looksLikeKeypair(bytes));
+  }
+  return signatureMemo.get(run);
+}
+function setAsideSignatures(text) {
+  return text.replace(SIG_FIELD, (whole, head, run, tail) => (isTicketSignature(run) ? `${head}<signature>${tail}` : whole));
+}
+
 function* walk(dir) {
   for (const name of readdirSync(dir)) {
     if (SKIP_DIRS.has(name)) continue;
@@ -70,7 +179,8 @@ export function scan(base = root) {
       const flat = normalize(text);
       for (const word of SIGNING_WORDS) if (flat.includes(word)) hits.push(`${rel}: ${word}`);
     }
-    const bare = text.replace(DATA_URI, '');
+    const checked = SIGNATURE_FILE.test(rel.split(sep).join('/')) ? setAsideSignatures(text) : text;
+    const bare = checked.replace(DATA_URI, '');
     for (const [label, shape] of KEY_SHAPES) if (shape.test(bare)) hits.push(`${rel}: ${label}`);
     if (hasSeedPhrase(bare)) hits.push(`${rel}: seed phrase`);
   }
@@ -80,3 +190,181 @@ export function scan(base = root) {
 test('no code can sign or send a transaction, and no key material is in the tree', () => {
   assert.deepEqual(scan(), []);
 });
+
+// --- ticket signatures: what the exemption lets through, and what must still fail ----------------
+// Each case is written into a temporary folder and checked with scan(folder), the way CI checks the
+// repository. Signatures and secrets are built at run time; the only literals are the two public
+// RFC 8032 test vectors, kept in halves.
+function base58Encode(bytes) {
+  let n = 0n;
+  for (const b of bytes) n = (n << 8n) | BigInt(b);
+  let out = '';
+  for (; n > 0n; n /= 58n) out = ALPHABET[Number(n % 58n)] + out;
+  for (const b of bytes) { if (b !== 0) break; out = `1${out}`; }
+  return out;
+}
+// 64 bytes shaped like a real signature: top bit set, second half below the group order
+function signatureBytes(label) {
+  const bytes = Buffer.from(createHash('sha512').update(`guard test ${label}`).digest());
+  bytes[0] |= 0x80;
+  bytes[63] &= 0x0f;
+  return bytes;
+}
+const signature = (label) => base58Encode(signatureBytes(label));
+// the same bytes with their second half (bytes 32 to 63, little-endian) set to the number `scalar`
+function withScalar(label, scalar) {
+  const bytes = signatureBytes(label);
+  let s = scalar;
+  for (let i = 32; i < 64; i += 1) { bytes[i] = Number(s & 0xffn); s >>= 8n; }
+  return bytes;
+}
+// RFC 8032 test vectors 1 and 2, public examples: working key pairs, put together here from their
+// halves. The second half of pair 1 is above the group order, so the scalar test alone stops it.
+// The second half of pair 2 is below it (as for 1 key pair in 16): only the key pair test stops that one.
+const pairOf = (first, second) => base58Encode(Buffer.concat([Buffer.from(first, 'hex'), Buffer.from(second, 'hex')]));
+const PAIR_1 = pairOf('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
+const PAIR_2 = pairOf('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c');
+
+function scanTree(files) {
+  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
+  try {
+    for (const [name, text] of Object.entries(files)) {
+      const file = join(dir, ...name.split('/'));
+      mkdirSync(dirname(file), { recursive: true });
+      writeFileSync(file, text);
+    }
+    return scan(dir).map((hit) => hit.split(sep).join('/'));
+  } finally {
+    rmSync(dir, { recursive: true, force: true });
+  }
+}
+const TICKET = 'public/tickets/plein-001.json';
+const REPORT = 'docs/releves/2026-10-25.md';
+const SECRET = (file) => `${file}: 64-byte base58 secret`;
+// a ticket as scripts/ticket.mjs writes it: twelve slices, the burn, an aid transfer, the claim, a payout adjustment
+const ticketJson = (extra = {}) => JSON.stringify({
+  n: 1,
+  at: '2026-10-24T18:00:00+02:00',
+  adjustments: [{ key: 'aid', amount: 10, sig: signature('adjustment') }],
+  slices: Array.from({ length: 12 }, (_, i) => ({ sig: signature(`slice ${i}`), spent: 100, bought: 1 })),
+  burn: { sig: signature('burn'), amount: 12 },
+  aidTransfer: { sig: signature('aid') },
+  teamTransfer: null,
+  claim: { sig: signature('claim') },
+  notes: [],
+  ...extra,
+}, null, 2);
+const report = (...lines) => `${lines.join('\n')}\n`;
+
+test('the signatures and the key pairs used below are what they claim to be', () => {
+  for (const label of ['a', 'b']) {
+    const text = signature(label);
+    const bytes = base58Decode(text);
+    assert.ok(text.length >= 87 && text.length <= 88, `${text.length} characters`);
+    assert.deepEqual([...bytes], [...signatureBytes(label)], 'the decoder undoes the encoder');
+    assert.equal(hasCanonicalScalar(bytes), true);
+    assert.equal(looksLikeKeypair(bytes), false);
+  }
+  for (const [pair, scalarOk] of [[PAIR_1, false], [PAIR_2, true]]) {
+    const bytes = base58Decode(pair);
+    assert.ok(pair.length >= 86 && pair.length <= 90, `${pair.length} characters`);
+    assert.equal(looksLikeKeypair(bytes), true);
+    assert.equal(hasCanonicalScalar(bytes), scalarOk);
+    for (const at of [0, 31, 32, 47, 63]) { // one changed bit anywhere and it is no longer a seed followed by its own public key
+      const changed = Uint8Array.from(bytes);
+      changed[at] ^= 1;
+      assert.equal(looksLikeKeypair(changed), false, `byte ${at}`);
+    }
+  }
+  // the group order of ed25519 (RFC 8032), spelled in hex here and in decimal above
+  assert.equal(SCALAR_ORDER, BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed'));
+  // the edge of the rule: the largest allowed second half is a signature's, the group order itself is not
+  assert.equal(hasCanonicalScalar(withScalar('edge', SCALAR_ORDER - 1n)), true);
+  assert.equal(hasCanonicalScalar(withScalar('edge', SCALAR_ORDER)), false);
+});
+
+test('a ticket may carry real signatures, as the value of a "sig" key', () => {
+  const sig = signature('tx');
+  const edge = base58Encode(withScalar('edge', SCALAR_ORDER - 1n));
+  assert.deepEqual(scanTree({
+    [TICKET]: ticketJson(),
+    'public/tickets/plein-002.json': ticketJson({ n: 2 }),
+    'public/tickets/index.json': '{"tickets": [{"n": 1, "date": "2026-10-24", "path": "/tickets/plein-001.json"}]}\n',
+    'public/tickets/minified.json': `{"burn":{"sig":"${sig}"}}`,
+    'public/tickets/spaced.json': `{ "burn" : { "sig" : "${sig}" } }`,
+    'public/tickets/edge.json': `{"claim":{"sig":"${edge}"}}`,
+  }), []);
+});
+
+test('a working key pair planted in a ticket is still found: in a "sig" field, another key or a note; and in a report or a draft', () => {
+  const sig = signature('ok');
+  for (const [name, pair] of [['pair 1', PAIR_1], ['pair 2', PAIR_2]]) {
+    const cases = {
+      'a sig field among real ones': [TICKET, ticketJson({ claim: { sig: pair } })],
+      'a minified sig field': ['public/tickets/plein-002.json', `{"slices":[{"sig":"${sig}"}],"claim":{"sig":"${pair}"}}`],
+      'another key of the ticket': [TICKET, ticketJson({ memo: pair })],
+      'a note of the ticket': [TICKET, ticketJson({ notes: [`clé ${pair}`] })],
+      'plain text of a report': [REPORT, report(`la clé est ${pair}`)],
+      'a draft in out/': ['out/plein-001-draft.json', ticketJson({ claim: { sig: pair } })],
+    };
+    for (const [label, [file, text]] of Object.entries(cases)) assert.deepEqual(scanTree({ [file]: text }), [SECRET(file)], `${name}, ${label}`);
+  }
+});
+
+test('a real-looking signature anywhere else is still a hit: other files, drafts, reports, other ticket folders', () => {
+  const sig = signature('elsewhere');
+  const text = `{ "sig": "${sig}" }\n`;
+  const places = [
+    'public/index.html', 'public/live.json', 'README.md', 'docs/lancement.md', 'scripts/ticket-notes.mjs', 'mcp/notes.mjs', 'api/_notes.js',
+    // a draft and a Sunday report are not exempt: a report links /tickets/plein-001.json or shows abcd…wxyz
+    'out/plein-001-draft.json', REPORT, 'docs/releves/2026-10-25.json',
+    // next to the exempt place, but not in it
+    'public/tickets/archive/plein-000.json', 'public/tickets/plein-001.md', 'public/tickets/plein-001.html',
+    'public/tickets-old/plein-001.json', 'public/ticket/plein-001.json', 'public/tickets.json',
+  ];
+  for (const file of places) assert.deepEqual(scanTree({ [file]: text }), [SECRET(file)], file);
+  // and a link to a transaction is a signature in plain text: it is not exempt anywhere
+  const link = `https://solscan.io/tx/${sig}\n`;
+  for (const file of [REPORT, 'README.md', TICKET]) assert.deepEqual(scanTree({ [file]: link }), [SECRET(file)], `${file}, a transaction link`);
+});
+
+test('in a ticket, a signature that is not the value of a "sig" key is still a hit', () => {
+  const sig = signature('misplaced');
+  const cases = {
+    'another key name': ticketJson({ signature: sig }),
+    'the key in capitals': ticketJson({ SIG: sig }),
+    'a note': ticketJson({ notes: [`tx ${sig}`] }),
+    'a Solscan link in a note': ticketJson({ notes: [`https://solscan.io/tx/${sig}`] }),
+    'a list under sig': `{"sig": ["${sig}"]}`,
+    'something after the signature in the value': `{"sig": "${sig}!"}`,
+    'single quotes': `{ 'sig': '${sig}' }`,
+    'bare text': `Signature : ${sig}`,
+  };
+  for (const [label, text] of Object.entries(cases)) assert.deepEqual(scanTree({ [TICKET]: text }), [SECRET(TICKET)], label);
+});
+
+test('a value under "sig" that is not a signature is still a hit: a second half at or above the group order, or not 64 bytes', () => {
+  const high = signatureBytes('high');
+  high[63] = 0xff;
+  const long = Buffer.concat([signatureBytes('long'), Buffer.from([0x11])]);
+  for (const [label, bytes] of [['far above the group order', high], ['equal to the group order', withScalar('edge', SCALAR_ORDER)], ['65 bytes', long]]) {
+    const text = base58Encode(bytes);
+    assert.ok(text.length >= 86 && text.length <= 90, `${label}: ${text.length} characters`);
+    assert.deepEqual(scanTree({ [TICKET]: ticketJson({ claim: { sig: text } }) }), [SECRET(TICKET)], label);
+  }
+});
+
+test('in a ticket, the other key shapes and the signing words are still found', () => {
+  const words = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];
+  const cases = {
+    '64-byte hex secret': 'ab'.repeat(64),
+    '64-number keypair array': JSON.stringify(Array.from({ length: 64 }, (_, i) => i * 3)),
+    '64-byte base64 secret': Buffer.alloc(64, 7).toString('base64'),
+    'seed phrase': words.join(' '),
+  };
+  for (const [label, secret] of Object.entries(cases)) {
+    assert.ok(scanTree({ [TICKET]: ticketJson({ notes: [secret] }) }).includes(`${TICKET}: ${label}`), label);
+  }
+  const call = ['send', 'Transaction'].join('');
+  assert.deepEqual(scanTree({ [TICKET]: ticketJson({ notes: [`appel ${call}`] }) }), [`${TICKET}: sendtransaction`]);
+});
```

**Self-contained, on purpose.** The guard imports `node:` built-ins (`crypto`, `fs`, `os`, `path`, `url`)
and nothing from this repository, as it did before. An earlier version of this proposal imported
`hasCanonicalScalar` and `looksLikeKeypair` from `scripts/ticket.mjs`, which loads `scripts/plein.mjs` and the
site modules `formula.js`, `fees.js`, `mint.js`, `typo.js` and `clock.js` into the guard's process. The
review showed what that costs: a module that ends the process on import, for
example a stray `process.exit(0)` at the top of `scripts/ticket.mjs`, makes the guard report `ok` with its
assertions never run. This was reproduced on the earlier diff in a scratch copy: 9 tests became 1 `ok`,
exit code 0. With the copies, the same edit leaves the guard's 8 tests running and green, and turns
`test/guard-parity.test.mjs` red (its exit handler fails the file when fewer than its 4 tests finish).
The copies are about 75 lines of BigInt arithmetic and a base58 decoder. They are exported only so that the
parity file can compare them. Any change to them is a change to `test/no-signing.test.mjs`, which section 7
tells the founders to look at.

## 4. The new tests

Test 1 is the existing tree scan. Tests 2 to 8 are new and run on temporary folders through
`scan(folder)`, the same function CI runs on the repository. Signatures and secrets are built at run time;
the only literals are the two public RFC 8032 test vectors, kept in halves, as `test/ticket.test.mjs`
already does.

| # | Test | What it shows |
| --- | --- | --- |
| 2 | the signatures and the key pairs used below are what they claim to be | test signatures are 87 or 88 characters, 64 bytes, canonical, not a key pair; both RFC vectors are working key pairs (vector 1 with a second half above the group order, vector 2 below it); one changed bit in any of five bytes and a pair is no longer a key pair; the group order matches its hex spelling; at the edge, the order minus one is allowed and the order itself is not |
| 3 | a ticket may carry real signatures, as the value of a `"sig"` key | a ticket as the printer writes it (16 signature fields, one of them in `adjustments`), a second ticket, `index.json`, minified JSON, spaced JSON, a signature with the largest allowed second half: no hit |
| 4 | a working key pair planted in a ticket is still found | both RFC pairs in 6 places each (a `sig` field among real ones, a minified `sig`, another key, a note, plain text of a report, a draft in `out/`): exactly one hit per file. Pair 2 passes the scalar test, so only the key pair test stops it |
| 5 | a real-looking signature anywhere else is still a hit | 16 paths (`public/index.html`, `public/live.json`, `README.md`, `docs/`, `scripts/`, `mcp/`, `api/`, a draft in `out/`, a report and a `.json` in `docs/releves/`, a nested ticket folder, `public/tickets/x.md` and `x.html`, `public/tickets-old/`, `public/ticket/`, `public/tickets.json`), and a Solscan transaction link in a report, a README and a ticket |
| 6 | in a ticket, a signature that is not the value of a `"sig"` key is still a hit | 8 cases: another key name, the key in capitals, a note, a Solscan link in a note, a list under `sig`, something after the signature in the value, single quotes, bare text |
| 7 | a value under `"sig"` that is not a signature is still a hit | a second half far above the group order, equal to it, and a 65-byte value |
| 8 | in a ticket, the other key shapes and the signing words are still found | 128 hex digits, a 64-number array, 64-byte base64, a 12-word seed phrase, and a signing word |

`test/guard-parity.test.mjs` (4 tests; it also runs the guard's own tests once more, because it imports the
guard) shows that the guard's copies agree with the originals: the decoder against `public/js/mint.js`
on 53 values; `edPublic` and the key pair test on RFC vectors 1 and 2; the scalar and key pair tests on 20
pseudo-random 64-byte values and 5 key pairs made from them; the group order and the edge of the rule.

Mutation check, in a scratch copy: the guard was weakened 24 ways, one at a time, and the guard's tests
re-run. 23 were caught (the number is the test that failed):

- key pair check removed (4); key pair helper forced to false (2, 4); key pair comparison that skips the last
  byte (2); the curve prime changed in the copy (2, 4);
- scalar check removed, alone or with the length test (7); `<` turned into `<=` at the group order (2, 7); the
  order constant off by one (2);
- every file exempt, the extension not required, nested folders exempt, a folder name without its closing
  slash (5);
- any 86 to 90 character run set aside in ticket files (5, 6); any key name counted as `sig` (6); the key name
  case-insensitive (6); the closing quote not required (6); a Solscan link exempt, as in the first version
  of this proposal (5, 6);
- path separators not normalised, or the exemption switched off (3, 8); everything in ticket files skipped
  (4 to 8); only the signing words skipped there (8);
- the decoder changed in the copy (2, 3, 8); the memo always answering yes (4, 7).

One survived: removing only the explicit length test, because the scalar test and the key pair test each
already refuse anything that is not 64 bytes. It stays in the code as written intent.

The same was done to the originals (`scripts/ticket.mjs`, `public/js/mint.js`), to see what the two test
files say: the group order changed by one, the key pair test forced to false, a key pair comparison that skips a
byte, the decoder's leading-ones rule removed. In each case the guard stays at 8 of 8 and the parity file
fails. And with `process.exit(0)` at the top of `scripts/ticket.mjs`: the guard still runs its 8 tests, the
parity file fails.

## 5. Risk, and why it is not a loosening in practice

**What the guard is for.** Keeping a key out of the repository. A signature is public (it is on chain,
on Solscan) and gives nobody any power over anything. The base58 rule reports signatures only because a
key pair file has the same length. The exemption separates the two by what they are, not by how they look.

**Why a signature cannot be a key.** A Solana key pair file is 32 bytes of seed followed by the 32-byte
public key derived from it (the comment above `looksLikeKeypair` in `scripts/ticket.mjs` says the same).
The helper derives the public key from the first half, in plain BigInt arithmetic, and compares. A random
64-byte value, a signature included, is a key pair with probability 2 to the power minus 256. So no
Solana key pair in that format can be set aside, whatever field it is put in. This was checked against
the RFC 8032 vectors and against Node's OpenSSL (both vectors derive the same public half).

**Where the exemption can be reached.** Only a `"sig"` value in a `.json` file directly under
`public/tickets/`. The printer writes `sig` fields and nothing else carries a raw signature:
`normalizeTicket` puts signatures under `sig` only, `validateTicket` rejects unknown keys and refuses 80 or
more base58 characters in `notes` and in the diesel text, and the site builds transaction links at run time.

**Honest statement.** Strictly, the set of texts the guard accepts grows, so on paper this is a loosening.
In practice it grows by signature-shaped values at one kind of position in one folder, and by one other
class of value: a 64-byte secret that is not a seed followed by its public key, whose second half also
happens to be below the group order (about 1 in 16 of random values), written exactly as a `sig` value in
`public/tickets/*.json`. A key pair with a mistyped character is in that class: it is no longer a key pair
for the test, although its first half is still a seed. As far as we know, no Solana tool the team uses writes
such a value. If one were pasted there anyway, three other things stand in the way: a human would have to
paste it by hand into a signature field of a draft, the Saturday routine runs `npm run verify:ticket` before
the ticket is published (it looks every signature up on chain, and a secret does not resolve), and two founders
read the ticket pull request. The printer (`validateTicket`) refuses a `sig` that is a working key pair, but
not this class, which is the point of naming it.

**What the test cannot say.** It checks the shape of a signature (64 bytes, canonical second half, not a key
pair). It cannot check that a signature is valid; only the chain can, and `npm run verify:ticket` asks it.

**Residual risks** (only the first is created by this change):

1. The class above (a 64-byte secret of another format, in a `sig` position, with a canonical-looking second
   half). Accepted by this proposal; the founders should know it exists.
2. Drift. The guard's copies and the printer's originals are two implementations. If someone makes the
   printer stricter or looser, the guard does not follow until the copy is updated; the parity file goes red
   when they disagree, which asks a human to decide. The parity file is a drift alarm, not a part of the
   guard. The guard itself changes only when its own file changes, which the review in section 7 sees.
3. Cost. The key pair derivation takes a few milliseconds per distinct signature, once per run. Measured: one
   ticket of 15 signatures adds 60 ms to the scan, 52 tickets (a year of Saturdays) add 2.1 seconds.
4. Already true today and not changed here: the guard is a tripwire for accidents, as its header says. For
   example, text after `data:` up to the next quote or space is removed before the shapes are tried
   (`DATA_URI`), anywhere in the repository, and a run longer than 90 base58 characters is not a match
   either. Worth a separate, tightening change (not part of this proposal).
5. A signature that is in the right place but wrong (a typo in the last character) passes if its second
   half is still canonical: only the chain can say, and `npm run verify:ticket` does.

**Not covered, on purpose.** Drafts in `out/` (ignored by git, never seen by CI), and any report or post
outside `public/tickets/`. They stay as strict as today. The agent file's condition (1) names `out/` among
the exempt places; this proposal does not exempt it (section 6).

## 6. Against the conditions already written for the reviewer

`.claude/agents/controleur-technique.md` pre-approves one amendment in principle, on four conditions.

| Condition there | This proposal |
| --- | --- |
| (1) exemption covers `public/tickets/*.json` and `out/`, nothing else | **Equal on the first:** `public/tickets/*.json`, directly in the folder, nothing nested. **Stricter on the second:** `out/` is not exempt. It is gitignored and CI never reads it, so exempting it would only spare a local red. The consequences are in section 8. If the founders want `out/*.json` exempt too, that is a separate diff with its own approval line. |
| (2) a base58 run is accepted only as the value of a `"sig"` key, with a canonical scalar and `looksLikeKeypair()` (exported by `scripts/ticket.mjs`) false; every other key shape still fails | **Equal,** with one difference: the key pair test is a **copy** inside the guard rather than an import, so that the guard imports nothing from the repository (section 3). `test/guard-parity.test.mjs` pins the copy to the original. |
| (3) tests: a run-time ticket fixture passes; a working key pair (an RFC 8032 vector) planted in a `sig` field, in another field and in a file outside the places fails | Tests 3, 4 and 5, with two vectors rather than one. |
| (4) signing words and the seed, hex, base64 and number-array shapes untouched | Untouched (test 8, and the diff edits none of those lines). |

`docs/innovations.md` #12 says `public/tickets/**` and also "a `solscan.io/tx/` URL". This proposal is
narrower on both counts, so it sits inside what that line describes.

## 7. What the founders must write to approve it

Each founder pastes the paragraph below on the pull request that applies this diff. GitHub does not count
an author's approval of their own pull request, so the founder whose account opened it (or whose token an
agent used to open it) pastes it as a plain comment, and the other founder pastes it as the text of an
Approve review. If the agents' GitHub App opened the pull request, both founders can approve with a review.
An agent never writes it for them. Quote « never loosen it », as `docs/innovations.md` asks. Pasting this is
enough; it may be in French, as long as it names this file and keeps the quoted words.

What GitHub enforces today: nothing about who approves. `.github/CODEOWNERS` lists one handle, and its header
says to turn on "Require review from Code Owners" only once both founders are listed, because with one
owner a pull request written by that owner could never be approved. Until both handles are in and that
option is on (Tier 2: not yet seen working), a bot's approval or a single founder's approval is not blocked
by GitHub. The control is the two founders' paragraphs, and `lancement`'s preflight is where the
CODEOWNERS line is checked.

```
APPROVED: guard amendment for ticket signatures, as in docs/proposals/guard-signatures.md.
I have read the diff and section 5. In public/tickets/*.json only, test/no-signing.test.mjs will
stop reporting a base58 string that is the value of a "sig" key, when it is 64 bytes with a canonical
second half and not a working key pair. The test checks that shape; it cannot check that a signature
is valid, only the chain can. Nothing else changes, and « never loosen it » still stands: I will
refuse any later change to that file that checks less.
[first name], [date], [pull request link]
```

```
APPROUVÉ : amendement du garde-fou pour les signatures des tickets, tel que dans docs/proposals/guard-signatures.md.
J'ai lu le diff et la section 5. Dans public/tickets/*.json seulement, le test test/no-signing.test.mjs
ne signalera plus une chaîne base58 qui est la valeur d'une clé "sig", quand elle fait 64 octets avec
une seconde moitié canonique et n'est pas une paire de clés qui fonctionne. Le test contrôle cette
forme ; il ne peut pas vérifier qu'une signature est valide, seule la chaîne le peut. Rien d'autre ne
change, et « never loosen it » reste la règle : je refuserai toute modification ultérieure de ce
fichier qui contrôle moins.
[prénom], [date], [lien de la pull request]
```

Before approving, thirty seconds on the pull request: in the code, the diff changes **one existing file**,
`test/no-signing.test.mjs`, and adds **one new file**, `test/guard-parity.test.mjs`; every other file in the
pull request is Markdown or an agent or skill file (section 8) and holds no code; the guard has no `import`
from a relative path (only `node:` modules); the `SIGNATURE_FILE` line names only `public/tickets/` and ends in
`.json`; `SIGNING_WORDS`, `KEY_SHAPES`, `SEED_RUN` and `SEED_COUNTS` are not in the diff; the CI `test` check is
green. If any of those is false, or the diff differs from section 3 in any other way, do not approve: this
approval covers the diff of section 3 and the wording of section 8, and nothing else. Record the decision in
the console's decisions too.

If the founders say no: the first ticket cannot pass the required check. Merging it over a red check
means loosening the rule for everything. The only other way is a ticket that stores its signatures in a
form the guard does not read, which is the same loosening by another door. Not recommended.

## 8. Wording that changes with it

The amendment makes some sentences elsewhere false or misleading. They change in the same pull request,
wording only, no code. Otherwise the plan for Friday and Saturday sends the team to a red check the
amendment does not clear.

| File | Where | Becomes |
| --- | --- | --- |
| `.claude/agents/controleur-technique.md` | the paragraph "The one amendment that is pre-approved in principle" | condition (1): "the exemption covers `public/tickets/*.json` and nothing else; `out/` is gitignored, CI never reads it, and it is not exempt". Condition (2): "`looksLikeKeypair()`" becomes "a copy of `looksLikeKeypair()` kept inside the guard (the guard imports nothing from the repository), pinned to the original by `test/guard-parity.test.mjs`". The sentence that `npm test` "goes red locally as soon as signatures are pasted into `out/`" gains "and stays red while a draft with signatures sits there; the amendment does not change that". |
| `.claude/skills/plein/SKILL.md` | Friday, step 7 (rehearse the ticket against the guard) | add: "Keep the draft outside the scratch copy (`npm run ticket` takes any path) or delete it before `npm test`. A draft with signatures in the copy's `out/` is not exempt and turns the run red even with the amendment merged." |
| `.claude/skills/plein/SKILL.md` | Saturday 19:05, step 1 | replace "though until the guard amendment is merged a local `npm test` flags them there too" with "and the guard amendment does not cover it: a local `npm test` is red while a draft with signatures sits there, and CI never sees it. Once `--write` has written the ticket and its PNG, delete the draft (the ticket is the record) before running `npm test`." |
| `.claude/agents/imprimeur.md` | the bullet "Never write a real signature into a fixture or a doc" | after the merge: "Tickets under `public/tickets/*.json` are the only place a full signature lives, as `sig` values; the guard accepts them there only (64 bytes, canonical second half, not a key pair). Anywhere else, `out/` drafts and Sunday reports included, a full signature still turns `npm test` red. Tests build placeholder signatures at run time. Do not loosen the guard yourself." |
| `docs/objectifs.md` | goal 2.6 | "`out/` skipped" becomes "`out/` not exempt (CI never reads it; a local `npm test` is red while a draft with signatures is there)"; the rest ("`sig` fields of `public/tickets/*.json` only") is already what this proposal does |
| `docs/salle-de-controle.md` | the "one amendment pre-approved in principle" sentence, and the guard rehearsal in the preflight | "(tickets under `public/tickets/` and `out/`, signatures only, …)" becomes "(`sig` values in `public/tickets/*.json`, checked more strictly than today; `out/` is not exempt)"; the rehearsal gains "keep the draft outside the scratch copy" |
| `docs/innovations.md` | #12, the "Thu 22 Guard fix" row | "`public/tickets/**`" becomes "`public/tickets/*.json`"; "under a `sig` key or in a `solscan.io/tx/` URL" becomes "as the value of a `sig` key"; the new cases add "a signature in a Sunday report or in `out/` fails" |
| `.claude/agents/releveur.md` and `.claude/skills/releve/SKILL.md` | the rules, and section 3 (Sunday report) | add: "A report never holds a full signature (the guard refuses it). Link `/tickets/plein-NNN.json`, or use the short form `abcd…wxyz` that the printed ticket uses." |

These are the owners' files; the pull request that applies the amendment carries them, and the founders'
approval covers them (section 7).

## 9. Applying, checking, undoing

```
git switch -c guard-ticket-signatures
# save the diff of section 3 as guard-signatures.diff, outside the repository
git apply --check guard-signatures.diff
git apply guard-signatures.diff
node --test test/no-signing.test.mjs test/guard-parity.test.mjs test/mcp.test.mjs test/ticket.test.mjs
npm test
```

Then make the wording edits of section 8 and open the pull request. `controleur-technique` reviews against
section 6 before the founders look. After the merge, change the status line of this file to "applied", with the
date and the pull request. To undo, revert that pull request: the guard returns to today's behaviour and the next
ticket is red again.

## 10. What was verified, and what was not

Run on 17 October 2026, in scratch copies outside the repository, on Windows with Node 22.

| Check | Result |
| --- | --- |
| `git apply --check` of this diff against the repository working tree (files with Windows line endings, `core.autocrlf` true), re-run once this document was final | applies cleanly; nothing was written |
| The diff extracted from this document, as it is and with the trailing spaces of its blank context lines stripped (what some editors do), each applied to a fresh copy of the repository | applies cleanly in both; the first is byte for byte the diff the tests ran with |
| `node --test test/no-signing.test.mjs` with the diff | 8 of 8 pass (the original tree scan, which reads this document, and the seven new tests) |
| `node --test test/no-signing.test.mjs test/guard-parity.test.mjs` | 20 of 20 pass (the parity file also runs the guard's 8 again) |
| `test/mcp.test.mjs` and `test/ticket.test.mjs`, which read the guard's text and use the printer's helpers, before and after the diff | 98 tests, 97 pass, 1 skipped, 0 fail, both times |
| Full suite on a copy of the working tree as it stood at about 10:10, before and after the diff, `test/automation.test.mjs` left out | before: 515 tests, 485 pass, 28 fail, 2 skipped; after: 534 tests, 504 pass, the same 28 fail, 2 skipped. The 19 new tests all pass. The 28 are other builders' tests in progress (the opening audit and ticket, the workflow files); they fail identically without the diff |
| `test/automation.test.mjs` | left out of both runs: it hung on that tree in a run without the diff (another builder's file), and was stopped |
| Mutation check | 24 weakenings of the guard, 23 caught, 1 redundant (section 4). 5 changes to the printer's helpers and the address decoder: each turns the parity file red and leaves the guard at 8 of 8 |
| Silent exit, on the earlier version of this proposal (the guard imported the printer) | `process.exit(0)` at the top of `scripts/ticket.mjs`: 9 tests became 1 `ok`, exit code 0. On this version: the guard runs 8 of 8, the parity file fails |
| Rehearsal: a ticket written by `writeTicket` (16 signature fields), a Sunday report, a draft in `out/` | ticket alone: today's guard 1 hit, with the proposal 0. A report with a full Solscan transaction link: today 2 hits, with the proposal 1, the report, on purpose. A report with a link to the ticket and the short form: 0. A draft with the ticket's signatures in `out/`: today 2 hits, with the proposal 1, the draft, on purpose. RFC vector 2 pasted into `claim.sig`: 1 hit |
| 300 signatures made by OpenSSL | 300 accepted by the guard's helpers, and the printer's helpers give the same answer on all 300; lengths 87 and 88 |
| 3 000 random 64-byte values | 176 pass the scalar test (5.9 %; 1 in 16 is 6.25 %); the guard's copy and the printer's original agree on all 3 000 |
| RFC vectors 1 and 2 against OpenSSL | both are working key pairs; the second half is above the group order for 1, below it for 2 |
| Cost of the key pair derivation | no tickets: 0 ms; 1 ticket of 15 signatures: 60 ms; 13 tickets: 0.7 s; 52 tickets: 2.1 s |

Not verified (Tier 2): a run on Linux, where CI runs (paths are joined with "/" on both systems, but the
run was on Windows; the mutation of the path separators only matters on Windows); a real mainnet signature
(no network here; the OpenSSL signatures stand in, and ed25519 gives every signature a second half below the
group order); the pull request flow with the branch rule and code-owner review switched on.
