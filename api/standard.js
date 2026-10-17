// POST /api/standard: the Telegram bot's webhook, "le standard" (the switchboard), and the way back.
//
// Going out. A founder types a command in the private ops group; Telegram posts the update here;
// this function checks who is talking and forwards the order to GitHub as a `repository_dispatch`
// (event_type "station-order"). The workflow .github/workflows/standard.yml picks it up and runs
// Claude Code as the named agent. This file never calls Claude, never touches a wallet and never
// holds a Solana key. It acknowledges the founder in the HTTP response itself (the webhook reply
// method), which needs no bot token.
//
// Coming back. When the run ends, the workflow POSTs the outcome here, with a proof that this
// function put in the dispatch: header X-Station-Report-Mac, an HMAC of the order's message id, the
// ops chat and an expiry, keyed by TELEGRAM_WEBHOOK_SECRET. This function checks the proof,
// composes the message from fixed words plus the agent's answer (every link that is not github.com,
// solscan.io or the site itself is removed) and posts it to the ops group with the ops bot's token.
// That token (TELEGRAM_OPS_BOT_TOKEN) lives in Vercel only: the GitHub job that runs Claude holds
// no Telegram secret at all, because code that job runs can be steered by a page the agent read.
// A proof is worth a few messages in the private group until it expires, nothing more.
//
// What it accepts, in this order (anything else is answered 200 and ignored, silently):
//   1. POST, with the header X-Telegram-Bot-Api-Secret-Token equal to TELEGRAM_WEBHOOK_SECRET
//      (compared in constant time). Missing env: 503. Wrong header: 401.
//   2. A plain `message` whose sender is in FOUNDER_TELEGRAM_IDS (comma-separated numeric ids) and
//      whose chat is TELEGRAM_OPS_CHAT_ID. Not a bot, not forwarded.
//   3. A command: /agent <name> <task>, /faire <task>, /releve, /audit, /etat (and /aide).
// A request with the X-Station-Report-Mac header is a report from the workflow instead (see above).
//
// Env (Vercel, Production): TELEGRAM_WEBHOOK_SECRET, FOUNDER_TELEGRAM_IDS, TELEGRAM_OPS_CHAT_ID,
// TELEGRAM_OPS_BOT_TOKEN, GITHUB_DISPATCH_TOKEN, GITHUB_REPO ("owner/name"). Setup: docs/telegram.md.
//
// GitHub side, read on 17 October 2026 (docs.github.com, REST "Create a repository dispatch
// event"): POST /repos/{owner}/{repo}/dispatches, 204 on success; event_type up to 100
// characters; client_payload an object of at most 10 top-level properties and under 64 KB; a
// fine-grained token needs the repository permission "Contents: write" and nothing else.
// Telegram side (core.telegram.org/bots/api, setWebhook): secret_token 1 to 256 characters of
// A-Z a-z 0-9 _ -, sent back in X-Telegram-Bot-Api-Secret-Token; a non-2xx answer is retried,
// so every authenticated request is answered 200, even when the dispatch failed.
// Tier 2: not run against the live Bot API or GitHub yet (no bot exists before the founders
// create one with @BotFather); the tests stub both.
//
// The rest of this file is the workflow's half of the contract (readOrder, orderPrompt,
// resultFromExecution, readReportRoute, buildReportBody, postReport on the runner; parseReportBody
// and composeReport here on Vercel), kept in one module so one test file pins both ends of the order.
// Telegram side of the way back, read 17 October 2026: sendMessage takes chat_id, reply_parameters
// and link_preview_options (core.telegram.org/bots/api; the field is_disabled inside the last is
// Tier 2, not read); a bot in a group in privacy mode is sent a bare command only if it spoke
// last (core.telegram.org/bots/features), hence the first test command in docs/telegram.md.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const NB = ' '; // non-breaking space (French typography before : ; ! ? and inside « »)

/** The station's agents: .claude/agents/*.md. A test pins this list to that directory. */
export const AGENTS = [
  'atelier-idees', 'automaticien', 'carrossier', 'chef-de-station', 'controleur-technique',
  'critique-degen', 'economiste', 'enqueteur', 'imprimeur', 'ligne-continue', 'mecano-chaine',
  'pompiste', 'releveur', 'tresorier', 'vigie',
];
export const DEFAULT_AGENT = 'chef-de-station';
export const EVENT_TYPE = 'station-order';
export const COMMANDS = ['agent', 'faire', 'releve', 'audit', 'etat', 'aide'];

export const MAX_TEXT = 2000;             // code points kept from an order (Telegram allows 4 096)
export const CUT_MARK = ' […]';
export const MAX_BODY_BYTES = 65536;      // a Telegram update is a few KB
export const DISPATCH_TIMEOUT_MS = 6000;  // Telegram waits for our answer; GitHub answers in under a second
export const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 }; // per founder, per instance
export const SEEN_MS = 60 * 60 * 1000;    // how long a redelivered update_id is recognised
export const MAX_REPORT = 3200;           // characters of the agent's answer sent back (Telegram: 4 096)
export const REPORT_HEADER = 'x-station-report-mac';
export const REPORT_PATH = '/api/standard';
export const REPORT_WINDOW_S = 2 * 60 * 60; // how long after the order a report is still accepted
export const REPORT_MAX_PER_ORDER = 3;    // delivered reports per order and instance (a brake, not a wall)
export const CLAUDE_STEP_MINUTES = 23;    // standard.yml gives the Claude step this much (a test pins it)
export const LINK_REMOVED = '[lien retiré]';
/** Hosts whose links may stay in a report, besides the site itself (www. and other subdomains too). */
export const LINK_HOSTS = ['github.com', 'solscan.io'];

/** What the shortcut commands ask, in English because it is the agent's brief. */
export const SHORTCUTS = {
  releve: {
    agent: 'releveur',
    text: 'Take one reading now, following the releve skill: npm run releve -- --json and npm run prix -- --json, then compare with public/live.json and public/config.js. Report each figure with its asOf, say which ones are null, and propose any live.json light change with its evidence. Change no file.',
  },
  audit: {
    agent: 'releveur',
    text: 'Run the launch self-audit, following the releve skill with --audit: npm run audit -- --markdown. Report what it found line by line (creation slot, same-slot buyers, early buyers, top 10, authorities, the suggested light states), say which lines could not be read, and change no file.',
  },
  etat: {
    agent: DEFAULT_AGENT,
    text: 'Give the founders the station status in at most 12 lines, following the station skill. Read docs/objectifs.md (Board), git status and log, the open pull requests and issues and the latest workflow runs (read-only gh commands). Say what is now, what is next, what is blocked on a founder and what waits for the second key. Change no file.',
  },
};

// ------------------------------------------------------------------ small pure helpers

/** Remove anything that looks like a token or one of ours from text that may be logged or sent. */
export function scrub(text, env = {}) {
  let out = String(text ?? '');
  for (const name of ['GITHUB_DISPATCH_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_OPS_BOT_TOKEN']) {
    const value = String(env[name] ?? '').trim();
    if (value.length >= 4) out = out.split(value).join('***');
  }
  return out
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, '***')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '***')
    .replace(/\b(?:bot)?\d{5,}:[A-Za-z0-9_-]{30,}/g, '***')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***');
}

/** Equal strings, compared in constant time (digests first, so lengths do not matter or leak). */
export function verifySecret(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const wanted = expected.trim();
  if (wanted === '') return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(wanted).digest();
  return timingSafeEqual(a, b);
}

/** FOUNDER_TELEGRAM_IDS → a Set of id strings. Anything that is not a whole number is dropped. */
export function parseIds(list) {
  return new Set(String(list ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d{1,20}$/.test(s)));
}

/** "owner/name" → { owner, name }, or null. Dot-only parts are refused (a path could escape the route). */
export function parseRepo(value) {
  const m = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(String(value ?? '').trim());
  if (!m || /^\.+$/.test(m[1]) || /^\.+$/.test(m[2])) return null;
  return { owner: m[1], name: m[2] };
}

const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Control characters and invisible direction marks out; CRLF to LF; blank runs squeezed. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Keep at most `max` code points (a pair of surrogates is never split) and say so when it cut. */
export function cutText(text, max = MAX_TEXT) {
  const points = Array.from(text);
  if (points.length <= max) return { text, truncated: false };
  return { text: points.slice(0, max).join('').trimEnd() + CUT_MARK, truncated: true };
}

/** "Économiste", "economiste", "@economiste" → "economiste" if it is an agent, else null. */
export function resolveAgent(name) {
  const key = fold(name).replace(/^@/, '').replace(/[_\s]+/g, '-');
  return AGENTS.includes(key) ? key : null;
}

/**
 * Read one message text. Returns null when it is not one of our commands (ignored silently), or
 * { command, agent, text, truncated } for an order, or { command, error } for a command that
 * needs a hint (error: 'no_agent' | 'unknown_agent' | 'no_task', plus `shown` for the last).
 */
export function parseCommand(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^\/([\p{L}_]{1,32})(?:@[A-Za-z0-9_]{1,64})?(?:\s+([\s\S]*))?$/u.exec(raw.trim());
  if (!m) return null;
  const command = fold(m[1]);
  if (!COMMANDS.includes(command)) return null;
  const rest = cleanText(m[2] ?? '');
  if (command === 'aide') return { command };
  if (command === 'agent') {
    const parts = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest);
    if (!parts) return { command, error: 'no_agent' };
    const agent = resolveAgent(parts[1]);
    if (!agent) return { command, error: 'unknown_agent', shown: Array.from(parts[1]).slice(0, 40).join('') };
    const task = cleanText(parts[2] ?? '');
    if (!task) return { command, error: 'no_task', agent };
    return { command, agent, ...cutText(task) };
  }
  if (command === 'faire') {
    if (!rest) return { command, error: 'no_task', agent: DEFAULT_AGENT };
    return { command, agent: DEFAULT_AGENT, ...cutText(rest) };
  }
  // /releve, /audit, /etat: a ready-made brief, plus the founder's own words if there are any
  const { agent, text } = SHORTCUTS[command];
  const note = rest ? `\n\nFounder's note: ${rest}` : '';
  return { command, agent, ...cutText(text + note) };
}

/**
 * The repository_dispatch body, the shape docs/telegram.md documents: five properties, plus the
 * three of the return route (report_url, report_until, report_mac) when there is one. GitHub
 * allows ten.
 */
export function buildDispatch({ agent, text, from, chatId, messageId, report = null }) {
  const client_payload = { agent, text, from, chat_id: chatId, message_id: messageId };
  if (report) Object.assign(client_payload, { report_url: report.url, report_until: report.until, report_mac: report.mac });
  return { event_type: EVENT_TYPE, client_payload };
}

// ------------------------------------------------------------------ the way back: proof and links

const HOST_RE = /^(?:[a-z0-9-]{1,63}\.){1,10}[a-z]{2,24}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * The proof that a report belongs to an order this function dispatched: an HMAC-SHA-256 of the
 * message id, the ops chat and the expiry (epoch seconds), keyed by the webhook secret, with a
 * label so the same key never signs anything else. Hex, 64 characters.
 */
export function reportMac(secret, { messageId, chatId, until }) {
  return createHmac('sha256', String(secret ?? '').trim())
    .update(`plein-station-report-v1|${messageId}|${chatId}|${until}`)
    .digest('hex');
}

/** True when `provided` is the proof for these fields. Constant time; a missing secret never matches. */
export function reportMacOk(provided, secret, fields) {
  if (typeof provided !== 'string' || !/^[0-9a-f]{64}$/.test(provided)) return false;
  if (String(secret ?? '').trim() === '') return false;
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(reportMac(secret, fields), 'hex'));
}

// Three shapes of link, matched in one pass so a long URL is judged whole: anything with a
// scheme and //, anything starting www., and a bare name that ends in one of the domain endings
// below. The list is short on purpose: a report talks about code, and names such as live.json,
// telegram.md, window.top or config.site must survive. So a bare domain with another ending is
// not caught; a link with a scheme or www. is caught whatever its ending. Every quantifier is
// bounded, so a long run of letters cannot make the match slow.
const LINK_TLDS = 'com|net|org|io|xyz|app|me|co|ly|gg|cc|tk|ru|cn|fi|fr|de|eu|uk|ch|ai|tv|pw|ws|su|click|online|club|biz|pro|icu|buzz|vip|win|fun|zip|mov|ink|lol|cfd|sbs|rest|bio|dog|wtf';
const LINK_RE = new RegExp(
  `[a-z][a-z0-9+.-]{1,20}:\\/\\/[^\\s<>"')\\]]{1,500}|www\\.[^\\s<>"')\\]]{1,500}|(?:[a-z0-9-]{1,63}\\.){1,6}(?:${LINK_TLDS})\\b(?:\\/[^\\s<>"')\\]]{0,500})?`,
  'gi',
);

function linkAllowed(link, hosts) {
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Text from an agent, for a person who may tap links on a phone: every link whose host is not in
 * `hosts` (and its subdomains) becomes "[lien retiré]". A prompt-injected run could otherwise hand
 * the founders a fake signing page through their own trusted bot.
 */
export function sanitizeLinks(text, hosts = LINK_HOSTS) {
  const allowed = hosts.map((h) => String(h).toLowerCase()).filter(Boolean);
  return String(text ?? '').replace(LINK_RE, (match) => {
    const bare = match.replace(/[.,;:!?]+$/, '');
    const tail = match.slice(bare.length);
    return (linkAllowed(bare, allowed) ? bare : LINK_REMOVED) + tail;
  });
}

// ------------------------------------------------------------------ the replies (French)

export function helpText() {
  return [
    'Commandes réservées aux fondateurs, dans ce groupe.',
    `/faire <tâche>${NB}: le chef de station s'en occupe.`,
    `/agent <nom> <tâche>${NB}: un agent précis.`,
    `/releve${NB}: un relevé de la chaîne et du prix.`,
    `/audit${NB}: l'auto-audit du lancement.`,
    `/etat${NB}: où en est la station.`,
    `Agents${NB}: ${AGENTS.join(', ')}.`,
    "Je réponds ici quand l'agent a fini.",
  ].join('\n');
}

export function replyFor(parsed) {
  if (parsed.command === 'aide') return helpText();
  if (parsed.error === 'no_agent') return `Il manque le nom de l'agent. Exemple${NB}: /agent economiste relis le barème des frais. Agents${NB}: ${AGENTS.join(', ')}.`;
  if (parsed.error === 'unknown_agent') return `Je ne connais pas l'agent «${NB}${parsed.shown}${NB}». Agents${NB}: ${AGENTS.join(', ')}.`;
  if (parsed.error === 'no_task') return `Il manque la tâche pour ${parsed.agent}. Exemple${NB}: /agent ${parsed.agent} relis la dernière PR.`;
  return '';
}

// said at once, in the acknowledgement, when the answer could not find its way back to the group
const NO_REPORT = {
  no_bot: `Attention${NB}: la réponse ne reviendra pas ici, TELEGRAM_OPS_BOT_TOKEN manque dans Vercel.`,
  no_host: `Attention${NB}: la réponse ne reviendra pas ici, l'adresse du site n'est pas lisible.`,
};

export function ackText(order, truncated, noReport = '') {
  const cut = truncated ? ` Texte coupé à ${String(MAX_TEXT).replace(/\B(?=(\d{3})+(?!\d))/g, NB)}${NB}caractères.` : '';
  const warn = NO_REPORT[noReport] ? ` ${NO_REPORT[noReport]}` : '';
  return `Reçu, je transmets à ${order.agent}.${cut}${warn}`;
}

const DISPATCH_FAILURES = {
  not_configured: "Le pont vers GitHub n'est pas réglé (GITHUB_DISPATCH_TOKEN ou GITHUB_REPO manque dans Vercel). Rien n'est parti.",
  401: "GitHub refuse le jeton (401). Il a peut-être expiré. Rien n'est parti.",
  403: "GitHub refuse l'envoi (403). Le jeton manque de droits, ou la limite est atteinte. Rien n'est parti.",
  404: "GitHub ne trouve pas le dépôt (404). Vérifie GITHUB_REPO et l'accès du jeton. Rien n'est parti.",
  422: "GitHub a refusé l'ordre (422). Rien n'est parti.",
};

export function failureText(result) {
  if (result.reason === 'not_configured') return DISPATCH_FAILURES.not_configured;
  if (DISPATCH_FAILURES[result.status]) return DISPATCH_FAILURES[result.status];
  if (result.status) return `GitHub a répondu ${result.status}. Regarde l'onglet Actions avant de renvoyer l'ordre.`;
  return `La réponse de GitHub n'est pas arrivée. L'ordre est peut-être parti${NB}: regarde l'onglet Actions avant de renvoyer.`;
}

// ------------------------------------------------------------------ GitHub

/** Send the order to GitHub. Never throws; the result carries a reason, never a token. */
export async function dispatchOrder(order, { env = process.env, fetch = (...a) => globalThis.fetch(...a), timeoutMs = DISPATCH_TIMEOUT_MS } = {}) {
  const repo = parseRepo(env.GITHUB_REPO);
  const token = String(env.GITHUB_DISPATCH_TOKEN ?? '').trim();
  if (!repo || !token) return { ok: false, reason: 'not_configured' };
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/dispatches`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'plein-standard',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(buildDispatch(order)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // the error text is dropped on purpose: a fixed word is all a log or a reply ever gets
    return { ok: false, reason: 'network', detail: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (res.status === 204) return { ok: true };
  return { ok: false, reason: 'http', status: res.status };
}

// ------------------------------------------------------------------ the handler

export const newState = () => ({ hits: new Map(), seen: new Map(), reports: new Map() });

function takeSlot(state, user, now, { max, windowMs }) {
  const recent = (state.hits.get(user) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    state.hits.set(user, recent);
    return { ok: false, retryMin: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 60000)) };
  }
  recent.push(now);
  state.hits.set(user, recent);
  return { ok: true };
}

function firstSight(state, updateId, now) {
  if (!Number.isSafeInteger(updateId)) return true;
  for (const [id, at] of state.seen) if (now - at > SEEN_MS) state.seen.delete(id);
  if (state.seen.has(updateId)) return false;
  if (state.seen.size >= 500) state.seen.delete(state.seen.keys().next().value);
  state.seen.set(updateId, now);
  return true;
}

/** Delivered reports per order. Over the cap, or an unknown order past the table's size, is refused. */
function reportsLeft(state, messageId, now) {
  for (const [id, entry] of state.reports) if (now - entry.at > 2 * REPORT_WINDOW_S * 1000) state.reports.delete(id);
  return REPORT_MAX_PER_ORDER - (state.reports.get(messageId)?.n ?? 0);
}

function noteReport(state, messageId, now) {
  if (state.reports.size >= 500 && !state.reports.has(messageId)) state.reports.delete(state.reports.keys().next().value);
  state.reports.set(messageId, { n: (state.reports.get(messageId)?.n ?? 0) + 1, at: now });
}

/** Where the workflow posts its report: this very function, on the host Telegram called. */
function reportUrlFor(req) {
  const host = String(req.headers?.host ?? '').toLowerCase();
  return HOST_RE.test(host) ? `https://${host}${REPORT_PATH}` : null;
}

/**
 * The return route of one order: where to post, until when, and the proof. Null (with the reason
 * the founder is told) when the ops bot's token or the site's address is missing.
 */
function reportRoute(req, env, message, nowMs) {
  if (String(env.TELEGRAM_OPS_BOT_TOKEN ?? '').trim() === '') return { report: null, why: 'no_bot' };
  const url = reportUrlFor(req);
  if (!url) return { report: null, why: 'no_host' };
  const until = Math.floor(nowMs / 1000) + REPORT_WINDOW_S;
  const chatId = String(env.TELEGRAM_OPS_CHAT_ID).trim();
  return { report: { url, until, mac: reportMac(env.TELEGRAM_WEBHOOK_SECRET, { messageId: message.message_id, chatId, until }) } };
}

/** Post to the ops group as the ops bot. Never throws; the result carries a status or a word, never a token. */
export async function sendToOpsGroup(text, { token, chatId, replyTo, fetch = (...a) => globalThis.fetch(...a), timeoutMs = DISPATCH_TIMEOUT_MS }) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number.isSafeInteger(Number(chatId)) ? Number(chatId) : chatId,
        text,
        reply_parameters: { message_id: replyTo, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  return res.status === 200 ? { ok: true } : { ok: false, reason: 'http', status: res.status };
}

async function readJson(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { error: 413 };
  let raw = req.body;
  if (raw != null && typeof raw === 'object' && !Buffer.isBuffer(raw)) return { value: raw };
  if (raw == null) {
    if (typeof req[Symbol.asyncIterator] !== 'function') return { error: 400 };
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return { error: 413 };
      chunks.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  } else if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (String(raw).length > MAX_BODY_BYTES) return { error: 413 };
  try { return { value: JSON.parse(String(raw)) }; } catch { return { error: 400 }; }
}

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Answer Telegram 200 and have it post `text` in the chat (webhook reply: no bot token needed). */
function speak(res, message, text) {
  respond(res, 200, {
    method: 'sendMessage',
    chat_id: message.chat.id,
    text,
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
  });
}

const silent = (res) => respond(res, 200, { ok: true });

/** True for the one kind of message we act on: a founder's plain text in the ops chat. */
function fromFounder(message, env) {
  if (!message || typeof message !== 'object' || typeof message.text !== 'string') return false;
  const sender = message.from;
  if (!sender || sender.is_bot || !Number.isSafeInteger(sender.id)) return false;
  if (message.forward_origin || message.forward_date || message.forward_from || message.forward_from_chat || message.via_bot || message.sender_chat) return false;
  const opsChat = String(env.TELEGRAM_OPS_CHAT_ID ?? '').trim();
  if (!/^-?\d{1,20}$/.test(opsChat) || String(message.chat?.id) !== opsChat) return false;
  return parseIds(env.FOUNDER_TELEGRAM_IDS).has(String(sender.id));
}

export function createHandler({
  env = process.env,
  fetch = (...a) => globalThis.fetch(...a),
  now = () => Date.now(),
  log = (line) => console.error(line),
  state = newState(),
} = {}) {
  async function run(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return respond(res, 405, { ok: false });
    }
    if (String(env.TELEGRAM_WEBHOOK_SECRET ?? '').trim() === '') return respond(res, 503, { ok: false, error: 'not_configured' });
    if (req.headers?.[REPORT_HEADER] !== undefined) return runReport(req, res);
    if (!verifySecret(req.headers?.['x-telegram-bot-api-secret-token'], env.TELEGRAM_WEBHOOK_SECRET)) return respond(res, 401, { ok: false });

    const body = await readJson(req);
    if (body.error) return respond(res, body.error, { ok: false });
    const update = body.value;
    const message = update && typeof update === 'object' ? update.message : null;
    if (!fromFounder(message, env)) return silent(res);

    const parsed = parseCommand(message.text);
    if (!parsed) return silent(res);
    const t = now();
    if (!firstSight(state, update.update_id, t)) return silent(res);

    if (parsed.command === 'aide' || parsed.error) return speak(res, message, replyFor(parsed));

    const slot = takeSlot(state, String(message.from.id), t, RATE_LIMIT);
    if (!slot.ok) {
      return speak(res, message, `Trop d'ordres d'un coup (${RATE_LIMIT.max} par ${RATE_LIMIT.windowMs / 60000} minutes). Réessaie dans ${slot.retryMin} min.`);
    }

    const route = reportRoute(req, env, message, t);
    const order = {
      agent: parsed.agent,
      text: parsed.text,
      from: message.from.id,
      chatId: message.chat.id,
      messageId: message.message_id,
      report: route.report,
    };
    const result = await dispatchOrder(order, { env, fetch });
    if (result.ok) return speak(res, message, ackText(order, parsed.truncated, route.why));
    // fixed words only: no upstream text, no header, no token ever reaches a log or a reply
    log(`standard: dispatch failed (${result.status ?? result.detail ?? result.reason})`);
    return speak(res, message, failureText(result));
  }
  /**
   * The workflow's report. Checked in this order: the proof's shape, the body, the proof itself
   * (keyed by the webhook secret, over the message id, the ops chat and the expiry), the expiry,
   * the bot token, the per-order cap. Nothing is logged before the proof holds, so a stranger
   * cannot fill the logs; after it, only fixed words.
   */
  async function runReport(req, res) {
    const mac = req.headers[REPORT_HEADER];
    if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return respond(res, 401, { ok: false });
    const body = await readJson(req);
    if (body.error) return respond(res, body.error, { ok: false });
    const report = parseReportBody(body.value);
    const chatId = String(env.TELEGRAM_OPS_CHAT_ID ?? '').trim();
    if (!report || !/^-?\d{1,20}$/.test(chatId)) return respond(res, 400, { ok: false });
    if (!reportMacOk(mac, env.TELEGRAM_WEBHOOK_SECRET, { messageId: report.messageId, chatId, until: report.until })) return respond(res, 401, { ok: false });
    const t = now();
    if (t / 1000 > report.until) return respond(res, 410, { ok: false, error: 'expired' });
    const token = String(env.TELEGRAM_OPS_BOT_TOKEN ?? '').trim();
    const repo = parseRepo(env.GITHUB_REPO);
    if (!token || !repo) {
      log('standard: report refused (not configured)');
      return respond(res, 503, { ok: false, error: 'not_configured' });
    }
    if (reportsLeft(state, report.messageId, t) <= 0) return respond(res, 429, { ok: false });
    const host = String(req.headers.host ?? '').toLowerCase();
    const text = composeReport({
      agent: report.agent,
      orderOutcome: report.orderOutcome,
      orderError: report.orderError,
      claudeOutcome: report.claudeOutcome,
      result: report.result,
      repo: `${repo.owner}/${repo.name}`,
      runUrl: `https://github.com/${repo.owner}/${repo.name}/actions/runs/${report.runId}`,
      branch: `claude/order-${report.runId}-${report.runAttempt}`,
      branchSha: report.branchSha,
      mainBefore: report.mainBefore,
      mainAfter: report.mainAfter,
      hosts: HOST_RE.test(host) ? [...LINK_HOSTS, host] : LINK_HOSTS,
    });
    const sent = await sendToOpsGroup(text, { token, chatId, replyTo: report.messageId, fetch });
    if (!sent.ok) {
      log(`standard: report not delivered (${sent.status ?? sent.reason})`);
      return respond(res, 502, { ok: false, error: 'telegram' });
    }
    noteReport(state, report.messageId, t);
    return respond(res, 200, { ok: true });
  }
  return async function handler(req, res) {
    try {
      return await run(req, res);
    } catch (error) {
      // never let an exception carry a token into the platform's error page or log
      log(`standard: unexpected error (${scrub(error?.message, env).slice(0, 80)})`);
      if (!res.writableEnded && !res.headersSent) respond(res, 200, { ok: false });
    }
  };
}

export default createHandler();

// ------------------------------------------------------------------ the workflow's half

const ORDER_ERRORS = {
  wrong_event: "ce n'est pas un ordre du standard",
  bad_payload: "l'ordre est mal formé",
  unknown_agent: "agent inconnu",
  empty_text: "ordre vide",
};

/**
 * The order in a repository_dispatch event, checked again on the runner: whoever holds a token
 * with write access can dispatch, so the workflow trusts the shape only after this. Error codes
 * are fixed words, never part of the payload.
 */
export function readOrder(event) {
  if (!event || typeof event !== 'object' || event.action !== EVENT_TYPE) return { ok: false, error: 'wrong_event' };
  const p = event.client_payload;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'bad_payload' };
  const agent = typeof p.agent === 'string' && AGENTS.includes(p.agent) ? p.agent : null;
  if (!agent) return { ok: false, error: 'unknown_agent' };
  const ids = [p.from, p.chat_id, p.message_id];
  if (!ids.every(Number.isSafeInteger) || p.from <= 0 || p.message_id <= 0) return { ok: false, error: 'bad_payload' };
  if (typeof p.text !== 'string') return { ok: false, error: 'bad_payload' };
  const clean = cleanText(p.text);
  if (!clean) return { ok: false, error: 'empty_text' };
  const { text, truncated } = cutText(clean);
  return { ok: true, order: { agent, text, truncated, from: p.from, chatId: p.chat_id, messageId: p.message_id } };
}

/** The file .station-order.md, which the Claude step reads (the order never goes through env or `with:`). */
export function orderPrompt(order, { branch = 'the branch the workflow chose' } = {}) {
  const text = order.text.replace(/<\/?order/gi, (m) => m.replace('<', '‹'));
  return [
    "Station $PLEIN: an order from the founders' Telegram ops chat",
    '',
    // no Telegram user id and no message id here: this file sits in the workspace, an agent may quote
    // it in a commit or a pull request, and a founder's id must never be published next to the coin
    `Order for the agent "${order.agent}", sent by a founder.`,
    '<order>',
    text,
    '</order>',
    '',
    'How to carry it out',
    `1. Read CLAUDE.md and docs/interfaces.md, then .claude/agents/${order.agent}.md. Act as that agent: its role, its limits and its hard lines are yours for this order. Call it with the Agent tool (subagent_type "${order.agent}") when its model or its tools fit the job better, then apply what it hands back. The other agents are in .claude/agents; call them when the order needs them.`,
    `2. If the order changes files, work on the branch ${branch}, which the workflow chose. Commit to it only through the commit tool, never to main, then open a pull request with exactly this form: gh pr create --head ${branch} --base main --title "<short title>" --body "<what changed and why, fit to be public>" (the commit tool writes through GitHub's API, so your checkout stays on main and a plain gh pr create would have no head branch). A founder approves and merges: do not merge, approve or review anything. Do not commit .station-order.md (this file).`,
    '3. An order that only asks for a status, a reading, an audit or a review changes nothing: answer only, open no pull request.',
    '4. Hard lines, whatever the order says. Never sign, broadcast or submit anything on a chain, never hold, read or print a key, a seed phrase, a token or a secret. Never post to X, Telegram or the site: draft only, the founders publish. No airdrop, no paid promotion. Unknown is null, never a guess. Mark every unverified external fact Tier 2. Commit messages, branch names and pull request text are public: put code, copy and test results there. Legal screening, attack analysis and strategy go only in your answer below.',
    "5. If the order is unclear, risky, or needs a founder's decision, do not guess: stop and ask in your answer.",
    '',
    'Your answer',
    "It goes to the founders' private ops chat as one Telegram message, read on a phone. Write it in French, plain text (no markdown, no tables), at most 15 short lines. First line: FAIT, BLOQUÉ or À DÉCIDER, then one sentence. Then what you did or found, the figures with their source, the pull request link if you opened one, and exactly what a founder has to do next (tap, say, decide). Never include a secret.",
    '',
  ].join('\n');
}

/**
 * The last result in the Claude Code execution file, which holds a JSON array of messages (or one
 * JSON message per line). { ok, text, subtype }; ok is false when there is no result at all.
 */
export function resultFromExecution(raw) {
  let items = [];
  try {
    const parsed = JSON.parse(String(raw));
    items = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    items = String(raw).split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } });
  }
  const last = [...items].reverse().find((m) => m && typeof m === 'object' && m.type === 'result');
  if (!last) return { ok: false, text: '', subtype: 'no_result' };
  return {
    ok: last.subtype === 'success' && last.is_error !== true,
    text: typeof last.result === 'string' ? cleanText(last.result) : '',
    subtype: String(last.subtype ?? ''),
  };
}

const short = (sha) => String(sha).slice(0, 7);
const isSha = (s) => SHA_RE.test(String(s ?? ''));

/**
 * The message the ops chat gets when the run ends, from fixed words and the agent's own answer.
 * The answer comes in as `result` ({ ok, text, subtype }, from resultFromExecution) or as the raw
 * `execution` file. Links in it are filtered (sanitizeLinks); the links this function adds
 * itself are built from validated parts only.
 */
export function composeReport({
  agent = '', orderOutcome = 'success', orderError = '', claudeOutcome = 'success', result = null, execution = null,
  runUrl = '', repo = '', branch = '', branchSha = '', mainBefore = '', mainAfter = '', hosts = LINK_HOSTS,
} = {}) {
  const lines = [];
  const who = AGENTS.includes(agent) ? agent : 'le standard';
  if (orderOutcome !== 'success') {
    lines.push(`Ordre refusé, rien n'a tourné (${ORDER_ERRORS[orderError] || 'raison inconnue'}).`);
  } else {
    const got = result ?? (execution == null ? null : resultFromExecution(execution));
    const answer = got ?? { ok: false, text: '', subtype: 'no_result' };
    if (claudeOutcome === 'cancelled') lines.push(`${who}${NB}: interrompu (annulé, ou délai de ${CLAUDE_STEP_MINUTES} minutes dépassé).`);
    else if (answer.ok && claudeOutcome === 'success') lines.push(`${who}${NB}: terminé.`);
    else if (answer.subtype === 'error_max_turns') lines.push(`${who}${NB}: arrêté, trop de tours sans finir.`);
    else if (answer.subtype === 'no_result') lines.push(`${who}${NB}: échec, aucune réponse (le délai de ${CLAUDE_STEP_MINUTES} minutes est peut-être dépassé). Regarde le journal.`);
    else lines.push(`${who}${NB}: échec (${answer.subtype || claudeOutcome}).`);
    if (answer.text) {
      // links first, length second; the input is cut first so the scan stays short
      const points = Array.from(answer.text);
      const clean = sanitizeLinks(points.slice(0, MAX_REPORT * 2).join(''), hosts);
      const cut = cutText(clean, MAX_REPORT);
      lines.push('', cut.truncated || points.length <= MAX_REPORT * 2 ? cut.text : clean + CUT_MARK);
    }
  }
  const parsedRepo = parseRepo(repo);
  const slug = parsedRepo ? `${parsedRepo.owner}/${parsedRepo.name}` : '';
  const runBase = `https://github.com/${slug}/actions/runs/`;
  const links = [];
  if (parsedRepo && isSha(branchSha) && /^claude\/order-\d+-\d+$/.test(branch)) {
    links.push(`Branche${NB}: https://github.com/${slug}/compare/main...${branch}?expand=1`);
  }
  if (parsedRepo && isSha(mainBefore) && isSha(mainAfter) && mainBefore !== mainAfter) {
    links.push(`Attention${NB}: main a bougé pendant l'ordre (${short(mainBefore)} puis ${short(mainAfter)}). Vérifie que c'est voulu${NB}: https://github.com/${slug}/compare/${mainBefore}...${mainAfter}`);
  }
  if (parsedRepo && runUrl.startsWith(runBase) && /^\d+$/.test(runUrl.slice(runBase.length))) links.push(`Journal${NB}: ${runUrl}`);
  if (links.length) lines.push('', ...links);
  return lines.join('\n');
}

// ------------------------------------------------------------------ the way back, runner side

const OUTCOMES = ['success', 'failure', 'cancelled', 'skipped'];

/**
 * The return route an order carries (report_url, report_until, report_mac, set by the function
 * above), checked again on the runner. Null when it is missing or malformed: an order that did not
 * come through the switchboard has no route, so no report is sent for it.
 */
export function readReportRoute(event) {
  const p = event && typeof event === 'object' ? event.client_payload : null;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const { report_url: url, report_until: until, report_mac: mac, message_id: messageId } = p;
  if (typeof url !== 'string' || !/^https:\/\/(?:[a-z0-9-]{1,63}\.){1,10}[a-z]{2,24}\/api\/standard$/.test(url)) return null;
  if (!Number.isSafeInteger(until) || until <= 0 || !Number.isSafeInteger(messageId) || messageId <= 0) return null;
  if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return null;
  return { url, until, mac, messageId };
}

/** What the runner posts back: ids, fixed words and the agent's answer. No repository name, no URL. */
export function buildReportBody({
  messageId, until, agent = '', orderOutcome = '', orderError = '', claudeOutcome = '', result = null,
  runId, runAttempt, branchSha = '', mainBefore = '', mainAfter = '',
}) {
  return {
    message_id: messageId,
    until,
    agent,
    order_outcome: orderOutcome,
    order_error: orderError,
    claude_outcome: claudeOutcome,
    result: result
      ? { ok: result.ok === true, subtype: result.subtype, text: Array.from(String(result.text ?? '')).slice(0, MAX_REPORT * 2).join('') }
      : null,
    run_id: runId,
    run_attempt: runAttempt,
    branch_sha: branchSha,
    main_before: mainBefore,
    main_after: mainAfter,
  };
}

/**
 * A report body, checked and reduced to known shapes (Vercel does not trust the runner). Null when
 * a number is not a whole positive number. Anything else that is off becomes a neutral value.
 */
export function parseReportBody(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const whole = (n) => Number.isSafeInteger(n) && n > 0;
  if (![v.message_id, v.until, v.run_id, v.run_attempt].every(whole)) return null;
  const sha = (s) => (isSha(s) ? s : '');
  const r = v.result;
  const result = r && typeof r === 'object' && !Array.isArray(r)
    ? {
      ok: r.ok === true,
      subtype: typeof r.subtype === 'string' && /^[a-z_]{1,60}$/.test(r.subtype) ? r.subtype : 'unknown',
      text: typeof r.text === 'string' ? cleanText(Array.from(r.text).slice(0, MAX_REPORT * 2).join('')) : '',
    }
    : null;
  return {
    messageId: v.message_id,
    until: v.until,
    agent: typeof v.agent === 'string' && AGENTS.includes(v.agent) ? v.agent : '',
    orderOutcome: OUTCOMES.includes(v.order_outcome) ? v.order_outcome : 'failure',
    orderError: typeof v.order_error === 'string' && Object.hasOwn(ORDER_ERRORS, v.order_error) ? v.order_error : '',
    claudeOutcome: OUTCOMES.includes(v.claude_outcome) ? v.claude_outcome : 'failure',
    result,
    runId: v.run_id,
    runAttempt: v.run_attempt,
    branchSha: sha(v.branch_sha),
    mainBefore: sha(v.main_before),
    mainAfter: sha(v.main_after),
  };
}

/**
 * Post the report to the switchboard, with the proof in a header. Retries a network error, a 429 or
 * a 5xx twice; any other answer is final. Never throws; the result carries a status or a word,
 * never the proof or the answer.
 */
export async function postReport(route, body, { fetch = (...a) => globalThis.fetch(...a), timeoutMs = 15000, delaysMs = [2000, 5000] } = {}) {
  let last = { ok: false, reason: 'network' };
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    try {
      const res = await fetch(route.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'plein-standard-runner', [REPORT_HEADER]: route.mac },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 200) return { ok: true, status: 200 };
      last = { ok: false, reason: 'http', status: res.status };
      if (res.status < 500 && res.status !== 429) return last;
    } catch {
      last = { ok: false, reason: 'network' };
    }
  }
  return last;
}
