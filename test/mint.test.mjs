import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base58Decode, isSolanaAddress } from '../public/js/mint.js';

test('well-known Solana addresses pass', () => {
  assert.equal(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), true); // USDC mint
  assert.equal(isSolanaAddress('So11111111111111111111111111111111111111112'), true); // wrapped SOL
  assert.equal(isSolanaAddress('11111111111111111111111111111111'), true); // system program
});

test('the system program decodes to 32 zero bytes', () => {
  const bytes = base58Decode('11111111111111111111111111111111');
  assert.equal(bytes.length, 32);
  assert.ok(bytes.every((b) => b === 0));
});

test('anything that is not exactly one address is refused', () => {
  assert.equal(isSolanaAddress(''), false);
  assert.equal(isSolanaAddress(undefined), false);
  assert.equal(isSolanaAddress(' EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), false); // leading space
  assert.equal(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\n'), false); // trailing newline
  assert.equal(isSolanaAddress('0x6B175474E89094C44Da98b954EedeAC495271d0F'), false); // an Ethereum address
  assert.equal(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1vv'), false); // 45 characters
  assert.equal(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDtIv'), false); // capital I is not base58
  assert.equal(isSolanaAddress('https://jup.ag/swap/USDC-PLEIN'), false);
  assert.equal(isSolanaAddress('$PLEIN'), false);
});
