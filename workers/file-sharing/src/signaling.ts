import { ConnectionBudget } from '../../../src/contracts/connection-budget';
import {
  ID_PATTERN,
  object,
  parseSignal,
  SESSION_TTL_MS,
  TOKEN_PATTERN,
} from '../../../src/contracts/transfer';
import type { IceConfiguration } from '../../../src/contracts/ice';
import { allowsOrigin } from './origin';

type Session = {
  id: string;
  sender: WebSocket;
  receiver?: WebSocket;
  admissionHash: Uint8Array;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};
const random = (length: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const hash = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
function equal(left: Uint8Array, right: Uint8Array) {
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
function ice(expiresAt: number): IceConfiguration {
  return {
    mode: 'stun',
    iceTransportPolicy: 'all',
    expiresAt,
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
  };
}

// Standard WebSockets intentionally keep this single hub in memory. A restart
// ends transfers; no socket attachments, SQL, KV, or file data are persisted.
export class SignalingHub {
  private connections = new ConnectionBudget();
  private sessions = new Map<string, Session>();
  private membership = new Map<WebSocket, Session>();
  private sockets = new Set<WebSocket>();
  private sentBytes = new Map<WebSocket, number>();
  private creationBudget = new Map<string, { count: number; until: number }>();
  private queue: Promise<void> = Promise.resolve();

  private send(socket: WebSocket, value: unknown) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify(value);
    const total = (this.sentBytes.get(socket) || 0) + new TextEncoder().encode(text).byteLength;
    // Bound the entire session's outgoing signaling even if a peer stops reading.
    if (total > 256 * 1024) {
      socket.close(1008);
      return;
    }
    this.sentBytes.set(socket, total);
    socket.send(text);
  }

  private remove(session: Session, reason: string) {
    if (!this.sessions.delete(session.id)) return;
    clearTimeout(session.timer);
    for (const socket of [session.sender, session.receiver]) {
      if (!socket) continue;
      this.membership.delete(socket);
      this.send(socket, { type: 'ended', reason });
      socket.close(1000);
    }
  }

  fetch(request: Request) {
    const url = new URL(request.url);
    if (
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
      !allowsOrigin(request.headers.get('Origin'), url.origin) ||
      url.pathname !== '/' ||
      url.search
    )
      return new Response('Forbidden', { status: 403 });
    if (this.sockets.size >= 44) return new Response('Busy', { status: 503 });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const release = this.connections.acquire(ip);
    if (!release)
      return new Response('Too many connections', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    const [client, socket] = Object.values(new WebSocketPair());
    socket.accept();
    this.sockets.add(socket);
    let count = 0;
    let window = Date.now();
    let queuedBytes = 0;
    const deadline = setTimeout(() => socket.close(1008), 10_000);
    const fail = () => {
      this.send(socket, {
        type: 'error',
        message: 'Session unavailable. Create a new link with the sender.',
      });
      socket.close(1008);
    };
    socket.addEventListener('message', (event) => {
      if (Date.now() - window >= 60_000) {
        count = 0;
        window = Date.now();
      }
      const raw = event.data;
      const size = typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : 0;
      if (
        typeof raw !== 'string' ||
        raw.length > 32 * 1024 ||
        size > 32 * 1024 ||
        ++count > 200 ||
        queuedBytes + size > 128 * 1024
      ) {
        fail();
        return;
      }
      queuedBytes += size;
      this.queue = this.queue
        .then(async () => {
          if (socket.readyState !== WebSocket.OPEN) return;
          await this.message(socket, raw, ip);
          if (this.membership.has(socket)) clearTimeout(deadline);
        })
        .catch(fail)
        .finally(() => {
          queuedBytes -= size;
        });
    });
    const cleanup = () => {
      release();
      clearTimeout(deadline);
      this.sockets.delete(socket);
      this.sentBytes.delete(socket);
      const session = this.membership.get(socket);
      if (session) this.remove(session, 'disconnected');
    };
    socket.addEventListener('close', cleanup);
    socket.addEventListener('error', () => {
      socket.close(1011);
      cleanup();
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async message(socket: WebSocket, raw: string, ip: string) {
    const message = object(JSON.parse(raw));
    const existing = this.membership.get(socket);
    if (message.type === 'create' && !existing) {
      for (const [address, budget] of this.creationBudget)
        if (budget.until <= Date.now()) this.creationBudget.delete(address);
      const budget = this.creationBudget.get(ip) || { count: 0, until: Date.now() + 60_000 };
      if (
        this.sessions.size >= 20 ||
        budget.count >= 20 ||
        (!this.creationBudget.has(ip) && this.creationBudget.size >= 1000)
      )
        throw new Error('Capacity');
      budget.count += 1;
      this.creationBudget.set(ip, budget);
      const id = random(16);
      const admission = random(32);
      const admissionHash = await hash(admission);
      if (socket.readyState !== WebSocket.OPEN) return;
      const expiresAt = Date.now() + SESSION_TTL_MS;
      const session: Session = {
        id,
        sender: socket,
        admissionHash,
        expiresAt,
        timer: setTimeout(() => this.remove(session, 'expired'), SESSION_TTL_MS),
      };
      this.sessions.set(id, session);
      this.membership.set(socket, session);
      this.send(socket, { type: 'created', id, admission, expiresAt });
    } else if (message.type === 'join' && !existing) {
      if (
        typeof message.id !== 'string' ||
        !ID_PATTERN.test(message.id) ||
        typeof message.admission !== 'string' ||
        !TOKEN_PATTERN.test(message.admission)
      )
        throw new Error('Unavailable');
      const admissionHash = await hash(message.admission);
      const session = this.sessions.get(message.id);
      if (socket.readyState !== WebSocket.OPEN) return;
      if (
        !session ||
        session.receiver ||
        session.sender.readyState !== WebSocket.OPEN ||
        session.expiresAt <= Date.now() ||
        !equal(session.admissionHash, admissionHash)
      )
        throw new Error('Unavailable');
      session.receiver = socket;
      this.membership.set(socket, session);
      this.send(socket, {
        type: 'joined',
        expiresAt: session.expiresAt,
        ice: ice(session.expiresAt),
      });
      this.send(session.sender, { type: 'paired', ice: ice(session.expiresAt) });
    } else if (message.type === 'signal' && existing && existing.expiresAt > Date.now()) {
      const data = parseSignal(message.data);
      const sender = existing.sender === socket;
      if ((sender && data.type === 'answer') || (!sender && data.type === 'offer'))
        throw new Error('Role');
      const target = sender ? existing.receiver : existing.sender;
      if (!target) throw new Error('Unavailable');
      this.send(target, { type: 'signal', data });
    } else if (message.type === 'cancel' && existing) this.remove(existing, 'cancelled');
    else throw new Error('Invalid message');
  }
}
