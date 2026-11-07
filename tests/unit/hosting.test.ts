import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsOrigin } from '../../workers/file-sharing/src/origin';

test('signaling permits the exact deployed frontend origins and rejects lookalikes', () => {
  const endpoint = 'https://file2file-preview.kumarkaushik871.workers.dev';
  for (const origin of [endpoint, 'https://share.kkos.in', 'https://file2file-share.pages.dev'])
    assert.equal(allowsOrigin(origin, endpoint), true);
  for (const origin of [
    null,
    'null',
    'http://share.kkos.in',
    'https://kkos.in',
    'https://share.kkos.in.evil.example',
    'https://other.pages.dev',
    'https://share.kkos.in:8443',
  ])
    assert.equal(allowsOrigin(origin, endpoint), false);
});
