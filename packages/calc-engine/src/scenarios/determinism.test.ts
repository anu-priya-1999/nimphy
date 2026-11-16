import { toCanonicalJson } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario, calculateTriadScenarios } from './scenario-calc';
import type { CaseScenariosInput, SingleScenarioInput } from './types';

describe('Scenario Calculation Determinism & Audit Replay Suite', () => {
  const ebookPack = ebookPackJson as unknown as CalcRulePack;
  const hardcoverPack = hardcoverPackJson as unknown as CalcRulePack;

  const sampleTriadInput: CaseScenariosInput = {
    scenarios: {
      low: { units: 150, listPriceMinor: 399, costVariancePercent: '15' },
      base: { units: 500, listPriceMinor: 599, costVariancePercent: '0' },
      high: { units: 1500, listPriceMinor: 899, costVariancePercent: '-10' },
    },
    currency: 'USD',
    format: 'ebook',
    fileSizeMb: '1.25',
  };

  it('produces byte-for-byte identical canonical JSON serializations across repeated runs', () => {
    const run1 = calculateTriadScenarios(sampleTriadInput, ebookPack);
    const run2 = calculateTriadScenarios(sampleTriadInput, ebookPack);

    const json1 = toCanonicalJson(run1);
    const json2 = toCanonicalJson(run2);

    expect(json1).toBe(json2);
  });

  it('guarantees identical traces without timestamps, generated UUIDs, or random values', () => {
    const run1 = calculateTriadScenarios(sampleTriadInput, ebookPack);

    const traceLowJson = toCanonicalJson(run1.scenarios.low.trace);
    const traceBaseJson = toCanonicalJson(run1.scenarios.base.trace);
    const traceHighJson = toCanonicalJson(run1.scenarios.high.trace);

    // Verify absence of dynamic timestamps or nondeterministic keys
    expect(traceLowJson).not.toMatch(/timestamp|createdAt|generatedAt|random/i);
    expect(traceBaseJson).not.toMatch(/timestamp|createdAt|generatedAt|random/i);
    expect(traceHighJson).not.toMatch(/timestamp|createdAt|generatedAt|random/i);

    // Verify engine version is pinned
    expect(run1.engineVersion).toBe('0.1.0');
    expect(run1.scenarios.low.trace.engineVersion).toBe('0.1.0');
  });

  it('proves scenario independence: modifying one scenario input has zero effect on other scenarios', () => {
    const baseInput: CaseScenariosInput = {
      scenarios: {
        low: { units: 100, listPriceMinor: 299, costVariancePercent: '10' },
        base: { units: 400, listPriceMinor: 499, costVariancePercent: '0' },
        high: { units: 1200, listPriceMinor: 999, costVariancePercent: '-10' },
      },
      currency: 'USD',
      format: 'ebook',
      fileSizeMb: '1',
    };

    const runA = calculateTriadScenarios(baseInput, ebookPack);

    // Modify ONLY low scenario
    const modifiedInput: CaseScenariosInput = {
      ...baseInput,
      scenarios: {
        ...baseInput.scenarios,
        low: { units: 50, listPriceMinor: 199, costVariancePercent: '30' },
      },
    };

    const runB = calculateTriadScenarios(modifiedInput, ebookPack);

    // Assert base and high outputs and traces are bit-for-bit identical
    expect(toCanonicalJson(runA.scenarios.base)).toBe(toCanonicalJson(runB.scenarios.base));
    expect(toCanonicalJson(runA.scenarios.high)).toBe(toCanonicalJson(runB.scenarios.high));
    expect(toCanonicalJson(runA.totals.base)).toBe(toCanonicalJson(runB.totals.base));
    expect(toCanonicalJson(runA.totals.high)).toBe(toCanonicalJson(runB.totals.high));

    // Assert low outputs differ
    expect(toCanonicalJson(runA.scenarios.low)).not.toBe(toCanonicalJson(runB.scenarios.low));
  });

  it('guarantees determinism across physical formats and per_total rounding point', () => {
    const hardcoverInput: SingleScenarioInput = {
      scenarioName: 'base',
      units: 350,
      listPriceMinor: 2499,
      costVariancePercent: '5',
      currency: 'EUR',
      format: 'hardcover',
      pages: 250,
    };

    const run1 = calculateSingleScenario(hardcoverInput, hardcoverPack);
    const run2 = calculateSingleScenario(hardcoverInput, hardcoverPack);

    expect(toCanonicalJson(run1)).toBe(toCanonicalJson(run2));
    expect(run1.netContribution.amountMinor).toBe(run2.netContribution.amountMinor);
    expect(run1.trace.aggregation.totalContributionMinor).toBe(
      run2.trace.aggregation.totalContributionMinor,
    );
  });
});
