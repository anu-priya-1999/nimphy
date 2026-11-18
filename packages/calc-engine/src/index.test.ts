import { Money } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import paperbackV1PackJson from '../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import * as CalcEngine from './index';
import {
  CALC_ENGINE_MODULE_NAME,
  CALC_ENGINE_MODULE_VERSION,
  // Scenario totals calculation (STEP-006)
  calculateSingleScenario,
  calculateTriadScenarios,
  evaluateScenarioOrdering,
  // Break-even economics calculation (STEP-007)
  calculateBreakEven,
  // Per-unit economics calculation (STEP-005)
  calculatePerUnitEconomics,
  // Exact rational arithmetic
  Rational,
  // Calculation errors
  CalcEngineError,
  CalcInputValidationError,
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
  CalcOverflowError,
  type CalcRulePack,
  type SingleScenarioResult,
  type TriadScenariosResult,
  type PerUnitEconomics,
  type BreakEvenResult,
} from './index';

describe('@nimphy/calc-engine Barrel Export & Public API', () => {
  it('exports module identity constants', () => {
    expect(CalcEngine.CALC_ENGINE_MODULE_NAME).toBe('calc-engine');
    expect(CalcEngine.CALC_ENGINE_MODULE_VERSION).toBe('0.1.0');
    expect(CALC_ENGINE_MODULE_NAME).toBe('calc-engine');
    expect(CALC_ENGINE_MODULE_VERSION).toBe('0.1.0');
  });

  it('exports calculation functions and math classes', () => {
    expect(typeof CalcEngine.calculatePerUnitEconomics).toBe('function');
    expect(typeof CalcEngine.calculateSingleScenario).toBe('function');
    expect(typeof CalcEngine.calculateTriadScenarios).toBe('function');
    expect(typeof CalcEngine.evaluateScenarioOrdering).toBe('function');
    expect(typeof CalcEngine.calculateBreakEven).toBe('function');
    expect(typeof CalcEngine.Rational).toBe('function');

    expect(typeof calculatePerUnitEconomics).toBe('function');
    expect(typeof calculateSingleScenario).toBe('function');
    expect(typeof calculateTriadScenarios).toBe('function');
    expect(typeof evaluateScenarioOrdering).toBe('function');
    expect(typeof calculateBreakEven).toBe('function');
    expect(typeof Rational).toBe('function');
  });

  it('exports all typed calculation engine error classes', () => {
    expect(typeof CalcEngine.CalcEngineError).toBe('function');
    expect(typeof CalcEngine.CalcInputValidationError).toBe('function');
    expect(typeof CalcEngine.CalcCurrencyMismatchError).toBe('function');
    expect(typeof CalcEngine.CalcFormatMismatchError).toBe('function');
    expect(typeof CalcEngine.NoMatchingRoyaltyTierError).toBe('function');
    expect(typeof CalcEngine.RulePackIncompatibleError).toBe('function');
    expect(typeof CalcEngine.CalcOverflowError).toBe('function');

    expect(typeof CalcEngineError).toBe('function');
    expect(typeof CalcInputValidationError).toBe('function');
    expect(typeof CalcCurrencyMismatchError).toBe('function');
    expect(typeof CalcFormatMismatchError).toBe('function');
    expect(typeof NoMatchingRoyaltyTierError).toBe('function');
    expect(typeof RulePackIncompatibleError).toBe('function');
    expect(typeof CalcOverflowError).toBe('function');
  });
});

describe('README Public API Compile-Time & Runtime Verification', () => {
  const paperbackRulePack = paperbackV1PackJson as unknown as CalcRulePack;
  const ebookRulePack = ebookPackJson as unknown as CalcRulePack;

  it('statically typechecks and executes the exact Single Scenario README example', () => {
    // Exact code snippet from packages/calc-engine/README.md lines 170-190
    const result: SingleScenarioResult = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 500,
        listPriceMinor: 999, // $9.99
        costVariancePercent: '0',
        currency: 'USD',
        format: 'paperback',
        pages: 200,
      },
      paperbackRulePack,
    );

    // Static compile-time type verification of every property accessed in README
    const units: number = result.units;
    const revenueMinor: number = result.revenue.amountMinor;
    const grossRoyaltyMinor: number = result.grossRoyalty.amountMinor;
    const applicableCostMinor: number = result.applicableCost.amountMinor;
    const netContributionMinor: number = result.netContribution.amountMinor;
    const isIllustrative: true = result.isIllustrative;
    const disclaimer: string = result.disclaimer;

    // Runtime value assertions
    expect(units).toBe(500);
    expect(revenueMinor).toBe(499500);
    expect(grossRoyaltyMinor).toBe(299500);
    expect(applicableCostMinor).toBe(226000);
    expect(netContributionMinor).toBe(73500);
    expect(isIllustrative).toBe(true);
    expect(disclaimer).toBe(
      'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
    );
  });

  it('statically typechecks and executes the exact Triad Scenarios README example', () => {
    // Exact code snippet from packages/calc-engine/README.md lines 197-214
    const triad: TriadScenariosResult = calculateTriadScenarios(
      {
        scenarios: {
          low: { units: 100, listPriceMinor: 799, costVariancePercent: '10' },
          base: { units: 500, listPriceMinor: 999, costVariancePercent: '0' },
          high: { units: 2500, listPriceMinor: 1299, costVariancePercent: '-10' },
        },
        currency: 'USD',
        format: 'paperback',
        pages: 200,
      },
      paperbackRulePack,
    );

    // Static compile-time type verification of every property accessed in README
    const areOrdered: boolean = triad.ordering.areTotalsMonotonicallyOrdered;
    const baseNetContributionMinor: number = triad.totals.base.netContribution.amountMinor;
    const disclaimer: string = triad.disclaimer;

    // Runtime value assertions
    expect(areOrdered).toBe(true);
    expect(baseNetContributionMinor).toBe(73500);
    expect(disclaimer).toBe(
      'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
    );
  });

  it('statically typechecks and executes the exact Per-Unit Economics README example', () => {
    // Exact code snippet from packages/calc-engine/README.md lines 221-230
    const perUnit: PerUnitEconomics = calculatePerUnitEconomics(
      {
        listPriceMinor: 499, // $4.99
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1.5',
      },
      ebookRulePack,
    );

    // Static compile-time type verification
    const format: string = perUnit.format;
    const currency: string = perUnit.currency;
    const listPriceMinor: number = perUnit.listPrice.amountMinor;
    const grossRoyaltyMinor: number | undefined = perUnit.grossRoyalty?.amountMinor;
    const applicableCostMinor: number | undefined = perUnit.applicableCost?.amountMinor;
    const netContributionMinor: number | undefined = perUnit.netContribution?.amountMinor;

    // Runtime value assertions
    expect(format).toBe('ebook');
    expect(currency).toBe('USD');
    expect(listPriceMinor).toBe(499);
    expect(grossRoyaltyMinor).toBe(349);
    expect(applicableCostMinor).toBe(23);
    expect(netContributionMinor).toBe(326);
    expect(perUnit.trace).toBeDefined();
  });

  it('statically typechecks and executes the exact Break-Even README example', () => {
    // Exact code snippet from packages/calc-engine/README.md lines 236-258
    const result: BreakEvenResult = calculateBreakEven(
      {
        fixedCost: Money.of(250000, 'USD'), // $2,500.00 fixed production cost
        listPriceMinor: 1499, // $14.99 list price
        currency: 'USD',
        format: 'paperback',
        pages: 200,
        costVariancePercent: '0',
      },
      paperbackRulePack,
    );

    // Verify TypeScript discriminated-union behavior
    expect(result.reachable).toBe(true);

    if (result.reachable) {
      // Static compile-time type verification of every property accessed in README
      const units: number = result.units;
      const formattedRevenue: string = result.revenue.toFormattedString();
      const unitContributionMinor: number | null = result.unitContributionMinor;
      const isIllustrative: true = result.isIllustrative;
      const disclaimer: string = result.disclaimer;
      const fixedCostMinor: number = result.fixedCost.amountMinor;

      // Runtime value assertions
      expect(units).toBe(560);
      expect(formattedRevenue).toBe('$8394.40');
      expect(result.revenue.amountMinor).toBe(839440);
      expect(unitContributionMinor).toBe(447);
      expect(isIllustrative).toBe(true);
      expect(typeof disclaimer).toBe('string');
      expect(fixedCostMinor).toBe(250000);
      expect(result.exactUnitContribution).toBeDefined();
      expect(result.trace).toBeDefined();
    } else {
      // Compile-time verification that unreachable branch exposes unreachableReason
      const reason: string = result.unreachableReason;
      expect(reason).toBeUndefined();
    }
  });

  it('statically typechecks exported calculation error classes and hierarchy', () => {
    const errs: CalcEngineError[] = [
      new CalcInputValidationError('INVALID_UNITS', 'Units must be non-negative'),
      new CalcCurrencyMismatchError('USD', 'EUR'),
      new CalcFormatMismatchError('ebook', 'paperback'),
      new NoMatchingRoyaltyTierError(5000, 'USD'),
      new RulePackIncompatibleError('MISSING_POLICY', 'Missing print cost policy'),
      new CalcOverflowError('Overflow'),
    ];

    expect(errs.length).toBe(6);
    for (const err of errs) {
      expect(err).toBeInstanceOf(CalcEngineError);
      expect(typeof err.code).toBe('string');
    }
  });
});
