import { test, expect, chromium, webkit, type Page } from '@playwright/test';
import { mkdtemp, rm, mkdir, open, stat, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { MAX_FILE_BYTES, MAX_FILE_LABEL } from '../../src/contracts/transfer';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { observeRelay, expectRelay } from './relay-evidence';

// Public free relays can be much slower than loopback. Keep the app's own
// 30-second inactivity deadline while allowing an actively progressing test.
const transferTimeout = process.env.CLOUD_TEST_FORCE_RELAY === '1' ? 120_000 : 30_000;

async function chooseFile(page: Page, name: string, bytes: Buffer) {
  const path = test.info().outputPath(name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await page.getByLabel('Choose a file').setInputFiles(path);
}

async function createTransfer(
  page: Page,
  bytes = Buffer.from('A real encrypted handoff.\n'),
  name = 'handoff.txt',
) {
  await page.goto('/');
  await chooseFile(page, name, bytes);
  await page.getByLabel('Your PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Create transfer link' }).click();
  await expect(page.getByLabel('Your private link')).toBeVisible();
  return page.getByLabel('Your private link').inputValue();
}

for (const size of [0, 1024 * 1024 + 17, 50 * 1024 * 1024]) {
  test(`actual two-context encrypted WebRTC transfer: ${size} bytes`, async ({ page, browser }) => {
    await observeRelay(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const bytes = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
    const url = await createTransfer(page, bytes, 'binary-fixture.bin');
    const context = await browser.newContext({
      acceptDownloads: true,
      permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
    });
    const receiver = await context.newPage();
    await observeRelay(receiver);
    receiver.on('pageerror', (error) => errors.push(error.message));
    await receiver.goto(url);
    await expect(receiver).toHaveURL(/\/receive\/$/);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible({
      timeout: transferTimeout,
    });
    const pending = receiver.waitForEvent('download');
    await receiver.getByRole('link', { name: 'Save file' }).click();
    const download = await pending;
    const saved = await readFile((await download.path())!);
    expect(saved.length).toBe(bytes.length);
    expect(createHash('sha256').update(saved).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(download.suggestedFilename()).toBe('binary-fixture.bin');
    await expect(page.getByText('File received and verified.')).toBeVisible();
    if (size === 0) {
      await receiver.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
      );
      await receiver.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
      );
    } else await receiver.getByRole('button', { name: 'Clear file from this page' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
    expect(errors).toEqual([]);
    await expectRelay(page);
    await expectRelay(receiver);
    await context.close();
  });
}

test('encrypted transfer to the other browser engine', async ({ page, browserName }) => {
  const otherEngine = browserName === 'webkit' ? chromium : webkit;
  const otherBrowser = await otherEngine.launch();
  try {
    const context = await otherBrowser.newContext({
      acceptDownloads: true,
      permissions: otherEngine === chromium ? ['local-network-access'] : [],
    });
    const receiver = await context.newPage();
    await observeRelay(page);
    await observeRelay(receiver);
    const errors: string[] = [];
    for (const current of [page, receiver])
      current.on('pageerror', (error) => errors.push(error.message));
    const bytes = Buffer.alloc(1024 * 1024 + 17);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    await receiver.goto(await createTransfer(page, bytes, 'cross-engine.bin'));
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible({
      timeout: transferTimeout,
    });
    const pending = receiver.waitForEvent('download');
    await receiver.getByRole('link', { name: 'Save file' }).click();
    const download = await pending;
    const saved = await readFile((await download.path())!);
    expect(saved.length).toBe(bytes.length);
    expect(createHash('sha256').update(saved).digest('hex')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(download.suggestedFilename()).toBe('cross-engine.bin');
    await expect(page.getByText('File received and verified.')).toBeVisible();
    expect(errors).toEqual([]);
    await expectRelay(page);
    await expectRelay(receiver);
  } finally {
    await otherBrowser.close();
  }
});

test('wrong PIN does not claim session; correct PIN can retry', async ({ page, browser }) => {
  const url = await createTransfer(page);
  const context = await browser.newContext({
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  });
  const receiver = await context.newPage();
  await receiver.goto(url);
  await receiver.getByLabel('Transfer PIN').fill('999999');
  await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
  await expect(receiver.getByRole('main').getByRole('alert')).toContainText('Unable to unlock');
  await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
  await expect(page.getByText('Waiting for the receiver')).toBeVisible();
  await expect(receiver.getByLabel('Transfer PIN')).toBeEnabled();
  await receiver.getByLabel('Transfer PIN').fill('123456');
  await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
  await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test('five wrong PINs clear the view without claiming the session', async ({ page, browser }) => {
  const url = await createTransfer(page);
  const context = await browser.newContext();
  const receiver = await context.newPage();
  await receiver.goto(url);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(receiver.getByLabel('Transfer PIN')).toBeEnabled();
    await receiver.getByLabel('Transfer PIN').fill('999999');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('main').getByRole('alert')).toContainText(
      attempt === 4 ? 'Five attempts used' : `${4 - attempt} attempts left`,
    );
  }
  await expect(receiver.getByLabel('Transfer PIN')).toHaveCount(0);
  await expect(page.getByText('Waiting for the receiver')).toBeVisible();
  await context.close();
});

test('oversized file is rejected before creating a link', async ({ page }) => {
  await page.goto('/');
  const path = test.info().outputPath('too-large.bin');
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'w');
  try {
    await file.truncate(MAX_FILE_BYTES + 1);
  } finally {
    await file.close();
  }
  await page.getByLabel('Choose a file').setInputFiles(path);
  await page.getByLabel('Your PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Create transfer link' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(MAX_FILE_LABEL);
  await expect(page.getByLabel('Your private link')).toHaveCount(0);
});

test('cancelled sender link cannot transfer', async ({ page, browser }) => {
  const url = await createTransfer(page);
  await page.getByRole('button', { name: 'Cancel transfer' }).click();
  const context = await browser.newContext({
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  });
  const receiver = await context.newPage();
  await receiver.goto(url);
  await receiver.getByLabel('Transfer PIN').fill('123456');
  await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
  await expect(receiver.getByRole('main').getByRole('alert')).toContainText(
    /unavailable|disconnected/i,
  );
  await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
  await context.close();
});

test('invalid link and responsive keyboard-accessible views', async ({ page, browserName }) => {
  await page.goto('/receive/#invalid');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid');
  await expect(page).toHaveURL(/\/receive\/$/);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  }
});

// Stream fixtures and download hashing so the test runner does not itself hold
// another GiB-sized Buffer while measuring a real browser transfer.
test('large-file benchmark downloads with matching SHA-256', async ({ page, browser }) => {
  test.setTimeout(12 * 60_000);
  const size = Number(process.env.LARGE_TEST_BYTES || MAX_FILE_BYTES);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES)
    throw new Error('Invalid large-file test size');
  const path = test.info().outputPath('maximum.bin');
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'w');
  const expected = createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
  try {
    for (let offset = 0; offset < size; offset += chunk.length) {
      chunk.writeUInt32BE(offset / chunk.length, 0);
      const part = chunk.subarray(0, Math.min(chunk.length, size - offset));
      await file.writeFile(part);
      expected.update(part);
    }
  } finally {
    await file.close();
  }
  await page.goto('/');
  await page.getByLabel('Choose a file').setInputFiles(path);
  await page.getByLabel('Your PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Create transfer link' }).click();
  await expect(page.getByLabel('Your private link')).toBeVisible();
  const profile =
    process.env.LARGE_TEST_PERSISTENT === '1' ||
    (process.env.LARGE_TEST_PERSISTENT !== '0' && size > 2 * 1024 * 1024 * 1024)
      ? await mkdtemp(join(tmpdir(), 'file2file-large-profile-'))
      : undefined;
  const options = {
    acceptDownloads: true,
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  };
  const context = profile
    ? await browser.browserType().launchPersistentContext(profile, options)
    : await browser.newContext(options);
  try {
    const receiver = await context.newPage();
    const errors: string[] = [];
    for (const current of [page, receiver])
      current.on('pageerror', (error) => errors.push(error.message));
    await receiver.goto(await page.getByLabel('Your private link').inputValue());
    await receiver.getByLabel('Transfer PIN').fill('123456');
    const started = Date.now();
    console.log(
      JSON.stringify({
        phase: 'transfer-started',
        engine: browser.browserType().name(),
        bytes: size,
        persistentProfile: Boolean(profile),
      }),
    );
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await Promise.race([
      receiver
        .getByRole('link', { name: 'Save file' })
        .waitFor({ state: 'visible', timeout: 10 * 60_000 }),
      receiver
        .getByRole('main')
        .getByRole('alert')
        .waitFor({ state: 'visible', timeout: 10 * 60_000 })
        .then(async () => {
          throw new Error(await receiver.getByRole('main').getByRole('alert').innerText());
        }),
    ]);
    const verifiedSeconds = (Date.now() - started) / 1000;
    const pending = receiver.waitForEvent('download');
    await receiver.getByRole('link', { name: 'Save file' }).click();
    const download = await pending;
    const savedPath = (await download.path())!;
    expect((await stat(savedPath)).size).toBe(size);
    const actual = createHash('sha256');
    for await (const data of createReadStream(savedPath)) actual.update(data);
    expect(actual.digest('hex')).toBe(expected.digest('hex'));
    expect(download.suggestedFilename()).toBe('maximum.bin');
    console.log(
      JSON.stringify({
        engine: browser.browserType().name(),
        bytes: size,
        verifiedSeconds,
        downloadedAndHashedSeconds: (Date.now() - started) / 1000,
      }),
    );
    await expect(page.getByText('File received and verified.')).toBeVisible();
    await receiver.getByRole('button', { name: 'Clear file from this page' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (profile) await rm(profile, { recursive: true, force: true });
    await rm(path, { force: true });
  }
});

test('a slow receiver applies backpressure without growing the receive queue', async ({
  page,
  browser,
}) => {
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 7, 83);
  const url = await createTransfer(page, bytes, 'slow.bin');
  const context = await browser.newContext({
    acceptDownloads: true,
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  });
  try {
    // Delay scheduling only; decrypt and integrity verification remain native.
    await context.addInitScript(() => {
      const decrypt = SubtleCrypto.prototype.decrypt;
      SubtleCrypto.prototype.decrypt = async function (...args) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return decrypt.apply(this, args);
      };
    });
    const receiver = await context.newPage();
    await receiver.goto(url);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible({
      timeout: 30_000,
    });
    const pending = receiver.waitForEvent('download');
    await receiver.getByRole('link', { name: 'Save file' }).click();
    expect(await readFile((await (await pending).path())!)).toEqual(bytes);
    await expect(page.getByText('File received and verified.')).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const attack of ['future', 'repeated'] as const) {
  test(`sender rejects authenticated ${attack} receive credits`, async ({ page, browser }) => {
    const url = await createTransfer(page, Buffer.alloc(8 * 1024 * 1024, 57));
    const context = await browser.newContext({
      permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
    });
    try {
      // A peer knows its directional key. Authenticate a dishonest acknowledgement
      // through native WebCrypto, rather than bypassing record authentication.
      await context.addInitScript((attack) => {
        const encrypt = SubtleCrypto.prototype.encrypt;
        let firstCredit: number | undefined;
        SubtleCrypto.prototype.encrypt = function (algorithm, key, data) {
          try {
            const control = JSON.parse(new TextDecoder().decode(data));
            if (control.type === 'progress') {
              firstCredit ??= control.received;
              control.received = attack === 'future' ? 4 * 1024 * 1024 * 1024 : firstCredit;
              data = new TextEncoder().encode(JSON.stringify(control));
            }
          } catch {
            /* Other encrypted records are unchanged. */
          }
          return encrypt.call(this, algorithm, key, data);
        };
      }, attack);
      const receiver = await context.newPage();
      await receiver.goto(url);
      await receiver.getByLabel('Transfer PIN').fill('123456');
      await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText('verification failed', {
        timeout: 30_000,
      });
      await expect(page.getByText('File received and verified.')).toHaveCount(0);
      await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test('verified download uses the active deadline instead of the original join deadline', async ({
  page,
  browser,
}) => {
  const url = await createTransfer(page);
  const context = await browser.newContext({
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  });
  try {
    const receiver = await context.newPage();
    await receiver.clock.install();
    await receiver.goto(url);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible({
      timeout: 30_000,
    });
    await receiver.clock.fastForward('16:00');
    await expect(receiver.getByRole('link', { name: 'Save file' })).toBeVisible();
    await receiver.clock.fastForward('45:00');
    await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
    await expect(receiver.getByRole('main').getByRole('alert')).toContainText('expired');
  } finally {
    await context.close();
  }
});

test('cancelling a slow transfer releases the sender waiting for receive credit', async ({
  page,
  browser,
}) => {
  const url = await createTransfer(page, Buffer.alloc(8 * 1024 * 1024, 42));
  const context = await browser.newContext({
    permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
  });
  try {
    await context.addInitScript(() => {
      const decrypt = SubtleCrypto.prototype.decrypt;
      SubtleCrypto.prototype.decrypt = async function (...args) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return decrypt.apply(this, args);
      };
    });
    const receiver = await context.newPage();
    await receiver.goto(url);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect
      .poll(() =>
        receiver.getByRole('progressbar').evaluate((el) => (el as HTMLProgressElement).value),
      )
      .toBeGreaterThan(0);
    await receiver.getByRole('button', { name: 'Cancel transfer' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      /unavailable|disconnected|connection failed|transfer stopped/i,
    );
    await expect(page.getByText('File received and verified.')).toHaveCount(0);
    await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
