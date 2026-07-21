import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: {
    command: 'NODE_ENV=development VITE_E2E=true pnpm exec vite --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: false,
  },
});
