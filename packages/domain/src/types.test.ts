import { describe, expect, it } from 'vitest';
import { Money } from './money/money';
import {
  BOOK_FORMATS,
  SCENARIO_DISCLAIMER_TEXT,
  SCENARIO_NAMES,
  isBookFormat,
  isScenarioName,
  isScenarioParameters,
  isScenarioTotals,
} from './types';

describe('Shared Domain Types and Guards', () => {
  it('defines canonical scenario names: low, base, high and enforces runtime immutability', () => {
    expect(SCENARIO_NAMES).toEqual(['low', 'base', 'high']);
    expect(Object.isFrozen(SCENARIO_NAMES)).toBe(true);

    expect(() => {
      (SCENARIO_NAMES as unknown as string[]).push('medium');
    }).toThrow();
  });

  it('validates scenario names via isScenarioName', () => {
    expect(isScenarioName('low')).toBe(true);
    expect(isScenarioName('base')).toBe(true);
    expect(isScenarioName('high')).toBe(true);
    expect(isScenarioName('medium')).toBe(false);
    expect(isScenarioName('')).toBe(false);
    expect(isScenarioName(null)).toBe(false);
    expect(isScenarioName(123)).toBe(false);
  });

  it('defines canonical disclaimer text for illustrative scenarios', () => {
    expect(SCENARIO_DISCLAIMER_TEXT).toBe(
      'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
    );
  });

  it('validates scenario parameters via isScenarioParameters guard', () => {
    const validBase = {
      scenarioName: 'base',
      units: 500,
      listPriceMinor: 999,
    };
    expect(isScenarioParameters(validBase)).toBe(true);

    const validWithStringVariance = {
      scenarioName: 'high',
      units: 2000,
      listPriceMinor: 1499,
      costVariancePercent: '-15.5',
    };
    expect(isScenarioParameters(validWithStringVariance)).toBe(true);

    // Boundary value -100% accepted
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '-100' })).toBe(true);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '-100.00' })).toBe(true);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '0' })).toBe(true);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '10' })).toBe(true);

    // JSON numeric values rejected
    expect(isScenarioParameters({ ...validBase, costVariancePercent: 10 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: 0 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: -10 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: -100 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: -150 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: NaN })).toBe(false);

    // Explicit null rejected
    expect(isScenarioParameters({ ...validBase, costVariancePercent: null })).toBe(false);

    // Invalid string formats rejected
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '-100.0001' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '-150' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '-100.1' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: 'not-a-number' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '1e5' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '1E-2' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '   ' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: ' 10 ' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '10 ' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: ' 10' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '\t10' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '\n10' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: '1'.repeat(55) })).toBe(false);

    // Invalid non-string types rejected
    expect(isScenarioParameters({ ...validBase, costVariancePercent: true })).toBe(false);
    expect(isScenarioParameters({ ...validBase, costVariancePercent: {} })).toBe(false);

    // Invalid base fields
    expect(isScenarioParameters(null)).toBe(false);
    expect(isScenarioParameters('not an object')).toBe(false);
    expect(isScenarioParameters({ ...validBase, scenarioName: 'invalid' })).toBe(false);
    expect(isScenarioParameters({ ...validBase, units: -1 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, units: 1.5 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, units: NaN })).toBe(false);
    expect(isScenarioParameters({ ...validBase, listPriceMinor: -100 })).toBe(false);
    expect(isScenarioParameters({ ...validBase, listPriceMinor: 1.5 })).toBe(false);
  });

  it('validates scenario totals via isScenarioTotals guard', () => {
    const validTotals = {
      scenarioName: 'base',
      units: 500,
      listPrice: Money.of(999, 'USD'),
      revenue: Money.of(499500, 'USD'),
      grossRoyalty: Money.of(349650, 'USD'),
      applicableCost: Money.of(7500, 'USD'),
      netContribution: Money.of(342150, 'USD'),
      isIllustrative: true as const,
    };
    expect(isScenarioTotals(validTotals)).toBe(true);

    // Invalid cases
    expect(isScenarioTotals(null)).toBe(false);
    expect(isScenarioTotals({})).toBe(false);
    expect(isScenarioTotals({ ...validTotals, scenarioName: 'unknown' })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, units: -1 })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, units: '500' })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, isIllustrative: false })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, listPrice: null })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, revenue: { amountMinor: 100 } })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, grossRoyalty: 100 })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, applicableCost: undefined })).toBe(false);
    expect(isScenarioTotals({ ...validTotals, netContribution: '100' })).toBe(false);
  });

  it('defines canonical book formats: ebook, paperback, hardcover and enforces runtime immutability', () => {
    expect(BOOK_FORMATS).toEqual(['ebook', 'paperback', 'hardcover']);
    expect(Object.isFrozen(BOOK_FORMATS)).toBe(true);

    expect(() => {
      (BOOK_FORMATS as unknown as string[]).push('audiobook');
    }).toThrow();
  });

  it('validates book formats via isBookFormat', () => {
    expect(isBookFormat('ebook')).toBe(true);
    expect(isBookFormat('paperback')).toBe(true);
    expect(isBookFormat('hardcover')).toBe(true);
    expect(isBookFormat('audiobook')).toBe(false);
    expect(isBookFormat('')).toBe(false);
    expect(isBookFormat(null)).toBe(false);
  });
});
