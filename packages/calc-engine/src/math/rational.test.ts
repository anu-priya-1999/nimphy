import { describe, expect, it } from 'vitest';
import { CalcInputValidationError } from '../errors/calc-error';
import { Rational } from './rational';

describe('Rational Math Value Object', () => {
  describe('Construction & Canonical Normalization', () => {
    it('creates canonical simplified fraction from integers', () => {
      const r = Rational.from(6, 8);
      expect(r.numerator).toBe(3n);
      expect(r.denominator).toBe(4n);
      expect(r.toDecimalString()).toBe('0.75');
    });

    it('creates canonical simplified fraction from BigInts', () => {
      const r = Rational.from(100n, 25n);
      expect(r.numerator).toBe(4n);
      expect(r.denominator).toBe(1n);
      expect(r.isInteger()).toBe(true);
    });

    it('normalizes negative denominator to numerator', () => {
      const r = Rational.from(3, -4);
      expect(r.numerator).toBe(-3n);
      expect(r.denominator).toBe(4n);
    });

    it('normalizes negative numerator and negative denominator to positive', () => {
      const r = Rational.from(-3, -4);
      expect(r.numerator).toBe(3n);
      expect(r.denominator).toBe(4n);
    });

    it('normalizes zero numerator to 0/1', () => {
      const r = Rational.from(0, 5);
      expect(r.numerator).toBe(0n);
      expect(r.denominator).toBe(1n);
      expect(r.isZero()).toBe(true);
    });

    it('creates zero and one constants', () => {
      expect(Rational.zero().isZero()).toBe(true);
      expect(Rational.one().numerator).toBe(1n);
      expect(Rational.one().denominator).toBe(1n);
    });

    it('rejects division by zero in constructor', () => {
      expect(() => Rational.from(1, 0)).toThrow(CalcInputValidationError);
      expect(() => Rational.from(1, 0n)).toThrow(CalcInputValidationError);
    });

    it('rejects non-safe-integer numbers in from()', () => {
      expect(() => Rational.from(1.5, 1)).toThrow(CalcInputValidationError);
      expect(() => Rational.from(1, 2.5)).toThrow(CalcInputValidationError);
      expect(() => Rational.from(NaN, 1)).toThrow(CalcInputValidationError);
      expect(() => Rational.from(Infinity, 1)).toThrow(CalcInputValidationError);
      expect(() => Rational.from('1' as unknown as number, 1)).toThrow(CalcInputValidationError);
    });

    it('is immutable (frozen)', () => {
      const r = Rational.from(3, 4);
      expect(Object.isFrozen(r)).toBe(true);
    });
  });

  describe('Decimal String Parsing', () => {
    it('parses terminating decimal strings accurately without floating-point math', () => {
      const r1 = Rational.fromDecimal('0.70');
      expect(r1.numerator).toBe(7n);
      expect(r1.denominator).toBe(10n);

      const r2 = Rational.fromDecimal('0.35');
      expect(r2.numerator).toBe(7n);
      expect(r2.denominator).toBe(20n);

      const r3 = Rational.fromDecimal('19.99');
      expect(r3.numerator).toBe(1999n);
      expect(r3.denominator).toBe(100n);

      const r4 = Rational.fromDecimal('-5.25');
      expect(r4.numerator).toBe(-21n);
      expect(r4.denominator).toBe(4n);

      const r5 = Rational.fromDecimal('100');
      expect(r5.numerator).toBe(100n);
      expect(r5.denominator).toBe(1n);
    });

    it('rejects invalid decimal strings', () => {
      expect(() => Rational.fromDecimal(123 as unknown as string)).toThrow(
        CalcInputValidationError,
      );
      expect(() => Rational.fromDecimal('abc')).toThrow(CalcInputValidationError);
      expect(() => Rational.fromDecimal('1.2.3')).toThrow(CalcInputValidationError);
      expect(() => Rational.fromDecimal('')).toThrow(CalcInputValidationError);
    });
  });

  describe('Arithmetic Operations', () => {
    it('adds fractions correctly', () => {
      const a = Rational.from(1, 3);
      const b = Rational.from(1, 6);
      const sum = a.add(b);
      expect(sum.numerator).toBe(1n);
      expect(sum.denominator).toBe(2n);
    });

    it('subtracts fractions correctly', () => {
      const a = Rational.from(3, 4);
      const b = Rational.from(1, 2);
      const diff = a.subtract(b);
      expect(diff.numerator).toBe(1n);
      expect(diff.denominator).toBe(4n);
    });

    it('multiplies fractions correctly', () => {
      const a = Rational.from(299, 1);
      const rate = Rational.fromDecimal('0.70');
      const product = a.multiply(rate);
      expect(product.numerator).toBe(2093n);
      expect(product.denominator).toBe(10n);
      expect(product.toDecimalString()).toBe('209.3');
    });

    it('divides fractions correctly', () => {
      const a = Rational.from(1, 2);
      const b = Rational.from(3, 4);
      const quotient = a.divide(b);
      expect(quotient.numerator).toBe(2n);
      expect(quotient.denominator).toBe(3n);
    });

    it('rejects division by zero Rational', () => {
      const a = Rational.from(1, 2);
      expect(() => a.divide(Rational.zero())).toThrow(CalcInputValidationError);
    });

    it('negates and computes absolute value', () => {
      const a = Rational.from(3, 4);
      expect(a.negate().numerator).toBe(-3n);
      expect(a.negate().abs().numerator).toBe(3n);
      expect(a.abs().numerator).toBe(3n);
    });
  });

  describe('Comparisons & Predicates', () => {
    it('compares correctly (-1, 0, 1)', () => {
      const a = Rational.from(1, 2);
      const b = Rational.from(3, 4);
      const c = Rational.from(2, 4);

      expect(a.compare(b)).toBe(-1);
      expect(b.compare(a)).toBe(1);
      expect(a.compare(c)).toBe(0);
      expect(a.equals(c)).toBe(true);
      expect(a.equals('not a rational')).toBe(false);
    });

    it('checks positive, negative, zero, and integer', () => {
      expect(Rational.from(5, 1).isPositive()).toBe(true);
      expect(Rational.from(5, 1).isInteger()).toBe(true);
      expect(Rational.from(-5, 2).isNegative()).toBe(true);
      expect(Rational.from(-5, 2).isInteger()).toBe(false);
      expect(Rational.zero().isZero()).toBe(true);
    });
  });

  describe('Rounding Policies (ADR-005)', () => {
    describe('round_down (truncate towards zero)', () => {
      it('truncates positive fractions towards zero', () => {
        expect(Rational.from(21, 10).round('round_down')).toBe(2n); // 2.1 -> 2
        expect(Rational.from(25, 10).round('round_down')).toBe(2n); // 2.5 -> 2
        expect(Rational.from(29, 10).round('round_down')).toBe(2n); // 2.9 -> 2
        expect(Rational.from(20, 10).round('round_down')).toBe(2n); // 2.0 -> 2
      });

      it('truncates negative fractions towards zero (NOT floor)', () => {
        expect(Rational.from(-21, 10).round('round_down')).toBe(-2n); // -2.1 -> -2
        expect(Rational.from(-25, 10).round('round_down')).toBe(-2n); // -2.5 -> -2
        expect(Rational.from(-29, 10).round('round_down')).toBe(-2n); // -2.9 -> -2
        expect(Rational.from(-20, 10).round('round_down')).toBe(-2n); // -2.0 -> -2
      });
    });

    describe('round_up (away from zero)', () => {
      it('rounds positive fractions away from zero', () => {
        expect(Rational.from(21, 10).round('round_up')).toBe(3n); // 2.1 -> 3
        expect(Rational.from(25, 10).round('round_up')).toBe(3n); // 2.5 -> 3
        expect(Rational.from(29, 10).round('round_up')).toBe(3n); // 2.9 -> 3
        expect(Rational.from(20, 10).round('round_up')).toBe(2n); // 2.0 -> 2
      });

      it('rounds negative fractions away from zero', () => {
        expect(Rational.from(-21, 10).round('round_up')).toBe(-3n); // -2.1 -> -3
        expect(Rational.from(-25, 10).round('round_up')).toBe(-3n); // -2.5 -> -3
        expect(Rational.from(-29, 10).round('round_up')).toBe(-3n); // -2.9 -> -3
        expect(Rational.from(-20, 10).round('round_up')).toBe(-2n); // -2.0 -> -2
      });
    });

    describe('round_half_up (nearest; exact ties away from zero)', () => {
      it('rounds to nearest integer for non-ties', () => {
        expect(Rational.from(24, 10).round('round_half_up')).toBe(2n); // 2.4 -> 2
        expect(Rational.from(26, 10).round('round_half_up')).toBe(3n); // 2.6 -> 3
        expect(Rational.from(-24, 10).round('round_half_up')).toBe(-2n); // -2.4 -> -2
        expect(Rational.from(-26, 10).round('round_half_up')).toBe(-3n); // -2.6 -> -3
        expect(Rational.from(20, 10).round('round_half_up')).toBe(2n); // 2.0 -> 2
        expect(Rational.from(-20, 10).round('round_half_up')).toBe(-2n); // -2.0 -> -2
      });

      it('breaks exact ties away from zero', () => {
        expect(Rational.from(15, 10).round('round_half_up')).toBe(2n); // +1.5 -> +2
        expect(Rational.from(25, 10).round('round_half_up')).toBe(3n); // +2.5 -> +3
        expect(Rational.from(35, 10).round('round_half_up')).toBe(4n); // +3.5 -> +4
        expect(Rational.from(45, 10).round('round_half_up')).toBe(5n); // +4.5 -> +5
        expect(Rational.from(-15, 10).round('round_half_up')).toBe(-2n); // -1.5 -> -2
        expect(Rational.from(-25, 10).round('round_half_up')).toBe(-3n); // -2.5 -> -3
        expect(Rational.from(-35, 10).round('round_half_up')).toBe(-4n); // -3.5 -> -4
        expect(Rational.from(-45, 10).round('round_half_up')).toBe(-5n); // -4.5 -> -5
      });
    });

    describe("round_half_even (Banker's rounding; exact ties to nearest even)", () => {
      it('rounds to nearest integer for non-ties', () => {
        expect(Rational.from(24, 10).round('round_half_even')).toBe(2n); // 2.4 -> 2
        expect(Rational.from(26, 10).round('round_half_even')).toBe(3n); // 2.6 -> 3
        expect(Rational.from(-24, 10).round('round_half_even')).toBe(-2n); // -2.4 -> -2
        expect(Rational.from(-26, 10).round('round_half_even')).toBe(-3n); // -2.6 -> -3
        expect(Rational.from(20, 10).round('round_half_even')).toBe(2n); // 2.0 -> 2
        expect(Rational.from(-20, 10).round('round_half_even')).toBe(-2n); // -2.0 -> -2
      });

      it('breaks exact ties to nearest even integer', () => {
        expect(Rational.from(15, 10).round('round_half_even')).toBe(2n); // +1.5 -> +2 (even)
        expect(Rational.from(25, 10).round('round_half_even')).toBe(2n); // +2.5 -> +2 (even)
        expect(Rational.from(35, 10).round('round_half_even')).toBe(4n); // +3.5 -> +4 (even)
        expect(Rational.from(45, 10).round('round_half_even')).toBe(4n); // +4.5 -> +4 (even)
        expect(Rational.from(-15, 10).round('round_half_even')).toBe(-2n); // -1.5 -> -2 (even)
        expect(Rational.from(-25, 10).round('round_half_even')).toBe(-2n); // -2.5 -> -2 (even)
        expect(Rational.from(-35, 10).round('round_half_even')).toBe(-4n); // -3.5 -> -4 (even)
        expect(Rational.from(-45, 10).round('round_half_even')).toBe(-4n); // -4.5 -> -4 (even)
      });
    });

    it('rejects invalid rounding mode', () => {
      // @ts-expect-error Testing invalid runtime rounding mode
      expect(() => Rational.from(5, 2).round('invalid_mode')).toThrow(CalcInputValidationError);
    });
  });

  describe('Decimal String & JSON Serialization', () => {
    it('converts terminating fractions to exact decimal strings', () => {
      expect(Rational.from(1, 2).toDecimalString()).toBe('0.5');
      expect(Rational.from(1, 4).toDecimalString()).toBe('0.25');
      expect(Rational.from(1, 8).toDecimalString()).toBe('0.125');
      expect(Rational.from(3, 10).toDecimalString()).toBe('0.3');
      expect(Rational.from(693, 20).toDecimalString()).toBe('34.65');
      expect(Rational.from(-3465, 100).toDecimalString()).toBe('-34.65');
      expect(Rational.from(500, 1).toDecimalString()).toBe('500');
    });

    it('formats non-terminating fractions with ellipsis', () => {
      const third = Rational.from(1, 3);
      expect(third.toDecimalString(5)).toBe('0.33333...');
      const sixth = Rational.from(-1, 6);
      expect(sixth.toDecimalString(5)).toBe('-0.16666...');
    });

    it('serializes to JSON with strings for safe JSON.stringify', () => {
      const r = Rational.from(693, 20);
      const json = r.toJSON();
      expect(json).toEqual({
        numerator: '693',
        denominator: '20',
        decimalString: '34.65',
      });
      expect(JSON.stringify(r)).toBe(
        JSON.stringify({
          numerator: '693',
          denominator: '20',
          decimalString: '34.65',
        }),
      );
    });
  });
});
