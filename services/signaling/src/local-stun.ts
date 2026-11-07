import { createSocket } from 'node:dgram';
import { crc32 } from 'node:zlib';

const COOKIE = 0x2112a442;

// Only the unauthenticated IPv4 Binding subset needed by the same-machine demo.
// Keep this on loopback; hosted deployments need a maintained STUN/TURN service.
export async function startLocalStun(port = 8788) {
  const socket = createSocket('udp4');
  let windowStart = Date.now();
  let requests = 0;
  socket.on('message', (message, remote) => {
    if (Date.now() - windowStart >= 1000) {
      windowStart = Date.now();
      requests = 0;
    }
    if (
      ++requests > 100 ||
      remote.address !== '127.0.0.1' ||
      message.length < 20 ||
      message.length > 512 ||
      message.readUInt16BE(0) !== 0x0001 ||
      message.readUInt32BE(4) !== COOKIE ||
      message.readUInt16BE(2) !== message.length - 20 ||
      message.length % 4 !== 0
    )
      return;

    for (let offset = 20; offset < message.length;) {
      if (offset + 4 > message.length) return;
      const type = message.readUInt16BE(offset);
      const length = message.readUInt16BE(offset + 2);
      const end = offset + 4 + Math.ceil(length / 4) * 4;
      // No credentials, allocation, or other comprehension-required extensions.
      if (end > message.length || type < 0x8000) return;
      if (
        type === 0x8028 &&
        (length !== 4 ||
          end !== message.length ||
          message.readUInt32BE(offset + 4) !==
            (crc32(message.subarray(0, offset)) ^ 0x5354554e) >>> 0)
      )
        return;
      offset = end;
    }

    const response = Buffer.alloc(32);
    response.writeUInt16BE(0x0101, 0);
    response.writeUInt16BE(12, 2);
    message.copy(response, 4, 4, 20); // Cookie and the client's transaction ID.
    response.writeUInt16BE(0x0020, 20); // XOR-MAPPED-ADDRESS (RFC 8489 §14.2).
    response.writeUInt16BE(8, 22);
    response[25] = 1; // IPv4.
    response.writeUInt16BE(remote.port ^ (COOKIE >>> 16), 26);
    response.writeUInt32BE((0x7f000001 ^ COOKIE) >>> 0, 28);
    socket.send(response, remote.port, remote.address, () => {
      // UDP delivery failure needs no retry; the browser owns Binding retries.
    });
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, '127.0.0.1', () => {
      socket.off('error', reject);
      resolve();
    });
  });
  return socket;
}
