// Pre-flights for the scheduled workflows: four small jobs, one file.
//
//   node scripts/_gate.mjs --hour 17 --until 18:30 [--first-plein] [--early-note f.md]
//                          [--skip-if-sent [--sent-note f.md]]
//       Which run of a twice-scheduled workflow may go ahead. Prints go=true|false and warn=true|false
//       (and early=true|false with --first-plein, duplicate=true|false with --skip-if-sent); the
//       reason goes to stderr.
//   node scripts/_gate.mjs --watch-order --alert-file f.txt [--wait 5]
//       The Saturday guard: did the plein workflow send its order to the ops chat? Prints
//       alert=true|false and state=…; the message for the founders goes to the file. Exit 2 when
//       GitHub cannot be read, which the workflow turns into a message too.
//   node scripts/_gate.mjs --require-ops [--require-channel]
//       Fails the step, loudly, when the Telegram secrets a step needs are empty. telegram.mjs is
//       a dry run without them (right on a laptop), which in a workflow is a message nobody gets.
//
// THE GATE. GitHub cron is UTC and knows no time zone, so a job meant for a Paris time has two cron
// lines, one per clock regime (Paris is UTC+2 until Sunday 25 October 2026, UTC+1 after). The gate
// lets through the line whose own UTC time falls in the wanted Paris hour on that day, however late
// GitHub starts it, and only until a cut-off. Looking at the wall clock when the job starts is
// not enough: GitHub delays runs, so in winter a late first line and the second one both look
// right (two posts), and in summer both look late (none).
// The line comes from github.event.schedule, passed in as CRON. Tier 2: GitHub documents that
// context but it has not run here; if it is empty on a scheduled run the gate stays closed and
// says so, and the button is the way to run the job by hand.
// With --first-plein the gate also reads firstPleinAt from public/config.js: a scheduled line that
// fires before the price freeze of the first plein (15 minutes before it, 17:45) stays closed, so
// no order is built a week early. Quietly when the first plein is within the next eight days (a
// planned wait); with a warning when it is further, which looks like a wrong date in config.js. A
// press of the button always goes ahead and, before that freeze, says it is early.
// Output: go=true|false and warn=true|false. warn is set when the gate closed for a reason nobody
// planned (a line it cannot read, a start after the cut-off, a first-plein date it cannot read). The
// run is green then, so the workflow sends the founders a message on warn=true instead of letting a
// Saturday pass unnoticed.
//
// THE GUARD. GitHub drops or delays scheduled runs, and a dropped run is green by absence: nothing
// fails, nobody is told. A second schedule line, a few minutes after the order is due, asks the
// Actions API whether a plein run since the price freeze sent its order, waits a little for one
// that is running or has not shown up yet (GitHub often starts a scheduled run minutes late), and
// writes the alert when none did. It reads with the job's own token (actions: read), from the
// environment only.
//
// THE DUPLICATE CHECK. The guard cannot tell a dropped run from a late one, and a founder who
// presses the button on its alert may find the scheduled run arriving behind them (the order gate is
// open until 18:30). With --skip-if-sent the order job asks the same question before it builds
// anything: a scheduled run that finds an order already sent since the week's fees arrived (17:50)
// stops, quietly, and a press of the button goes ahead with a note on top (a person pressing it
// twice means it: a corrected price, say). A read that fails or takes too long never stops the
// order: it goes ahead with a warning.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { paris, parisInstant } from '../public/js/clock.js';
import { typo } from '../public/js/typo.js';

const CONFIG_PATH = fileURLToPath(new URL('../public/config.js', import.meta.url));
const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 86400000;

// ---- the gate ------------------------------------------------------------------------------

/** The price freezes this long before the plein starts (17:45 for an 18:00 plein). */
export const FREEZE_LEAD_MS = 15 * 60000;
/** A line that fires this many days or less before the freeze of the first plein is a planned wait. */
export const QUIET_DAYS = 8;

/** { min, hour } of a cron line with a fixed minute and hour, or null. */
export function cronTime(cron) {
  const m = /^\s*(\d{1,2})\s+(\d{1,2})\s+\S+\s+\S+\s+\S+\s*$/.exec(String(cron ?? ''));
  if (!m || Number(m[1]) > 59 || Number(m[2]) > 23) return null;
  return { min: Number(m[1]), hour: Number(m[2]) };
}

/** firstPleinAt from the text of public/config.js, as an instant in ms, or null when it cannot be read. */
export function firstPleinFromConfig(source) {
  try {
    const sandbox = { window: {} };
    runInNewContext(String(source), sandbox, { timeout: 1000 });
    const at = Date.parse(sandbox.window.PLEIN_CONFIG?.firstPleinAt);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Saturday 24 October 2026, 18:00 Paris" */
export function when(ms) {
  const p = paris(ms);
  return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${pad(p.h)}:${pad(p.min)} Paris`;
}

/** The line put in front of an order that was started by hand before the first plein. */
export function earlyNote(firstPlein) {
  return `**NOTE: this order was started early, by hand.** The first plein is ${when(firstPlein)} (\`firstPleinAt\` in public/config.js). `
    + 'Treat what follows as a preview: the balance, the price and the quotes will change before then.\n\n';
}

/**
 * Does this run go ahead? `hour` is the Paris hour the cron line must land in, `until` the Paris
 * cut-off ("11:00") on the same Paris day. A person pressing the button always goes ahead.
 * `firstPlein` (ms) is asked for only by the plein workflow: undefined means no floor, null means
 * the date could not be read. Returns { go, why, warn, early } (warn: something unexpected, worth an
 * annotation in the run and a message; early: only with a first-plein date).
 */
export function decide({ event, cron, now, hour, until, firstPlein }) {
  const asked = firstPlein !== undefined;
  const floor = Number.isFinite(firstPlein) ? firstPlein - FREEZE_LEAD_MS : null;
  if (event === 'workflow_dispatch') {
    if (asked && floor !== null && now < floor) {
      return { go: true, why: `started by hand, before the first plein (${when(firstPlein)})`, early: true };
    }
    return asked ? { go: true, why: 'started by hand', early: false } : { go: true, why: 'started by hand' };
  }
  if (event !== 'schedule') return { go: false, why: `unexpected event "${event ?? ''}"`, warn: true };
  const at = cronTime(cron);
  if (!at) return { go: false, why: `cannot read the schedule line "${cron ?? ''}"; use the button`, warn: true };

  const [uh, um] = String(until).split(':').map(Number);
  if (!(uh >= 0 && uh <= 23 && um >= 0 && um <= 59)) throw new Error('--until must look like 11:00');

  // the instant the line was meant to fire: today's UTC date, or yesterday's if that is in the future
  const day = new Date(now);
  let scheduled = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), at.hour, at.min);
  if (scheduled > now + 5 * 60000) scheduled -= DAY_MS;
  const p = paris(scheduled);
  if (p.h !== Number(hour)) {
    return { go: false, why: `this line is ${pad(p.h)}:${pad(p.min)} in Paris on that day, not in the ${hour}h hour: the other line owns this clock regime` };
  }
  if (asked) {
    if (floor === null) return { go: false, why: 'cannot read firstPleinAt from public/config.js; use the button', warn: true, early: false };
    if (scheduled < floor) {
      const far = (floor - scheduled) / DAY_MS > QUIET_DAYS;
      return {
        go: false,
        early: false,
        why: far
          ? `the first plein is ${when(firstPlein)}, more than ${QUIET_DAYS} days after this line: check firstPleinAt in public/config.js`
          : `no plein yet: the first one is ${when(firstPlein)}, and this line fires before its price freeze`,
        ...(far ? { warn: true } : {}),
      };
    }
  }
  if (now >= parisInstant(p.y, p.m, p.d, uh, um)) {
    return { go: false, why: `started after the ${pad(uh)}:${pad(um)} cut-off in Paris; use the button`, warn: true, ...(asked ? { early: false } : {}) };
  }
  return { go: true, why: `the ${pad(p.h)}:${pad(p.min)} Paris line, started in time`, ...(asked ? { early: false } : {}) };
}

// ---- the guard -----------------------------------------------------------------------------

/** The workflow, the job and the step whose success means "the order reached the ops chat". */
export const ORDER_WORKFLOW = 'plein.yml';
export const ORDER_JOB = 'plein';
export const ORDER_STEP = 'Send it to the founders';
const API_VERSION = '2022-11-28';

/**
 * What one run of the plein workflow did, from the jobs the Actions API lists for it:
 * 'sent' (the send step succeeded), 'running' (not finished, or not started), 'failed' (the order job
 * failed, was cancelled or timed out without sending) or 'idle' (nothing to do: the gate was closed,
 * or the order job was skipped, as it is in the run of the guard itself).
 */
export function orderOfRun(run, jobs) {
  const job = (jobs ?? []).find((j) => j?.name === ORDER_JOB);
  if (!job) return run?.status === 'completed' ? 'idle' : 'running';
  const step = (job.steps ?? []).find((s) => s?.name === ORDER_STEP);
  if (step?.conclusion === 'success') return 'sent';
  if (job.status !== 'completed') return 'running';
  return ['failure', 'cancelled', 'timed_out'].includes(job.conclusion) ? 'failed' : 'idle';
}

/** When the send step of a run finished (ms), or the run's start when the API gives no step time. */
export function sentAtOf(run, jobs) {
  const step = (jobs ?? []).find((j) => j?.name === ORDER_JOB)?.steps?.find((s) => s?.name === ORDER_STEP);
  const done = Date.parse(step?.completed_at);
  return Number.isFinite(done) ? done : Date.parse(run?.created_at);
}

const todayAt = (ms, h, min) => { const p = paris(ms); return parisInstant(p.y, p.m, p.d, h, min); };
/** 17:45 Paris on the Paris day of `ms`: the price freeze, before which no run counts as today's order. */
export const freezeOf = (ms) => todayAt(ms, 17, 45);
/**
 * 17:50 Paris on the Paris day of `ms`: the week's fees have reached the réservoir. The duplicate check
 * counts only orders created from then on: an order pressed between the freeze and the fees (a preview)
 * read a balance without them and must not stop the scheduled one.
 */
export const feesOf = (ms) => todayAt(ms, 17, 50);

/**
 * Judge the runs of the plein workflow created since `since` (ms), the guard's own run excluded.
 * `jobsByRun` maps a run id to its jobs. state: 'sent' if any run sent the order, else 'running' if
 * one may still, else 'failed' if one broke, else 'missing' (no run, or only idle ones). `culprit` is
 * the latest run in that state; for 'sent', `sentAt` is when its send step finished.
 */
export function judgeOrder({ runs, jobsByRun, since, selfId }) {
  const seen = (runs ?? [])
    .filter((r) => r && String(r.id) !== String(selfId) && Date.parse(r.created_at) >= since)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((run) => ({ run, state: orderOfRun(run, jobsByRun.get(String(run.id))) }));
  const has = (s) => seen.some((x) => x.state === s);
  const state = has('sent') ? 'sent' : has('running') ? 'running' : has('failed') ? 'failed' : 'missing';
  const culprit = seen.find((x) => x.state === state)?.run ?? null;
  const sentAt = state === 'sent' ? sentAtOf(culprit, jobsByRun.get(String(culprit.id))) : null;
  return { state, seen, culprit, sentAt };
}

/** The message for the ops chat when no order arrived. French, typeset, no link but the logs. */
export function orderAlertText({ state, now, runUrl, culpritUrl }) {
  const p = paris(now);
  const at = `${pad(p.h)}:${pad(p.min)}`;
  const log = culpritUrl ? ` Son journal : ${culpritUrl}.` : '';
  const head = {
    missing: `Aucun ordre d'achat n'est arrivé à ${at} et le job plein n'a pas tourné. GitHub a peut-être sauté la planification.`,
    failed: `Le job plein a échoué ou a été interrompu, l'ordre d'achat n'est pas arrivé (${at}).${log}`,
    running: `Le job plein tourne encore à ${at} et l'ordre d'achat n'est pas arrivé.${log}`,
  }[state] ?? `L'ordre d'achat n'est pas arrivé à ${at}.`;
  const byHand = 'le bouton plein (Actions, plein, Run workflow), en donnant le réservoir à la main si la lecture de la chaîne échoue';
  // A job that is running is already working on the order: a second one from the button would be two
  // orders against the same réservoir, so the button is only for when it fails.
  const how = state === 'running'
    ? `À faire : attendre la fin du job en suivant son journal, sans presser le bouton plein. S'il échoue, presser alors ${byHand}. Un seul ordre à exécuter.`
    : `À faire : presser ${byHand}, ou lancer « npm run plein -- --from-chain --markdown » sur un ordinateur. Les tranches commencent à 18:00.`
      + (state === 'missing' ? ' Si le job planifié démarre en retard, il s\'arrête de lui-même quand un ordre est déjà parti : un seul ordre à exécuter.' : '');
  return typo(`${head}\n${how}${runUrl ? `\nJournal de la garde : ${runUrl}` : ''}`);
}

async function getJson(fetchImpl, url, token) {
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': API_VERSION, authorization: `Bearer ${token}`, 'user-agent': 'station-plein-garde' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`GitHub unreachable: ${String(error?.message ?? error).split(token).join('***')}`);
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}

/**
 * One look at the Actions API: the runs of the plein workflow since the freeze, and for each one its
 * jobs. `env` carries GH_TOKEN (the job's own, actions: read), GITHUB_REPOSITORY, GITHUB_RUN_ID and
 * GITHUB_API_URL; nothing else is read and nothing is written to GitHub.
 */
export async function lookAtOrders({ fetch: fetchImpl = globalThis.fetch, env = process.env, since }) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  const repo = env.GITHUB_REPOSITORY || '';
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  if (!token) throw new Error('no GH_TOKEN in the environment');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is not owner/name');
  // the token only ever goes to https, or to this machine (the tests run a fake of the API on 127.0.0.1)
  if (!/^https:\/\//.test(api) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(api)) throw new Error('GITHUB_API_URL is not https');
  const list = await getJson(fetchImpl, `${api}/repos/${repo}/actions/workflows/${ORDER_WORKFLOW}/runs?per_page=30`, token);
  const runs = Array.isArray(list?.workflow_runs) ? list.workflow_runs : null;
  if (!runs) throw new Error('GitHub sent no list of workflow runs');
  const jobsByRun = new Map();
  for (const run of runs) {
    if (String(run?.id) === String(env.GITHUB_RUN_ID) || !(Date.parse(run?.created_at) >= since)) continue;
    const jobs = await getJson(fetchImpl, `${api}/repos/${repo}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=30`, token);
    jobsByRun.set(String(run.id), Array.isArray(jobs?.jobs) ? jobs.jobs : []);
  }
  return judgeOrder({ runs, jobsByRun, since, selfId: env.GITHUB_RUN_ID });
}

/**
 * Did the order go out since 17:45 Paris today? A run in progress is waited for, up to `waitMs`, and
 * so is the absence of any run: GitHub often starts a scheduled run minutes late, and an alert that
 * sends a founder to the button while that run is on its way makes two orders. A run that already
 * failed does not wait: its own notice has gone out and the founders need the way out now. Returns
 * { alert, state, text }. Throws when GitHub cannot be read: the caller must treat that as
 * "unknown", never as "fine".
 */
export async function watchOrder({
  fetch: fetchImpl = globalThis.fetch, env = process.env, clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), waitMs = 5 * 60000, pollMs = 30000,
} = {}) {
  const started = clock();
  const since = freezeOf(started);
  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  for (;;) {
    const verdict = await lookAtOrders({ fetch: fetchImpl, env, since });
    const maybeComing = verdict.state === 'running' || verdict.state === 'missing';
    if (maybeComing && clock() - started < waitMs) { await sleep(pollMs); continue; }
    if (verdict.state === 'sent') return { alert: false, state: 'sent', text: '' };
    const text = orderAlertText({ state: verdict.state, now: clock(), runUrl, culpritUrl: verdict.culprit?.html_url ?? '' });
    return { alert: true, state: verdict.state, text };
  }
}

// ---- the duplicate check -------------------------------------------------------------------

/** Longest the order job spends asking GitHub whether an order already went out. */
export const DUPLICATE_CHECK_MS = 30000;

/** The line put in front of an order started by hand when one already went out since the freeze. */
export function sentNote({ at, url }) {
  const p = paris(at);
  const link = /^https:\/\/\S+$/.test(url ?? '') ? ` (${url})` : '';
  return `**NOTE: an order was already sent today, at ${pad(p.h)}:${pad(p.min)} Paris${link}.** `
    + 'Execute only one order: this one if it replaces the other (a corrected price, or a réservoir given by hand), otherwise the first. '
    + 'The first may already be spending the réservoir.\n\n';
}

/**
 * The duplicate rule for the order job. `sent` is what lookAtOrders saw (null when GitHub could not be
 * read, which never stops an order). A scheduled run that finds an order already sent stops: it is a
 * late line arriving behind a press of the button. A press of the button goes ahead whatever it finds
 * and carries a note. Returns the verdict with `duplicate` added, and `sentNote` for a press.
 */
export function afterOrders({ verdict, event, sent }) {
  if (!verdict.go || sent?.state !== 'sent') return { ...verdict, duplicate: false };
  const at = Number.isFinite(sent.sentAt) ? sent.sentAt : Date.parse(sent.culprit?.created_at);
  const url = sent.culprit?.html_url ?? '';
  const known = Number.isFinite(at);
  const p = known ? paris(at) : null;
  const hhmm = known ? `${pad(p.h)}:${pad(p.min)} Paris` : 'at an unknown time';
  if (event === 'schedule') {
    return { ...verdict, go: false, duplicate: true, why: `an order was already sent today (${hhmm}${url ? `, ${url}` : ''}); this scheduled run stops` };
  }
  return { ...verdict, duplicate: true, why: `${verdict.why}; an order was already sent today (${hhmm})`, ...(known ? { sentNote: sentNote({ at, url }) } : {}) };
}

function withDeadline(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`GitHub did not answer within ${ms / 1000} seconds`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** One bounded look for an order already sent. Never throws: { sent, error } with sent null on error. */
export async function lookForSent({ fetch: fetchImpl = globalThis.fetch, env = process.env, since, deadlineMs = DUPLICATE_CHECK_MS }) {
  try {
    return { sent: await withDeadline(lookAtOrders({ fetch: fetchImpl, env, since }), deadlineMs), error: '' };
  } catch (error) {
    return { sent: null, error: String(error?.message ?? error) };
  }
}

// ---- the secrets check ---------------------------------------------------------------------

/** Names of the Telegram secrets a step needs that are empty. */
export function missingTelegram(env, { channel = false } = {}) {
  const need = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_OPS_CHAT_ID', ...(channel ? ['TELEGRAM_CHANNEL_ID'] : [])];
  return need.filter((name) => !String(env?.[name] ?? '').trim());
}

// ---- command line --------------------------------------------------------------------------

async function gateMain(values) {
  if (values.hour === undefined || values.until === undefined) throw new Error('give --hour and --until');
  const now = values.now ? Date.parse(values.now) : Date.now();
  if (!Number.isFinite(now)) throw new Error('--now is not a date');
  const asked = !!values['first-plein'];
  const event = values.event ?? process.env.GITHUB_EVENT_NAME;
  let firstPlein;
  if (asked) {
    try { firstPlein = firstPleinFromConfig(readFileSync(values.config ?? CONFIG_PATH, 'utf8')); } catch { firstPlein = null; }
  }
  let verdict = decide({
    event,
    cron: values.cron ?? process.env.CRON,
    now, hour: values.hour, until: values.until, firstPlein,
  });
  // the duplicate check runs only for a run that would go ahead; it can close the gate (a late scheduled
  // run behind an order already sent) but never because GitHub could not be read
  if (verdict.go && values['skip-if-sent']) {
    const { sent, error } = await lookForSent({ since: feesOf(now) });
    if (error) console.error(`::warning title=Duplicate check::could not tell whether an order was already sent (${error}); going ahead`);
    verdict = afterOrders({ verdict, event, sent });
    if (verdict.duplicate && verdict.go) console.error('::warning title=Order already sent::an order was already sent today; execute only one');
  }
  console.error(`${verdict.go ? 'go' : `${verdict.warn ? '::warning::' : ''}skipped`}: ${verdict.why}`);
  if (verdict.early) console.error('::warning title=Early plein::this order is started before the first plein; it is a preview, not Saturday\'s order');
  console.log(`go=${verdict.go}`);
  // a closed gate nobody planned is green in the run, so the workflow turns this into a chat message
  console.log(`warn=${!!verdict.warn}`);
  if (asked) {
    console.log(`early=${!!verdict.early}`);
    if (verdict.early && values['early-note']) writeFileSync(values['early-note'], earlyNote(firstPlein));
  }
  if (values['skip-if-sent']) {
    console.log(`duplicate=${!!verdict.duplicate}`);
    if (verdict.sentNote && values['sent-note']) writeFileSync(values['sent-note'], verdict.sentNote);
  }
}

async function watchMain(values) {
  if (!values['alert-file']) throw new Error('give --alert-file');
  const minutes = values.wait === undefined ? 5 : Number(values.wait);
  if (!(minutes >= 0 && minutes <= 8)) throw new Error('--wait is a number of minutes from 0 to 8');
  const verdict = await watchOrder({ waitMs: minutes * 60000 });
  console.error(verdict.alert ? `::warning title=No order::${verdict.state}` : 'the order was sent');
  if (verdict.alert) writeFileSync(values['alert-file'], `${verdict.text}\n`);
  console.log(`alert=${verdict.alert}`);
  console.log(`state=${verdict.state}`);
}

function requireMain(values) {
  const missing = missingTelegram(process.env, { channel: !!values['require-channel'] });
  if (missing.length) {
    console.log(`::error title=Telegram secrets missing::${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} empty, so nothing can reach the founders. `
      + 'Add them under Settings, Secrets and variables, Actions. The report is in the job summary.');
    process.exitCode = 1;
    return;
  }
  console.log('telegram secrets present');
}

async function main() {
  const { values } = parseArgs({
    options: {
      hour: { type: 'string' }, until: { type: 'string' }, now: { type: 'string' }, cron: { type: 'string' }, event: { type: 'string' },
      'first-plein': { type: 'boolean' }, config: { type: 'string' }, 'early-note': { type: 'string' },
      'skip-if-sent': { type: 'boolean' }, 'sent-note': { type: 'string' },
      'watch-order': { type: 'boolean' }, 'alert-file': { type: 'string' }, wait: { type: 'string' },
      'require-ops': { type: 'boolean' }, 'require-channel': { type: 'boolean' },
    },
  });
  if (values['require-ops']) return requireMain(values);
  if (values['watch-order']) return watchMain(values);
  return gateMain(values);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(exitCodeOf(error));
  });
}

/** Exit 2 for "GitHub could not be read" (the guard's step), 1 for a bad command line. */
function exitCodeOf(error) {
  return /GitHub|GH_TOKEN|GITHUB_/.test(error.message) ? 2 : 1;
}
