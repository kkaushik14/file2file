import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { once } from 'node:events';

const transport = process.argv[2] || 'udp';
if (!['udp', 'tcp'].includes(transport)) throw new Error('Use udp or tcp.');
const rejectCredentials = process.argv.includes('--invalid-credentials');
const directory = await mkdtemp(join(tmpdir(), 'file2file-turn-'));
const secret = randomBytes(32).toString('base64');
const secretFile = join(directory, 'secret');
const configFile = join(directory, 'turnserver.conf');
let turn;
let tests;
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stop(tests).then(() => stop(turn));
  });

try {
  await writeFile(secretFile, rejectCredentials ? randomBytes(32).toString('base64') : secret, {
    mode: 0o600,
  });
  await writeFile(
    configFile,
    [
      'listening-ip=127.0.0.1',
      'relay-ip=127.0.0.1',
      'listening-port=34790',
      'min-port=50000',
      'max-port=50100',
      'realm=file2file.local',
      'use-auth-secret',
      `static-auth-secret=${secret}`,
      'fingerprint',
      'no-tls',
      'no-dtls',
      'no-cli',
      'no-tcp-relay',
      'no-multicast-peers',
      // Only this disposable loopback fixture permits loopback relay peers.
      'allow-loopback-peers',
      `cli-password=${randomBytes(24).toString('hex')}`,
      'user-quota=8',
      'total-quota=64',
      'max-allocate-lifetime=900',
      'relay-threads=1',
      'no-stdout-log',
      `log-file=${join(directory, 'turn.log')}`,
      `pidfile=${join(directory, 'turn.pid')}`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
  turn = spawn(process.env.TURNSERVER_BIN || 'turnserver', ['-c', configFile], { stdio: 'ignore' });
  await once(turn, 'spawn');
  const deadline = Date.now() + 10_000;
  while (true) {
    if (turn.exitCode !== null || turn.signalCode !== null)
      throw new Error('coturn stopped during startup.');
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port: 34790 });
      socket.setTimeout(200);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) break;
    if (Date.now() > deadline)
      throw new Error('coturn startup timed out. Check that TCP/UDP 34790 is free.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(
    `Testing authenticated TURN over ${transport.toUpperCase()} on loopback; relay-only policy.`,
  );
  tests = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--grep',
      rejectCredentials ? 'TURN rejects' : 'actual two-context|other browser engine',
      ...process.argv.slice(3).filter((arg) => arg !== '--invalid-credentials'),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        SIGNAL_HOST: '127.0.0.1',
        SIGNAL_PORT: '8787',
        SIGNAL_ORIGINS: 'http://127.0.0.1:4174',
        TRANSFER_NETWORK: 'turn',
        ICE_TRANSPORT_POLICY: 'relay',
        STUN_URLS: '',
        TURN_URLS: `turn:127.0.0.1:34790?transport=${transport}`,
        TURN_SECRET_FILE: secretFile,
        TURN_TEST_TRANSPORT: transport,
        TURN_TEST_REJECT: rejectCredentials ? '1' : '',
        NEXT_PUBLIC_SIGNAL_URL: '',
      },
    },
  );
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await stop(tests);
  await stop(turn);
  await rm(directory, { recursive: true, force: true });
}
