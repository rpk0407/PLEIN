import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown, nextPleinAt, parisInstant } from '../public/js/clock.js';

const H = 3600000;

test('Paris wall-clock times map to the right instants in summer and in winter', () => {
  assert.equal(new Date(parisInstant(2026, 10, 17, 18, 0)).toISOString(), '2026-10-17T16:00:00.000Z'); // CEST, UTC+2
  assert.equal(new Date(parisInstant(2026, 10, 31, 18, 0)).toISOString(), '2026-10-31T17:00:00.000Z'); // CET, UTC+1
});

test('the next plein is the coming Saturday 18:00 in Paris', () => {
  const friday = Date.parse('2026-10-16T21:00:00Z'); // Friday 23:00 in Paris
  assert.equal(new Date(nextPleinAt(friday)).toISOString(), '2026-10-17T16:00:00.000Z');
  const saturdayAtSix = Date.parse('2026-10-17T16:00:00Z');
  assert.equal(new Date(nextPleinAt(saturdayAtSix)).toISOString(), '2026-10-24T16:00:00.000Z');
});

test('the countdown across the clock change is real time, not wall-clock time', () => {
  const saturdayNight = Date.parse('2026-10-24T17:00:00Z'); // Saturday 24 Oct, 19:00 in Paris (CEST)
  const next = nextPleinAt(saturdayNight); // Saturday 31 Oct, 18:00 in Paris (CET)
  assert.equal(new Date(next).toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal((next - saturdayNight) / H, 168); // a wall-clock count would say 167
  assert.equal(formatCountdown((next - saturdayNight) / 1000), '7J 00:00:00');
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(93784), '1J 02:03:04');
  assert.equal(formatCountdown(59), '00:00:59');
  assert.equal(formatCountdown(-5), '00:00:00');
});
