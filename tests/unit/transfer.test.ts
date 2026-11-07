import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNK_BYTES,
  MAX_FILE_BYTES,
  parseManifest,
  parseSignal,
  safeFilename,
} from '../../src/contracts/transfer';
import {
  base64url,
  createLink,
  decryptRecord,
  deriveTransferKeys,
  encode,
  encryptRecord,
  parseLink,
  randomBytes,
  unlockLink,
} from '../../src/features/transfer/domain/crypto';
import { FileReceiver } from '../../src/features/transfer/domain/receiver';

test('link roundtrip, wrong PIN, metadata tampering, unsupported KDF and expiry', async () => {
  const id = base64url(randomBytes(16));
  const token = base64url(randomBytes(32));
  const link = await createLink(id, Date.now() + 60_000, token, '123456');
  const parsed = parseLink(link.fragment);
  const unlocked = await unlockLink(parsed, '123456');
  assert.deepEqual(unlocked.root, link.root);
  assert.equal(unlocked.admission, token);
  await assert.rejects(unlockLink(parsed, '123457'));
  await assert.rejects(unlockLink({ ...parsed, expiresAt: parsed.expiresAt + 1 }, '123456'));
  assert.throws(() => parseLink(base64url(encode({ ...parsed, kdf: 'PBKDF2-SHA256-1' }))));
  assert.throws(() => parseLink(base64url(encode({ ...parsed, v: 1 }))));
  assert.throws(() => parseLink(link.fragment, parsed.expiresAt + 1));
  assert.throws(() => parseLink('x'.repeat(4097)));
  unlocked.root.fill(0);
  link.root.fill(0);
});

test('record integrity binds ciphertext, session, sequence and direction', async () => {
  const root = randomBytes(32);
  const id = base64url(randomBytes(16));
  const keys = await deriveTransferKeys(root, id);
  root.fill(0);
  const plain = encode({ type: 'ready' });
  const record = await encryptRecord(keys.receiver, id, 'receiver', 0, plain);
  assert.deepEqual(await decryptRecord(keys.receiver, id, 'receiver', 0, record), plain);
  const changed = record.slice();
  changed[changed.length - 1] ^= 1;
  await assert.rejects(decryptRecord(keys.receiver, id, 'receiver', 0, changed));
  await assert.rejects(decryptRecord(keys.receiver, `${id}x`, 'receiver', 0, record));
  await assert.rejects(decryptRecord(keys.sender, id, 'sender', 0, record));
  await assert.rejects(decryptRecord(keys.receiver, id, 'receiver', 1, record));
});

test('receiver requires exact chunks and authenticated completion before creating a download', async () => {
  const id = base64url(randomBytes(16));
  const keys = await deriveTransferKeys(randomBytes(32), id);
  const encrypt = (sequence: number, bytes: Uint8Array<ArrayBuffer>) =>
    encryptRecord(keys.sender, id, 'sender', sequence, bytes);
  const receiver = new FileReceiver(keys.sender, id);
  const bytes = new Uint8Array(CHUNK_BYTES + 7).fill(71);
  await receiver.accept(
    await encrypt(
      0,
      encode({
        type: 'manifest',
        name: 'a.bin',
        size: bytes.length,
        chunkSize: CHUNK_BYTES,
        chunks: 2,
      }),
    ),
  );
  await receiver.accept(await encrypt(1, bytes.slice(0, CHUNK_BYTES)));
  assert.throws(() => receiver.takeBlob());
  await assert.rejects(
    receiver.accept(await encrypt(3, encode({ type: 'complete', size: bytes.length, chunks: 2 }))),
  );
  await receiver.accept(await encrypt(2, bytes.slice(CHUNK_BYTES)));
  assert.throws(() => receiver.takeBlob());
  await receiver.accept(
    await encrypt(3, encode({ type: 'complete', size: bytes.length, chunks: 2 })),
  );
  assert.deepEqual(new Uint8Array(await receiver.takeBlob().arrayBuffer()), bytes);
  await assert.rejects(receiver.accept(await encrypt(4, encode({ type: 'complete' }))));
});

test('zero-byte files verify and cancellation prevents output', async () => {
  const id = base64url(randomBytes(16));
  const keys = await deriveTransferKeys(randomBytes(32), id);
  const receiver = new FileReceiver(keys.sender, id);
  await receiver.accept(
    await encryptRecord(
      keys.sender,
      id,
      'sender',
      0,
      encode({ type: 'manifest', name: 'empty', size: 0, chunkSize: CHUNK_BYTES, chunks: 0 }),
    ),
  );
  await receiver.accept(
    await encryptRecord(
      keys.sender,
      id,
      'sender',
      1,
      encode({ type: 'complete', size: 0, chunks: 0 }),
    ),
  );
  assert.equal(receiver.takeBlob().size, 0);
  const cancelled = new FileReceiver(keys.sender, id);
  cancelled.clear();
  await assert.rejects(
    cancelled.accept(await encryptRecord(keys.sender, id, 'sender', 0, encode({}))),
  );
});

test('malicious manifest, filename and signaling limits', () => {
  const valid = { type: 'manifest', name: 'file', size: 0, chunks: 0, chunkSize: CHUNK_BYTES };
  assert.throws(() => parseManifest({ ...valid, size: MAX_FILE_BYTES + 1 }));
  assert.throws(() => parseManifest({ ...valid, size: -1 }));
  assert.throws(() => parseManifest({ ...valid, size: 1, chunks: 0 }));
  assert.throws(() => parseManifest({ ...valid, name: 'a'.repeat(256) }));
  assert.throws(() => parseSignal({ type: 'offer', sdp: 'x'.repeat(25 * 1024) }));
  assert.throws(() =>
    parseSignal({ type: 'candidate', candidate: 'x', sdpMid: null, sdpMLineIndex: -1 }),
  );
  assert.equal(safeFilename('../a\u202e.exe'), '_a.exe');
});

test('duplicate records and incorrect final chunk length are rejected', async () => {
  const id = base64url(randomBytes(16));
  const keys = await deriveTransferKeys(randomBytes(32), id);
  const receiver = new FileReceiver(keys.sender, id);
  const header = await encryptRecord(
    keys.sender,
    id,
    'sender',
    0,
    encode({ type: 'manifest', name: 'test', size: 2, chunkSize: CHUNK_BYTES, chunks: 1 }),
  );
  await receiver.accept(header);
  await assert.rejects(receiver.accept(header));
  await assert.rejects(
    receiver.accept(await encryptRecord(keys.sender, id, 'sender', 1, new Uint8Array([1]))),
  );
  receiver.clear();
});
