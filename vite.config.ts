import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  worker: { format: 'es' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
