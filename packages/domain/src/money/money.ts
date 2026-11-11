import {
  CurrencyMismatchError,
  InvalidMoneyError,
  MoneyOverflowError,
} from '../errors/domain-error';
import {
  CurrencyCode,
  getCurrencyMetadata,
  getMinorUnitExponent,
  parseCurrencyCode,
} from './currency';

declare const MoneyBrand: unique symbol;

/**
 * Immutable Money Value Object representing an exact financial amount in minor units
 * (e.g., cents, pence, yen) paired with an ISO-4217 currency code.
 *
 * Adheres strictly to Principle P-01 (deterministic core, no floats in money storage/calc),
 * ADR-005 (integer minor units, explicit currency, no silent rounding), and AGENTS.md §4.
 */
export class Money {
  declare readonly [MoneyBrand]: true;

  readonly amountMinor: number;
  readonly currency: CurrencyCode;

  /**
   * Private constructor to enforce boundary validation through factory methods.
   */
  private constructor(amountMinor: number, currency: CurrencyCode) {
    this.amountMinor = Object.is(amountMinor, -0) ? 0 : amountMinor;
    this.currency = currency;
    Object.freeze(this);
  }

  /**
   * Safe factory creating an immutable Money value object from integer minor units.
   * Rejects non-finite values, fractional minor units, unsafe integers, and unsupported currencies.
   */
  static of(amountMinor: number, currency: CurrencyCode | string): Money {
    if (typeof amountMinor !== 'number') {
      throw new InvalidMoneyError(
        `Amount must be a number, received: ${typeof amountMinor} (${String(amountMinor)})`,
      );
    }

    if (!Number.isFinite(amountMinor)) {
      throw new InvalidMoneyError(`Amount must be a finite number, received: ${amountMinor}`);
    }

    if (!Number.isInteger(amountMinor)) {
      throw new InvalidMoneyError(
        `Minor unit amount must be an integer, received fractional value: ${amountMinor}`,
      );
    }

    if (amountMinor > Number.MAX_SAFE_INTEGER || amountMinor < Number.MIN_SAFE_INTEGER) {
      throw new MoneyOverflowError(
        `Minor unit amount ${amountMinor} exceeds JavaScript safe integer range [${Number.MIN_SAFE_INTEGER}, ${Number.MAX_SAFE_INTEGER}]`,
        { amountMinor },
      );
    }

    const validatedCurrency = parseCurrencyCode(currency);
    return new Money(amountMinor, validatedCurrency);
  }

  /**
   * Creates a Money instance representing zero for the given currency.
   */
  static zero(currency: CurrencyCode | string): Money {
    return Money.of(0, currency);
  }

  /**
   * Safe decimal string parser that converts human-readable decimal strings
   * (e.g. "19.99" for USD, "2500" for JPY) into minor units WITHOUT floating-point arithmetic.
   *
   * Rejects strings with more fractional digits than the currency permits, preventing silent rounding.
   */
  static fromDecimal(decimalString: string, currency: CurrencyCode | string): Money {
    if (typeof decimalString !== 'string') {
      throw new InvalidMoneyError(
        `Decimal representation must be a string, received: ${typeof decimalString}`,
      );
    }

    const trimmed = decimalString.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new InvalidMoneyError(
        `Invalid decimal monetary format: "${decimalString}". Expected numeric string like "19.99" or "-5.00".`,
      );
    }

    const validatedCurrency = parseCurrencyCode(currency);
    const exponent = getMinorUnitExponent(validatedCurrency);

    const isNegative = trimmed.startsWith('-');
    const unsignedStr = isNegative ? trimmed.slice(1) : trimmed;
    const parts = unsignedStr.split('.');
    const wholeStr = parts[0]!;
    const fracStr = parts[1] ?? '';

    if (exponent === 0) {
      if (fracStr.length > 0 && !/^0+$/.test(fracStr)) {
        throw new InvalidMoneyError(
          `Currency ${validatedCurrency} does not support fractional units, received: "${decimalString}"`,
        );
      }

      const wholeNum = Number(wholeStr);
      if (!Number.isSafeInteger(wholeNum)) {
        throw new MoneyOverflowError(
          `Decimal amount exceeds safe integer range: "${decimalString}"`,
        );
      }

      const amountMinor = isNegative ? -wholeNum : wholeNum;
      return Money.of(amountMinor, validatedCurrency);
    }

    // Currencies with positive exponents (e.g. 2 for USD, EUR, GBP, CAD, AUD)
    if (fracStr.length > exponent) {
      throw new InvalidMoneyError(
        `Currency ${validatedCurrency} supports at most ${exponent} decimal places without rounding; received "${decimalString}" with ${fracStr.length} decimal places.`,
      );
    }

    const paddedFrac = fracStr.padEnd(exponent, '0');
    const combinedStr = `${wholeStr}${paddedFrac}`;
    const combinedNum = Number(combinedStr);

    if (!Number.isSafeInteger(combinedNum)) {
      throw new MoneyOverflowError(
        `Parsed minor units exceed safe integer range: "${decimalString}"`,
      );
    }

    const amountMinor = isNegative ? -combinedNum : combinedNum;
    return Money.of(amountMinor, validatedCurrency);
  }

  /**
   * Validates and reconstructs a Money instance from an untrusted JSON/DTO object.
   */
  static fromJSON(dto: unknown): Money {
    if (!dto || typeof dto !== 'object') {
      throw new InvalidMoneyError('Invalid Money DTO: expected object');
    }

    const candidate = dto as Record<string, unknown>;
    if (typeof candidate.amountMinor !== 'number') {
      throw new InvalidMoneyError('Invalid Money DTO: amountMinor must be a number');
    }
    if (typeof candidate.currency !== 'string') {
      throw new InvalidMoneyError('Invalid Money DTO: currency must be a string');
    }

    return Money.of(candidate.amountMinor, candidate.currency);
  }

  /**
   * Returns a copy of the other Money or throws if currency mismatch.
   */
  private assertSameCurrency(other: Money, operation: string): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency, operation);
    }
  }

  /**
   * Adds another Money amount. Currencies must match strictly.
   */
  add(other: Money): Money {
    this.assertSameCurrency(other, 'addition');
    const sum = this.amountMinor + other.amountMinor;
    if (!Number.isSafeInteger(sum)) {
      throw new MoneyOverflowError(
        `Addition of ${this.amountMinor} and ${other.amountMinor} resulted in overflow beyond safe integer range`,
        { a: this.amountMinor, b: other.amountMinor, operation: 'add' },
      );
    }
    return new Money(sum, this.currency);
  }

  /**
   * Subtracts another Money amount. Currencies must match strictly.
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other, 'subtraction');
    const difference = this.amountMinor - other.amountMinor;
    if (!Number.isSafeInteger(difference)) {
      throw new MoneyOverflowError(
        `Subtraction of ${other.amountMinor} from ${this.amountMinor} resulted in overflow beyond safe integer range`,
        { a: this.amountMinor, b: other.amountMinor, operation: 'subtract' },
      );
    }
    return new Money(difference, this.currency);
  }

  /**
   * Multiplies Money by an exact integer factor.
   * Floating-point numbers are rejected to prevent IEEE-754 precision inaccuracies (P-01, ADR-005).
   * For decimal factors (e.g. "0.29"), use `multiplyDecimal()`.
   * For rational fractions (e.g. 29/100 or 3/2), use `multiplyRatio()`.
   */
  multiply(factor: number): Money {
    if (typeof factor !== 'number' || !Number.isFinite(factor)) {
      throw new InvalidMoneyError(
        `Multiplication factor must be a finite number, received: ${String(factor)}`,
      );
    }

    if (!Number.isInteger(factor)) {
      throw new InvalidMoneyError(
        `Multiplication factor must be an integer to prevent IEEE-754 floating-point inaccuracies, received: ${factor}. For decimal multipliers use multiplyDecimal(string), or for fractional ratios use multiplyRatio(numerator, denominator).`,
        { amountMinor: this.amountMinor, factor },
      );
    }

    return this.multiplyRatio(BigInt(factor), 1n);
  }

  /**
   * Exact multiplication by a decimal string factor (e.g. "0.29", "1.5", "-0.05", "2").
   * Parses the decimal string into an exact rational fraction without IEEE-754 floating-point math.
   * If the result produces a fractional minor unit, throws InvalidMoneyError (no silent rounding).
   * If the result exceeds safe integer range, throws MoneyOverflowError.
   */
  multiplyDecimal(decimalString: string): Money {
    if (typeof decimalString !== 'string') {
      throw new InvalidMoneyError(
        `Decimal multiplier must be a string, received: ${typeof decimalString}`,
      );
    }

    const trimmed = decimalString.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new InvalidMoneyError(
        `Invalid decimal multiplier format: "${decimalString}". Expected numeric string like "0.29" or "-1.5".`,
      );
    }

    const isNegative = trimmed.startsWith('-');
    const unsignedStr = isNegative ? trimmed.slice(1) : trimmed;
    const parts = unsignedStr.split('.');
    const wholeStr = parts[0]!;
    const fracStr = parts[1] ?? '';

    const exponent = fracStr.length;
    const combinedStr = `${wholeStr}${fracStr}`;
    const numerator = isNegative ? -BigInt(combinedStr) : BigInt(combinedStr);
    const denominator = 10n ** BigInt(exponent);

    return this.multiplyRatio(numerator, denominator);
  }

  /**
   * Exact rational multiplication by a rational fraction (numerator / denominator).
   * Supports both BigInt and safe integer numbers.
   * Throws InvalidMoneyError if denominator is zero or if the product produces a fractional minor unit.
   * Throws MoneyOverflowError if the integer result exceeds safe integer range [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER].
   */
  multiplyRatio(numerator: bigint | number, denominator: bigint | number): Money {
    let numBig: bigint;
    if (typeof numerator === 'bigint') {
      numBig = numerator;
    } else if (typeof numerator === 'number' && Number.isSafeInteger(numerator)) {
      numBig = BigInt(numerator);
    } else {
      throw new InvalidMoneyError(
        `Numerator must be a safe integer or bigint, received: ${String(numerator)}`,
      );
    }

    let denBig: bigint;
    if (typeof denominator === 'bigint') {
      denBig = denominator;
    } else if (typeof denominator === 'number' && Number.isSafeInteger(denominator)) {
      denBig = BigInt(denominator);
    } else {
      throw new InvalidMoneyError(
        `Denominator must be a safe integer or bigint, received: ${String(denominator)}`,
      );
    }

    if (denBig === 0n) {
      throw new InvalidMoneyError('Denominator cannot be zero in rational multiplication');
    }

    // Normalize denominator to positive
    if (denBig < 0n) {
      numBig = -numBig;
      denBig = -denBig;
    }

    const amountBig = BigInt(this.amountMinor);
    const product = amountBig * numBig;
    const remainder = product % denBig;

    if (remainder !== 0n) {
      throw new InvalidMoneyError(
        `Multiplication of ${this.toString()} by ratio ${numBig}/${denBig} produced a fractional minor unit (remainder: ${remainder}). Rounding must be handled explicitly by calculation policy.`,
        { amountMinor: this.amountMinor, numerator: String(numBig), denominator: String(denBig) },
      );
    }

    const resultBig = product / denBig;
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);

    if (resultBig < minSafe || resultBig > maxSafe) {
      throw new MoneyOverflowError(
        `Multiplication resulted in overflow beyond safe integer range: ${resultBig}`,
        { amountMinor: this.amountMinor, result: String(resultBig) },
      );
    }

    const minorNum = Number(resultBig);
    return new Money(minorNum, this.currency);
  }

  /**
   * Returns a negated Money instance (e.g. 500 -> -500, -500 -> 500, 0 -> 0).
   */
  negate(): Money {
    const negated = this.amountMinor === 0 ? 0 : -this.amountMinor;
    return new Money(negated, this.currency);
  }

  /**
   * Returns the absolute value of this Money instance.
   */
  abs(): Money {
    return new Money(Math.abs(this.amountMinor), this.currency);
  }

  /**
   * Value-equality comparison. Returns true if and only if both instances share
   * the same currency and identical minor-unit integer amounts.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Money)) {
      return false;
    }
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  /**
   * Compares two Money instances of the same currency.
   * Returns -1 if this < other, 1 if this > other, and 0 if equal.
   * Throws CurrencyMismatchError if currencies differ.
   */
  compare(other: Money): number {
    this.assertSameCurrency(other, 'comparison');
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  isPositive(): boolean {
    return this.amountMinor > 0;
  }

  isNegative(): boolean {
    return this.amountMinor < 0;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  /**
   * Serializes to pure JSON object matching API and DB schemas: { amountMinor: number, currency: CurrencyCode }.
   */
  toJSON(): { amountMinor: number; currency: CurrencyCode } {
    return {
      amountMinor: this.amountMinor,
      currency: this.currency,
    };
  }

  /**
   * Converts the amount to a deterministic decimal string without floating-point math.
   * E.g. USD 1999 -> "19.99", USD -450 -> "-4.50", USD 5 -> "0.05", JPY 2500 -> "2500".
   */
  toDecimalString(): string {
    const exponent = getMinorUnitExponent(this.currency);
    if (exponent === 0) {
      return String(this.amountMinor);
    }

    const isNegative = this.amountMinor < 0;
    const absMinor = BigInt(Math.abs(this.amountMinor));
    const divisor = 10n ** BigInt(exponent);
    const whole = absMinor / divisor;
    const frac = String(absMinor % divisor).padStart(exponent, '0');

    const signPrefix = isNegative ? '-' : '';
    return `${signPrefix}${whole}.${frac}`;
  }

  /**
   * Formats the amount with its currency symbol.
   * E.g. "$19.99", "-$4.50", "¥2500".
   */
  toFormattedString(): string {
    const meta = getCurrencyMetadata(this.currency);
    const isNegative = this.amountMinor < 0;
    const absMinor = BigInt(Math.abs(this.amountMinor));
    const exponent = meta.minorUnitExponent;

    let numStr: string;
    if (exponent === 0) {
      numStr = String(absMinor);
    } else {
      const divisor = 10n ** BigInt(exponent);
      const whole = absMinor / divisor;
      const frac = String(absMinor % divisor).padStart(exponent, '0');
      numStr = `${whole}.${frac}`;
    }

    return isNegative ? `-${meta.symbol}${numStr}` : `${meta.symbol}${numStr}`;
  }

  /**
   * Returns a standard human-readable string representation: e.g. "19.99 USD".
   */
  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }
}
