import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSignalingUrl } from '../../src/features/transfer/domain/signaling';

test('public origins require explicit WSS; loopback retains local defaults', () => {
  assert.equal(resolveSignalingUrl('localhost'), 'ws://localhost:8787');
  assert.equal(resolveSignalingUrl('[::1]'), 'ws://[::1]:8787');
  assert.equal(
    resolveSignalingUrl('app.example.com', 'wss://signal.example.com'),
    'wss://signal.example.com/',
  );
  assert.equal(
    resolveSignalingUrl('localhost', 'wss://signal.example.com'),
    'wss://signal.example.com/',
  );
  for (const url of [
    undefined,
    'ws://signal.example.com',
    'wss://user:secret@signal.example.com',
    'wss://signal.example.com/?secret=x',
    'wss://signal.example.com/path',
    'wss://signal.example.com/#key',
  ])
    assert.throws(() => resolveSignalingUrl('app.example.com', url));
});

test('same-origin cloud signaling preserves the host and requires secure public transport', () => {
  assert.equal(
    resolveSignalingUrl('example.workers.dev', 'same-origin', 'https://example.workers.dev'),
    'wss://example.workers.dev/',
  );
  assert.equal(
    resolveSignalingUrl('127.0.0.1', 'same-origin', 'http://127.0.0.1:8789'),
    'ws://127.0.0.1:8789/',
  );
  assert.throws(() => resolveSignalingUrl('example.com', 'same-origin', 'http://example.com'));
  assert.throws(() => resolveSignalingUrl('example.com', 'same-origin', 'https://elsewhere.com'));
});
