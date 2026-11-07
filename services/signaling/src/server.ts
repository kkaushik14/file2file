import { ConnectionBudget } from '../../../src/contracts/connection-budget';
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createIceProvider, type IceProvider } from './ice';
import {
  ID_PATTERN,
  object,
  parseSignal,
  SESSION_TTL_MS,
  ACTIVE_TRANSFER_TTL_MS,
  TOKEN_PATTERN,
} from '../../../src/contracts/transfer';

type Session = {
  id: string;
  sender: WebSocket;
  receiver?: WebSocket;
  admissionHash: Buffer;
  expiresAt: number;
  timer: NodeJS.Timeout;
};
type Options = {
  origins: string[];
  ttlMs?: number;
  activeTtlMs?: number;
  maxSessions?: number;
  maxSockets?: number;
  ice?: IceProvider;
};
const hash = (text: string) => createHash('sha256').update(text).digest();

export function createSignalingServer({
  origins,
  ttlMs = SESSION_TTL_MS,
  activeTtlMs = ACTIVE_TRANSFER_TTL_MS,
  maxSessions = 100,
  maxSockets = 220,
  ice = createIceProvider({}),
}: Options) {
  const connections = new ConnectionBudget();
  const sessions = new Map<string, Session>();
  const membership = new Map<WebSocket, Session>();
  const creationBudget = new Map<string, { count: number; until: number }>();
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024,
    perMessageDeflate: false,
  });
  const send = (socket: WebSocket, value: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      if (socket.bufferedAmount > 128 * 1024) {
        socket.terminate();
        return;
      }
      socket.send(JSON.stringify(value));
    }
  };
  function remove(session: Session, reason: string) {
    if (!sessions.delete(session.id)) return;
    clearTimeout(session.timer);
    for (const socket of [session.sender, session.receiver]) {
      if (!socket) continue;
      membership.delete(socket);
      send(socket, { type: 'ended', reason });
      socket.close(1000);
    }
  }
  server.on('upgrade', (request, socket, head) => {
    if (
      request.url !== '/' ||
      !origins.includes(request.headers.origin || '') ||
      sockets.clients.size >= maxSockets
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const release = connections.acquire(request.socket.remoteAddress || 'unknown');
    if (!release) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nRetry-After: 60\r\n\r\n');
      return;
    }
    socket.once('close', release);
    try {
      sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws, request));
    } catch {
      release();
      socket.destroy();
    }
  });
  sockets.on('connection', (socket, request) => {
    let alive = true;
    let count = 0;
    let window = Date.now();
    const admissionDeadline = setTimeout(() => socket.close(1008), 10_000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 15_000);
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('error', () => socket.terminate());
    socket.on('message', (raw, binary) => {
      try {
        if (Date.now() - window >= 60_000) {
          count = 0;
          window = Date.now();
        }
        if (binary || ++count > 200) throw new Error('Message limit.');
        const message = object(JSON.parse(raw.toString()));
        const existing = membership.get(socket);
        if (message.type === 'create' && !existing) {
          const ip = request.socket.remoteAddress || 'unknown';
          for (const [address, budget] of creationBudget)
            if (budget.until <= Date.now()) creationBudget.delete(address);
          const budget = creationBudget.get(ip) || { count: 0, until: Date.now() + 60_000 };
          if (
            sessions.size >= maxSessions ||
            budget.count >= 20 ||
            (!creationBudget.has(ip) && creationBudget.size >= 1000)
          )
            throw new Error('Capacity.');
          budget.count += 1;
          creationBudget.set(ip, budget);
          const id = randomBytes(16).toString('base64url');
          const admission = randomBytes(32).toString('base64url');
          const expiresAt = Date.now() + ttlMs;
          const session: Session = {
            id,
            sender: socket,
            admissionHash: hash(admission),
            expiresAt,
            timer: setTimeout(() => remove(session, 'expired'), ttlMs),
          };
          sessions.set(id, session);
          membership.set(socket, session);
          clearTimeout(admissionDeadline);
          send(socket, { type: 'created', id, admission, expiresAt });
        } else if (message.type === 'join' && !existing) {
          if (
            typeof message.id !== 'string' ||
            !ID_PATTERN.test(message.id) ||
            typeof message.admission !== 'string' ||
            !TOKEN_PATTERN.test(message.admission)
          )
            throw new Error('Unavailable.');
          const session = sessions.get(message.id);
          if (
            !session ||
            session.receiver ||
            session.expiresAt <= Date.now() ||
            !timingSafeEqual(session.admissionHash, hash(message.admission))
          )
            throw new Error('Unavailable.');
          clearTimeout(session.timer);
          session.expiresAt = Date.now() + activeTtlMs;
          session.timer = setTimeout(() => remove(session, 'expired'), activeTtlMs);
          session.receiver = socket;
          membership.set(socket, session);
          clearTimeout(admissionDeadline);
          send(socket, {
            type: 'joined',
            expiresAt: session.expiresAt,
            ice: ice.issue(session.expiresAt),
          });
          send(session.sender, {
            type: 'paired',
            expiresAt: session.expiresAt,
            ice: ice.issue(session.expiresAt),
          });
        } else if (message.type === 'signal' && existing && existing.expiresAt > Date.now()) {
          const data = parseSignal(message.data);
          const sender = existing.sender === socket;
          if ((sender && data.type === 'answer') || (!sender && data.type === 'offer'))
            throw new Error('Invalid role.');
          const target = sender ? existing.receiver : existing.sender;
          if (!target) throw new Error('Unavailable.');
          send(target, { type: 'signal', data });
        } else if (message.type === 'cancel' && existing) {
          remove(existing, 'cancelled');
        } else throw new Error('Invalid message.');
      } catch {
        send(socket, {
          type: 'error',
          message: 'Session unavailable. Create a new link with the sender.',
        });
        socket.close(1008);
      }
    });
    socket.on('close', () => {
      clearTimeout(admissionDeadline);
      clearInterval(heartbeat);
      const session = membership.get(socket);
      if (session) remove(session, 'disconnected');
    });
  });
  return {
    server,
    async close() {
      for (const session of [...sessions.values()]) remove(session, 'shutdown');
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
