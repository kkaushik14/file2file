import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { unstable_dev } from 'wrangler';

test('hosted provider credentials are delivered only after valid admission', async () => {
  const worker = await unstable_dev('workers/file-sharing/src/index.ts', {
    config: 'workers/file-sharing/wrangler.jsonc',
    local: true,
    ip: '127.0.0.1',
    port: 0,
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
    vars: { TURN_USERNAME: 'synthetic-user', TURN_PASSWORD: 'synthetic-password' },
  });
  const sockets = [];
  const origin = `http://${worker.address}:${worker.port}`;
  const connect = async () => {
    const socket = new WebSocket(origin.replace('http:', 'ws:') + '/', { origin });
    sockets.push(socket);
    await once(socket, 'open');
    return socket;
  };
  const receive = async (socket) =>
    JSON.parse((await once(socket, 'message', { signal: AbortSignal.timeout(5000) }))[0]);
  const request = async (socket, value) => {
    const result = receive(socket);
    socket.send(JSON.stringify(value));
    return result;
  };
  try {
    assert.deepEqual(await (await fetch(origin + '/health')).json(), {
      ok: true,
      network: 'turn',
      relay: true,
    });
    const sender = await connect();
    const created = await request(sender, { type: 'create' });
    assert.equal(created.ice, undefined);
    const invalid = await connect();
    const rejected = await request(invalid, {
      type: 'join',
      id: created.id,
      admission: 'a'.repeat(43),
    });
    assert.equal(rejected.type, 'error');
    assert.equal(rejected.ice, undefined);
    const receiver = await connect();
    const paired = receive(sender);
    const joined = await request(receiver, {
      type: 'join',
      id: created.id,
      admission: created.admission,
    });
    for (const value of [joined, await paired]) {
      assert.equal(value.ice.mode, 'turn');
      assert.equal(value.ice.credentialMode, 'static');
      assert.ok(value.ice.expiresAt > created.expiresAt);
      assert.equal(value.ice.expiresAt, joined.expiresAt);
      assert.equal(value.ice.iceServers[1].username, 'synthetic-user');
      assert.equal(value.ice.iceServers[1].credential, 'synthetic-password');
    }
    const third = await connect();
    assert.equal(
      (await request(third, { type: 'join', id: created.id, admission: created.admission })).type,
      'error',
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await worker.stop();
  }
});
