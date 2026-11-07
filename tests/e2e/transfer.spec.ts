import { test, expect, chromium, webkit, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { observeRelay, expectRelay } from './relay-evidence';

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
      timeout: 30_000,
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
      timeout: 30_000,
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
  await chooseFile(page, 'too-large.bin', Buffer.alloc(50 * 1024 * 1024 + 1));
  await page.getByLabel('Your PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Create transfer link' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('50 MiB');
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
