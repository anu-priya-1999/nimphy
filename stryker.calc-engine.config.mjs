// @ts-check
/**
 * Stryker Mutation Testing Configuration for @nimphy/calc-engine (STEP-009).
 *
 * Conforms to:
 * - Principle P-09: Testability (mutation testing to expose assertion gaps).
 * - ADR-004: Pure deterministic calculation engine.
 * - Doc 12 §3.10: Mutation testing on calc-engine (target score OPEN).
 * - Focused scope: mutates only calculation source files in packages/calc-engine/src.
 * - Reuses existing Vitest configuration via vitest.calc-engine.config.ts to avoid running
 *   unrelated workspace suites.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: {
    configFile: 'vitest.calc-engine.config.ts',
  },
  mutate: [
    'packages/calc-engine/src/**/*.ts',
    '!packages/calc-engine/src/**/*.test.ts',
    '!packages/calc-engine/src/**/types.ts',
    '!packages/calc-engine/src/**/index.ts',
    '!packages/calc-engine/src/golden/**',
    '!packages/calc-engine/src/errors/**',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/mutation.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: null, // Policy: Target score remains OPEN per doc 12 §3.10
  },
  ignoreStatic: true,
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 4000,
  cleanTempDir: true,
  incremental: true,
  incrementalFile: 'reports/stryker-step-09-completion.json',
};

export default config;
