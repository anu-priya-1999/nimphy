import { describe, expect, it } from 'vitest';
import { DomainError } from '@nimphy/domain';
import {
  CalcCurrencyMismatchError,
  CalcEngineError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
} from './calc-error';

describe('Calculation Engine Error Hierarchy', () => {
  it('CalcEngineError inherits from DomainError', () => {
    class ConcreteCalcError extends CalcEngineError {
      constructor() {
        super('test message', 'TEST_CODE');
      }
    }
    const err = new ConcreteCalcError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('TEST_CODE');
  });

  it('CalcInputValidationError includes reason and stable code', () => {
    const err = new CalcInputValidationError('MISSING_REQUIRED_INPUT', 'Field missing', {
      field: 'listPriceMinor',
    });
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('CALC_INPUT_INVALID');
    expect(err.reason).toBe('MISSING_REQUIRED_INPUT');
    expect(err.details).toEqual({
      reason: 'MISSING_REQUIRED_INPUT',
      field: 'listPriceMinor',
    });
  });

  it('CalcCurrencyMismatchError captures expected and actual currencies', () => {
    const err = new CalcCurrencyMismatchError('EUR', 'USD');
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('CALC_CURRENCY_MISMATCH');
    expect(err.details).toEqual({
      inputCurrency: 'EUR',
      rulePackCurrency: 'USD',
    });
    expect(err.message).toContain('EUR');
    expect(err.message).toContain('USD');
  });

  it('CalcFormatMismatchError captures expected and actual formats', () => {
    const err = new CalcFormatMismatchError('paperback', 'ebook');
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('CALC_FORMAT_MISMATCH');
    expect(err.details).toEqual({
      inputFormat: 'paperback',
      rulePackFormat: 'ebook',
    });
  });

  it('NoMatchingRoyaltyTierError records list price and currency', () => {
    const err = new NoMatchingRoyaltyTierError(50, 'USD');
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('NO_MATCHING_ROYALTY_TIER');
    expect(err.details).toEqual({
      listPriceMinor: 50,
      currency: 'USD',
    });
  });

  it('RulePackIncompatibleError records reason and details', () => {
    const err = new RulePackIncompatibleError(
      'PRINT_COST_POLICY_MISSING',
      'Missing print cost policy',
    );
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('RULE_PACK_INCOMPATIBLE');
    expect(err.details).toEqual({
      reason: 'PRINT_COST_POLICY_MISSING',
    });
  });

  it('CalcOverflowError records safe integer overflow', () => {
    const err = new CalcOverflowError('Overflow in calculation', { value: '99999999999999999' });
    expect(err).toBeInstanceOf(CalcEngineError);
    expect(err.code).toBe('CALC_OVERFLOW');
    expect(err.details).toEqual({
      value: '99999999999999999',
    });
  });
});
