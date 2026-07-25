import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/integration/**/*.postgres.test.ts'],
    exclude: ['dist/**'],
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
