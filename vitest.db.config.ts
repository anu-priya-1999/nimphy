import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/db/**/*.db.test.ts', 'packages/persistence/src/**/*.db.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    hookTimeout: 30000,
    teardownTimeout: 30000,
    // Database tests run sequentially to avoid concurrent schema/role interference
    fileParallelism: false,
  },
  resolve: {
    alias: {
      pg: path.resolve(__dirname, './packages/persistence/node_modules/pg'),
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
