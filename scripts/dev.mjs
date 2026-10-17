// Local preview: serves public/ and runs api/*.js the way Vercel does. No dependencies.
//   npm run dev  →  http://localhost:3000
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = join(root, 'public');
const apiDir = join(root, 'api');
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ics': 'text/calendar; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

// vercel.json is the one list of rewrites, so the same paths answer here and in production
// (/airdrop, /claim, /v2 ... serve a static page while the address bar keeps the path).
// Only plain-path sources are applied, matched exactly: that is all the file uses. A pattern
// source is skipped with a note, so a preview deployment is the place to try it.
const rewrites = new Map();
try {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  for (const { source, destination } of config.rewrites || []) {
    if (typeof source !== 'string' || typeof destination !== 'string') continue;
    if (/[:()*?+\[\]{}]/.test(source) || /^[a-z]+:\/\//i.test(destination)) {
      console.warn(`vercel.json rewrite ${source} not applied by this server (pattern or external)`);
      continue;
    }
    rewrites.set(source, destination);
  }
} catch (error) {
  console.warn(`vercel.json not read, no rewrites here: ${error.message}`);
}

async function serveStatic(pathname, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Adresse invalide');
    return;
  }
  let file = normalize(join(publicDir, decoded));
  if (!file.startsWith(publicDir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' };
    if (file.endsWith('live.json')) headers['cache-control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    await serveNotFound(res);
  }
}

// Like Vercel, a path that matches nothing gets public/404.html with a 404 status. It carries the
// answer to a scam link the exact rewrites miss (/claim/, /Claim, /v3). Plain text if the page is gone.
async function serveNotFound(res) {
  try {
    const body = await readFile(join(publicDir, '404.html'));
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}

async function serveApi(pathname, req, res) {
  const name = pathname.replace(/^\/api\//, '').replace(/\.js$/, '');
  if (!/^[a-z0-9-]+$/.test(name)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const mod = await import(`${pathToFileURL(join(apiDir, `${name}.js`)).href}?t=${Date.now()}`);
    req.query = Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    await mod.default(req, res);
  } catch (error) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'handler_failed', detail: String(error.message || error) }));
  }
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname.startsWith('/api/')) serveApi(pathname, req, res);
  else serveStatic(rewrites.get(pathname) ?? pathname, res);
}).listen(port, () => {
  console.log(`Station $PLEIN → http://localhost:${port}`);
  if (rewrites.size) console.log(`Réécritures de vercel.json : ${[...rewrites.keys()].join(' ')}`);
});
