import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { unstable_dev } from 'wrangler';

const transport = process.argv[2];
if (!['udp', 'tcp'].includes(transport)) throw new Error('Choose udp or tcp.');
let worker;
let origin = process.env.CLOUD_TEST_URL;
if (!origin) {
  const path = process.env.TURN_TEST_SECRETS_FILE;
  if (!path)
    throw new Error('Set CLOUD_TEST_URL, or TURN_TEST_SECRETS_FILE for a local cloud build.');
  const secrets = JSON.parse(await readFile(path, 'utf8'));
  for (const key of ['TURN_USERNAME', 'TURN_PASSWORD'])
    if (
      typeof secrets[key] !== 'string' ||
      secrets[key] === '<redacted>' ||
      !/^[\x21-\x7e]{1,256}$/.test(secrets[key])
    )
      throw new Error('Invalid or masked test relay credentials.');
  worker = await unstable_dev('workers/file-sharing/src/index.ts', {
    config: 'workers/file-sharing/wrangler.jsonc',
    local: true,
    ip: '127.0.0.1',
    port: 0,
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
    vars: { TURN_USERNAME: secrets.TURN_USERNAME, TURN_PASSWORD: secrets.TURN_PASSWORD },
  });
  origin = `http://${worker.address}:${worker.port}`;
}
let tests;
try {
  console.log(
    `Testing public TURN over ${transport.toUpperCase()} with real relay-only browser connections.`,
  );
  tests = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'playwright.cloud.config.ts',
      '--grep',
      '1048593 bytes|other browser engine',
      '--output',
      `test-results/hosted-turn-${transport}`,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        CLOUD_TEST_URL: origin,
        CLOUD_TEST_FORCE_RELAY: '1',
        TURN_TEST_TRANSPORT: transport,
      },
    },
  );
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
} finally {
  if (tests && tests.exitCode === null) tests.kill('SIGTERM');
  await worker?.stop();
}
