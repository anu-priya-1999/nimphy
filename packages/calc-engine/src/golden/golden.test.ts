import { describe, expect, it } from 'vitest';
import goldenCasesData from '../../../../fixtures/calc-engine/golden-per-unit-cases.json';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import { calculatePerUnitEconomics } from '../per-unit/per-unit-calc';
import type { CalcRulePack, PerUnitCalcInput } from '../per-unit/types';

describe('Golden Fixtures Verification (Independent Hand-Derived Parity)', () => {
  const packsByKeyAndVersion = new Map<string, CalcRulePack>([
    ['TEST_EBOOK_STANDARD@1.0.0', ebookPackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@1.0.0', paperbackV1PackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@2.0.0', paperbackV2PackJson as unknown as CalcRulePack],
    ['TEST_HARDCOVER_GLOBAL@1.0.0', hardcoverPackJson as unknown as CalcRulePack],
  ]);

  const cases = goldenCasesData.cases;

  it('contains at least 20 comprehensive golden cases covering all synthetic packs', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const testCase of cases) {
    it(`evaluates golden case "${testCase.id}": ${testCase.description}`, () => {
      const packKey = `${testCase.rulePackRef.packKey}@${testCase.rulePackRef.version}`;
      const rulePack = packsByKeyAndVersion.get(packKey);
      expect(rulePack).toBeDefined();

      const input: PerUnitCalcInput = {
        listPriceMinor: testCase.input.listPriceMinor,
        currency: testCase.input.currency,
        format: testCase.input.format,
        pages: 'pages' in testCase.input ? (testCase.input.pages as number) : undefined,
        fileSizeMb: 'fileSizeMb' in testCase.input ? String(testCase.input.fileSizeMb) : undefined,
      };

      const result = calculatePerUnitEconomics(input, rulePack!);

      // 1. Tier selection check
      expect(result.royaltyTier.name).toBe(testCase.expectedTier);
      expect(result.royaltyTier.royaltyRateDecimal).toBe(testCase.expectedRate);

      // 2. Exact rational gross royalty check
      expect(result.exactGrossRoyalty.numerator.toString()).toBe(
        testCase.expectedExactRoyalty.numerator,
      );
      expect(result.exactGrossRoyalty.denominator.toString()).toBe(
        testCase.expectedExactRoyalty.denominator,
      );
      expect(result.exactGrossRoyalty.toDecimalString()).toBe(
        testCase.expectedExactRoyalty.decimalString,
      );

      // 3. Applicable cost check
      if (testCase.expectedProductionCostMinor !== null) {
        expect(result.applicableCost).not.toBeNull();
        expect(result.applicableCost?.amountMinor).toBe(testCase.expectedProductionCostMinor);
        expect(result.costBreakdown.totalCostMinor).toBe(testCase.expectedProductionCostMinor);
      } else {
        expect(result.applicableCost).toBeNull();
        expect(result.costBreakdown.totalCostMinor).toBeNull();
      }

      // 4. Exact rational net contribution check
      expect(result.exactNetContribution.numerator.toString()).toBe(
        testCase.expectedExactContribution.numerator,
      );
      expect(result.exactNetContribution.denominator.toString()).toBe(
        testCase.expectedExactContribution.denominator,
      );
      expect(result.exactNetContribution.toDecimalString()).toBe(
        testCase.expectedExactContribution.decimalString,
      );

      // 5. Rounding check
      expect(result.rounding.mode).toBe(testCase.rounding.mode);
      expect(result.rounding.point).toBe(testCase.rounding.point);

      if (testCase.rounding.point === 'per_unit') {
        expect(result.grossRoyalty).not.toBeNull();
        expect(result.grossRoyalty?.amountMinor).toBe(testCase.expectedRoundedGrossRoyaltyMinor);

        expect(result.netContribution).not.toBeNull();
        expect(result.netContribution?.amountMinor).toBe(
          testCase.expectedRoundedNetContributionMinor,
        );
        expect(result.isRounded).toBe(true);
      } else {
        // per_total: per-unit rounded Money is null
        expect(result.grossRoyalty).toBeNull();
        expect(result.netContribution).toBeNull();
        expect(result.isRounded).toBe(false);
      }
    });
  }
});
