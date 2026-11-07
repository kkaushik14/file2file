import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createIceProvider } from '../src/ice';
import { parseIceConfiguration } from '../../../src/contracts/ice';

const secret = randomBytes(32).toString('base64');
const env = {
  TRANSFER_NETWORK: 'turn',
  STUN_URLS: 'stun:turn.example.com:3478',
  TURN_URLS: 'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp',
};

test('public STUN mode cannot silently claim a relay or contain TURN credentials', () => {
  const config = {
    mode: 'stun',
    iceTransportPolicy: 'all',
    expiresAt: Date.now() + 60_000,
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
  };
  assert.equal(parseIceConfiguration(config).mode, 'stun');
  assert.throws(() => parseIceConfiguration({ ...config, iceTransportPolicy: 'relay' }));
  assert.throws(() =>
    parseIceConfiguration({
      ...config,
      iceServers: createIceProvider(env, secret).issue(config.expiresAt).iceServers,
    }),
  );
});

test('TURN credentials follow coturn REST auth, remain separate per peer and expire with the session', () => {
  const provider = createIceProvider(env, secret);
  const expiry = Date.now() + 15 * 60_000;
  const first = parseIceConfiguration(provider.issue(expiry));
  const second = provider.issue(expiry);
  assert.equal(first.iceTransportPolicy, 'all');
  assert.equal(first.expiresAt, (Math.ceil(expiry / 1000) + 60) * 1000);
  const turn = first.iceServers[1];
  assert.notEqual(turn.username, second.iceServers[1].username);
  assert.equal(turn.credential, createHmac('sha1', secret).update(turn.username!).digest('base64'));
  assert.equal(JSON.stringify(first).includes(secret), false);
  assert.equal(
    createIceProvider({ ...env, ICE_TRANSPORT_POLICY: 'relay' }, secret).issue(expiry)
      .iceTransportPolicy,
    'relay',
  );
  assert.throws(() => parseIceConfiguration(first, first.expiresAt));
});

test('incomplete or unsafe ICE configuration fails instead of silently falling back', () => {
  for (const overrides of [
    { TRANSFER_NETWORK: 'unknown' },
    { TURN_URLS: '' },
    { ICE_TRANSPORT_POLICY: 'invalid' },
    { TURN_URLS: 'https://turn.example.com' },
    { TURN_URLS: 'turn:user:password@turn.example.com' },
    { TURN_URLS: 'turns:turn.example.com?transport=udp' },
    { STUN_URLS: 'stun:example.com:99999' },
  ])
    assert.throws(() => createIceProvider({ ...env, ...overrides }, secret));
  assert.throws(() => createIceProvider(env));
  assert.throws(() => createIceProvider(env, 'short'));
  assert.throws(() => createIceProvider({ TURN_URLS: env.TURN_URLS }, secret));
  const local = parseIceConfiguration(createIceProvider({}).issue(Date.now() + 60_000));
  assert.deepEqual(local.iceServers, [{ urls: ['stun:127.0.0.1:8788'] }]);
  assert.throws(() => parseIceConfiguration({ ...local, mode: ['local'] }));
  assert.throws(() => parseIceConfiguration({ ...local, mode: 'turn' }));
  assert.throws(() => parseIceConfiguration({ ...local, iceTransportPolicy: 'relay' }));
  assert.throws(() =>
    parseIceConfiguration({ ...local, iceServers: [{ urls: ['stun:elsewhere.example'] }] }),
  );
  const configured = createIceProvider(env, secret).issue(Date.now() + 60_000);
  configured.iceServers[1].credential = 'invalid';
  assert.throws(() => parseIceConfiguration(configured));
});
