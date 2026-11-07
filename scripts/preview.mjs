import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';

const root = resolve('out');
const configuredSignal = process.env.NEXT_PUBLIC_SIGNAL_URL;
let signalSource = '';
if (configuredSignal) {
  const url = new URL(configuredSignal);
  if (
    url.protocol !== 'wss:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('NEXT_PUBLIC_SIGNAL_URL must be a secure signaling origin.');
  signalSource = url.origin;
}
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    const bytes = await readFile(file);
    const hashes =
      extname(file) === '.html'
        ? Array.from(bytes.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
            .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
            .join(' ')
        : '';
    response.writeHead(200, {
      'Content-Type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' ${hashes}; style-src 'self'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:8787 ws://localhost:8787 ${signalSource}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end('Not found');
  }
});
server.listen(4174, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4174'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
