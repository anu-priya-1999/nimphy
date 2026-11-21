import baseConfig from './vitest.config';

/**
 * Focused Vitest configuration for @nimphy/calc-engine mutation testing.
 * Reuses base configuration (aliases, plugins) while setting
 * environment to 'node' and targeting the fast unit, boundary, error,
 * golden, and differential reference test suites of calc-engine,
 * while excluding generative property loops (which iterate hundreds of times
 * per test).
 */
const calcEngineVitestConfig = {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    env: {
      STRYKER_RUN: 'true',
    },
    include: ['packages/calc-engine/src/**/*.test.ts', 'tests/differential/**/*.test.ts'],
    exclude: ['packages/calc-engine/src/**/properties.test.ts'],
  },
};

export default calcEngineVitestConfig;
