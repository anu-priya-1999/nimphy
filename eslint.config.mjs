import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import nimphyPlugin from './scripts/eslint-plugin-nimphy.mjs';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      '@nimphy': nimphyPlugin,
    },
    rules: {
      '@nimphy/architecture-boundaries': 'error',
    },
  },
  {
    settings: {
      next: {
        rootDir: 'apps/web/',
      },
    },
  },
  globalIgnores([
    '.next/**',
    '**/.next/**',
    'out/**',
    '**/out/**',
    'build/**',
    '**/build/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'next-env.d.ts',
    '**/next-env.d.ts',
    'pnpm-lock.yaml',
    '.pnpm-store/**',
  ]),
]);
