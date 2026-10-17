// Telegram Bot API, the two calls the station needs: a text message and a photo.
//   node scripts/telegram.mjs --ops|--channel (--text "…" | --file report.md) [--photo card.png]
//
// Secrets come from the environment only: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (public
// channel), TELEGRAM_OPS_CHAT_ID (the two founders). When one is missing the call is a dry run
// that prints what it would send, so the same script works on a laptop and in a workflow.
// The token never reaches a log or an error message. Every call has a 20 s deadline (answer body
// included), so a hung Telegram fails its step instead of eating the job's time limit.
// Tier 2: not yet run against the live Bot API (no bot exists before the founders create one with
// @BotFather). The call shapes follow Telegram's documented sendMessage and sendPhoto, with the
// 4 096-character message and 1 024-character caption limits; the tests use a stubbed fetch.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const API = 'https://api.telegram.org';
const TEXT_LIMIT = 4000;     // the API allows 4096; stay clear of it
const CAPTION_LIMIT = 1024;
const TIMEOUT_MS = 20000;    // the Bot API answers in well under a second; 20 s is a call that has hung
const CHAT_VARS = { ops: 'TELEGRAM_OPS_CHAT_ID', channel: 'TELEGRAM_CHANNEL_ID' };

/** Strip the bot token (and any /bot<token>/ URL piece) from text that may be logged. */
export function scrub(text, token) {
  let out = String(text).replace(/bot\d+:[\w-]{10,}/g, 'bot***');
  if (token) out = out.split(token).join('***');
  return out;
}

/** Plain text from a markdown report: the Bot API gets no parse_mode, so markup would show raw. */
export function plainFromMarkdown(md) {
  return String(md)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6} +/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut text into messages under the limit, at line breaks where possible. */
export function chunkText(text, limit = TEXT_LIMIT) {
  const chunks = [];
  let current = '';
  for (const line of String(text).split('\n')) {
    for (let rest = line; ; ) {
      const piece = rest.slice(0, limit);
      rest = rest.slice(limit);
      if (current && current.length + 1 + piece.length > limit) { chunks.push(current); current = ''; }
      current = current ? `${current}\n${piece}` : piece;
      if (!rest) break;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

function target(which, env) {
  const chatVar = CHAT_VARS[which];
  if (!chatVar) throw new Error(`unknown Telegram target "${which}" (ops or channel)`);
  const token = env.TELEGRAM_BOT_TOKEN || '';
  const chatId = env[chatVar] || '';
  return { token, chatId, missing: [!token && 'TELEGRAM_BOT_TOKEN', !chatId && chatVar].filter(Boolean) };
}

async function call(token, method, body, fetchImpl, timeoutMs) {
  // one deadline for the whole call, answer body included: a hung call must fail in seconds, not
  // after fetch's own five minutes, or the job times out and its failure notice never runs
  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = () => new Error(`Telegram ${method} timed out after ${timeoutMs} ms`);
  let res;
  try {
    res = await fetchImpl(`${API}/bot${token}/${method}`, body instanceof FormData
      ? { method: 'POST', body, signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (signal.aborted) throw timedOut();
    throw new Error(scrub(`Telegram ${method} failed: ${error.message}`, token));
  }
  let json = null;
  try { json = await res.json(); } catch {
    if (signal.aborted) throw timedOut();
    /* not JSON: reported below */
  }
  if (!res.ok || !json?.ok) {
    throw new Error(scrub(`Telegram ${method} answered ${res.status}: ${json?.description || 'no description'}`, token));
  }
  return json.result;
}

/** Send text to "ops" or "channel". Long text goes out as several messages. */
export async function sendMessage(which, text, { env = process.env, fetch: fetchImpl = globalThis.fetch, log = console.log, timeoutMs = TIMEOUT_MS } = {}) {
  const { token, chatId, missing } = target(which, env);
  const parts = chunkText(text);
  if (missing.length) {
    log(`[dry run] sendMessage → ${which} (missing ${missing.join(', ')}), ${parts.length} message(s):\n${parts.join('\n---\n')}`);
    return { ok: true, dryRun: true, sent: 0 };
  }
  for (const part of parts) {
    await call(token, 'sendMessage', { chat_id: chatId, text: part, link_preview_options: { is_disabled: true } }, fetchImpl, timeoutMs);
  }
  return { ok: true, dryRun: false, sent: parts.length };
}

/** Send a PNG or JPEG file with an optional caption. A caption over 1 024 characters goes as text. */
export async function sendPhoto(which, file, caption = '', { env = process.env, fetch: fetchImpl = globalThis.fetch, log = console.log, timeoutMs = TIMEOUT_MS } = {}) {
  const { token, chatId, missing } = target(which, env);
  const long = caption.length > CAPTION_LIMIT;
  if (missing.length) {
    log(`[dry run] sendPhoto → ${which} (missing ${missing.join(', ')}): ${file}${caption ? `\ncaption:\n${caption}` : ''}`);
    return { ok: true, dryRun: true, sent: 0 };
  }
  const form = new FormData();
  form.set('chat_id', chatId);
  if (caption && !long) form.set('caption', caption);
  const type = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
  form.set('photo', new Blob([readFileSync(file)], { type }), basename(file));
  await call(token, 'sendPhoto', form, fetchImpl, timeoutMs);
  if (long) await sendMessage(which, caption, { env, fetch: fetchImpl, log, timeoutMs });
  return { ok: true, dryRun: false, sent: 1 };
}

async function main() {
  const { values } = parseArgs({
    options: {
      ops: { type: 'boolean' }, channel: { type: 'boolean' },
      text: { type: 'string' }, file: { type: 'string' }, photo: { type: 'string' },
    },
  });
  if (values.ops === values.channel) throw new Error('give exactly one of --ops or --channel');
  const which = values.ops ? 'ops' : 'channel';
  if ((values.text === undefined) === (values.file === undefined)) throw new Error('give exactly one of --text or --file');
  const raw = values.file !== undefined ? readFileSync(values.file, 'utf8') : values.text;
  const text = /\.md$/i.test(values.file || '') ? plainFromMarkdown(raw) : raw;
  if (!text.trim()) { console.log('nothing to send'); return; }
  if (values.photo) await sendPhoto(which, values.photo, text);
  else await sendMessage(which, text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(scrub(error.message, process.env.TELEGRAM_BOT_TOKEN));
    process.exit(1);
  });
}
