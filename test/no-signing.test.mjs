// The repository's one hard rule, enforced: nothing here holds a key, signs, or broadcasts.
// Visitors sign their own swaps in their own wallet (inside the Jupiter Plugin); the team signs
// the weekly buyback by hand in a multisig. If this test fails, someone added a signing path or
// committed key material. Remove it; do not loosen the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SELF = join('test', 'no-signing.test.mjs');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel']);
const CODE = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.py', '.json', '.yml', '.yaml', '.sh']);
const TEXT = new Set([...CODE, '.md', '.txt', '.ics', '.svg', '.css', '.csv']);

// Assembled from pieces so this file does not match itself.
const j = (...parts) => parts.join('');
const SIGNING_WORDS = [
  j('from', 'SecretKey'), j('from', 'Seed('), j('secret', 'Key'), j('private', 'Key'),
  j('sign', 'Transaction'), j('sign', 'AllTransactions'), j('sign', 'Message'),
  j('send', 'Transaction'), j('send', 'RawTransaction'), j('sendAnd', 'ConfirmTransaction'),
  j('window', '.solana'), j('window', '.phantom'), j('mnemonic', 'ToSeed'),
];
// A 64-byte secret key in base58 is 87 or 88 characters; a keypair file is 64 numbers in brackets.
const BASE58_SECRET = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{86,90}(?![1-9A-HJ-NP-Za-km-z])/;
const KEYPAIR_ARRAY = /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/;
const DATA_URI = /data:[^"')\s]+/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}
const tree = [...walk(root)].map((path) => ({ path, rel: relative(root, path), ext: extname(path).toLowerCase() }));

test('no code in this repository can sign or broadcast a transaction', () => {
  const hits = [];
  for (const { path, rel, ext } of tree) {
    if (rel === SELF || !CODE.has(ext)) continue;
    const text = readFileSync(path, 'utf8');
    for (const word of SIGNING_WORDS) if (text.includes(word)) hits.push(`${rel}: ${word}`);
  }
  assert.deepEqual(hits, []);
});

test('no key material anywhere in the tree', () => {
  const hits = [];
  for (const { path, rel, ext } of tree) {
    if (/keypair|(^|[\\/])id\.json$|\.key$/i.test(rel)) hits.push(`${rel}: key-shaped file name`);
    if (!TEXT.has(ext)) continue;
    const text = readFileSync(path, 'utf8').replace(DATA_URI, '');
    if (BASE58_SECRET.test(text)) hits.push(`${rel}: 64-byte base58 string`);
    if (KEYPAIR_ARRAY.test(text)) hits.push(`${rel}: 64-number keypair array`);
  }
  assert.deepEqual(hits, []);
});
