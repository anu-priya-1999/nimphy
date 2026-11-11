import { describe, expect, it } from 'vitest';
import {
  CanonicalSerializationError,
  CurrencyMismatchError,
  DomainError,
  InvalidIdentifierError,
  InvalidMoneyError,
  InvalidProvenanceError,
  MoneyOverflowError,
  UnsupportedCurrencyError,
} from './domain-error';

describe('Domain Errors Hierarchy', () => {
  it('verifies that DomainError inherits from Error and preserves properties', () => {
    class TestDomainError extends DomainError {
      constructor(msg: string) {
        super(msg, 'TEST_CODE', { foo: 'bar' });
      }
    }

    const err = new TestDomainError('Test failure');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe('TestDomainError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Test failure');
    expect(err.details).toEqual({ foo: 'bar' });
    expect(Object.isFrozen(err.details)).toBe(true);
  });

  it('handles DomainError without details', () => {
    class SimpleDomainError extends DomainError {
      constructor() {
        super('Simple', 'SIMPLE_CODE');
      }
    }
    const err = new SimpleDomainError();
    expect(err.details).toBeUndefined();
  });

  it('creates InvalidMoneyError with stable error code', () => {
    const err = new InvalidMoneyError('Invalid amount', { amount: NaN });
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_MONEY');
    expect(err.message).toBe('Invalid amount');
    expect(err.details).toEqual({ amount: NaN });
  });

  it('creates CurrencyMismatchError with structured details', () => {
    const err = new CurrencyMismatchError('USD', 'EUR', 'addition');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('CURRENCY_MISMATCH');
    expect(err.message).toContain('Currency mismatch during addition: expected USD, got EUR');
    expect(err.details).toEqual({
      expectedCurrency: 'USD',
      actualCurrency: 'EUR',
      operation: 'addition',
    });
  });

  it('creates CurrencyMismatchError without operation parameter', () => {
    const err = new CurrencyMismatchError('USD', 'GBP');
    expect(err.message).toBe('Currency mismatch: expected USD, got GBP');
  });

  it('creates MoneyOverflowError with stable error code', () => {
    const err = new MoneyOverflowError('Integer overflow in addition', { a: 1, b: 2 });
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('MONEY_OVERFLOW');
    expect(err.message).toBe('Integer overflow in addition');
  });

  it('creates UnsupportedCurrencyError with allowed list', () => {
    const err = new UnsupportedCurrencyError('XYZ', ['USD', 'EUR']);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('UNSUPPORTED_CURRENCY');
    expect(err.message).toContain('Unsupported currency code: "XYZ"');
    expect(err.message).toContain('Allowed: [USD, EUR]');
  });

  it('creates UnsupportedCurrencyError without allowed list', () => {
    const err = new UnsupportedCurrencyError('XYZ');
    expect(err.message).toBe('Unsupported currency code: "XYZ". Allowed: []');
  });

  it('creates InvalidProvenanceError with allowed values', () => {
    const err = new InvalidProvenanceError('random_guess', ['user_input', 'official_fact']);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_PROVENANCE');
    expect(err.message).toContain('Invalid provenance value: "random_guess"');
  });

  it('creates InvalidProvenanceError without allowed values', () => {
    const err = new InvalidProvenanceError('random_guess');
    expect(err.message).toBe('Invalid provenance value: "random_guess". Allowed: []');
  });

  it('creates InvalidIdentifierError with brand name and reason', () => {
    const err = new InvalidIdentifierError('UserId', 'not-a-uuid', 'Must be a valid UUID');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_IDENTIFIER');
    expect(err.message).toBe('Invalid UserId identifier: "not-a-uuid" (Must be a valid UUID)');
  });

  it('creates InvalidIdentifierError without reason', () => {
    const err = new InvalidIdentifierError('CaseId', '');
    expect(err.message).toBe('Invalid CaseId identifier: ""');
  });

  it('creates CanonicalSerializationError with stable code', () => {
    const err = new CanonicalSerializationError('Circular reference detected');
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('CANONICAL_SERIALIZATION_ERROR');
    expect(err.message).toBe('Circular reference detected');
  });
});
