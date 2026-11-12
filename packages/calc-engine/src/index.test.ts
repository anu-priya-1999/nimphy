import { describe, expect, it } from 'vitest';
import * as CalcEngine from './index';

describe('@nimphy/calc-engine Barrel Export & Public API', () => {
  it('exports module identity constants', () => {
    expect(CalcEngine.CALC_ENGINE_MODULE_NAME).toBe('calc-engine');
    expect(CalcEngine.CALC_ENGINE_MODULE_VERSION).toBe('0.1.0');
  });

  it('exports calculation functions and math classes', () => {
    expect(typeof CalcEngine.calculatePerUnitEconomics).toBe('function');
    expect(typeof CalcEngine.Rational).toBe('function');
  });

  it('exports all typed calculation engine error classes', () => {
    expect(typeof CalcEngine.CalcEngineError).toBe('function');
    expect(typeof CalcEngine.CalcInputValidationError).toBe('function');
    expect(typeof CalcEngine.CalcCurrencyMismatchError).toBe('function');
    expect(typeof CalcEngine.CalcFormatMismatchError).toBe('function');
    expect(typeof CalcEngine.NoMatchingRoyaltyTierError).toBe('function');
    expect(typeof CalcEngine.RulePackIncompatibleError).toBe('function');
    expect(typeof CalcEngine.CalcOverflowError).toBe('function');
  });
});
