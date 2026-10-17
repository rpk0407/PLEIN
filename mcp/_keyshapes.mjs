// The shapes of key material, for text that is about to leave this machine (ops_notify sends to
// Telegram, which keeps what it receives). These are the same shapes test/no-signing.test.mjs looks
// for in the repository; a test in test/mcp.test.mjs fails if the two drift apart. Keep them in step.
//
// A tripwire on shapes, not a proof: it catches the usual formats of a 64-byte secret and a seed
// phrase. Nobody should paste one anywhere, and no tool here asks for one.

const B58 = '1-9A-HJ-NP-Za-km-z';

export const KEY_SHAPES = [
  ['64-byte base58 secret', new RegExp(`(?<![${B58}])[${B58}]{86,90}(?![${B58}])`)],
  ['64-byte hex secret', /(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])/],
  ['64-byte base64 secret', /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{86}==(?![A-Za-z0-9+/=])/],
  ['64-number keypair array', /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/],
];

// Longer runs than the shapes above, refused too: a message has no reason to carry 80 base58
// characters or 64 hex digits (a signature is 87 or 88 characters; a 32-byte key is 64 hex digits).
export const LONG_RUNS = [
  ['long base58 run (a key or a signature)', /[1-9A-HJ-NP-Za-km-z]{80,}/],
  ['long hex run (a key or a hash)', /[0-9a-fA-F]{64,}/],
];

export const SEED_COUNTS = new Set([12, 15, 18, 21, 24]);
// a whole run of 3–8 letter lowercase words, with nothing but punctuation or line ends around it
export const SEED_RUN = /(?:^|[^\p{L}\p{N} ])[ \t]*((?:[a-z]{3,8} ){11,23}[a-z]{3,8})[ \t]*(?=$|[^\p{L}\p{N} ])/gmu;

export function hasSeedPhrase(text) {
  return [...String(text).matchAll(SEED_RUN)].some((m) => SEED_COUNTS.has(m[1].split(' ').length));
}

/** The label of the first key-shaped thing in a text, or null. */
export function keyShapeHit(text) {
  const body = String(text);
  for (const [label, shape] of [...KEY_SHAPES, ...LONG_RUNS]) if (shape.test(body)) return label;
  return hasSeedPhrase(body) ? 'seed phrase (12 to 24 words)' : null;
}
