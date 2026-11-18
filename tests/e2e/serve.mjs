// Serveur statique de test : sert `dist/` en appliquant les en-têtes de `public/_headers` (dont la politique de sécurité CSP),
// comme Cloudflare Pages, avec le repli « application monopage » (toute adresse inconnue → index.html).
// Usage : npm run build && node tests/e2e/serve.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../../dist/', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

// _headers : « /chemin » puis lignes indentées « Nom: valeur »
const rules = [];
let cur = null;
for (const line of readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push((cur = { pattern: line.trim(), headers: {} }));
  else if (cur) { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
}
const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html'); // repli SPA
  const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' };
  for (const r of rules) if (matches(r.pattern, path)) Object.assign(headers, r.headers);
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`WIRD (dist + _headers) sur http://127.0.0.1:${PORT}`));
