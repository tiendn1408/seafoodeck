import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// One-way alias: the Studio app reuses learner modules from apps/web/src (API client, meStore,
// Library, Account, …); apps/web never imports anything from here.
const web = fileURLToPath(new URL('../web/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@web': web } },
  // Shared static files (favicon, login illustration) live with the learner app.
  publicDir: fileURLToPath(new URL('../web/public', import.meta.url)),
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api/v1': {
        target: process.env.API_DEV_TARGET ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
