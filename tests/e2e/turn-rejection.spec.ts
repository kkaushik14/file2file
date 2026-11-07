import { test, expect } from '@playwright/test';

// Registered only when the harness deliberately gives signaling a different
// signing secret from the real coturn server's secret.
if (process.env.TURN_TEST_REJECT === '1') {
  test('TURN rejects invalid credentials without a completed download', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    await page.getByLabel('Choose a file').setInputFiles({
      name: 'rejected.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('must not transfer'),
    });
    await page.getByLabel('Your PIN', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Create transfer link' }).click();
    await expect(page.getByLabel('Your private link')).toBeVisible();
    const context = await browser.newContext({
      permissions: browser.browserType().name() === 'chromium' ? ['local-network-access'] : [],
    });
    try {
      const receiver = await context.newPage();
      await receiver.goto(await page.getByLabel('Your private link').inputValue());
      await receiver.getByLabel('Transfer PIN').fill('123456');
      await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
      await expect(receiver.getByRole('main').getByRole('alert')).toContainText(
        /stalled|disconnected|failed/i,
        { timeout: 35_000 },
      );
      await expect(receiver.getByRole('link', { name: 'Save file' })).toHaveCount(0);
      await expect(page.getByText('File received and verified.')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
