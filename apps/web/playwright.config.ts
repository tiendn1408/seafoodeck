import { defineConfig, devices } from '@playwright/test';
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:18089';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pilot.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: externalBaseURL ?? 'http://127.0.0.1:43217', trace: 'off' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
