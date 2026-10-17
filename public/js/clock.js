// Paris time for the countdowns. Works in real instants rather than wall-clock arithmetic, so a
// countdown stays right across the summer/winter time change (Sunday 25 October 2026, 03:00).

const parisFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock reading in Paris at a given instant (ms since epoch). */
export function paris(time) {
  const p = Object.fromEntries(parisFormat.formatToParts(new Date(time)).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    h: Number(p.hour), min: Number(p.minute), s: Number(p.second),
    dow: DAYS[p.weekday] ?? 0,
  };
}

/** The instant at which Paris clocks show this date and time (day may overflow the month). */
export function parisInstant(y, m, d, h, min) {
  const target = Date.UTC(y, m - 1, d, h, min);
  let t = target;
  for (let i = 0; i < 2; i += 1) {
    const p = paris(t);
    t -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - target;
  }
  return t;
}

/** Next Saturday 18:00 in Paris strictly after `now`. */
export function nextPleinAt(now) {
  const p = paris(now);
  const days = (6 - p.dow + 7) % 7;
  let at = parisInstant(p.y, p.m, p.d + days, 18, 0);
  if (at <= now) at = parisInstant(p.y, p.m, p.d + days + 7, 18, 0);
  return at;
}

/** 93 784 s → "1J 02:03:04"; under a day → "02:03:04". */
export function formatCountdown(totalSeconds) {
  const total = Math.max(0, Math.round(totalSeconds));
  const z = (n) => String(n).padStart(2, '0');
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}J ` : ''}${z(h)}:${z(m)}:${z(s)}`;
}

/**
 * Where the countdown points once the station is open: the next Saturday 18:00, but never earlier
 * than the first weekly plein. On opening day the evening's 18:00 is not a plein, so the countdown
 * runs to the following Saturday. `firstPleinAt` is an instant in ms; NaN or missing means no floor.
 */
export function countdownTarget(now, firstPleinAt) {
  const next = nextPleinAt(now);
  return Number.isFinite(firstPleinAt) ? Math.max(next, firstPleinAt) : next;
}

/** The last Saturday 18:00 in Paris at or before `now`. */
export function lastPleinAt(now) {
  const p = paris(now);
  const back = (p.dow - 6 + 7) % 7;
  const at = parisInstant(p.y, p.m, p.d - back, 18, 0);
  return at <= now ? at : parisInstant(p.y, p.m, p.d - back - 7, 18, 0);
}

/** Saturday 18:00 to the ticket at 19:05. */
export const PLEIN_WINDOW_MS = 65 * 60 * 1000;

/**
 * { start, end } while a weekly plein is running, otherwise null. Saturdays before the first plein
 * never count, so the state cannot trigger on opening day.
 */
export function pleinInProgress(now, firstPleinAt) {
  const start = lastPleinAt(now);
  if (Number.isFinite(firstPleinAt) && start < firstPleinAt) return null;
  return now < start + PLEIN_WINDOW_MS ? { start, end: start + PLEIN_WINDOW_MS } : null;
}

const whenFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** French wording of an instant in Paris: { weekday: 'samedi', day: '24', month: 'oct.', hm: '18:00' }. */
export function frenchWhen(time) {
  const p = Object.fromEntries(whenFormat.formatToParts(new Date(time)).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, day: p.day, month: p.month, hm: `${p.hour}:${p.minute}` };
}

/** ISO 8601 week of the Paris date of an instant, e.g. "2026-W43". */
export function isoWeek(time) {
  const p = paris(time);
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const weekday = date.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // the Thursday of this week decides the year
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
