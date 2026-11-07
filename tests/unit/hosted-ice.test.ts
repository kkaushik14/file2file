import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostedIce } from '../../workers/file-sharing/src/ice';
import { parseIceConfiguration } from '../../src/contracts/ice';

const record = (data: string, TTL = 60) => ({ name: 'stun.cloudflare.com.', type: 1, TTL, data });
const resolver = (Answer: unknown[]) => new Response(JSON.stringify({ Status: 0, Answer }));

test('hosted discovery retains hostname and caches only fresh public A records', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let calls = 0;
  const ice = new HostedIce(async (url, options) => {
    assert.equal(url, 'https://cloudflare-dns.com/dns-query?name=stun.cloudflare.com&type=A');
    assert.equal(options?.redirect, 'manual');
    calls++;
    return resolver([
      record('10.0.0.1'),
      { ...record('162.159.207.0', 2), name: 'stun.cloudflare.com' },
    ]);
  });
  const config = await ice.configuration(Date.now() + 60_000);
  assert.deepEqual(parseIceConfiguration(config).iceServers[0].urls, [
    'stun:stun.cloudflare.com:3478',
    'stun:162.159.207.0:3478',
  ]);
  await ice.configuration(Date.now() + 60_000);
  assert.equal(calls, 1);
  t.mock.timers.tick(2001);
  await ice.configuration(Date.now() + 60_000);
  assert.equal(calls, 2);
});

test('discovery outage or invalid DNS data safely falls back without private addresses', async () => {
  const responses = [
    () => {
      throw new Error('offline');
    },
    () => new Response('x'.repeat(8193)),
    () =>
      resolver([
        record('127.0.0.1'),
        record('192.168.1.1'),
        record('169.254.1.1'),
        record('999.1.1.1'),
        record('162.159.207.0', 0),
        { ...record('1.1.1.1'), name: 'attacker.example.' },
      ]),
    () => new Response(JSON.stringify({ Status: 2, Answer: [record('1.1.1.1')] })),
  ];
  for (const response of responses) {
    const ice = new HostedIce(async () => response());
    const config = await ice.configuration(Date.now() + 60_000);
    assert.deepEqual(config.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478'] }]);
  }
});

test('provider relay credentials are explicit and incomplete settings fail closed', async () => {
  const ice = new HostedIce(async () => resolver([]));
  const expiresAt = Date.now() + 60_000;
  const env = { TURN_USERNAME: 'fixture-user', TURN_PASSWORD: 'fixture-password' };
  const config = await ice.configuration(expiresAt, env);
  assert.equal(config.mode, 'turn');
  assert.equal(config.credentialMode, 'static');
  assert.equal(config.iceTransportPolicy, 'all');
  assert.deepEqual(config.iceServers[1], {
    urls: [
      'turn:free.expressturn.com:3478?transport=udp',
      'turn:free.expressturn.com:3478?transport=tcp',
    ],
    username: env.TURN_USERNAME,
    credential: env.TURN_PASSWORD,
  });
  assert.throws(() => parseIceConfiguration({ ...config, credentialMode: undefined }));
  assert.throws(() => parseIceConfiguration({ ...config, mode: 'stun' }));
  assert.equal(
    (await ice.configuration(expiresAt, { ...env, TURN_POLICY: 'relay' })).iceTransportPolicy,
    'relay',
  );
  for (const invalid of [
    { TURN_USERNAME: 'user' },
    { ...env, TURN_USERNAME: '<redacted>' },
    { ...env, TURN_PASSWORD: '<redacted>' },
    { TURN_PASSWORD: 'password' },
    { ...env, TURN_PASSWORD: 'bad\npassword' },
    { ...env, TURN_POLICY: 'invalid' },
  ])
    await assert.rejects(ice.configuration(expiresAt, invalid));
});
