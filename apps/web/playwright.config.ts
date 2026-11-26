import { defineConfig, devices } from '@playwright/test';
// Two origins of the local pilot stack (phase 2.5e). They must differ by host: cookies ignore ports.
const learnerURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:18089';
const studioURL = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:18090';
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } };
const mobile = { ...devices['iPhone 13'], defaultBrowserType: 'chromium' as const };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  retries: 0,
  reporter: 'list',
  use: { trace: 'off' },
  projects: [
    // Learner app (learner origin).
    { name: 'desktop', testMatch: 'pilot.spec.ts', use: { ...desktop, baseURL: learnerURL } },
    { name: 'mobile', testMatch: 'pilot.spec.ts', use: { ...mobile, baseURL: learnerURL } },
    // Studio app (studio origin).
    {
      name: 'studio-desktop',
      testMatch: 'studio.spec.ts',
      use: { ...desktop, baseURL: studioURL },
    },
    { name: 'studio-mobile', testMatch: 'studio.spec.ts', use: { ...mobile, baseURL: studioURL } },
  ],
});
