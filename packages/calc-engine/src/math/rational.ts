import { CalcInputValidationError } from '../errors/calc-error';

export type RoundingMode = 'round_half_up' | 'round_half_even' | 'round_down' | 'round_up';
export type RoundingPoint = 'per_unit' | 'per_total';

/**
 * Computes greatest common divisor of two BigInts using Euclid's algorithm.
 */
function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Immutable Rational Number representing an exact fraction (numerator / denominator)
 * with arbitrary-precision BigInt arithmetic.
 *
 * Guarantees:
 * - Deterministic, pure arithmetic with zero floating-point representation.
 * - Always stored in canonical simplified form (coprime numerator and positive denominator).
 * - Zero denominator strictly rejected.
 * - Rounding adheres strictly to ADR-005 policies and IEEE-754 tie-breaking rules.
 */
export class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    if (denominator === 0n) {
      throw new CalcInputValidationError(
        'DIVISION_BY_ZERO',
        'Denominator cannot be zero in Rational number',
      );
    }

    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }

    if (numerator === 0n) {
      this.numerator = 0n;
      this.denominator = 1n;
    } else {
      const divisor = gcd(numerator, denominator);
      this.numerator = numerator / divisor;
      this.denominator = denominator / divisor;
    }

    Object.freeze(this);
  }

  /**
   * Constructs a Rational from integer/BigInt numerator and denominator.
   */
  static from(numerator: bigint | number, denominator: bigint | number = 1n): Rational {
    const numBig = Rational.toBigInt(numerator, 'numerator');
    const denBig = Rational.toBigInt(denominator, 'denominator');
    return new Rational(numBig, denBig);
  }

  /**
   * Safe conversion of safe integer or BigInt into BigInt.
   */
  private static toBigInt(val: bigint | number, fieldName: string): bigint {
    if (typeof val === 'bigint') {
      return val;
    }
    if (typeof val === 'number') {
      if (!Number.isFinite(val) || !Number.isSafeInteger(val)) {
        throw new CalcInputValidationError(
          'INVALID_INTEGER',
          `Rational ${fieldName} must be a safe integer or bigint, received: ${String(val)}`,
        );
      }
      return BigInt(val);
    }
    throw new CalcInputValidationError(
      'INVALID_TYPE',
      `Rational ${fieldName} must be a number or bigint, received: ${typeof val}`,
    );
  }

  /**
   * Constructs a Rational from a decimal string without IEEE-754 floating-point conversion.
   * e.g. "0.70" -> 7/10, "19.99" -> 1999/100, "-0.05" -> -1/20, "100" -> 100/1.
   */
  static fromDecimal(decimalString: string): Rational {
    if (typeof decimalString !== 'string') {
      throw new CalcInputValidationError(
        'INVALID_DECIMAL',
        `Decimal representation must be a string, received: ${typeof decimalString}`,
      );
    }

    const trimmed = decimalString.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new CalcInputValidationError(
        'INVALID_DECIMAL_FORMAT',
        `Invalid decimal format: "${decimalString}". Expected numeric string like "0.35" or "10.00".`,
      );
    }

    const isNegative = trimmed.startsWith('-');
    const unsignedStr = isNegative ? trimmed.slice(1) : trimmed;
    const parts = unsignedStr.split('.');
    const wholeStr = parts[0]!;
    const fracStr = parts[1] ?? '';

    const exponent = BigInt(fracStr.length);
    const combinedStr = `${wholeStr}${fracStr}`;
    const numerator = isNegative ? -BigInt(combinedStr) : BigInt(combinedStr);
    const denominator = 10n ** exponent;

    return new Rational(numerator, denominator);
  }

  /**
   * Constructs Rational zero (0/1).
   */
  static zero(): Rational {
    return new Rational(0n, 1n);
  }

  /**
   * Constructs Rational one (1/1).
   */
  static one(): Rational {
    return new Rational(1n, 1n);
  }

  /**
   * Adds another Rational.
   */
  add(other: Rational): Rational {
    const num = this.numerator * other.denominator + other.numerator * this.denominator;
    const den = this.denominator * other.denominator;
    return new Rational(num, den);
  }

  /**
   * Subtracts another Rational.
   */
  subtract(other: Rational): Rational {
    const num = this.numerator * other.denominator - other.numerator * this.denominator;
    const den = this.denominator * other.denominator;
    return new Rational(num, den);
  }

  /**
   * Multiplies by another Rational.
   */
  multiply(other: Rational): Rational {
    const num = this.numerator * other.numerator;
    const den = this.denominator * other.denominator;
    return new Rational(num, den);
  }

  /**
   * Divides by another Rational.
   */
  divide(other: Rational): Rational {
    if (other.numerator === 0n) {
      throw new CalcInputValidationError('DIVISION_BY_ZERO', 'Cannot divide by zero Rational');
    }
    const num = this.numerator * other.denominator;
    const den = this.denominator * other.numerator;
    return new Rational(num, den);
  }

  /**
   * Negates this Rational.
   */
  negate(): Rational {
    return new Rational(-this.numerator, this.denominator);
  }

  /**
   * Absolute value of this Rational.
   */
  abs(): Rational {
    return new Rational(this.numerator < 0n ? -this.numerator : this.numerator, this.denominator);
  }

  /**
   * Equality comparison. In canonical form, fractions are equal iff numerator and denominator match.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Rational)) {
      return false;
    }
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  /**
   * Comparison returning -1 (less), 0 (equal), or 1 (greater).
   */
  compare(other: Rational): number {
    const diff = this.numerator * other.denominator - other.numerator * this.denominator;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }

  isZero(): boolean {
    return this.numerator === 0n;
  }

  isPositive(): boolean {
    return this.numerator > 0n;
  }

  isNegative(): boolean {
    return this.numerator < 0n;
  }

  isInteger(): boolean {
    return this.denominator === 1n;
  }

  /**
   * Rounds this rational number to a BigInt integer according to the specified RoundingMode.
   *
   * Supported modes:
   * - 'round_down': Truncates towards zero (positive 2.7 -> 2, negative -2.7 -> -2).
   * - 'round_up': Rounds away from zero (positive 2.1 -> 3, negative -2.1 -> -3).
   * - 'round_half_up': Nearest integer; exact ties round away from zero (+2.5 -> 3, -2.5 -> -3).
   * - 'round_half_even': Nearest integer; exact ties round to nearest even integer (Banker's rounding:
   *   +2.5 -> 2, +3.5 -> 4, -2.5 -> -2, -3.5 -> -4).
   */
  round(mode: RoundingMode): bigint {
    const n = this.numerator;
    const d = this.denominator;
    const q = n / d;
    const r = n % d;

    if (r === 0n) {
      return q;
    }

    switch (mode) {
      case 'round_down':
        // BigInt division truncates toward zero
        return q;

      case 'round_up':
        // Away from zero
        return n > 0n ? q + 1n : q - 1n;

      case 'round_half_up': {
        const absR = r < 0n ? -r : r;
        const doubleR = absR * 2n;
        if (doubleR < d) {
          return q;
        }
        if (doubleR > d) {
          return n > 0n ? q + 1n : q - 1n;
        }
        // Exact tie (doubleR === d): round away from zero
        return n > 0n ? q + 1n : q - 1n;
      }

      case 'round_half_even': {
        const absR = r < 0n ? -r : r;
        const doubleR = absR * 2n;
        if (doubleR < d) {
          return q;
        }
        if (doubleR > d) {
          return n > 0n ? q + 1n : q - 1n;
        }
        // Exact tie (doubleR === d): round to nearest even integer
        const isEven = q % 2n === 0n;
        if (isEven) {
          return q;
        }
        return n > 0n ? q + 1n : q - 1n;
      }

      default: {
        const exhaustiveCheck: never = mode;
        throw new CalcInputValidationError(
          'INVALID_ROUNDING_MODE',
          `Unsupported rounding mode: ${String(exhaustiveCheck)}`,
        );
      }
    }
  }

  /**
   * Converts the Rational to an exact decimal string if it terminates.
   * If non-terminating (e.g. 1/3), outputs decimal digits up to maxDecimals with ellipsis.
   */
  toDecimalString(maxDecimals = 20): string {
    const n = this.numerator;
    const d = this.denominator;

    if (d === 1n) {
      return n.toString();
    }

    const isNeg = n < 0n;
    const absN = isNeg ? -n : n;

    // Check if denominator factorizes into only 2s and 5s (terminating decimal)
    let tempD = d;
    let twos = 0;
    let fives = 0;
    while (tempD % 2n === 0n) {
      tempD /= 2n;
      twos++;
    }
    while (tempD % 5n === 0n) {
      tempD /= 5n;
      fives++;
    }

    const sign = isNeg ? '-' : '';

    if (tempD === 1n) {
      // Guaranteed terminating decimal
      const k = Math.max(twos, fives);
      const factor2 = 2n ** BigInt(k - twos);
      const factor5 = 5n ** BigInt(k - fives);
      const scaledN = absN * factor2 * factor5;
      const tenPowK = 10n ** BigInt(k);

      const wholePart = scaledN / tenPowK;
      const fracPart = scaledN % tenPowK;

      let fracStr = fracPart.toString().padStart(k, '0');
      // Trim trailing zeros
      fracStr = fracStr.replace(/0+$/, '');
      return `${sign}${wholePart.toString()}.${fracStr}`;
    }

    // Non-terminating decimal
    const wholePart = absN / d;
    let remainder = absN % d;
    let fracStr = '';
    let digits = 0;

    while (remainder !== 0n && digits < maxDecimals) {
      remainder *= 10n;
      const digit = remainder / d;
      remainder %= d;
      fracStr += digit.toString();
      digits++;
    }

    return `${sign}${wholePart.toString()}.${fracStr}...`;
  }

  /**
   * Custom serialization providing string representation suitable for JSON.stringify
   * and RFC 8785 canonical JSON serialization without native BigInt errors.
   */
  toJSON(): { numerator: string; denominator: string; decimalString: string } {
    return {
      numerator: this.numerator.toString(),
      denominator: this.denominator.toString(),
      decimalString: this.toDecimalString(),
    };
  }
}
