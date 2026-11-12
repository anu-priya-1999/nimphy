import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 20000,
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/domain/src/**', 'packages/rules/src/**', 'packages/calc-engine/src/**'],
      exclude: [
        'packages/domain/src/**/*.test.ts',
        'packages/rules/src/**/*.test.ts',
        'packages/calc-engine/src/**/*.test.ts',
        'packages/calc-engine/src/per-unit/types.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web'),
      '@nimphy/domain': path.resolve(__dirname, './packages/domain/src'),
      '@nimphy/calc-engine': path.resolve(__dirname, './packages/calc-engine/src'),
      '@nimphy/rules': path.resolve(__dirname, './packages/rules/src'),
      '@nimphy/ai': path.resolve(__dirname, './packages/ai/src'),
      '@nimphy/documents': path.resolve(__dirname, './packages/documents/src'),
      '@nimphy/payments': path.resolve(__dirname, './packages/payments/src'),
      '@nimphy/persistence': path.resolve(__dirname, './packages/persistence/src'),
    },
  },
});
