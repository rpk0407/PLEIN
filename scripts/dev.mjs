// Local preview: serves public/ and runs api/*.js the way Vercel does. No dependencies.
//   npm run dev  →  http://localhost:3000
import { createServer } from 'node:http';
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

async function serveStatic(pathname, res) {
  let file = normalize(join(publicDir, decodeURIComponent(pathname)));
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
  else serveStatic(pathname, res);
}).listen(port, () => {
  console.log(`Station $PLEIN → http://localhost:${port}`);
});
