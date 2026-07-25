import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'src/__tests__/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Baseline gates prevent coverage regressions while the suite is expanded
      // toward the Phase 2 80% global target.
      thresholds: {
        global: {
          statements: 44,
          branches: 33,
          functions: 46,
          lines: 45,
        },
      },
    },
  },
});
