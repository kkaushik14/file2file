export const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_FILE_LABEL = '8 GiB';
export const MIN_CHUNK_BYTES = 12 * 1024;
export const CHUNK_BYTES = 48 * 1024;
export const TRANSFER_WINDOW_BYTES = CHUNK_BYTES * 80;
export const TRANSFER_ACK_BYTES = 96 * 1024;
export const MAX_RECORD_BYTES = CHUNK_BYTES + 20;
export const SESSION_TTL_MS = 15 * 60 * 1000;
export const ACTIVE_TRANSFER_TTL_MS = 60 * 60 * 1000;
export const KDF_PROFILE = 'PBKDF2-SHA256-600000';
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export type Manifest = {
  type: 'manifest';
  name: string;
  size: number;
  chunkSize: number;
  chunks: number;
};

export type LinkEnvelope = {
  v: 2;
  id: string;
  expiresAt: number;
  kdf: typeof KDF_PROFILE;
  salt: string;
  iv: string;
  secret: string;
  wrapped: string;
};

export type SignalData =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'candidate'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid record.');
  return value as Record<string, unknown>;
}

export function validPin(pin: string) {
  return /^(?:\d{6}|\d{8})$/.test(pin);
}

export function parseManifest(value: unknown): Manifest {
  const m = object(value);
  if (
    m.type !== 'manifest' ||
    typeof m.name !== 'string' ||
    m.name.length < 1 ||
    m.name.length > 255 ||
    !Number.isSafeInteger(m.size) ||
    (m.size as number) < 0 ||
    (m.size as number) > MAX_FILE_BYTES ||
    (m.chunkSize !== CHUNK_BYTES && m.chunkSize !== MIN_CHUNK_BYTES) ||
    m.chunks !== Math.ceil((m.size as number) / (m.chunkSize as number))
  )
    throw new Error('Invalid file manifest.');
  return m as Manifest;
}

export function parseSignal(value: unknown): SignalData {
  const s = object(value);
  if (
    (s.type === 'offer' || s.type === 'answer') &&
    typeof s.sdp === 'string' &&
    s.sdp.length <= 24 * 1024
  ) {
    return { type: s.type, sdp: s.sdp };
  }
  if (
    s.type === 'candidate' &&
    typeof s.candidate === 'string' &&
    s.candidate.length <= 4096 &&
    (s.sdpMid === null || (typeof s.sdpMid === 'string' && s.sdpMid.length <= 256)) &&
    (s.sdpMLineIndex === null ||
      (Number.isInteger(s.sdpMLineIndex) &&
        (s.sdpMLineIndex as number) >= 0 &&
        (s.sdpMLineIndex as number) < 32))
  ) {
    return {
      type: 'candidate',
      candidate: s.candidate,
      sdpMid: s.sdpMid as string | null,
      sdpMLineIndex: s.sdpMLineIndex as number | null,
    };
  }
  throw new Error('Invalid signaling message.');
}

export function safeFilename(name: string) {
  const cleaned = Array.from(name)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (
        code >= 32 &&
        code !== 127 &&
        !(code >= 0x202a && code <= 0x202e) &&
        !(code >= 0x2066 && code <= 0x2069)
      );
    })
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 255) || 'download';
}
