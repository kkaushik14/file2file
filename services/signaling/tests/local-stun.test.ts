import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import test from 'node:test';
import { crc32 } from 'node:zlib';
import { startLocalStun } from '../src/local-stun';

function binding() {
  const request = Buffer.alloc(20);
  request.writeUInt16BE(1, 0);
  request.writeUInt32BE(0x2112a442, 4);
  randomBytes(12).copy(request, 8);
  return request;
}

test('loopback STUN returns the actual UDP source port and matching transaction', async () => {
  const server = await startLocalStun(0);
  const client = createSocket('udp4');
  try {
    const request = Buffer.concat([binding(), Buffer.alloc(8)]);
    request.writeUInt16BE(8, 2);
    request.writeUInt16BE(0x8028, 20);
    request.writeUInt16BE(4, 22);
    request.writeUInt32BE((crc32(request.subarray(0, 20)) ^ 0x5354554e) >>> 0, 24);
    const reply = once(client, 'message', { signal: AbortSignal.timeout(2000) });
    client.send(request, server.address().port, '127.0.0.1');
    const [response] = (await reply) as [Buffer];
    assert.equal(response.length, 32);
    assert.equal(response.readUInt16BE(0), 0x0101);
    assert.equal(response.readUInt16BE(2), 12);
    assert.deepEqual(response.subarray(4, 20), request.subarray(4, 20));
    assert.equal(response.readUInt16BE(20), 0x0020);
    assert.equal(response[25], 1);
    assert.equal(response.readUInt16BE(26) ^ 0x2112, client.address().port);
    assert.equal((response.readUInt32BE(28) ^ 0x2112a442) >>> 0, 0x7f000001);
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    client.close();
    server.close();
  }
});

test('loopback STUN ignores malformed, unsupported and oversized requests', async () => {
  const server = await startLocalStun(0);
  const client = createSocket('udp4');
  try {
    const wrongMethod = binding();
    wrongMethod.writeUInt16BE(3, 0); // TURN Allocate must never allocate a relay.
    const wrongCookie = binding();
    wrongCookie.writeUInt32BE(0, 4);
    const wrongLength = binding();
    wrongLength.writeUInt16BE(4, 2);
    const truncatedAttribute = Buffer.concat([binding(), Buffer.from([0x80, 0x22, 0, 8])]);
    truncatedAttribute.writeUInt16BE(4, 2);
    const requiredAttribute = Buffer.from(truncatedAttribute);
    requiredAttribute.writeUInt16BE(0x0006, 20);
    requiredAttribute.writeUInt16BE(0, 22);
    const badFingerprint = Buffer.concat([binding(), Buffer.from([0x80, 0x28, 0, 4, 0, 0, 0, 0])]);
    badFingerprint.writeUInt16BE(8, 2);
    const received: Buffer[] = [];
    client.on('message', (message) => received.push(message));
    for (const request of [
      Buffer.alloc(1),
      wrongMethod,
      wrongCookie,
      wrongLength,
      truncatedAttribute,
      requiredAttribute,
      badFingerprint,
      Buffer.alloc(516),
    ]) {
      client.send(request, server.address().port, '127.0.0.1');
    }
    const valid = binding();
    const reply = once(client, 'message', { signal: AbortSignal.timeout(2000) });
    client.send(valid, server.address().port, '127.0.0.1');
    await reply;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].subarray(8, 20), valid.subarray(8, 20));
  } finally {
    client.close();
    server.close();
  }
});
