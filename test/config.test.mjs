// The two hand-edited files: public/config.js (settings) and public/live.json (contract,
// wallets, dashboard). A mistake here reaches every visitor, so the shapes are pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isSolanaAddress } from '../public/js/mint.js';
import { buybackPct } from '../public/js/formula.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('public/config.js'), sandbox);
  return sandbox.window.PLEIN_CONFIG;
}

test('the swap widget can only come from Jupiter, with USDC in and no referral fee', () => {
  const { jupiter } = loadConfig();
  assert.equal(new URL(jupiter.pluginSrc).origin, 'https://plugin.jup.ag');
  assert.equal(jupiter.inputMint, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(jupiter.referralAccount, '');
  assert.equal(jupiter.referralFeeBps, 0);
});

test('the launch time and the official price are usable', () => {
  const c = loadConfig();
  assert.ok(Number.isFinite(Date.parse(c.launchAt)), 'launchAt must parse');
  assert.match(c.launchAt, /[+-]\d\d:\d\d$/, 'launchAt carries its UTC offset');
  assert.ok(c.official.gazole > 1 && c.official.gazole < 4, 'diesel price in a sane band');
  assert.ok(Number.isFinite(buybackPct(c.official.gazole)));
  assert.ok(c.official.weekLabel && c.official.source, 'the week and the source are named');
});

test('live.json only ever holds well-formed public addresses, and honest dashboard values', () => {
  const live = JSON.parse(read('public/live.json'));
  assert.ok(live.contract === '' || isSolanaAddress(live.contract), 'contract is empty or a Solana address');
  for (const [key, address] of Object.entries(live.wallets)) {
    assert.ok(address === '' || isSolanaAddress(address), `wallet ${key} is empty or a Solana address`);
  }
  const d = live.dashboard;
  for (const key of ['reservoirUsdc', 'volume24hUsd', 'burned']) {
    assert.ok(d[key] === null || (Number.isFinite(d[key]) && d[key] >= 0), `${key} is null or a non-negative number`);
  }
  const measured = d.reservoirUsdc !== null || d.volume24hUsd !== null;
  assert.ok(!measured || Number.isFinite(Date.parse(d.asOf)), 'a measured value carries the time of its reading');
  for (const [key, v] of Object.entries(d.voyants)) {
    assert.ok(['ok', 'warn', 'pending'].includes(v.state), `voyant ${key} has a known state`);
  }
});
