import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: {
    command: 'VITE_E2E=true pnpm build && node ../../scripts/serve-client-e2e.mjs',
    port: 4173,
    reuseExistingServer: false,
  },
});
