// HTML to PNG with the headless Chrome or Edge already on the machine (and on GitHub's Ubuntu
// runners). No dependency: the browser is driven by its own --screenshot switch. Files starting
// with "_" are helpers, not commands.
// Tier 1: renders 1200 × 675 with Edge on the founders' Windows machine (17 October 2026).
// Tier 2: Chrome on GitHub's ubuntu runners (expected preinstalled; the --no-sandbox flag there is
// the usual container workaround). If the first workflow run fails here, set CHROME_PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'];
const KNOWN_PLACES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** Path of a browser we can drive, or null. `env` and `exists` are injectable for tests. */
export function findBrowser({ env = process.env, exists = existsSync, platform = process.platform } = {}) {
  if (env.CHROME_PATH) return exists(env.CHROME_PATH) ? env.CHROME_PATH : null;
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of String(env.PATH || env.Path || '').split(delimiter).filter(Boolean)) {
    for (const name of ON_PATH) {
      for (const suffix of suffixes) {
        const candidate = join(dir, name + suffix);
        if (exists(candidate)) return candidate;
      }
    }
  }
  if (env.LOCALAPPDATA) {
    const local = `${env.LOCALAPPDATA.replace(/\\/g, '/')}/Google/Chrome/Application/chrome.exe`;
    if (exists(local)) return local;
  }
  return KNOWN_PLACES.find((p) => exists(p)) || null;
}

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function pngSize(buffer) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || sig.some((b, i) => buffer[i] !== b)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Screenshot an HTML file at exactly width × height pixels. Throws when no browser is found. */
export function renderPng(htmlPath, pngPath, { width = 1200, height = 675 } = {}) {
  const browser = findBrowser();
  if (!browser) throw new Error('no Chrome or Edge found: install one or set CHROME_PATH');
  const out = resolve(pngPath);
  mkdirSync(dirname(out), { recursive: true });
  // a throwaway profile, so a Chrome that is already open does not swallow the command
  const profile = mkdtempSync(join(tmpdir(), 'plein-render-'));
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--force-device-scale-factor=1', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--virtual-time-budget=4000',
    `--screenshot=${out}`,
  ];
  // CI containers run Chrome without a user namespace; the page is a local file we wrote
  if (process.env.CI) args.push('--no-sandbox');
  args.push(pathToFileURL(resolve(htmlPath)).href);
  try {
    const run = spawnSync(browser, args, { timeout: 60000, encoding: 'utf8' });
    if (run.error) throw new Error(`browser failed to start: ${run.error.message}`);
    if (!existsSync(out)) throw new Error(`browser exited ${run.status} without writing the PNG`);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  const size = pngSize(readFileSync(out));
  if (!size) throw new Error('the browser did not write a PNG');
  if (size.width !== width || size.height !== height) {
    throw new Error(`PNG is ${size.width}×${size.height}, expected ${width}×${height}`);
  }
  return out;
}
