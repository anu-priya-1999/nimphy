import { UnsupportedCurrencyError } from '../errors/domain-error';

/**
 * Explicit set of supported ISO-4217 currency codes approved for the MVP.
 * Publishing marketplaces and PayPal integrations initially operate on these currencies.
 * ADR-005, doc 02 §A-2, doc 06 §4.
 */
export const SUPPORTED_CURRENCIES = Object.freeze([
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
] as const);

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export interface CurrencyMetadata {
  readonly code: CurrencyCode;
  readonly minorUnitExponent: number;
  readonly symbol: string;
  readonly name: string;
}

export const CURRENCY_METADATA: Readonly<Record<CurrencyCode, CurrencyMetadata>> = Object.freeze({
  USD: Object.freeze({
    code: 'USD',
    minorUnitExponent: 2,
    symbol: '$',
    name: 'US Dollar',
  }),
  EUR: Object.freeze({
    code: 'EUR',
    minorUnitExponent: 2,
    symbol: '€',
    name: 'Euro',
  }),
  GBP: Object.freeze({
    code: 'GBP',
    minorUnitExponent: 2,
    symbol: '£',
    name: 'British Pound',
  }),
  CAD: Object.freeze({
    code: 'CAD',
    minorUnitExponent: 2,
    symbol: 'CA$',
    name: 'Canadian Dollar',
  }),
  AUD: Object.freeze({
    code: 'AUD',
    minorUnitExponent: 2,
    symbol: 'A$',
    name: 'Australian Dollar',
  }),
  JPY: Object.freeze({
    code: 'JPY',
    minorUnitExponent: 0,
    symbol: '¥',
    name: 'Japanese Yen',
  }),
});

/**
 * Runtime type guard for supported currency codes.
 */
export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  if (typeof value !== 'string') return false;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Asserts that a value is a supported currency code, throwing UnsupportedCurrencyError otherwise.
 */
export function assertSupportedCurrency(value: unknown): asserts value is CurrencyCode {
  if (!isSupportedCurrency(value)) {
    throw new UnsupportedCurrencyError(String(value), SUPPORTED_CURRENCIES);
  }
}

/**
 * Parses and validates a currency code string.
 * Trims whitespace and normalizes to uppercase before checking.
 */
export function parseCurrencyCode(value: unknown): CurrencyCode {
  if (typeof value !== 'string') {
    throw new UnsupportedCurrencyError(String(value), SUPPORTED_CURRENCIES);
  }
  const normalized = value.trim().toUpperCase();
  if (!isSupportedCurrency(normalized)) {
    throw new UnsupportedCurrencyError(normalized, SUPPORTED_CURRENCIES);
  }
  return normalized;
}

/**
 * Returns metadata for a supported currency code.
 */
export function getCurrencyMetadata(currency: CurrencyCode): CurrencyMetadata {
  assertSupportedCurrency(currency);
  return CURRENCY_METADATA[currency];
}

/**
 * Returns the minor-unit exponent (e.g. 2 for USD, 0 for JPY) for a supported currency.
 */
export function getMinorUnitExponent(currency: CurrencyCode): number {
  return getCurrencyMetadata(currency).minorUnitExponent;
}
