import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const pages = process.argv.includes('--pages');
const hosting = JSON.parse(await readFile('workers/file-sharing/hosting.json', 'utf8'));
const signalOrigin = hosting.signalingOrigin.replace(/^https:/, 'wss:');
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_SIGNAL_URL: pages ? signalOrigin : 'same-origin',
    NEXT_PUBLIC_NETWORK_MODE: 'stun',
  },
});
if (result.status !== 0) process.exit(result.status || 1);
const hashes = new Set();
const pageHashes = new Map();
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (path.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      const current = new Set();
      for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        const hash = `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`;
        current.add(hash);
        hashes.add(hash);
      }
      pageHashes.set('/' + relative('out', path), [...current]);
    }
  }
}
await collect('out');
if (pages) {
  await rm('pages-out', { recursive: true, force: true });
  await cp('out', 'pages-out', { recursive: true });
  const policy = (scripts) =>
    `default-src 'self'; script-src 'self' ${scripts.join(' ')}; style-src 'self'; img-src 'self' data:; connect-src 'self' ${signalOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  // The fallback covers unknown URLs served by 404.html. Each known HTML route
  // replaces it, keeping the full policy below Pages' 2,000-character line cap.
  let headers = `/*\n  Content-Security-Policy: ${policy(pageHashes.get('/404.html') || [])}\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000\n  X-Robots-Tag: noindex, nofollow\n`;
  let rules = 1;
  for (const [file, scripts] of pageHashes) {
    const route = file.endsWith('/index.html') ? file.slice(0, -10) : file.slice(0, -5);
    for (const path of new Set([route, route === '/' ? '/' : route.replace(/\/$/, ''), file])) {
      headers += `\n${path}\n  ! Content-Security-Policy\n  Content-Security-Policy: ${policy(scripts)}\n`;
      rules += 1;
    }
  }
  if (rules > 100 || headers.split('\n').some((line) => Buffer.byteLength(line) > 2000))
    throw new Error('Pages security headers exceed the hosting limits.');
  await writeFile('pages-out/_headers', headers);
  console.log('Pages export ready in pages-out with explicit WSS and script hashes.');
  process.exit(0);
}
await mkdir('workers/file-sharing/generated', { recursive: true });
await writeFile('workers/file-sharing/generated/csp.json', JSON.stringify([...hashes]));
console.log('Cloud preview built with same-origin signaling and script hashes.');
