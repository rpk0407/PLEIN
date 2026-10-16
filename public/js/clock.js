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
