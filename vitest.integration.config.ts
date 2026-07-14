import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: ['apps/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: false,
    restoreMocks: true,
  },
});
