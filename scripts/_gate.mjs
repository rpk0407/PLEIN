// Which run of a twice-scheduled workflow may go ahead.
//   node scripts/_gate.mjs --hour 8 --until 11:00     prints go=true|false and warn=true|false; the reason goes to stderr
//
// GitHub cron is UTC and knows no time zone, so a job meant for a Paris time has two cron lines,
// one per clock regime (Paris is UTC+2 until Sunday 25 October 2026, UTC+1 after). The gate lets
// through the line whose own UTC time falls in the wanted Paris hour on that day, however late
// GitHub starts it, and only until a cut-off. Looking at the wall clock when the job starts is
// not enough: GitHub delays runs, so in winter a late first line and the second one both look
// right (two posts), and in summer both look late (none).
// The line comes from github.event.schedule, passed in as CRON. Tier 2: GitHub documents that
// context but it has not run here; if it is empty on a scheduled run the gate stays closed and
// says so, and the button is the way to run the job by hand.
// Output: go=true|false and warn=true|false. warn is set when the gate closed for a reason nobody
// planned (a line it cannot read, or a start after the cut-off). The run is green then, so the
// workflow sends the founders a message on warn=true instead of letting a Saturday pass unnoticed.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { paris, parisInstant } from '../public/js/clock.js';

/** { min, hour } of a cron line with a fixed minute and hour, or null. */
export function cronTime(cron) {
  const m = /^\s*(\d{1,2})\s+(\d{1,2})\s+\S+\s+\S+\s+\S+\s*$/.exec(String(cron ?? ''));
  if (!m || Number(m[1]) > 59 || Number(m[2]) > 23) return null;
  return { min: Number(m[1]), hour: Number(m[2]) };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Does this run go ahead? `hour` is the Paris hour the cron line must land in, `until` the Paris
 * cut-off ("11:00") on the same Paris day. A person pressing the button always goes ahead.
 * Returns { go, why, warn } (warn: something unexpected, worth an annotation in the run).
 */
export function decide({ event, cron, now, hour, until }) {
  if (event === 'workflow_dispatch') return { go: true, why: 'started by hand' };
  if (event !== 'schedule') return { go: false, why: `unexpected event "${event ?? ''}"`, warn: true };
  const at = cronTime(cron);
  if (!at) return { go: false, why: `cannot read the schedule line "${cron ?? ''}"; use the button`, warn: true };

  const [uh, um] = String(until).split(':').map(Number);
  if (!(uh >= 0 && uh <= 23 && um >= 0 && um <= 59)) throw new Error('--until must look like 11:00');

  // the instant the line was meant to fire: today's UTC date, or yesterday's if that is in the future
  const day = new Date(now);
  let scheduled = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), at.hour, at.min);
  if (scheduled > now + 5 * 60000) scheduled -= 86400000;
  const p = paris(scheduled);
  if (p.h !== Number(hour)) {
    return { go: false, why: `this line is ${pad(p.h)}:${pad(p.min)} in Paris on that day, not in the ${hour}h hour: the other line owns this clock regime` };
  }
  if (now >= parisInstant(p.y, p.m, p.d, uh, um)) {
    return { go: false, why: `started after the ${pad(uh)}:${pad(um)} cut-off in Paris; use the button`, warn: true };
  }
  return { go: true, why: `the ${pad(p.h)}:${pad(p.min)} Paris line, started in time` };
}

function main() {
  const { values } = parseArgs({
    options: { hour: { type: 'string' }, until: { type: 'string' }, now: { type: 'string' }, cron: { type: 'string' }, event: { type: 'string' } },
  });
  if (values.hour === undefined || values.until === undefined) throw new Error('give --hour and --until');
  const now = values.now ? Date.parse(values.now) : Date.now();
  if (!Number.isFinite(now)) throw new Error('--now is not a date');
  const verdict = decide({
    event: values.event ?? process.env.GITHUB_EVENT_NAME,
    cron: values.cron ?? process.env.CRON,
    now, hour: values.hour, until: values.until,
  });
  console.error(`${verdict.go ? 'go' : `${verdict.warn ? '::warning::' : ''}skipped`}: ${verdict.why}`);
  console.log(`go=${verdict.go}`);
  // a closed gate nobody planned is green in the run, so the workflow turns this into a chat message
  console.log(`warn=${!!verdict.warn}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
