import { describe, expect, it } from 'vitest';
import { toCanonicalJson } from '@nimphy/domain';
import { calculatePerUnitEconomics } from './per-unit-calc';
import type { CalcRulePack, PerUnitCalcInput } from './types';

describe('Calculation Trace Completeness & Determinism', () => {
  const sampleEbookPack: CalcRulePack = Object.freeze({
    id: '550e8400-e29b-41d4-a716-446655440001',
    packKey: 'TEST_EBOOK_STANDARD',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'ebook',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    content: Object.freeze({
      rounding: Object.freeze({
        mode: 'round_half_up',
        point: 'per_unit',
      }),
      royalty: Object.freeze({
        tiers: Object.freeze([
          Object.freeze({
            name: 'standard_mid',
            minPriceMinor: 299,
            maxPriceMinor: 999,
            royaltyRateDecimal: '0.70',
          }),
        ]),
      }),
      printCost: null,
      deliveryCost: Object.freeze({
        costPerMbMinor: 15,
      }),
      limits: Object.freeze({
        minListPriceMinor: 99,
        maxListPriceMinor: 20000,
        minPages: null,
        maxPages: null,
      }),
    }),
    contentHash: 'sha256:bd44021f5ba36887d329b32f56455855ed1152b9a951e64e1f04dea4eaeeb627',
  });

  const input: PerUnitCalcInput = {
    listPriceMinor: 499,
    currency: 'USD',
    format: 'ebook',
    fileSizeMb: '2',
  };

  it('produces byte-for-byte identical canonical JSON traces across repeated runs', () => {
    const run1 = calculatePerUnitEconomics(input, sampleEbookPack);
    const run2 = calculatePerUnitEconomics(input, sampleEbookPack);

    const canonical1 = toCanonicalJson(run1.trace);
    const canonical2 = toCanonicalJson(run2.trace);

    expect(canonical1).toBe(canonical2);
    expect(typeof canonical1).toBe('string');
  });

  it('contains complete structured information required for independent verification', () => {
    const result = calculatePerUnitEconomics(input, sampleEbookPack);
    const trace = result.trace;

    // Engine version
    expect(trace.engineVersion).toBe('0.1.0');

    // Rule Pack references
    expect(trace.rulePackRef).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440001',
      packKey: 'TEST_EBOOK_STANDARD',
      version: '1.0.0',
      contentHash: 'sha256:bd44021f5ba36887d329b32f56455855ed1152b9a951e64e1f04dea4eaeeb627',
    });

    // Input parameters
    expect(trace.input).toEqual({
      listPriceMinor: 499,
      currency: 'USD',
      format: 'ebook',
      fileSizeMb: '2',
    });

    // Selected tier details
    expect(trace.selectedTier).toEqual({
      name: 'standard_mid',
      minPriceMinor: 299,
      maxPriceMinor: 999,
      royaltyRateDecimal: '0.70',
      rateNumerator: '7',
      rateDenominator: '10',
    });

    // Cost breakdown
    expect(trace.costBreakdown).toEqual({
      kind: 'delivery',
      fileSizeMb: '2',
      costPerMbMinor: 15,
      exactCostNumerator: '30',
      exactCostDenominator: '1',
      exactCostDecimalString: '30',
      totalCostMinor: 30,
      roundedCostMinor: 30,
    });

    // Exact rational intermediate calculations
    expect(trace.exactCalculations.grossRoyalty).toEqual({
      numerator: '3493',
      denominator: '10',
      decimalString: '349.3',
    });
    expect(trace.exactCalculations.applicableCost).toEqual({
      numerator: '30',
      denominator: '1',
      decimalString: '30',
    });
    expect(trace.exactCalculations.netContribution).toEqual({
      numerator: '3193',
      denominator: '10',
      decimalString: '319.3',
    });

    // Rounding policy and audited operations
    expect(trace.rounding.mode).toBe('round_half_up');
    expect(trace.rounding.point).toBe('per_unit');
    expect(trace.rounding.operations).toHaveLength(1);
    expect(trace.rounding.operations[0]).toEqual({
      target: 'gross_royalty',
      mode: 'round_half_up',
      point: 'per_unit',
      unroundedNumerator: '3493',
      unroundedDenominator: '10',
      unroundedDecimal: '349.3',
      roundedMinor: 349,
    });

    // Final summary
    expect(trace.finalSummary).toEqual({
      grossRoyaltyMinor: 349,
      applicableCostMinor: 30,
      netContributionMinor: 319,
      currency: 'USD',
    });

    // Ordered trace steps
    expect(trace.steps.length).toBeGreaterThanOrEqual(5);
    expect(trace.steps.map((s) => s.step)).toEqual([
      'input_validated',
      'tier_selected',
      'gross_royalty_calculated',
      'cost_calculated',
      'rounding_applied',
      'contribution_calculated',
    ]);
  });

  it('records separate rounding operations for fractional delivery cost and fractional royalty', () => {
    const fractionalInput: PerUnitCalcInput = {
      listPriceMinor: 499,
      currency: 'USD',
      format: 'ebook',
      fileSizeMb: '0.5',
    };

    const result = calculatePerUnitEconomics(fractionalInput, sampleEbookPack);
    const trace = result.trace;

    expect(trace.costBreakdown).toEqual({
      kind: 'delivery',
      fileSizeMb: '0.5',
      costPerMbMinor: 15,
      exactCostNumerator: '15',
      exactCostDenominator: '2',
      exactCostDecimalString: '7.5',
      totalCostMinor: 8,
      roundedCostMinor: 8,
    });

    expect(trace.rounding.operations).toHaveLength(2);
    expect(trace.rounding.operations[0]).toEqual({
      target: 'gross_royalty',
      mode: 'round_half_up',
      point: 'per_unit',
      unroundedNumerator: '3493',
      unroundedDenominator: '10',
      unroundedDecimal: '349.3',
      roundedMinor: 349,
    });
    expect(trace.rounding.operations[1]).toEqual({
      target: 'production_cost',
      mode: 'round_half_up',
      point: 'per_unit',
      unroundedNumerator: '15',
      unroundedDenominator: '2',
      unroundedDecimal: '7.5',
      roundedMinor: 8,
    });

    expect(trace.finalSummary).toEqual({
      grossRoyaltyMinor: 349,
      applicableCostMinor: 8,
      netContributionMinor: 341,
      currency: 'USD',
    });
  });

  it('contains zero timestamps, random IDs, or filesystem metadata', () => {
    const result = calculatePerUnitEconomics(input, sampleEbookPack);
    const traceJson = JSON.stringify(result.trace);

    // Assert absence of nondeterministic keys
    expect(traceJson).not.toContain('timestamp');
    expect(traceJson).not.toContain('created_at');
    expect(traceJson).not.toContain('random');
    expect(traceJson).not.toContain('path');
    expect(traceJson).not.toContain('file:///');
  });
});
