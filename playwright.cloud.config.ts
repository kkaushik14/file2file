import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CLOUD_TEST_URL || 'http://127.0.0.1:8789';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: process.env.CLOUD_TEST_FORCE_RELAY === '1' ? 180_000 : 60_000,
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure' },
  webServer: process.env.CLOUD_TEST_URL
    ? undefined
    : {
        command: 'npm run dev:cloud',
        url: `${baseURL}/health`,
        reuseExistingServer: false,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['local-network-access'] },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
