import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { frontendOrigin, signalingOrigin } = JSON.parse(
  await readFile('workers/file-sharing/hosting.json', 'utf8'),
);
for (const path of [
  '/',
  '/receive/',
  '/terms/',
  '/privacy/',
  '/help/',
  '/contact/',
  '/security/',
  '/.well-known/security.txt',
]) {
  const response = await fetch(frontendOrigin + path, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', path);
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  const content = await response.text();
  if (path === '/contact/' || path.endsWith('security.txt'))
    assert.ok(content.includes('kumarkaushik871@gmail.com'));
  console.log(`Verified ${path}`);
}
const response = await fetch(signalingOrigin + '/health', { signal: AbortSignal.timeout(20_000) });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, network: 'stun', relay: false });
console.log('Verified STUN-only signaling health.');
