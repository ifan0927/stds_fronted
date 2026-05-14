import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.staging\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/staging' }]],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results/staging',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
