// Shape check for Solana addresses: 32 bytes written in base58.
// This is a guard against pasting the wrong kind of thing (a URL, a ticker, an 0x address,
// a stray space), NOT a proof that an address is the right one: Solana addresses carry no
// checksum, so a mistyped but well-formed address still passes. The page only ever shows an
// address that passes this check.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes base58 text into bytes; null if any character is outside the alphabet. */
export function base58Decode(text) {
  const bytes = [];
  for (const ch of text) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; k < text.length && text[k] === '1'; k += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

/** True only for a string that is exactly one base58 address of 32 bytes, nothing around it. */
export function isSolanaAddress(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false;
  const bytes = base58Decode(value);
  return bytes !== null && bytes.length === 32;
}
