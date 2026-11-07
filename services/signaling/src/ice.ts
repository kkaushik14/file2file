import { createHmac, randomBytes } from 'node:crypto';
import { validIceUrl, type IceConfiguration } from '../../../src/contracts/ice';

export type IceProvider = {
  mode: 'local' | 'turn';
  issue: (expiresAt: number) => IceConfiguration;
};

export function createIceProvider(env: NodeJS.ProcessEnv, secret?: string): IceProvider {
  const mode = env.TRANSFER_NETWORK || 'local';
  if (mode === 'local') {
    if (env.STUN_URLS || env.TURN_URLS || env.TURN_SECRET_FILE || env.ICE_TRANSPORT_POLICY)
      throw new Error('Set TRANSFER_NETWORK=turn to use relay settings.');
    return {
      mode,
      issue: (expiresAt) => ({
        mode,
        iceTransportPolicy: 'all',
        expiresAt,
        iceServers: [{ urls: ['stun:127.0.0.1:8788'] }],
      }),
    };
  }
  if (mode !== 'turn') throw new Error('TRANSFER_NETWORK must be local or turn.');
  const urls = (value: string | undefined, kind: 'stun' | 'turn') => {
    if (!value && kind === 'stun') return [];
    const list = (value || '').split(',').map((item) => item.trim());
    if (list.length > 8 || !list.every((url) => validIceUrl(url, kind)))
      throw new Error(`Invalid ${kind.toUpperCase()}_URLS configuration.`);
    return list;
  };
  const stun = urls(env.STUN_URLS, 'stun');
  const turn = urls(env.TURN_URLS, 'turn');
  if (!secret || !/^[A-Za-z0-9+/=_-]{43,256}$/.test(secret))
    throw new Error(
      'TURN_SECRET_FILE must contain a random secret of at least 32 bytes, encoded as base64 or hex.',
    );
  const policy = env.ICE_TRANSPORT_POLICY || 'all';
  if (policy !== 'all' && policy !== 'relay')
    throw new Error('ICE_TRANSPORT_POLICY must be all or relay.');
  return {
    mode,
    issue: (sessionExpiry) => {
      // Covers the remaining session plus a small clock-skew allowance. Never refreshed.
      const expiresAt = (Math.ceil(sessionExpiry / 1000) + 60) * 1000;
      const username = `${expiresAt / 1000}:${randomBytes(16).toString('base64url')}`;
      const credential = createHmac('sha1', secret).update(username).digest('base64');
      return {
        mode,
        expiresAt,
        iceTransportPolicy: policy,
        iceServers: [
          ...(stun.length ? [{ urls: stun }] : []),
          { urls: turn, username, credential },
        ],
      };
    },
  };
}
