import { describe, expect, it } from 'vitest';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import { CalcOverflowError } from '../errors/calc-error';
import { Rational } from '../math/rational';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario } from './scenario-calc';
import { calculatePerUnitEconomics } from '../per-unit/per-unit-calc';

describe('Accepted ADR-005: per_total vs per_unit Aggregation Regression Suite', () => {
  const hardcoverPack = hardcoverPackJson as unknown as CalcRulePack;
  const ebookPack = ebookPackJson as unknown as CalcRulePack;
  const paperbackV1Pack = paperbackV1PackJson as unknown as CalcRulePack;

  it('proves that per_total aggregates exact rational amounts and rounds only once at total level', () => {
    // Under hardcoverPack (round_down, per_total):
    // List price: 1999 (€19.99)
    // Rate: 0.50 (50%)
    // Exact gross royalty per unit = 1999 * 0.50 = 999.5 cents
    // Per-unit Economics under per_total preserves exactGrossRoyalty = 999.5 and grossRoyalty Money = null
    const perUnit = calculatePerUnitEconomics(
      { listPriceMinor: 1999, currency: 'EUR', format: 'hardcover', pages: 100 },
      hardcoverPack,
    );
    expect(perUnit.grossRoyalty).toBeNull();
    expect(perUnit.netContribution).toBeNull();
    expect(perUnit.exactGrossRoyalty.toDecimalString()).toBe('999.5');

    // If premature per-unit rounding occurred under round_down:
    // 999.5 would round to 999 minor units.
    // For Q = 3 units: 999 * 3 = 2997 minor units.
    //
    // Under correct ADR-005 per_total aggregation:
    // Exact total royalty = 999.5 * 3 = 2998.5 minor units.
    // 2998.5 rounds under round_down to 2998 minor units!
    const scenario3 = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 3,
        listPriceMinor: 1999,
        currency: 'EUR',
        format: 'hardcover',
        pages: 100,
      },
      hardcoverPack,
    );

    expect(scenario3.grossRoyalty.amountMinor).toBe(2998);
    expect(scenario3.grossRoyalty.amountMinor).not.toBe(2997); // PROOF that premature per-unit rounding was avoided!
  });

  it('proves that per_total rounds aggregate royalty and aggregate cost separately before subtraction', () => {
    // Synthetic pack configured with per_total and round_half_up
    const customPerTotalPack: CalcRulePack = {
      ...ebookPack,
      content: {
        ...ebookPack.content,
        rounding: {
          mode: 'round_half_up',
          point: 'per_total',
        },
      },
    };

    // Case: List price 99 ($0.99), 35% tier
    // Exact per-unit gross royalty = 99 * 0.35 = 34.65 cents
    // Exact per-unit delivery cost for 0.5 MB = 0.5 * 15 = 7.5 cents
    // Exact per-unit net contribution = 34.65 - 7.5 = 27.15 cents
    //
    // Let Q = 10 units:
    // exactTotalRoyalty = 34.65 * 10 = 346.5 cents -> rounds under round_half_up to 347 cents
    // exactTotalCost = 7.5 * 10 = 75.0 cents -> rounds to 75 cents
    // totalContribution derived by subtraction = 347 - 75 = 272 cents
    //
    // If one incorrectly rounded exact total contribution directly:
    // exactTotalContribution = 27.15 * 10 = 271.5 cents -> would round under round_half_up to 272 cents.
    // But let's check Q = 1 unit:
    // Q = 1:
    // exactTotalRoyalty = 34.65 -> rounds to 35
    // exactTotalCost = 7.5 -> rounds to 8
    // totalContribution by subtraction = 35 - 8 = 27 cents
    // If one incorrectly rounded exact contribution directly:
    // 27.15 rounds to 27 cents.
    //
    // Now let's test Q = 2 units:
    // exactTotalRoyalty = 34.65 * 2 = 69.3 -> rounds to 69 cents
    // exactTotalCost = 7.5 * 2 = 15.0 -> 15 cents
    // totalContribution by subtraction = 69 - 15 = 54 cents!
    const resultQ2 = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 2,
        listPriceMinor: 99,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '0.5',
      },
      customPerTotalPack,
    );

    expect(resultQ2.grossRoyalty.amountMinor).toBe(69);
    expect(resultQ2.applicableCost.amountMinor).toBe(15);
    expect(resultQ2.netContribution.amountMinor).toBe(54);
    expect(resultQ2.netContribution.amountMinor).toBe(
      resultQ2.grossRoyalty.amountMinor - resultQ2.applicableCost.amountMinor,
    );
  });

  it('demonstrates divergence between per_unit and per_total policies for identical fractional amounts', () => {
    // Ebook standard has rounding.point = 'per_unit', round_half_up
    // List price 99 ($0.99), tier 35%, 1 MB delivery (15 cents)
    // exactGrossRoyalty per unit = 99 * 0.35 = 34.65 cents
    //
    // Under per_unit:
    // 34.65 rounds per unit to 35 cents
    // Delivery cost = 15 cents
    // Unit contribution = 35 - 15 = 20 cents
    // For Q = 10 units:
    // Total royalty = 35 * 10 = 350 cents
    // Total cost = 15 * 10 = 150 cents
    // Total contribution = 350 - 150 = 200 cents
    const perUnitScenario = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 10,
        listPriceMinor: 99,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      },
      ebookPack,
    );
    expect(perUnitScenario.grossRoyalty.amountMinor).toBe(350);
    expect(perUnitScenario.netContribution.amountMinor).toBe(200);

    // Under per_total (with same round_half_up mode):
    const perTotalPack: CalcRulePack = {
      ...ebookPack,
      content: {
        ...ebookPack.content,
        rounding: { mode: 'round_half_up', point: 'per_total' },
      },
    };
    // exactTotalRoyalty = 34.65 * 10 = 346.5 cents -> rounds to 347 cents!
    // exactTotalCost = 15 * 10 = 150 cents -> 150 cents
    // Total contribution = 347 - 150 = 197 cents!
    const perTotalScenario = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 10,
        listPriceMinor: 99,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      },
      perTotalPack,
    );
    expect(perTotalScenario.grossRoyalty.amountMinor).toBe(347);
    expect(perTotalScenario.netContribution.amountMinor).toBe(197);

    // DIVERGENCE CONFIRMED:
    // per_unit yields $3.50 royalty, $2.00 contribution
    // per_total yields $3.47 royalty, $1.97 contribution
    // A 3-cent difference resulting purely from rounding boundary!
    expect(perUnitScenario.grossRoyalty.amountMinor).not.toBe(
      perTotalScenario.grossRoyalty.amountMinor,
    );
    expect(perUnitScenario.netContribution.amountMinor).not.toBe(
      perTotalScenario.netContribution.amountMinor,
    );
  });

  it('preserves negative net contribution without clamping or discarding negative signs', () => {
    // Paperback US v1 at minimum allowed list price $5.00 with 300 pages
    // Print cost: 100 + (300 - 24) * 2 = 652 cents
    // Royalty: 500 * 0.60 = 300 cents
    // Unit contribution: 300 - 652 = -352 cents (-$3.52)
    // Q = 250 units:
    // Total royalty = 300 * 250 = 75,000 cents ($750.00)
    // Total cost = 652 * 250 = 163,000 cents ($1630.00)
    // Total contribution = 75,000 - 163,000 = -88,000 cents (-$880.00)
    const negativeResult = calculateSingleScenario(
      {
        scenarioName: 'low',
        units: 250,
        listPriceMinor: 500,
        currency: 'USD',
        format: 'paperback',
        pages: 300,
      },
      paperbackV1Pack,
    );

    expect(negativeResult.netContribution.amountMinor).toBe(-88000);
    expect(negativeResult.netContribution.isNegative()).toBe(true);
    expect(negativeResult.exactTotalContribution.toDecimalString()).toBe('-88000');
  });

  it('aggregates correctly for Q = 1 unit under per_total without using null per-unit fields', () => {
    const singleUnitHardcover = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 1,
        listPriceMinor: 1999,
        currency: 'EUR',
        format: 'hardcover',
        pages: 100,
      },
      hardcoverPack,
    );

    // Royalty: 999.5 rounds under round_down to 999
    expect(singleUnitHardcover.grossRoyalty.amountMinor).toBe(999);
    // Cost: 675
    expect(singleUnitHardcover.applicableCost.amountMinor).toBe(675);
    // Contribution: 999 - 675 = 324
    expect(singleUnitHardcover.netContribution.amountMinor).toBe(324);
  });

  it('correctly aggregates across all four Rule Pack rounding modes under per_total with fractional amounts', () => {
    // List price 99 ($0.99), tier rate 35%, delivery fee 7.5 cents (0.5 MB * 15 cents/MB)
    // Q = 3 units:
    // exactTotalRoyalty = 99 * 0.35 * 3 = 103.95 cents
    // exactTotalCost = 7.5 * 3 = 22.5 cents (halfway between 22 and 23)
    const modes = ['round_half_up', 'round_half_even', 'round_down', 'round_up'] as const;
    const expected = {
      round_half_up: { royalty: 104, cost: 23, contribution: 81 },
      round_half_even: { royalty: 104, cost: 22, contribution: 82 },
      round_down: { royalty: 103, cost: 22, contribution: 81 },
      round_up: { royalty: 104, cost: 23, contribution: 81 },
    };

    for (const mode of modes) {
      const packWithMode: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          rounding: { mode, point: 'per_total' },
        },
      };

      const result = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: 3,
          listPriceMinor: 99,
          costVariancePercent: '0',
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '0.5',
        },
        packWithMode,
      );

      expect(result.grossRoyalty.amountMinor).toBe(expected[mode].royalty);
      expect(result.applicableCost.amountMinor).toBe(expected[mode].cost);
      expect(result.netContribution.amountMinor).toBe(expected[mode].contribution);
      expect(result.netContribution.amountMinor).toBe(
        result.grossRoyalty.amountMinor - result.applicableCost.amountMinor,
      );
    }
  });

  it('enforces ADR-005 contract for per_total: preserves unaggregated per-unit rational > MAX_SAFE_INTEGER and succeeds when aggregate cost is safe', () => {
    // Contract:
    // 1. Preserve exact adjusted per-unit cost.
    // 2. Multiply by quantity using Rational arithmetic.
    // 3. Round aggregate cost exactly once.
    // 4. Validate the resulting rounded aggregate Money amount against both safe-integer bounds.
    // 5. Raise CalcOverflowError only when the monetary result being materialized exceeds the supported range.

    // A: Zero units produces exact zero aggregate cost without overflow
    const zeroResult = calculateSingleScenario(
      {
        scenarioName: 'base',
        units: 0,
        listPriceMinor: 1500,
        costVariancePercent: '99999999999999999999',
        currency: 'EUR',
        format: 'hardcover',
        pages: 1000,
      },
      hardcoverPack,
    );

    expect(zeroResult.units).toBe(0);
    expect(zeroResult.applicableCost.amountMinor).toBe(0);
    expect(
      zeroResult.exactApplicableCostVaried.compare(Rational.from(Number.MAX_SAFE_INTEGER)),
    ).toBeGreaterThan(0);
    expect(zeroResult.exactTotalCost.isZero()).toBe(true);

    // B: When quantity > 0 causes materialized aggregate cost to exceed safe integer bounds, raises CalcOverflowError
    expect(() =>
      calculateSingleScenario(
        {
          scenarioName: 'base',
          units: 1,
          listPriceMinor: 1500,
          costVariancePercent: '99999999999999999999',
          currency: 'EUR',
          format: 'hardcover',
          pages: 1000,
        },
        hardcoverPack,
      ),
    ).toThrow(CalcOverflowError);
  });
});
