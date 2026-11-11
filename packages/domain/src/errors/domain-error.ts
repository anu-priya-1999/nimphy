/**
 * Base and specialized domain error types for the Nimphy domain layer.
 * All domain errors inherit from DomainError and carry stable machine-readable codes.
 * Conforms to AGENTS.md §4 and doc 05 §M-01.
 */

export abstract class DomainError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details ? Object.freeze({ ...details }) : undefined;
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when constructing or operating on Money with invalid parameters
 * (e.g. non-finite values, fractional minor units, NaN, non-integers).
 */
export class InvalidMoneyError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INVALID_MONEY', details);
  }
}

/**
 * Thrown when an arithmetic or comparison operation is attempted across differing currencies.
 */
export class CurrencyMismatchError extends DomainError {
  constructor(expectedCurrency: string, actualCurrency: string, operation?: string) {
    super(
      `Currency mismatch${operation ? ` during ${operation}` : ''}: expected ${expectedCurrency}, got ${actualCurrency}`,
      'CURRENCY_MISMATCH',
      { expectedCurrency, actualCurrency, operation },
    );
  }
}

/**
 * Thrown when arithmetic exceeds safe integer bounds (Number.MAX_SAFE_INTEGER / MIN_SAFE_INTEGER).
 */
export class MoneyOverflowError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MONEY_OVERFLOW', details);
  }
}

/**
 * Thrown when an unsupported or malformed currency code is supplied.
 */
export class UnsupportedCurrencyError extends DomainError {
  constructor(currency: string, supportedCurrencies?: readonly string[]) {
    super(
      `Unsupported currency code: "${currency}". Allowed: [${supportedCurrencies ? supportedCurrencies.join(', ') : ''}]`,
      'UNSUPPORTED_CURRENCY',
      { currency, supportedCurrencies },
    );
  }
}

/**
 * Thrown when an invalid provenance classification is supplied.
 */
export class InvalidProvenanceError extends DomainError {
  constructor(provenance: unknown, allowedValues?: readonly string[]) {
    super(
      `Invalid provenance value: "${String(provenance)}". Allowed: [${allowedValues ? allowedValues.join(', ') : ''}]`,
      'INVALID_PROVENANCE',
      { provenance, allowedValues },
    );
  }
}

/**
 * Thrown when a branded domain identifier fails validation (e.g. empty, malformed, non-UUID).
 */
export class InvalidIdentifierError extends DomainError {
  constructor(brand: string, value: unknown, reason?: string) {
    super(
      `Invalid ${brand} identifier: "${String(value)}"${reason ? ` (${reason})` : ''}`,
      'INVALID_IDENTIFIER',
      { brand, value, reason },
    );
  }
}

/**
 * Thrown when canonical JSON serialization fails (e.g. circular reference, unsupported type).
 */
export class CanonicalSerializationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CANONICAL_SERIALIZATION_ERROR', details);
  }
}
