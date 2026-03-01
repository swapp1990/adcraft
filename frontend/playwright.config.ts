import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5190';
const IS_DEPLOYED = BASE_URL.startsWith('https://');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 30000,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: IS_DEPLOYED
    ? [
        {
          name: 'deployed-chromium',
          use: { ...devices['Desktop Chrome'] },
          testDir: './tests/deployed',
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
          testIgnore: '**/deployed/**',
        },
      ],

  // Dev server — only for local (non-deployed) tests
  webServer: IS_DEPLOYED
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5190',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
