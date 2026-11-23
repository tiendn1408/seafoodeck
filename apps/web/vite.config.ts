import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // The common chunk that holds the API client (src/pilot/api.ts), shared by the entry and
        // the lazy screens, is named `shared-*`, not after whichever module the bundler picked
        // (it was `users-*.js`, after users.css). Every other chunk keeps its own name, so the
        // e2e checks on `Admin-*`, `AdminTabs-*`, `UsersAdmin-*`, `Manager*-*` still hold.
        chunkFileNames: (chunk) =>
          !chunk.isEntry &&
          !chunk.isDynamicEntry &&
          chunk.moduleIds.some((id) => /[\\/]src[\\/]pilot[\\/]api\.ts(\?|$)/.test(id))
            ? 'assets/shared-[hash].js'
            : 'assets/[name]-[hash].js',
        codeSplitting: {
          // React, ReactDOM (with the JSX runtime) and scheduler are shared by the entry and every
          // lazy admin/manager chunk; they get their own `vendor` chunk.
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
    proxy: {
      '/api/v1': {
        target: process.env.API_DEV_TARGET ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
