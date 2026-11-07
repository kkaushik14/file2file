import { test, expect } from '@playwright/test';

const routes = [
  ['/terms/', 'Terms of Use & Conditions'],
  ['/privacy/', 'Privacy Policy'],
  ['/help/', 'Help with a transfer'],
  ['/contact/', 'Contact File2File'],
  ['/security/', 'Security & reporting'],
];

test('information pages have complete navigation, working contact links and mobile reflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 800 });
    for (const [path, title] of routes) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Information' }).locator('a[aria-current="page"]'),
      ).toHaveAttribute('href', path);
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Send a file' }),
      ).toHaveAttribute('href', '/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.goto('/contact/');
  await expect(
    page.getByRole('link', { name: 'Private security report', exact: true }),
  ).toHaveAttribute(
    'href',
    'mailto:kumarkaushik871@gmail.com?subject=File2File%20security%20report',
  );
  await page
    .getByRole('navigation', { name: 'Information' })
    .getByRole('link', { name: 'Help' })
    .click();
  await page.getByText('The connection stalls or never starts', { exact: true }).click();
  await expect(
    page.getByText('the free plan has no TLS relay on port 443.', { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('leaving and restoring transfer views clears private links, PINs and session admission', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose a file').setInputFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('private lifecycle fixture'),
  });
  await page.getByLabel('Your PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Create transfer link' }).click();
  const link = page.getByLabel('Your private link');
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  const context = await browser.newContext();
  try {
    const receiver = await context.newPage();
    await receiver.goto(url);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    // Exercise the bfcache pagehide path without losing the mounted React tree.
    await receiver.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
    );
    await receiver.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(receiver.getByLabel('Transfer PIN')).toHaveCount(0);
    await expect(receiver.getByRole('main').getByRole('alert')).toContainText('Transfer cleared');
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
    );
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(link).toHaveCount(0);
    await expect(page.getByLabel('Your PIN', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Choose a file')).toHaveValue('');
    await receiver.goto('about:blank');
    await receiver.goto(url);
    await receiver.getByLabel('Transfer PIN').fill('123456');
    await receiver.getByRole('button', { name: 'Unlock and receive' }).click();
    await expect(receiver.getByRole('main').getByRole('alert')).toContainText(
      /unavailable|disconnected/i,
    );
  } finally {
    await context.close();
  }
});
