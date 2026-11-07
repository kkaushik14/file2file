import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'off', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run preview', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
    {
      command: 'npm run dev:signal',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['local-network-access'] },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
