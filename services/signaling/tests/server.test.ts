import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createSignalingServer } from '../src/server';
import { createIceProvider, type IceProvider } from '../src/ice';
import { randomBytes } from 'node:crypto';

const origin = 'http://127.0.0.1:4174';
async function fixture(ttlMs = 60_000, ice?: IceProvider, activeTtlMs?: number) {
  const app = createSignalingServer({ origins: [origin], ttlMs, ice, activeTtlMs });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const connect = async () => {
    const socket = new WebSocket(url, { origin });
    await once(socket, 'open');
    return socket;
  };
  return { ...app, url, connect };
}

test('relay credentials are issued only once per admitted peer, never on create or invalid admission', async () => {
  const provider = createIceProvider(
    { TRANSFER_NETWORK: 'turn', TURN_URLS: 'turn:relay.example:3478' },
    randomBytes(32).toString('base64'),
  );
  let issued = 0;
  const app = await fixture(60_000, {
    ...provider,
    issue: (expiry) => {
      issued += 1;
      return provider.issue(expiry);
    },
  });
  try {
    const sender = await app.connect();
    const created = await request(sender, { type: 'create' });
    assert.equal(created.ice, undefined);
    assert.equal(issued, 0);
    const wrong = await app.connect();
    const denied = await request(wrong, {
      type: 'join',
      id: created.id,
      admission: 'a'.repeat(43),
    });
    assert.equal(denied.type, 'error');
    assert.equal(denied.ice, undefined);
    assert.equal(issued, 0);
    const receiver = await app.connect();
    const paired = once(sender, 'message');
    const joined = await request(receiver, {
      type: 'join',
      id: created.id,
      admission: created.admission,
    });
    const sent = JSON.parse((await paired)[0].toString());
    assert.equal(joined.ice.mode, 'turn');
    assert.equal(sent.ice.mode, 'turn');
    assert.notEqual(joined.ice.iceServers[0].username, sent.ice.iceServers[0].username);
    assert.equal(issued, 2);
    const third = await app.connect();
    assert.equal(
      (await request(third, { type: 'join', id: created.id, admission: created.admission })).ice,
      undefined,
    );
    assert.equal((await request(receiver, { type: 'ice' })).type, 'error');
    assert.equal(issued, 2);
  } finally {
    await app.close();
  }
});
async function request(socket: WebSocket, message: unknown) {
  const pending = once(socket, 'message');
  socket.send(JSON.stringify(message));
  const [data] = await pending;
  return JSON.parse(data.toString());
}

test('only admitted receiver gets signaling; second receiver and wrong token fail', async () => {
  const app = await fixture();
  try {
    const sender = await app.connect();
    const created = await request(sender, { type: 'create' });
    const invalid = await app.connect();
    assert.equal(
      (await request(invalid, { type: 'join', id: created.id, admission: 'a'.repeat(43) })).type,
      'error',
    );
    const receiver = await app.connect();
    const paired = once(sender, 'message');
    assert.equal(
      (await request(receiver, { type: 'join', id: created.id, admission: created.admission }))
        .type,
      'joined',
    );
    await paired;
    const third = await app.connect();
    assert.equal(
      (await request(third, { type: 'join', id: created.id, admission: created.admission })).type,
      'error',
    );
    const offer = once(receiver, 'message');
    sender.send(JSON.stringify({ type: 'signal', data: { type: 'offer', sdp: 'synthetic-sdp' } }));
    assert.equal(JSON.parse((await offer)[0].toString()).data.sdp, 'synthetic-sdp');
    const ended = once(receiver, 'message');
    sender.close();
    assert.equal(JSON.parse((await ended)[0].toString()).type, 'ended');
  } finally {
    await app.close();
  }
});

test('expiry removes session and rejects stale admission', async () => {
  const app = await fixture(100);
  try {
    const sender = await app.connect();
    const created = await request(sender, { type: 'create' });
    assert.equal(JSON.parse((await once(sender, 'message'))[0].toString()).reason, 'expired');
    const receiver = await app.connect();
    assert.equal(
      (await request(receiver, { type: 'join', id: created.id, admission: created.admission }))
        .type,
      'error',
    );
  } finally {
    await app.close();
  }
});

test('rejects foreign origins and unauthenticated signaling', async () => {
  const app = await fixture();
  try {
    const denied = new WebSocket(app.url, { origin: 'https://unrelated.example' });
    const [error] = await once(denied, 'error');
    assert.match(error.message, /403/);
    const socket = await app.connect();
    assert.equal(
      (await request(socket, { type: 'signal', data: { type: 'offer', sdp: 'test' } })).type,
      'error',
    );
  } finally {
    await app.close();
  }
});

test('cancellation tears down session and invalid payload closes socket', async () => {
  const app = await fixture();
  try {
    const sender = await app.connect();
    const created = await request(sender, { type: 'create' });
    assert.equal((await request(sender, { type: 'cancel' })).reason, 'cancelled');
    const stale = await app.connect();
    assert.equal(
      (await request(stale, { type: 'join', id: created.id, admission: created.admission })).type,
      'error',
    );
    const bad = await app.connect();
    assert.equal((await request(bad, { type: 'create', unexpected: true })).type, 'created');
    assert.equal(
      (await request(bad, { type: 'signal', data: { type: 'file', data: 'plaintext' } })).type,
      'error',
    );
  } finally {
    await app.close();
  }
});

test('per-address upgrade cap rejects excess sockets and releases capacity after closure', async () => {
  const app = await fixture();
  try {
    const sockets = [];
    for (let i = 0; i < 8; i++) sockets.push(await app.connect());
    await assert.rejects(app.connect(), /429/);
    const closed = once(sockets[0], 'close');
    sockets[0].close();
    await closed;
    const replacement = await app.connect();
    assert.equal((await request(replacement, { type: 'create' })).type, 'created');
  } finally {
    await app.close();
  }
});

test('admission replaces the unused-link timer with a bounded active-transfer timer', async () => {
  const app = await fixture(150, undefined, 600);
  try {
    const sender = await app.connect();
    const created = await request(sender, { type: 'create' });
    const receiver = await app.connect();
    const paired = once(sender, 'message');
    const joined = await request(receiver, {
      type: 'join',
      id: created.id,
      admission: created.admission,
    });
    const senderPair = JSON.parse((await paired)[0].toString());
    assert.ok(joined.expiresAt > created.expiresAt);
    assert.equal(senderPair.expiresAt, joined.expiresAt);
    const ended = once(receiver, 'message');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(receiver.readyState, WebSocket.OPEN);
    const [message] = await ended;
    assert.equal(JSON.parse(message.toString()).reason, 'expired');
  } finally {
    await app.close();
  }
});
