import { describe, expect, it } from 'vitest';
import { UnsupportedCurrencyError } from '../errors/domain-error';
import {
  CURRENCY_METADATA,
  SUPPORTED_CURRENCIES,
  assertSupportedCurrency,
  getCurrencyMetadata,
  getMinorUnitExponent,
  isSupportedCurrency,
  parseCurrencyCode,
} from './currency';

describe('Currency Primitives and Metadata', () => {
  it('defines the approved list of supported currencies and enforces runtime immutability', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']);
    expect(Object.isFrozen(SUPPORTED_CURRENCIES)).toBe(true);

    expect(() => {
      (SUPPORTED_CURRENCIES as unknown as string[]).push('XYZ');
    }).toThrow();

    expect(() => {
      (SUPPORTED_CURRENCIES as unknown as string[])[0] = 'HACK';
    }).toThrow();
  });

  it('provides correct metadata for all supported currencies with verified Unicode symbols', () => {
    expect(getCurrencyMetadata('USD')).toEqual({
      code: 'USD',
      minorUnitExponent: 2,
      symbol: '$',
      name: 'US Dollar',
    });
    expect(getCurrencyMetadata('USD').symbol.codePointAt(0)).toBe(0x24);

    expect(getCurrencyMetadata('EUR')).toEqual({
      code: 'EUR',
      minorUnitExponent: 2,
      symbol: '€',
      name: 'Euro',
    });
    expect(getCurrencyMetadata('EUR').symbol.codePointAt(0)).toBe(0x20ac); // Euro sign €

    expect(getCurrencyMetadata('GBP')).toEqual({
      code: 'GBP',
      minorUnitExponent: 2,
      symbol: '£',
      name: 'British Pound',
    });
    expect(getCurrencyMetadata('GBP').symbol.codePointAt(0)).toBe(0xa3); // Pound sign £

    expect(getCurrencyMetadata('CAD')).toEqual({
      code: 'CAD',
      minorUnitExponent: 2,
      symbol: 'CA$',
      name: 'Canadian Dollar',
    });

    expect(getCurrencyMetadata('AUD')).toEqual({
      code: 'AUD',
      minorUnitExponent: 2,
      symbol: 'A$',
      name: 'Australian Dollar',
    });

    expect(getCurrencyMetadata('JPY')).toEqual({
      code: 'JPY',
      minorUnitExponent: 0,
      symbol: '¥',
      name: 'Japanese Yen',
    });
    expect(getCurrencyMetadata('JPY').symbol.codePointAt(0)).toBe(0xa5); // Yen sign ¥
  });

  it('guarantees CURRENCY_METADATA is deeply frozen', () => {
    expect(Object.isFrozen(CURRENCY_METADATA)).toBe(true);
    for (const code of SUPPORTED_CURRENCIES) {
      expect(Object.isFrozen(CURRENCY_METADATA[code])).toBe(true);
    }
  });

  describe('isSupportedCurrency', () => {
    it('returns true for supported currencies', () => {
      for (const code of SUPPORTED_CURRENCIES) {
        expect(isSupportedCurrency(code)).toBe(true);
      }
    });

    it('returns false for unsupported strings or arbitrary types', () => {
      expect(isSupportedCurrency('CHF')).toBe(false);
      expect(isSupportedCurrency('INR')).toBe(false);
      expect(isSupportedCurrency('usd')).toBe(false); // requires uppercase
      expect(isSupportedCurrency('')).toBe(false);
      expect(isSupportedCurrency(null)).toBe(false);
      expect(isSupportedCurrency(undefined)).toBe(false);
      expect(isSupportedCurrency(123)).toBe(false);
      expect(isSupportedCurrency({})).toBe(false);
    });
  });

  describe('assertSupportedCurrency', () => {
    it('passes without error for valid currencies', () => {
      expect(() => assertSupportedCurrency('USD')).not.toThrow();
      expect(() => assertSupportedCurrency('JPY')).not.toThrow();
    });

    it('throws UnsupportedCurrencyError for invalid currencies', () => {
      expect(() => assertSupportedCurrency('XYZ')).toThrow(UnsupportedCurrencyError);
      expect(() => assertSupportedCurrency('btc')).toThrow(UnsupportedCurrencyError);
    });
  });

  describe('parseCurrencyCode', () => {
    it('parses valid currency code strings and handles case and whitespace trimming', () => {
      expect(parseCurrencyCode('USD')).toBe('USD');
      expect(parseCurrencyCode(' usd ')).toBe('USD');
      expect(parseCurrencyCode('jpy')).toBe('JPY');
      expect(parseCurrencyCode('  Eur ')).toBe('EUR');
    });

    it('throws UnsupportedCurrencyError for non-strings or unsupported codes', () => {
      expect(() => parseCurrencyCode(null)).toThrow(UnsupportedCurrencyError);
      expect(() => parseCurrencyCode(undefined)).toThrow(UnsupportedCurrencyError);
      expect(() => parseCurrencyCode(42)).toThrow(UnsupportedCurrencyError);
      expect(() => parseCurrencyCode('INVALID')).toThrow(UnsupportedCurrencyError);
      expect(() => parseCurrencyCode('')).toThrow(UnsupportedCurrencyError);
    });
  });

  describe('getMinorUnitExponent', () => {
    it('returns 2 for standard fiat currencies', () => {
      expect(getMinorUnitExponent('USD')).toBe(2);
      expect(getMinorUnitExponent('EUR')).toBe(2);
      expect(getMinorUnitExponent('GBP')).toBe(2);
      expect(getMinorUnitExponent('CAD')).toBe(2);
      expect(getMinorUnitExponent('AUD')).toBe(2);
    });

    it('returns 0 for zero-decimal currencies like JPY', () => {
      expect(getMinorUnitExponent('JPY')).toBe(0);
    });
  });
});
