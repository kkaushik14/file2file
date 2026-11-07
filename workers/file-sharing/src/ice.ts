import { parseIceConfiguration, type IceConfiguration } from '../../../src/contracts/ice';
import { object } from '../../../src/contracts/transfer';

const STUN_HOST = 'stun.cloudflare.com';
const TURN_HOST = 'free.expressturn.com';

export type RelayEnvironment = {
  TURN_USERNAME?: string;
  TURN_PASSWORD?: string;
  TURN_POLICY?: string;
};

export function relayEnabled(env: RelayEnvironment) {
  if (!env.TURN_USERNAME && !env.TURN_PASSWORD && !env.TURN_POLICY) return false;
  if (
    !env.TURN_USERNAME ||
    env.TURN_USERNAME === '<redacted>' ||
    env.TURN_PASSWORD === '<redacted>' ||
    !/^[\x21-\x7e]{1,256}$/.test(env.TURN_USERNAME) ||
    !env.TURN_PASSWORD ||
    !/^[\x21-\x7e]{1,256}$/.test(env.TURN_PASSWORD) ||
    (env.TURN_POLICY !== undefined && !['all', 'relay'].includes(env.TURN_POLICY))
  )
    throw new Error('Incomplete relay configuration');
  return true;
}

function publicIpv4(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  const parts = value.split('.').map(Number);
  if (parts.some((part, index) => part > 255 || String(part) !== value.split('.')[index]))
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

// Some WebKit installations gather no usable candidates from STUN hostnames.
// Keep the hostname (including its IPv6 path) and add fresh A records, never
// hardcoded addresses. Only the fixed provider hostnames are resolved, server-side.
class PublicDiscovery {
  private addresses: string[] = [];
  private validUntil = 0;

  constructor(
    private host: typeof STUN_HOST | typeof TURN_HOST,
    private request: typeof fetch,
  ) {}

  async resolve(): Promise<string[]> {
    if (Date.now() >= this.validUntil) {
      this.addresses = [];
      this.validUntil = Date.now() + 30_000;
      try {
        const response = await this.request(
          `https://cloudflare-dns.com/dns-query?name=${this.host}&type=A`,
          {
            headers: { Accept: 'application/dns-json' },
            signal: AbortSignal.timeout(2000),
            redirect: 'manual',
          },
        );
        if (!response.ok || !response.body) throw new Error('Discovery unavailable');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 8192) throw new Error('Discovery response too large');
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const result = object(JSON.parse(new TextDecoder().decode(bytes)));
        if (result.Status !== 0 || result.TC === true || !Array.isArray(result.Answer))
          throw new Error('Discovery unavailable');
        let ttl = 300;
        for (const raw of result.Answer.slice(0, 16)) {
          const record = object(raw);
          if (
            (record.name !== this.host && record.name !== `${this.host}.`) ||
            record.type !== 1 ||
            !publicIpv4(record.data) ||
            typeof record.TTL !== 'number' ||
            !Number.isInteger(record.TTL) ||
            record.TTL <= 0
          )
            continue;
          ttl = Math.min(ttl, record.TTL);
          this.addresses.push(record.data);
          if (this.addresses.length === 2) break;
        }
        this.addresses = [...new Set(this.addresses)];
        if (this.addresses.length > 0) this.validUntil = Date.now() + ttl * 1000;
      } catch {
        // DNS outages must not prevent admission or remove the hostname path.
        this.addresses = [];
      }
    }
    return [this.host, ...this.addresses];
  }
}

export class HostedIce {
  private stun: PublicDiscovery;
  private turn: PublicDiscovery;

  constructor(request: typeof fetch = (...args) => fetch(...args)) {
    this.stun = new PublicDiscovery(STUN_HOST, request);
    this.turn = new PublicDiscovery(TURN_HOST, request);
  }

  async configuration(expiresAt: number, env: RelayEnvironment = {}): Promise<IceConfiguration> {
    const relay = relayEnabled(env);
    const [stun, turn] = await Promise.all([this.stun.resolve(), relay ? this.turn.resolve() : []]);
    return parseIceConfiguration({
      mode: relay ? 'turn' : 'stun',
      ...(relay ? { credentialMode: 'static' } : {}),
      iceTransportPolicy: relay && env.TURN_POLICY === 'relay' ? 'relay' : 'all',
      expiresAt,
      iceServers: [
        { urls: stun.map((host) => `stun:${host}:3478`) },
        ...(relay
          ? [
              {
                urls: turn.flatMap((host) =>
                  ['udp', 'tcp'].map((transport) => `turn:${host}:3478?transport=${transport}`),
                ),
                username: env.TURN_USERNAME,
                credential: env.TURN_PASSWORD,
              },
            ]
          : []),
      ],
    });
  }
}
