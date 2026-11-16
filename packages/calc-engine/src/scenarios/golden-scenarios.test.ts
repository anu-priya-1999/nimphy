import { describe, expect, it } from 'vitest';
import goldenScenarioCasesData from '../../../../fixtures/calc-engine/golden-scenario-cases.json';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario } from './scenario-calc';
import type { SingleScenarioInput } from './types';

describe('Golden Scenario Fixtures Verification (Independent Hand-Derived Parity)', () => {
  const packsByKeyAndVersion = new Map<string, CalcRulePack>([
    ['TEST_EBOOK_STANDARD@1.0.0', ebookPackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@1.0.0', paperbackV1PackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@2.0.0', paperbackV2PackJson as unknown as CalcRulePack],
    ['TEST_HARDCOVER_GLOBAL@1.0.0', hardcoverPackJson as unknown as CalcRulePack],
  ]);

  const cases = goldenScenarioCasesData.cases;

  it('contains at least 20 comprehensive golden scenario cases covering all synthetic packs', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const testCase of cases) {
    it(`evaluates golden scenario "${testCase.id}": ${testCase.description}`, () => {
      const packKey = `${testCase.rulePackRef.packKey}@${testCase.rulePackRef.version}`;
      const rulePack = packsByKeyAndVersion.get(packKey);
      expect(rulePack).toBeDefined();

      const input: SingleScenarioInput = {
        scenarioName: testCase.input.scenarioName as SingleScenarioInput['scenarioName'],
        units: testCase.input.units,
        listPriceMinor: testCase.input.listPriceMinor,
        costVariancePercent: testCase.input.costVariancePercent,
        currency: testCase.input.currency,
        format: testCase.input.format,
        pages: 'pages' in testCase.input ? (testCase.input.pages as number) : undefined,
        fileSizeMb: 'fileSizeMb' in testCase.input ? String(testCase.input.fileSizeMb) : undefined,
      };

      const result = calculateSingleScenario(input, rulePack!);

      // 1. Revenue verification
      expect(result.revenue.amountMinor).toBe(testCase.expectedRevenueMinor);
      expect(result.revenue.currency).toBe(testCase.input.currency);

      // 2. Total Gross Royalty verification
      expect(result.grossRoyalty.amountMinor).toBe(testCase.expectedTotalRoyaltyMinor);
      expect(result.grossRoyalty.currency).toBe(testCase.input.currency);

      // 3. Total Applicable Cost verification
      expect(result.applicableCost.amountMinor).toBe(testCase.expectedTotalCostMinor);
      expect(result.applicableCost.currency).toBe(testCase.input.currency);

      // 4. Total Net Contribution verification
      expect(result.netContribution.amountMinor).toBe(testCase.expectedTotalContributionMinor);
      expect(result.netContribution.currency).toBe(testCase.input.currency);

      // 5. Exact total rational amounts
      expect(result.exactTotalRoyalty.numerator.toString()).toBe(
        testCase.expectedExactTotalRoyalty.numerator,
      );
      expect(result.exactTotalRoyalty.denominator.toString()).toBe(
        testCase.expectedExactTotalRoyalty.denominator,
      );
      expect(result.exactTotalRoyalty.toDecimalString()).toBe(
        testCase.expectedExactTotalRoyalty.decimalString,
      );

      expect(result.exactTotalCost.numerator.toString()).toBe(
        testCase.expectedExactTotalCost.numerator,
      );
      expect(result.exactTotalCost.denominator.toString()).toBe(
        testCase.expectedExactTotalCost.denominator,
      );
      expect(result.exactTotalCost.toDecimalString()).toBe(
        testCase.expectedExactTotalCost.decimalString,
      );

      expect(result.exactTotalContribution.numerator.toString()).toBe(
        testCase.expectedExactTotalContribution.numerator,
      );
      expect(result.exactTotalContribution.denominator.toString()).toBe(
        testCase.expectedExactTotalContribution.denominator,
      );
      expect(result.exactTotalContribution.toDecimalString()).toBe(
        testCase.expectedExactTotalContribution.decimalString,
      );

      // 6. Illustrative flag
      expect(result.isIllustrative).toBe(true);

      // 7. Audit trace parity
      expect(result.trace.aggregation.totalRevenueMinor).toBe(testCase.expectedRevenueMinor);
      expect(result.trace.aggregation.totalRoyaltyMinor).toBe(testCase.expectedTotalRoyaltyMinor);
      expect(result.trace.aggregation.totalCostMinor).toBe(testCase.expectedTotalCostMinor);
      expect(result.trace.aggregation.totalContributionMinor).toBe(
        testCase.expectedTotalContributionMinor,
      );
    });
  }
});
