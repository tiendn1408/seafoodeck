import config from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...config,
  testMatch: ['four-modes.spec.ts', 'mobile-layout.spec.ts', 'migration.spec.ts', 'study.spec.ts'],
  use: { ...config.use, baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:18088' },
});
