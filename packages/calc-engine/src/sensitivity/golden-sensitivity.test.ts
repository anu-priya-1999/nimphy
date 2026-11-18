import { describe, expect, it } from 'vitest';
import goldenSensitivityCasesData from '../../../../fixtures/calc-engine/golden-sensitivity-cases.json';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSensitivity } from './sensitivity-calc';
import type { SensitivityDriverConfig, SensitivityInput } from './types';

describe('Golden Sensitivity Fixtures Verification (Independent Hand-Derived Parity)', () => {
  const packsByKeyAndVersion = new Map<string, CalcRulePack>([
    ['TEST_EBOOK_STANDARD@1.0.0', ebookPackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@1.0.0', paperbackV1PackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@2.0.0', paperbackV2PackJson as unknown as CalcRulePack],
    ['TEST_HARDCOVER_GLOBAL@1.0.0', hardcoverPackJson as unknown as CalcRulePack],
  ]);

  const cases = goldenSensitivityCasesData.cases;

  it('contains at least 20 comprehensive golden sensitivity cases covering all synthetic packs', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const testCase of cases) {
    it(`evaluates golden sensitivity "${testCase.id}": ${testCase.description}`, () => {
      const packKey = `${testCase.rulePackRef.packKey}@${testCase.rulePackRef.version}`;
      const rulePack = packsByKeyAndVersion.get(packKey);
      expect(rulePack).toBeDefined();

      const input: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units: testCase.input.baseline.units,
          listPriceMinor: testCase.input.baseline.listPriceMinor,
          costVariancePercent: testCase.input.baseline.costVariancePercent,
          currency: testCase.input.baseline.currency,
          format: testCase.input.baseline.format,
          pages:
            'pages' in testCase.input.baseline
              ? (testCase.input.baseline.pages as number)
              : undefined,
          fileSizeMb:
            'fileSizeMb' in testCase.input.baseline
              ? String(testCase.input.baseline.fileSizeMb)
              : undefined,
        },
        drivers: testCase.input.drivers as unknown as SensitivityDriverConfig[],
      };

      const result = calculateSensitivity(input, rulePack!);

      // 1. Baseline net contribution assertion
      expect(result.baseline.netContribution.amountMinor).toBe(
        testCase.expectedBaselineContributionMinor,
      );

      // 2. Ranked drivers count assertion
      expect(result.rankedDrivers.length).toBe(testCase.expectedRankedDrivers.length);
      expect(result.drivers.length).toBe(testCase.expectedRankedDrivers.length);

      // 3. For each ranked driver, verify exact parity with expected hand derivation
      for (let i = 0; i < testCase.expectedRankedDrivers.length; i++) {
        const expected = testCase.expectedRankedDrivers[i]!;
        const actual = result.rankedDrivers[i]!;

        expect(actual.rank).toBe(expected.rank);
        expect(actual.driver).toBe(expected.driver);
        expect(actual.perturbation).toBe(expected.perturbation);
        expect(actual.lowerValue).toBe(expected.lowerValue);
        expect(actual.upperValue).toBe(expected.upperValue);

        // Monetary results in minor units
        expect(actual.lowerNetContribution.amountMinor).toBe(expected.lowerContributionMinor);
        expect(actual.upperNetContribution.amountMinor).toBe(expected.upperContributionMinor);
        expect(actual.deltaLower.amountMinor).toBe(expected.deltaLowerMinor);
        expect(actual.deltaUpper.amountMinor).toBe(expected.deltaUpperMinor);
        expect(actual.impactScoreMinor).toBe(expected.impactScoreMinor);
        expect(actual.impactScore.amountMinor).toBe(expected.impactScoreMinor);

        // Consistency check: impactScore is max(|deltaLower|, |deltaUpper|)
        const expectedImpact = Math.max(
          Math.abs(expected.deltaLowerMinor),
          Math.abs(expected.deltaUpperMinor),
        );
        expect(actual.impactScoreMinor).toBe(expectedImpact);
      }

      // 4. Immutability assertion
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.rankedDrivers)).toBe(true);
      expect(Object.isFrozen(result.drivers)).toBe(true);
      expect(Object.isFrozen(result.trace)).toBe(true);
    });
  }
});
