// The repository's one hard rule, enforced: nothing here holds a key, signs, or broadcasts.
// Visitors sign their own swaps in their own wallet (inside the Jupiter Plugin); the team signs
// the weekly buyback by hand in a multisig. If this test fails, someone added a signing path or
// committed key material. Remove it; do not loosen the test.
//
// It is a tripwire, not a proof: it catches the usual names and shapes, and code review still
// has to read anything that touches a wallet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SELF = join('test', 'no-signing.test.mjs');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.gz']);
const PROSE = new Set(['.md', '.txt']); // prose may talk about keys; it is still scanned for key material

// Matched against code with case and every non-alphanumeric character removed, so that
// signAndSendTransaction, send_transaction, "spl-token burn" and "solana transfer" all match.
const SIGNING_WORDS = [
  'signtransaction', 'signalltransactions', 'signmessage', 'signedtransaction',
  'sendtransaction', 'sendrawtransaction', 'sendencodedtransaction', 'sendandconfirm', 'sendbundle',
  'secretkey', 'privatekey', 'createprivatekey', 'fromsecretkey', 'fromseed', 'mnemonictoseed',
  'frombase58string', 'keypairgenerate', 'createkeypairsignerfrombytes', 'solanakeygen',
  'proposalapprove', 'proposalexecute', 'vaulttransactionexecute',
  'spltokenburn', 'spltokentransfer', 'solanatransfer',
  'windowsolana', 'windowphantom', 'windowbackpack', 'windowsolflare',
  'anchorproviderenv', 'anchorwallet', 'nodewallet',
];
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// Key material, in any text file: a 64-byte secret as base58 (87–88 chars), hex (128) or
// base64 (88 with padding), a keypair file (64 numbers), or a 12–24 word seed phrase.
const B58 = '1-9A-HJ-NP-Za-km-z';
const KEY_SHAPES = [
  ['64-byte base58 secret', new RegExp(`(?<![${B58}])[${B58}]{86,90}(?![${B58}])`)],
  ['64-byte hex secret', /(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])/],
  ['64-byte base64 secret', /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{86}==(?![A-Za-z0-9+/=])/],
  ['64-number keypair array', /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/],
];
const SEED_COUNTS = new Set([12, 15, 18, 21, 24]);
// a whole run of 3–8 letter lowercase words, with nothing but punctuation or line ends around it
const SEED_RUN = /(?:^|[^\p{L}\p{N} ])[ \t]*((?:[a-z]{3,8} ){11,23}[a-z]{3,8})[ \t]*(?=$|[^\p{L}\p{N} ])/gmu;
const DATA_URI = /data:[^"')\s]+/g;

function hasSeedPhrase(text) {
  return [...text.matchAll(SEED_RUN)].some((m) => SEED_COUNTS.has(m[1].split(' ').length));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
export function scan(base = root) {
  const hits = [];
  for (const path of walk(base)) {
    const rel = relative(base, path);
    const ext = extname(path).toLowerCase();
    if (rel === SELF) continue;
    if (/keypair|(^|[\\/])id\.json$|\.key$|\.pem$/i.test(rel)) hits.push(`${rel}: key-shaped file name`);
    if (BINARY.has(ext)) continue;
    const text = readFileSync(path, 'utf8');
    if (!PROSE.has(ext)) {
      const flat = normalize(text);
      for (const word of SIGNING_WORDS) if (flat.includes(word)) hits.push(`${rel}: ${word}`);
    }
    const bare = text.replace(DATA_URI, '');
    for (const [label, shape] of KEY_SHAPES) if (shape.test(bare)) hits.push(`${rel}: ${label}`);
    if (hasSeedPhrase(bare)) hits.push(`${rel}: seed phrase`);
  }
  return hits;
}

test('no code can sign or send a transaction, and no key material is in the tree', () => {
  assert.deepEqual(scan(), []);
});
