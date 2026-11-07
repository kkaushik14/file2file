import { object, SESSION_TTL_MS } from './transfer';

export type IceServer = { urls: string[]; username?: string; credential?: string };
export type IceConfiguration = {
  mode: 'local' | 'stun' | 'turn';
  iceTransportPolicy: 'all' | 'relay';
  iceServers: IceServer[];
  expiresAt: number;
};

export function validIceUrl(url: string, kind: 'stun' | 'turn') {
  if (url.length > 512) return false;
  const match =
    /^(stun|turn|turns):([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(
      url,
    );
  if (!match || (kind === 'stun' ? match[1] !== 'stun' : match[1] === 'stun')) return false;
  if (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535)) return false;
  if (match[1] === 'stun' && match[4]) return false;
  return match[1] !== 'turns' || match[4] !== 'udp';
}

export function parseIceConfiguration(value: unknown, now = Date.now()): IceConfiguration {
  const config = object(value);
  if (
    !['local', 'stun', 'turn'].includes(config.mode as string) ||
    (config.iceTransportPolicy !== 'all' && config.iceTransportPolicy !== 'relay') ||
    !Number.isSafeInteger(config.expiresAt) ||
    (config.expiresAt as number) <= now ||
    (config.expiresAt as number) > now + SESSION_TTL_MS + 61_000 ||
    !Array.isArray(config.iceServers) ||
    config.iceServers.length < 1 ||
    config.iceServers.length > 2
  )
    throw new Error('Invalid connection configuration.');
  let hasTurn = false;
  const iceServers = config.iceServers.map((value): IceServer => {
    const server = object(value);
    if (!Array.isArray(server.urls) || server.urls.length < 1 || server.urls.length > 8)
      throw new Error('Invalid connection servers.');
    const turn = typeof server.urls[0] === 'string' && server.urls[0].startsWith('turn');
    if (
      !server.urls.every(
        (url) => typeof url === 'string' && validIceUrl(url, turn ? 'turn' : 'stun'),
      )
    )
      throw new Error('Invalid connection server URL.');
    if (turn) {
      hasTurn = true;
      if (
        typeof server.username !== 'string' ||
        !/^\d{10,12}:[A-Za-z0-9_-]{22}$/.test(server.username) ||
        typeof server.credential !== 'string' ||
        !/^[A-Za-z0-9+/]{27}=$/.test(server.credential) ||
        Number(server.username.split(':')[0]) * 1000 !== config.expiresAt
      )
        throw new Error('Invalid temporary relay credentials.');
      return { urls: server.urls, username: server.username, credential: server.credential };
    }
    if (server.username !== undefined || server.credential !== undefined)
      throw new Error('Unexpected discovery credentials.');
    return { urls: server.urls };
  });
  if (
    config.mode === 'turn'
      ? !hasTurn
      : config.mode === 'stun'
        ? hasTurn || config.iceTransportPolicy !== 'all'
        : config.iceTransportPolicy !== 'all' ||
          iceServers.length !== 1 ||
          iceServers[0].urls.length !== 1 ||
          iceServers[0].urls[0] !== 'stun:127.0.0.1:8788'
  )
    throw new Error('Incomplete connection configuration.');
  return {
    mode: config.mode as IceConfiguration['mode'],
    iceTransportPolicy: config.iceTransportPolicy as IceConfiguration['iceTransportPolicy'],
    expiresAt: config.expiresAt as number,
    iceServers,
  };
}
