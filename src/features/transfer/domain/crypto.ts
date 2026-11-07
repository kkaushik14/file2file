import {
  ID_PATTERN,
  KDF_PROFILE,
  MAX_RECORD_BYTES,
  object,
  SESSION_TTL_MS,
  TOKEN_PATTERN,
  validPin,
  type LinkEnvelope,
} from '@/contracts/transfer';

export type Bytes = Uint8Array<ArrayBuffer>;
export type Direction = 'sender' | 'receiver';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const encode = (value: unknown) => encoder.encode(JSON.stringify(value));
export const decode = (bytes: Bytes): unknown => JSON.parse(decoder.decode(bytes));
export const randomBytes = (length: number): Bytes =>
  crypto.getRandomValues(new Uint8Array(length));

export function base64url(bytes: Bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function unbase64url(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > 4096) throw new Error('Invalid link.');
  const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
  if (base64url(bytes) !== text) throw new Error('Invalid link encoding.');
  return bytes;
}

function exactBytes(value: unknown, size: number) {
  if (typeof value !== 'string') throw new Error('Invalid link.');
  const bytes = unbase64url(value);
  if (bytes.length !== size) throw new Error('Invalid link.');
  return bytes;
}

export function parseLink(fragment: string, now = Date.now()): LinkEnvelope {
  if (!fragment || fragment.length > 4096) throw new Error('This link is missing or invalid.');
  const e = object(decode(unbase64url(fragment.replace(/^#/, ''))));
  if (
    e.v !== 2 ||
    e.kdf !== KDF_PROFILE ||
    typeof e.id !== 'string' ||
    !ID_PATTERN.test(e.id) ||
    !Number.isSafeInteger(e.expiresAt) ||
    (e.expiresAt as number) <= now ||
    (e.expiresAt as number) > now + SESSION_TTL_MS + 60_000 ||
    typeof e.wrapped !== 'string' ||
    e.wrapped.length > 1024
  )
    throw new Error('This link is invalid, expired, or unsupported.');
  exactBytes(e.salt, 16);
  exactBytes(e.iv, 12);
  exactBytes(e.secret, 32);
  if (unbase64url(e.wrapped).length < 17) throw new Error('Invalid link.');
  return e as LinkEnvelope;
}

async function wrappingKey(secret: string, pin: string, salt: Bytes) {
  if (!validPin(pin)) throw new Error('Use a 6- or 8-digit PIN.');
  const input = encoder.encode(`${secret}:${pin}`);
  try {
    const material = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    input.fill(0);
  }
}

const wrapAAD = (id: string, expiry: number) => encode(['file2file', 2, 'wrap', id, expiry]);

export async function createLink(id: string, expiresAt: number, admission: string, pin: string) {
  const root = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const secret = base64url(randomBytes(32));
  const key = await wrappingKey(secret, pin, salt);
  const payload = encode({ key: base64url(root), admission });
  try {
    const wrapped = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: wrapAAD(id, expiresAt) },
      key,
      payload,
    );
    const envelope: LinkEnvelope = {
      v: 2,
      id,
      expiresAt,
      kdf: KDF_PROFILE,
      salt: base64url(salt),
      iv: base64url(iv),
      secret,
      wrapped: base64url(new Uint8Array(wrapped)),
    };
    return { envelope, root, fragment: base64url(encode(envelope)) };
  } catch (error) {
    root.fill(0);
    throw error;
  } finally {
    payload.fill(0);
  }
}

export async function unlockLink(envelope: LinkEnvelope, pin: string) {
  parseLink(base64url(encode(envelope)));
  const key = await wrappingKey(envelope.secret, pin, unbase64url(envelope.salt));
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unbase64url(envelope.iv),
        additionalData: wrapAAD(envelope.id, envelope.expiresAt),
      },
      key,
      unbase64url(envelope.wrapped),
    ),
  );
  try {
    const payload = object(decode(plain));
    if (typeof payload.admission !== 'string' || !TOKEN_PATTERN.test(payload.admission))
      throw new Error('Invalid admission.');
    return { root: exactBytes(payload.key, 32), admission: payload.admission };
  } finally {
    plain.fill(0);
  }
}

export async function deriveTransferKeys(root: Bytes, id: string) {
  const material = await crypto.subtle.importKey('raw', root, 'HKDF', false, ['deriveKey']);
  const derive = (direction: Direction) =>
    crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode(id),
        info: encoder.encode(`file2file:v2:${direction}`),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  const [sender, receiver] = await Promise.all([derive('sender'), derive('receiver')]);
  return { sender, receiver };
}

function recordParameters(id: string, direction: Direction, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff)
    throw new Error('Invalid sequence.');
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, sequence);
  return {
    name: 'AES-GCM',
    iv,
    additionalData: encode(['file2file', 2, id, direction, sequence]),
    tagLength: 128,
  };
}

export async function encryptRecord(
  key: CryptoKey,
  id: string,
  direction: Direction,
  sequence: number,
  plain: Bytes,
): Promise<Bytes> {
  if (plain.length + 20 > MAX_RECORD_BYTES) throw new Error('Record too large.');
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(recordParameters(id, direction, sequence), key, plain),
  );
  const record = new Uint8Array(cipher.length + 4);
  new DataView(record.buffer).setUint32(0, sequence);
  record.set(cipher, 4);
  return record;
}

export async function decryptRecord(
  key: CryptoKey,
  id: string,
  direction: Direction,
  expected: number,
  record: Bytes,
): Promise<Bytes> {
  if (
    record.length < 20 ||
    record.length > MAX_RECORD_BYTES ||
    new DataView(record.buffer, record.byteOffset).getUint32(0) !== expected
  )
    throw new Error('Invalid or out-of-order record.');
  return new Uint8Array(
    await crypto.subtle.decrypt(recordParameters(id, direction, expected), key, record.slice(4)),
  );
}
