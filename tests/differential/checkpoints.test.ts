/**
 * Independent Hand-Derived Reference Checkpoints Verification.
 *
 * Verifies that:
 * 1. The independent reference oracle produces exact agreement with hand-derived checkpoint derivations.
 * 2. The production calc-engine produces exact agreement with both the reference oracle and hand derivations.
 * 3. All 4 rounding modes, rounding ties, and representative break-even / sensitivity calculations pass.
 */

import { describe, expect, it } from 'vitest';
import checkpointsData from '../../fixtures/calc-engine/reference-checkpoints.json';
import ebookPackJson from '../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import { type Currency, Money } from '@nimphy/domain';
import {
  calculateBreakEven,
  calculatePerUnitEconomics,
  calculateSensitivity,
  calculateSingleScenario,
  calculateTriadScenarios,
  type CalcRulePack,
  type CaseScenariosInput,
  type SensitivityDriverConfig,
} from '@nimphy/calc-engine';
import {
  refCalculateBreakEven,
  refCalculatePerUnit,
  refCalculateSensitivity,
  refCalculateSingleScenario,
  refCalculateTriadScenarios,
  type RefCaseScenariosInput,
  type RefRulePack,
} from './reference-oracle';

describe('Independent Reference Checkpoints (Hand-Derived Parity)', () => {
  const packsByKey = new Map<string, object>([
    ['TEST_EBOOK_STANDARD@1.0.0', ebookPackJson],
    ['TEST_PAPERBACK_US@1.0.0', paperbackV1PackJson],
    ['TEST_HARDCOVER_GLOBAL@1.0.0', hardcoverPackJson],
  ]);

  function getRulePackWithRounding(
    packKey: string,
    version: string,
    roundingOverride?: {
      mode: 'round_half_up' | 'round_half_even' | 'round_down' | 'round_up';
      point: 'per_unit' | 'per_total';
    },
  ): { prodPack: CalcRulePack; refPack: RefRulePack } {
    const raw = packsByKey.get(`${packKey}@${version}`);
    if (!raw) {
      throw new Error(`Rule pack fixture not found: ${packKey}@${version}`);
    }

    const cloned = JSON.parse(JSON.stringify(raw));
    if (roundingOverride) {
      cloned.content.rounding = {
        mode: roundingOverride.mode,
        point: roundingOverride.point,
      };
    }

    return {
      prodPack: cloned as CalcRulePack,
      refPack: cloned as RefRulePack,
    };
  }

  it('contains at least 14 comprehensive reference checkpoints', () => {
    expect(checkpointsData.checkpoints.length).toBeGreaterThanOrEqual(14);
  });

  for (const cp of checkpointsData.checkpoints) {
    it(`evaluates checkpoint "${cp.id}": ${cp.description}`, () => {
      const { prodPack, refPack } = getRulePackWithRounding(
        cp.rulePackRef.packKey,
        cp.rulePackRef.version,
        cp.roundingOverride,
      );

      if (cp.type === 'per_unit') {
        const input = cp.input as {
          listPriceMinor: number;
          currency: Currency;
          format: 'ebook' | 'paperback' | 'hardcover';
          pages?: number;
          fileSizeMb?: string;
        };

        // 1. Reference Oracle evaluation
        const refResult = refCalculatePerUnit(input, refPack);
        expect(refResult.exactGrossRoyalty.numerator.toString()).toBe(
          cp.expected.exactGrossRoyalty.numerator,
        );
        expect(refResult.exactGrossRoyalty.denominator.toString()).toBe(
          cp.expected.exactGrossRoyalty.denominator,
        );
        expect(refResult.exactProductionCost.numerator.toString()).toBe(
          cp.expected.exactProductionCost.numerator,
        );
        expect(refResult.exactProductionCost.denominator.toString()).toBe(
          cp.expected.exactProductionCost.denominator,
        );
        expect(refResult.grossRoyaltyMinor).toBe(cp.expected.grossRoyaltyMinor);
        expect(refResult.productionCostMinor).toBe(cp.expected.productionCostMinor);
        expect(refResult.unitContributionMinor).toBe(cp.expected.unitContributionMinor);

        // 2. Production engine evaluation
        const prodResult = calculatePerUnitEconomics(input, prodPack);
        expect(prodResult.exactGrossRoyalty.numerator.toString()).toBe(
          cp.expected.exactGrossRoyalty.numerator,
        );
        expect(prodResult.exactGrossRoyalty.denominator.toString()).toBe(
          cp.expected.exactGrossRoyalty.denominator,
        );
        expect(prodResult.exactApplicableCost.numerator.toString()).toBe(
          cp.expected.exactProductionCost.numerator,
        );
        expect(prodResult.exactApplicableCost.denominator.toString()).toBe(
          cp.expected.exactProductionCost.denominator,
        );
        expect(prodResult.grossRoyalty?.amountMinor ?? null).toBe(cp.expected.grossRoyaltyMinor);
        expect(prodResult.applicableCost?.amountMinor ?? null).toBe(
          cp.expected.productionCostMinor,
        );
        expect(prodResult.netContribution?.amountMinor ?? null).toBe(
          cp.expected.unitContributionMinor,
        );
      } else if (cp.type === 'scenario') {
        const input = cp.input as {
          units: number;
          listPriceMinor: number;
          currency: Currency;
          format: 'ebook' | 'paperback' | 'hardcover';
          pages?: number;
          fileSizeMb?: string;
          costVariancePercent?: string;
        };

        // 1. Reference Oracle evaluation
        const refResult = refCalculateSingleScenario(input, refPack);
        expect(refResult.revenueMinor).toBe(cp.expected.revenueMinor);
        expect(refResult.grossRoyaltyMinor).toBe(cp.expected.grossRoyaltyMinor);
        expect(refResult.productionCostMinor).toBe(cp.expected.productionCostMinor);
        expect(refResult.netContributionMinor).toBe(cp.expected.netContributionMinor);

        if (cp.expected.exactTotalRoyalty) {
          expect(refResult.exactTotalRoyalty.numerator.toString()).toBe(
            cp.expected.exactTotalRoyalty.numerator,
          );
          expect(refResult.exactTotalRoyalty.denominator.toString()).toBe(
            cp.expected.exactTotalRoyalty.denominator,
          );
        }
        if (cp.expected.exactTotalCost) {
          expect(refResult.exactTotalCost.numerator.toString()).toBe(
            cp.expected.exactTotalCost.numerator,
          );
          expect(refResult.exactTotalCost.denominator.toString()).toBe(
            cp.expected.exactTotalCost.denominator,
          );
        }
        if (cp.expected.exactTotalContribution) {
          expect(refResult.exactTotalContribution.numerator.toString()).toBe(
            cp.expected.exactTotalContribution.numerator,
          );
          expect(refResult.exactTotalContribution.denominator.toString()).toBe(
            cp.expected.exactTotalContribution.denominator,
          );
        }

        // 2. Production engine evaluation
        const prodResult = calculateSingleScenario({ ...input, scenarioName: 'base' }, prodPack);
        expect(prodResult.revenue.amountMinor).toBe(cp.expected.revenueMinor);
        expect(prodResult.grossRoyalty.amountMinor).toBe(cp.expected.grossRoyaltyMinor);
        expect(prodResult.applicableCost.amountMinor).toBe(cp.expected.productionCostMinor);
        expect(prodResult.netContribution.amountMinor).toBe(cp.expected.netContributionMinor);

        if (cp.expected.exactTotalRoyalty) {
          expect(prodResult.exactTotalRoyalty.numerator.toString()).toBe(
            cp.expected.exactTotalRoyalty.numerator,
          );
          expect(prodResult.exactTotalRoyalty.denominator.toString()).toBe(
            cp.expected.exactTotalRoyalty.denominator,
          );
        }
        if (cp.expected.exactTotalCost) {
          expect(prodResult.exactTotalCost.numerator.toString()).toBe(
            cp.expected.exactTotalCost.numerator,
          );
          expect(prodResult.exactTotalCost.denominator.toString()).toBe(
            cp.expected.exactTotalCost.denominator,
          );
        }
        if (cp.expected.exactTotalContribution) {
          expect(prodResult.exactTotalContribution.numerator.toString()).toBe(
            cp.expected.exactTotalContribution.numerator,
          );
          expect(prodResult.exactTotalContribution.denominator.toString()).toBe(
            cp.expected.exactTotalContribution.denominator,
          );
        }
      } else if (cp.type === 'triad') {
        const input = cp.input as CaseScenariosInput;
        const refInput = cp.input as RefCaseScenariosInput;

        // 1. Reference Oracle evaluation
        const refResult = refCalculateTriadScenarios(refInput, refPack);
        for (const sName of ['low', 'base', 'high'] as const) {
          const expectedS = cp.expected.scenarios[sName];
          const actualRefS = refResult.scenarios[sName];
          expect(actualRefS.revenueMinor).toBe(expectedS.revenueMinor);
          expect(actualRefS.grossRoyaltyMinor).toBe(expectedS.grossRoyaltyMinor);
          expect(actualRefS.productionCostMinor).toBe(expectedS.productionCostMinor);
          expect(actualRefS.netContributionMinor).toBe(expectedS.netContributionMinor);
          expect(actualRefS.exactTotalRoyalty.numerator.toString()).toBe(
            expectedS.exactTotalRoyalty.numerator,
          );
          expect(actualRefS.exactTotalRoyalty.denominator.toString()).toBe(
            expectedS.exactTotalRoyalty.denominator,
          );
          expect(actualRefS.exactTotalCost.numerator.toString()).toBe(
            expectedS.exactTotalCost.numerator,
          );
          expect(actualRefS.exactTotalCost.denominator.toString()).toBe(
            expectedS.exactTotalCost.denominator,
          );
          expect(actualRefS.exactTotalContribution.numerator.toString()).toBe(
            expectedS.exactTotalContribution.numerator,
          );
          expect(actualRefS.exactTotalContribution.denominator.toString()).toBe(
            expectedS.exactTotalContribution.denominator,
          );
        }

        expect(refResult.ordering.areInputsMonotonicallyOrdered).toBe(
          cp.expected.ordering.areInputsMonotonicallyOrdered,
        );
        expect(refResult.ordering.areTotalsMonotonicallyOrdered).toBe(
          cp.expected.ordering.areTotalsMonotonicallyOrdered,
        );
        expect(refResult.ordering.netContributionOrderingSatisfied).toBe(
          cp.expected.ordering.netContributionOrderingSatisfied,
        );
        expect(refResult.ordering.revenueOrderingSatisfied).toBe(
          cp.expected.ordering.revenueOrderingSatisfied,
        );
        expect(refResult.ordering.details).toEqual(cp.expected.ordering.details);

        // 2. Production engine evaluation
        const prodResult = calculateTriadScenarios(input, prodPack);
        for (const sName of ['low', 'base', 'high'] as const) {
          const expectedS = cp.expected.scenarios[sName];
          const actualProdS = prodResult.scenarios[sName];
          expect(actualProdS.revenue.amountMinor).toBe(expectedS.revenueMinor);
          expect(actualProdS.grossRoyalty.amountMinor).toBe(expectedS.grossRoyaltyMinor);
          expect(actualProdS.applicableCost.amountMinor).toBe(expectedS.productionCostMinor);
          expect(actualProdS.netContribution.amountMinor).toBe(expectedS.netContributionMinor);
          expect(actualProdS.exactTotalRoyalty.numerator.toString()).toBe(
            expectedS.exactTotalRoyalty.numerator,
          );
          expect(actualProdS.exactTotalRoyalty.denominator.toString()).toBe(
            expectedS.exactTotalRoyalty.denominator,
          );
          expect(actualProdS.exactTotalCost.numerator.toString()).toBe(
            expectedS.exactTotalCost.numerator,
          );
          expect(actualProdS.exactTotalCost.denominator.toString()).toBe(
            expectedS.exactTotalCost.denominator,
          );
          expect(actualProdS.exactTotalContribution.numerator.toString()).toBe(
            expectedS.exactTotalContribution.numerator,
          );
          expect(actualProdS.exactTotalContribution.denominator.toString()).toBe(
            expectedS.exactTotalContribution.denominator,
          );
        }

        expect(prodResult.ordering.areInputsMonotonicallyOrdered).toBe(
          cp.expected.ordering.areInputsMonotonicallyOrdered,
        );
        expect(prodResult.ordering.areTotalsMonotonicallyOrdered).toBe(
          cp.expected.ordering.areTotalsMonotonicallyOrdered,
        );
        expect(prodResult.ordering.netContributionOrderingSatisfied).toBe(
          cp.expected.ordering.netContributionOrderingSatisfied,
        );
        expect(prodResult.ordering.revenueOrderingSatisfied).toBe(
          cp.expected.ordering.revenueOrderingSatisfied,
        );
        expect(prodResult.ordering.details).toEqual(cp.expected.ordering.details);
      } else if (cp.type === 'break_even') {
        const input = cp.input as {
          fixedCostMinor: number;
          listPriceMinor: number;
          currency: Currency;
          format: 'ebook' | 'paperback' | 'hardcover';
          pages?: number;
          fileSizeMb?: string;
          costVariancePercent?: string;
        };

        // 1. Reference Oracle evaluation
        const refResult = refCalculateBreakEven(input, refPack);
        expect(refResult.reachable).toBe(cp.expected.reachable);
        if (cp.expected.reachable) {
          expect(refResult.breakEvenUnits).toBe(cp.expected.breakEvenUnits);
          expect(refResult.breakEvenRevenueMinor).toBe(cp.expected.breakEvenRevenueMinor);
        } else {
          expect(refResult.unreachableReason).toBe(cp.expected.unreachableReason);
        }
        expect(refResult.unitContributionMinor).toBe(cp.expected.unitContributionMinor);

        if (cp.expected.exactUnitContribution) {
          expect(refResult.exactUnitContribution.numerator.toString()).toBe(
            cp.expected.exactUnitContribution.numerator,
          );
          expect(refResult.exactUnitContribution.denominator.toString()).toBe(
            cp.expected.exactUnitContribution.denominator,
          );
        }

        // 2. Production engine evaluation
        const prodResult = calculateBreakEven(
          {
            fixedCost: Money.of(input.fixedCostMinor, input.currency),
            currency: input.currency,
            listPriceMinor: input.listPriceMinor,
            format: input.format,
            pages: input.pages,
            fileSizeMb: input.fileSizeMb,
            costVariancePercent: input.costVariancePercent,
          },
          prodPack,
        );
        expect(prodResult.reachable).toBe(cp.expected.reachable);
        if (cp.expected.reachable) {
          expect(prodResult.reachable).toBe(true);
          if (prodResult.reachable) {
            expect(prodResult.units).toBe(cp.expected.breakEvenUnits);
            expect(prodResult.revenue.amountMinor).toBe(cp.expected.breakEvenRevenueMinor);
          }
        } else {
          expect(prodResult.unreachableReason).toBe(cp.expected.unreachableReason);
        }
        expect(prodResult.unitContributionMinor).toBe(cp.expected.unitContributionMinor);

        if (cp.expected.exactUnitContribution) {
          expect(prodResult.exactUnitContribution.numerator.toString()).toBe(
            cp.expected.exactUnitContribution.numerator,
          );
          expect(prodResult.exactUnitContribution.denominator.toString()).toBe(
            cp.expected.exactUnitContribution.denominator,
          );
        }
      } else if (cp.type === 'sensitivity') {
        const input = cp.input as {
          baseline: {
            units: number;
            listPriceMinor: number;
            currency: Currency;
            format: 'ebook' | 'paperback' | 'hardcover';
            pages?: number;
            fileSizeMb?: string;
            costVariancePercent?: string;
          };
          drivers: SensitivityDriverConfig[];
        };

        // 1. Reference Oracle evaluation
        const refResult = refCalculateSensitivity(input, refPack);
        expect(refResult.baselineNetContributionMinor).toBe(
          cp.expected.baselineNetContributionMinor,
        );
        expect(refResult.baselineRevenueMinor).toBe(cp.expected.baselineRevenueMinor);
        expect(refResult.rankedDrivers.length).toBe(cp.expected.rankedDrivers.length);
        for (let i = 0; i < refResult.rankedDrivers.length; i++) {
          const actual = refResult.rankedDrivers[i];
          const expected = cp.expected.rankedDrivers[i];
          expect(actual.driver).toBe(expected.driver);
          expect(actual.rank).toBe(expected.rank);
          expect(actual.impactScoreMinor).toBe(expected.impactScoreMinor);
          expect(actual.lowerNetContributionMinor).toBe(expected.lowerNetContributionMinor);
          expect(actual.upperNetContributionMinor).toBe(expected.upperNetContributionMinor);
          expect(actual.deltaLowerMinor).toBe(expected.deltaLowerMinor);
          expect(actual.deltaUpperMinor).toBe(expected.deltaUpperMinor);
          if (expected.lowerRevenueMinor !== undefined) {
            expect(actual.lowerRevenueMinor).toBe(expected.lowerRevenueMinor);
          }
          if (expected.upperRevenueMinor !== undefined) {
            expect(actual.upperRevenueMinor).toBe(expected.upperRevenueMinor);
          }
          if (expected.deltaLowerRevenueMinor !== undefined) {
            expect(actual.deltaLowerRevenueMinor).toBe(expected.deltaLowerRevenueMinor);
          }
          if (expected.deltaUpperRevenueMinor !== undefined) {
            expect(actual.deltaUpperRevenueMinor).toBe(expected.deltaUpperRevenueMinor);
          }
        }

        // 2. Production engine evaluation
        const prodResult = calculateSensitivity(
          {
            baseline: {
              ...input.baseline,
              scenarioName: 'base',
            },
            drivers: input.drivers,
          },
          prodPack,
        );
        expect(prodResult.baseline.netContribution.amountMinor).toBe(
          cp.expected.baselineNetContributionMinor,
        );
        expect(prodResult.baseline.revenue.amountMinor).toBe(cp.expected.baselineRevenueMinor);
        expect(prodResult.rankedDrivers.length).toBe(cp.expected.rankedDrivers.length);
        for (let i = 0; i < prodResult.rankedDrivers.length; i++) {
          const actual = prodResult.rankedDrivers[i];
          const expected = cp.expected.rankedDrivers[i];
          expect(actual.driver).toBe(expected.driver);
          expect(actual.rank).toBe(expected.rank);
          expect(actual.impactScoreMinor).toBe(expected.impactScoreMinor);
          expect(actual.lowerNetContribution.amountMinor).toBe(expected.lowerNetContributionMinor);
          expect(actual.upperNetContribution.amountMinor).toBe(expected.upperNetContributionMinor);
          expect(actual.deltaLower.amountMinor).toBe(expected.deltaLowerMinor);
          expect(actual.deltaUpper.amountMinor).toBe(expected.deltaUpperMinor);
          if (expected.lowerRevenueMinor !== undefined) {
            expect(actual.lowerRevenue.amountMinor).toBe(expected.lowerRevenueMinor);
          }
          if (expected.upperRevenueMinor !== undefined) {
            expect(actual.upperRevenue.amountMinor).toBe(expected.upperRevenueMinor);
          }
          if (expected.deltaLowerRevenueMinor !== undefined) {
            expect(actual.deltaLowerRevenue.amountMinor).toBe(expected.deltaLowerRevenueMinor);
          }
          if (expected.deltaUpperRevenueMinor !== undefined) {
            expect(actual.deltaUpperRevenue.amountMinor).toBe(expected.deltaUpperRevenueMinor);
          }
        }
      }
    });
  }
});
