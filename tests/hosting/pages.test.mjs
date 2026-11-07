import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';

const origin = 'http://127.0.0.1:8791';
let pagesProcess;
let output = '';
before(async () => {
  pagesProcess = spawn(
    globalThis.process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'pages',
      'dev',
      'pages-out',
      '--ip',
      '127.0.0.1',
      '--port',
      '8791',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [pagesProcess.stdout, pagesProcess.stderr])
    stream.on('data', (data) => {
      output = (output + data).slice(-8000);
    });
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (pagesProcess.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      /* Wait for local runtime startup. */
    }
    await setTimeout(200);
  }
  throw new Error(`Pages did not start: ${output}`);
});
after(async () => {
  if (pagesProcess && pagesProcess.exitCode === null) {
    const ended = once(pagesProcess, 'exit');
    pagesProcess.kill('SIGTERM');
    await ended;
  }
});

test('Pages serves a complete, valid CSP for every route and the not-found fallback', async () => {
  for (const path of [
    '/',
    '/receive/',
    '/terms/',
    '/privacy/',
    '/help/',
    '/contact/',
    '/security/',
    '/missing-page/',
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, path === '/missing-page/' ? 404 : 200, path);
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp, path);
    assert.equal(csp.includes('unsafe-inline'), false);
    assert.equal(
      csp.split('default-src').length,
      2,
      'The fallback policy must be replaced, not intersected.',
    );
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /wss:\/\/file2file-preview\.kumarkaushik871\.workers\.dev/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`;
      assert.ok(csp.includes(hash), `${path} must permit its own bootstrap scripts`);
    }
  }
  const response = await fetch(origin + '/.well-known/security.txt');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Contact: mailto:kumarkaushik871@gmail.com/);
});
