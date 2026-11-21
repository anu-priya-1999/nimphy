/**
 * Independent Exact Rational Arithmetic for Financial Differential Verification.
 *
 * CRITICAL INDEPENDENCE CONTRACT:
 * - This implementation is 100% test-only and isolated from packages/calc-engine.
 * - It does NOT import or call ANY production calculation or math logic.
 * - Uses pure BigInt arithmetic with zero IEEE 754 floating-point drift.
 * - Independently implements all 4 rounding modes:
 *     round_half_up, round_half_even, round_down, round_up
 */

export type RefRoundingMode = 'round_half_up' | 'round_half_even' | 'round_down' | 'round_up';
export type RefRoundingPoint = 'per_unit' | 'per_total';

function bigIntAbs(val: bigint): bigint {
  return val < 0n ? -val : val;
}

function bigIntGcd(a: bigint, b: bigint): bigint {
  let x = bigIntAbs(a);
  let y = bigIntAbs(b);
  while (y > 0n) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x;
}

export class RefRational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: bigint, denominator: bigint = 1n) {
    if (denominator === 0n) {
      throw new Error('RefRational division by zero: denominator cannot be zero');
    }

    // Normalize sign so denominator is always positive
    let num = numerator;
    let den = denominator;
    if (den < 0n) {
      num = -num;
      den = -den;
    }

    if (num === 0n) {
      this.numerator = 0n;
      this.denominator = 1n;
      return;
    }

    const divisor = bigIntGcd(num, den);
    this.numerator = num / divisor;
    this.denominator = den / divisor;
  }

  static zero(): RefRational {
    return new RefRational(0n, 1n);
  }

  static fromBigInt(val: bigint): RefRational {
    return new RefRational(val, 1n);
  }

  static fromNumber(val: number): RefRational {
    if (!Number.isFinite(val) || !Number.isSafeInteger(val)) {
      throw new Error(`RefRational.fromNumber requires safe integer, received: ${val}`);
    }
    return new RefRational(BigInt(val), 1n);
  }

  /**
   * Parse an exact decimal string (e.g., "1.5", "-0.75", "10", "-100") into RefRational.
   * Does NOT use parseFloat or JavaScript float math.
   */
  static fromDecimalString(str: string): RefRational {
    const trimmed = str.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(`RefRational.fromDecimalString invalid decimal: "${str}"`);
    }

    const isNegative = trimmed.startsWith('-');
    const digits = isNegative ? trimmed.slice(1) : trimmed;
    const dotIndex = digits.indexOf('.');

    if (dotIndex === -1) {
      const num = BigInt(digits);
      return new RefRational(isNegative ? -num : num, 1n);
    }

    const integerPart = digits.slice(0, dotIndex);
    const fractionalPart = digits.slice(dotIndex + 1);
    const scale = BigInt(fractionalPart.length);
    const denominator = 10n ** scale;
    const numerator = BigInt(integerPart) * denominator + BigInt(fractionalPart);

    return new RefRational(isNegative ? -numerator : numerator, denominator);
  }

  add(other: RefRational): RefRational {
    const num = this.numerator * other.denominator + other.numerator * this.denominator;
    const den = this.denominator * other.denominator;
    return new RefRational(num, den);
  }

  subtract(other: RefRational): RefRational {
    const num = this.numerator * other.denominator - other.numerator * this.denominator;
    const den = this.denominator * other.denominator;
    return new RefRational(num, den);
  }

  multiply(other: RefRational): RefRational {
    const num = this.numerator * other.numerator;
    const den = this.denominator * other.denominator;
    return new RefRational(num, den);
  }

  divide(other: RefRational): RefRational {
    if (other.numerator === 0n) {
      throw new Error('RefRational divide by zero rational');
    }
    const num = this.numerator * other.denominator;
    const den = this.denominator * other.numerator;
    return new RefRational(num, den);
  }

  compare(other: RefRational): number {
    const diff = this.numerator * other.denominator - other.numerator * this.denominator;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }

  equals(other: RefRational): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
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

  /**
   * Independently round this rational to an integer BigInt according to the specified mode.
   *
   * Supported modes:
   * - round_half_up: nearest integer; exact half-way tie rounds away from zero (+2.5 -> 3, -2.5 -> -3)
   * - round_half_even: nearest integer; exact half-way tie rounds to nearest even (+2.5 -> 2, +3.5 -> 4, -2.5 -> -2, -3.5 -> -4)
   * - round_down: truncation toward zero (+2.7 -> 2, -2.7 -> -2)
   * - round_up: away from zero (+2.1 -> 3, -2.1 -> -3)
   */
  round(mode: RefRoundingMode): bigint {
    const n = this.numerator;
    const d = this.denominator;
    const q = n / d;
    const r = n % d;

    if (r === 0n) {
      return q;
    }

    switch (mode) {
      case 'round_down':
        // BigInt integer division truncates toward zero
        return q;

      case 'round_up':
        // Away from zero
        return n > 0n ? q + 1n : q - 1n;

      case 'round_half_up': {
        const absR = bigIntAbs(r);
        const doubleR = absR * 2n;
        if (doubleR < d) {
          return q;
        }
        // doubleR > d or exact tie (doubleR === d): away from zero
        return n > 0n ? q + 1n : q - 1n;
      }

      case 'round_half_even': {
        const absR = bigIntAbs(r);
        const doubleR = absR * 2n;
        if (doubleR < d) {
          return q;
        }
        if (doubleR > d) {
          return n > 0n ? q + 1n : q - 1n;
        }
        // Exact tie (doubleR === d): round to nearest even integer
        const isQuotientEven = q % 2n === 0n;
        if (isQuotientEven) {
          return q;
        }
        return n > 0n ? q + 1n : q - 1n;
      }
    }
  }

  toDecimalString(maxDecimals: number = 20): string {
    if (this.denominator === 1n) {
      return this.numerator.toString();
    }
    const isNegative = this.numerator < 0n;
    const absNum = bigIntAbs(this.numerator);
    const intPart = absNum / this.denominator;
    let rem = absNum % this.denominator;

    if (rem === 0n) {
      return (isNegative ? '-' : '') + intPart.toString();
    }

    let frac = '';
    while (rem !== 0n && frac.length < maxDecimals) {
      rem *= 10n;
      frac += (rem / this.denominator).toString();
      rem %= this.denominator;
    }

    return (isNegative ? '-' : '') + intPart.toString() + '.' + frac;
  }
}
