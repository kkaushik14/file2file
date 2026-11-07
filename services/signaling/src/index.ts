import { createSignalingServer } from './server';
import { startLocalStun } from './local-stun';
import { readFile } from 'node:fs/promises';
import { createIceProvider } from './ice';

const host = process.env.SIGNAL_HOST || '127.0.0.1';
const port = Number(process.env.SIGNAL_PORT || 8787);
const origins = (
  process.env.SIGNAL_ORIGINS || 'http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:4174'
).split(',');
const secret = process.env.TURN_SECRET_FILE
  ? (await readFile(process.env.TURN_SECRET_FILE, 'utf8')).trim()
  : undefined;
const ice = createIceProvider(process.env, secret);
const app = createSignalingServer({ origins, ice });
const stun = ice.mode === 'local' ? await startLocalStun() : undefined;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  void Promise.all([
    app.close(),
    new Promise<void>((resolve) => (stun ? stun.close(() => resolve()) : resolve())),
  ]).then(() => process.exit(code));
}
stun?.on('error', () => stop(1));
app.server.on('error', () => stop(1));
app.server.listen(port, host, () => console.log(`Signaling: ws://${host}:${port}`));
console.log(
  ice.mode === 'local'
    ? 'Local STUN: 127.0.0.1:8788/udp (same-machine discovery only)'
    : 'TURN discovery configured; credentials issued on admission.',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop());
