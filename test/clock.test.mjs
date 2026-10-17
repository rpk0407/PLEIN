import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countdownTarget, formatCountdown, frenchWhen, isoWeek, lastPleinAt, nextPleinAt, parisInstant, pleinInProgress,
} from '../public/js/clock.js';

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

test('after the opening the countdown runs to the first weekly plein, never to opening evening', () => {
  const first = Date.parse('2026-10-24T18:00:00+02:00');
  const afterOpening = Date.parse('2026-10-17T15:31:00+02:00');
  assert.equal(formatCountdown((countdownTarget(afterOpening, first) - afterOpening) / 1000), '7J 02:29:00');
  const sameEvening = Date.parse('2026-10-17T17:59:00+02:00');
  assert.equal(new Date(countdownTarget(sameEvening, first)).toISOString(), '2026-10-24T16:00:00.000Z');
  // from the first plein on, the plain next Saturday applies
  const sunday = Date.parse('2026-10-25T12:00:00+01:00');
  assert.equal(countdownTarget(sunday, first), nextPleinAt(sunday));
  // no floor configured: plain behaviour
  assert.equal(countdownTarget(afterOpening, NaN), nextPleinAt(afterOpening));
});

test('the last plein and the running-plein window', () => {
  const first = Date.parse('2026-10-24T18:00:00+02:00');
  const at = (iso) => Date.parse(iso);
  assert.equal(new Date(lastPleinAt(at('2026-10-21T10:00:00+02:00'))).toISOString(), '2026-10-17T16:00:00.000Z');
  assert.equal(new Date(lastPleinAt(at('2026-10-24T18:00:00+02:00'))).toISOString(), '2026-10-24T16:00:00.000Z');
  assert.equal(new Date(lastPleinAt(at('2026-10-24T17:59:59+02:00'))).toISOString(), '2026-10-17T16:00:00.000Z');
  assert.equal(new Date(lastPleinAt(at('2026-10-31T19:30:00+01:00'))).toISOString(), '2026-10-31T17:00:00.000Z'); // after the clock change
  // opening day, 18:30: a Saturday 18:00 hour, but not a plein yet
  assert.equal(pleinInProgress(at('2026-10-17T18:30:00+02:00'), first), null);
  assert.equal(pleinInProgress(at('2026-10-17T18:30:00+02:00'), NaN) !== null, true); // without the floor it would trigger
  // 24 October: from 18:00 sharp to 19:05 excluded
  assert.equal(pleinInProgress(at('2026-10-24T17:59:59+02:00'), first), null);
  assert.ok(pleinInProgress(at('2026-10-24T18:00:00+02:00'), first));
  assert.ok(pleinInProgress(at('2026-10-24T19:04:59+02:00'), first));
  assert.equal(pleinInProgress(at('2026-10-24T19:05:00+02:00'), first), null);
  assert.equal(new Date(pleinInProgress(at('2026-10-24T18:10:00+02:00'), first).end).toISOString(), '2026-10-24T17:05:00.000Z');
  // Saturday 31 October is CET, the window moves with it
  assert.ok(pleinInProgress(at('2026-10-31T18:30:00+01:00'), first));
});

test('French wording of an instant in Paris', () => {
  assert.deepEqual(frenchWhen(Date.parse('2026-10-17T15:30:00+02:00')), { weekday: 'samedi', day: '17', month: 'oct.', hm: '15:30' });
  assert.deepEqual(frenchWhen(Date.parse('2026-10-31T17:00:00Z')), { weekday: 'samedi', day: '31', month: 'oct.', hm: '18:00' });
});

test('ISO weeks, in Paris time and across the year end', () => {
  assert.equal(isoWeek(Date.parse('2026-10-17T15:30:00+02:00')), '2026-W42');
  assert.equal(isoWeek(Date.parse('2026-10-24T18:00:00+02:00')), '2026-W43');
  assert.equal(isoWeek(Date.parse('2026-10-26T00:30:00+01:00')), '2026-W44'); // Monday just after midnight Paris
  assert.equal(isoWeek(Date.parse('2026-10-25T23:30:00Z')), '2026-W44'); // Monday 00:30 in Paris, still Sunday in UTC
  assert.equal(isoWeek(Date.parse('2027-01-01T12:00:00+01:00')), '2026-W53'); // 1 Jan 2027 is a Friday
  assert.equal(isoWeek(Date.parse('2024-12-30T12:00:00+01:00')), '2025-W01'); // Monday belonging to next year's week 1
  assert.equal(isoWeek(Date.parse('2026-01-01T12:00:00+01:00')), '2026-W01');
});
