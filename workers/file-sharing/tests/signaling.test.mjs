import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { unstable_dev } from 'wrangler';

let worker;
let origin;
const sockets = new Set();
before(async () => {
  if (process.env.CLOUD_TEST_URL) origin = process.env.CLOUD_TEST_URL;
  else {
    worker = await unstable_dev('workers/file-sharing/src/index.ts', {
      config: 'workers/file-sharing/wrangler.jsonc',
      local: true,
      ip: '127.0.0.1',
      port: 0,
      persist: false,
      logLevel: 'error',
      experimental: { disableExperimentalWarning: true },
    });
    origin = `http://${worker.address}:${worker.port}`;
  }
});
after(async () => {
  for (const socket of sockets) socket.terminate();
  await worker?.stop();
});
async function connect(overrides = {}) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/', { origin, ...overrides });
  sockets.add(socket);
  await once(socket, 'open');
  return socket;
}
async function receive(socket) {
  const [raw] = await once(socket, 'message', { signal: AbortSignal.timeout(5000) });
  return JSON.parse(raw.toString());
}
async function request(socket, message) {
  const pending = receive(socket);
  socket.send(JSON.stringify(message));
  return pending;
}

test('static routes have restrictive headers and health reports configured relay mode', async () => {
  if (origin.startsWith('https:')) {
    const redirect = await fetch(origin.replace(/^https:/, 'http:') + '/', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), origin + '/');
    const insecure = new WebSocket(origin.replace(/^https:/, 'ws:') + '/', { origin });
    sockets.add(insecure);
    await assert.rejects(once(insecure, 'open'), /403/);
  }
  for (const path of [
    '/',
    '/receive/',
    '/terms/',
    '/privacy/',
    '/help/',
    '/contact/',
    '/security/',
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' 'sha256-/);
    assert.equal(csp.includes('unsafe-inline'), false);
    assert.ok(csp.includes(origin.replace(/^http/, 'ws')));
    const html = await response.text();
    assert.ok(html.includes('Terms &amp; Conditions'));
    assert.ok(html.includes('Privacy'));
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  }
  assert.deepEqual(await (await fetch(origin + '/health')).json(), {
    ok: true,
    network: process.env.CLOUD_TEST_NETWORK || 'stun',
    relay: process.env.CLOUD_TEST_NETWORK === 'turn',
  });
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
  assert.equal((await fetch(origin + '/missing-page/')).status, 404);
});

test('only an admitted single receiver obtains ICE; signals and cancellation follow ownership', async () => {
  const sender = await connect();
  const created = await request(sender, { type: 'create' });
  assert.equal(created.type, 'created');
  assert.equal(created.ice, undefined);
  const invalid = await connect();
  assert.equal(
    (await request(invalid, { type: 'join', id: created.id, admission: 'a'.repeat(43) })).type,
    'error',
  );
  const receiver = await connect();
  const paired = receive(sender);
  const joined = await request(receiver, {
    type: 'join',
    id: created.id,
    admission: created.admission,
  });
  assert.equal(joined.type, 'joined');
  assert.equal(joined.ice.mode, process.env.CLOUD_TEST_NETWORK || 'stun');
  assert.equal((await paired).type, 'paired');
  const third = await connect();
  assert.equal(
    (await request(third, { type: 'join', id: created.id, admission: created.admission })).type,
    'error',
  );
  const offer = receive(receiver);
  sender.send(JSON.stringify({ type: 'signal', data: { type: 'offer', sdp: 'synthetic' } }));
  assert.equal((await offer).data.sdp, 'synthetic');
  const ended = receive(receiver);
  assert.equal((await request(sender, { type: 'cancel' })).reason, 'cancelled');
  assert.equal((await ended).reason, 'cancelled');
  const stale = await connect();
  assert.equal(
    (await request(stale, { type: 'join', id: created.id, admission: created.admission })).type,
    'error',
  );
});

test('foreign origins, unauthenticated signals, binary and oversized messages fail closed', async () => {
  await assert.rejects(connect({ origin: 'https://unrelated.example' }), /403/);
  const socket = await connect();
  assert.equal(
    (await request(socket, { type: 'signal', data: { type: 'offer', sdp: 'test' } })).type,
    'error',
  );
  for (const data of [Buffer.from('binary'), 'a'.repeat(32 * 1024 + 1)]) {
    const bad = await connect();
    const pending = receive(bad);
    bad.send(data);
    assert.equal((await pending).type, 'error');
  }
});

test('custom domain and Pages frontend can create and cancel an admitted session', async () => {
  for (const frontend of ['https://share.kkos.in', 'https://file2file-share.pages.dev']) {
    const socket = await connect({ origin: frontend });
    assert.equal((await request(socket, { type: 'create' })).type, 'created');
    assert.equal((await request(socket, { type: 'cancel' })).reason, 'cancelled');
  }
  await assert.rejects(connect({ origin: 'https://share.kkos.in.evil.example' }), /403/);
});

test('socket closure removes its session and a receiver cannot send an offer', async () => {
  const sender = await connect();
  const created = await request(sender, { type: 'create' });
  const receiver = await connect();
  const paired = receive(sender);
  await request(receiver, { type: 'join', id: created.id, admission: created.admission });
  await paired;
  const ended = receive(sender);
  assert.equal(
    (await request(receiver, { type: 'signal', data: { type: 'offer', sdp: 'bad role' } })).type,
    'error',
  );
  assert.equal((await ended).reason, 'disconnected');
});

test(
  'per-address upgrade cap bounds unauthenticated sockets and releases capacity',
  { skip: Boolean(process.env.CLOUD_TEST_URL) },
  async () => {
    const held = [];
    try {
      for (let i = 0; i < 8; i++) held.push(await connect());
      await assert.rejects(connect(), /429/);
      const closed = once(held[0], 'close');
      held[0].close();
      await closed;
      held.push(await connect());
    } finally {
      for (const socket of held) socket.close();
    }
  },
);
