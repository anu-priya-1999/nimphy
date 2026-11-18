import { type CurrencyCode, Money } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import goldenBreakEvenCasesData from '../../../../fixtures/calc-engine/golden-break-even-cases.json';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateBreakEven } from './break-even-calc';
import type { BreakEvenInput } from './types';

describe('Golden Break-Even Fixtures Verification (Independent Hand-Derived Parity)', () => {
  const packsByKeyAndVersion = new Map<string, CalcRulePack>([
    ['TEST_EBOOK_STANDARD@1.0.0', ebookPackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@1.0.0', paperbackV1PackJson as unknown as CalcRulePack],
    ['TEST_PAPERBACK_US@2.0.0', paperbackV2PackJson as unknown as CalcRulePack],
    ['TEST_HARDCOVER_GLOBAL@1.0.0', hardcoverPackJson as unknown as CalcRulePack],
  ]);

  const cases = goldenBreakEvenCasesData.cases;

  it('contains at least 20 comprehensive golden break-even cases covering all synthetic packs', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const testCase of cases) {
    it(`evaluates golden break-even "${testCase.id}": ${testCase.description}`, () => {
      const packKey = `${testCase.rulePackRef.packKey}@${testCase.rulePackRef.version}`;
      const rulePack = packsByKeyAndVersion.get(packKey);
      expect(rulePack).toBeDefined();

      const input: BreakEvenInput = {
        fixedCost: Money.of(testCase.input.fixedCostMinor, testCase.input.currency as CurrencyCode),
        listPriceMinor: testCase.input.listPriceMinor,
        currency: testCase.input.currency,
        format: testCase.input.format,
        pages: 'pages' in testCase.input ? (testCase.input.pages as number) : undefined,
        fileSizeMb: 'fileSizeMb' in testCase.input ? String(testCase.input.fileSizeMb) : undefined,
        costVariancePercent:
          'costVariancePercent' in testCase.input
            ? String(testCase.input.costVariancePercent)
            : undefined,
      };

      const result = calculateBreakEven(input, rulePack!);

      // Reachability assertion
      expect(result.reachable).toBe(testCase.expectedReachable);

      if (testCase.expectedReachable) {
        if (!result.reachable) throw new Error('Expected reachable result');

        // Units assertion
        expect(result.units).toBe(testCase.expectedUnits);

        // Revenue assertion
        expect(result.revenue.amountMinor).toBe(testCase.expectedRevenueMinor);
        expect(result.revenue.currency).toBe(testCase.input.currency);

        // Fixed cost echo
        expect(result.fixedCost.amountMinor).toBe(testCase.input.fixedCostMinor);
        expect(result.fixedCost.currency).toBe(testCase.input.currency);

        // Unit contribution minor assertion
        expect(result.unitContributionMinor).toBe(testCase.expectedUnitContributionMinor);

        // Exact rational assertion
        expect(result.exactUnitContribution.numerator.toString()).toBe(
          testCase.expectedExactContribution.numerator,
        );
        expect(result.exactUnitContribution.denominator.toString()).toBe(
          testCase.expectedExactContribution.denominator,
        );
        expect(result.exactUnitContribution.toDecimalString()).toBe(
          testCase.expectedExactContribution.decimalString,
        );

        // Trace audit
        expect(result.trace.result.reachable).toBe(true);
        expect(result.trace.result.units).toBe(testCase.expectedUnits);
        expect(result.trace.result.revenueMinor).toBe(testCase.expectedRevenueMinor);
      } else {
        if (result.reachable) throw new Error('Expected unreachable result');

        expect(result.unreachableReason).toBe(testCase.expectedUnreachableReason);
        expect(result.fixedCost.amountMinor).toBe(testCase.input.fixedCostMinor);
        expect(result.exactUnitContribution.numerator.toString()).toBe(
          testCase.expectedExactContribution.numerator,
        );
        expect(result.exactUnitContribution.denominator.toString()).toBe(
          testCase.expectedExactContribution.denominator,
        );
        expect(result.trace.result.reachable).toBe(false);
        expect(result.trace.result.unreachableReason).toBe(testCase.expectedUnreachableReason);
      }

      // Immutability check
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.trace)).toBe(true);
    });
  }
});
