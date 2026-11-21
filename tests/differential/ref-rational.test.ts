/**
 * Independent Reference Rational Arithmetic & Signed Rounding Tests.
 *
 * Verifies that the independent test-only RefRational arithmetic class correctly
 * implements exact BigInt rational operations and all 4 signed rounding modes
 * across positive, negative, boundary, and half-tie inputs without importing
 * any production calculation or math modules.
 */

import { describe, expect, it } from 'vitest';
import { RefRational } from './reference-oracle/ref-rational';

describe('RefRational - Independent Exact Signed Rounding', () => {
  describe('round_down (truncation toward zero)', () => {
    it('truncates positive fractions toward zero', () => {
      // Below half
      expect(RefRational.fromDecimalString('2.1').round('round_down')).toBe(2n);
      expect(RefRational.fromDecimalString('2.4').round('round_down')).toBe(2n);
      // Exact half
      expect(RefRational.fromDecimalString('2.5').round('round_down')).toBe(2n);
      expect(RefRational.fromDecimalString('3.5').round('round_down')).toBe(3n);
      // Above half
      expect(RefRational.fromDecimalString('2.7').round('round_down')).toBe(2n);
      expect(RefRational.fromDecimalString('2.99').round('round_down')).toBe(2n);
      // Exact integer
      expect(RefRational.fromDecimalString('2.0').round('round_down')).toBe(2n);
      expect(RefRational.fromDecimalString('0.0').round('round_down')).toBe(0n);
    });

    it('truncates negative fractions toward zero (not toward negative infinity)', () => {
      // Below half magnitude
      expect(RefRational.fromDecimalString('-2.1').round('round_down')).toBe(-2n);
      expect(RefRational.fromDecimalString('-2.4').round('round_down')).toBe(-2n);
      // Exact half
      expect(RefRational.fromDecimalString('-2.5').round('round_down')).toBe(-2n);
      expect(RefRational.fromDecimalString('-3.5').round('round_down')).toBe(-3n);
      // Above half magnitude
      expect(RefRational.fromDecimalString('-2.7').round('round_down')).toBe(-2n);
      expect(RefRational.fromDecimalString('-2.99').round('round_down')).toBe(-2n);
      // Exact integer
      expect(RefRational.fromDecimalString('-2.0').round('round_down')).toBe(-2n);
    });
  });

  describe('round_up (away from zero)', () => {
    it('rounds positive fractions away from zero', () => {
      // Below half
      expect(RefRational.fromDecimalString('2.01').round('round_up')).toBe(3n);
      expect(RefRational.fromDecimalString('2.1').round('round_up')).toBe(3n);
      expect(RefRational.fromDecimalString('2.4').round('round_up')).toBe(3n);
      // Exact half
      expect(RefRational.fromDecimalString('2.5').round('round_up')).toBe(3n);
      expect(RefRational.fromDecimalString('3.5').round('round_up')).toBe(4n);
      // Above half
      expect(RefRational.fromDecimalString('2.7').round('round_up')).toBe(3n);
      expect(RefRational.fromDecimalString('2.99').round('round_up')).toBe(3n);
      // Exact integer
      expect(RefRational.fromDecimalString('2.0').round('round_up')).toBe(2n);
      expect(RefRational.fromDecimalString('0.0').round('round_up')).toBe(0n);
    });

    it('rounds negative fractions away from zero (not toward positive infinity)', () => {
      // Below half magnitude
      expect(RefRational.fromDecimalString('-2.01').round('round_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-2.1').round('round_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-2.4').round('round_up')).toBe(-3n);
      // Exact half
      expect(RefRational.fromDecimalString('-2.5').round('round_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-3.5').round('round_up')).toBe(-4n);
      // Above half magnitude
      expect(RefRational.fromDecimalString('-2.7').round('round_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-2.99').round('round_up')).toBe(-3n);
      // Exact integer
      expect(RefRational.fromDecimalString('-2.0').round('round_up')).toBe(-2n);
    });
  });

  describe('round_half_up (nearest integer; exact ties away from zero)', () => {
    it('rounds positive values correctly around half boundaries', () => {
      // Below half -> nearest integer (q)
      expect(RefRational.fromDecimalString('2.49').round('round_half_up')).toBe(2n);
      expect(RefRational.fromDecimalString('2.4').round('round_half_up')).toBe(2n);
      expect(RefRational.fromDecimalString('3.49').round('round_half_up')).toBe(3n);

      // Exact half -> ties away from zero (+2.5 -> +3, +3.5 -> +4)
      expect(RefRational.fromDecimalString('2.5').round('round_half_up')).toBe(3n);
      expect(RefRational.fromDecimalString('3.5').round('round_half_up')).toBe(4n);

      // Above half -> nearest integer (q + 1)
      expect(RefRational.fromDecimalString('2.51').round('round_half_up')).toBe(3n);
      expect(RefRational.fromDecimalString('2.7').round('round_half_up')).toBe(3n);
      expect(RefRational.fromDecimalString('3.51').round('round_half_up')).toBe(4n);
    });

    it('rounds negative values correctly around half boundaries (ties away from zero)', () => {
      // Below half magnitude -> nearest integer (toward zero, -q)
      expect(RefRational.fromDecimalString('-2.49').round('round_half_up')).toBe(-2n);
      expect(RefRational.fromDecimalString('-2.4').round('round_half_up')).toBe(-2n);
      expect(RefRational.fromDecimalString('-3.49').round('round_half_up')).toBe(-3n);

      // Exact half -> ties away from zero (-2.5 -> -3, -3.5 -> -4)
      expect(RefRational.fromDecimalString('-2.5').round('round_half_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-3.5').round('round_half_up')).toBe(-4n);

      // Above half magnitude -> nearest integer (away from zero, -(q + 1))
      expect(RefRational.fromDecimalString('-2.51').round('round_half_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-2.7').round('round_half_up')).toBe(-3n);
      expect(RefRational.fromDecimalString('-3.51').round('round_half_up')).toBe(-4n);
    });
  });

  describe('round_half_even (Banker’s rounding: nearest integer; exact ties to even)', () => {
    it('rounds positive values correctly (ties to nearest even integer)', () => {
      // Below half -> nearest integer
      expect(RefRational.fromDecimalString('2.49').round('round_half_even')).toBe(2n);
      expect(RefRational.fromDecimalString('3.49').round('round_half_even')).toBe(3n);

      // Exact half: +2.5 -> 2 (2 is even), +3.5 -> 4 (4 is even, 3 is odd)
      expect(RefRational.fromDecimalString('2.5').round('round_half_even')).toBe(2n);
      expect(RefRational.fromDecimalString('3.5').round('round_half_even')).toBe(4n);
      expect(RefRational.fromDecimalString('4.5').round('round_half_even')).toBe(4n);
      expect(RefRational.fromDecimalString('5.5').round('round_half_even')).toBe(6n);

      // Above half -> nearest integer
      expect(RefRational.fromDecimalString('2.51').round('round_half_even')).toBe(3n);
      expect(RefRational.fromDecimalString('3.51').round('round_half_even')).toBe(4n);
    });

    it('rounds negative values correctly (ties to nearest even integer)', () => {
      // Below half magnitude -> nearest integer
      expect(RefRational.fromDecimalString('-2.49').round('round_half_even')).toBe(-2n);
      expect(RefRational.fromDecimalString('-3.49').round('round_half_even')).toBe(-3n);

      // Exact half: -2.5 -> -2 (-2 is even), -3.5 -> -4 (-4 is even, -3 is odd)
      expect(RefRational.fromDecimalString('-2.5').round('round_half_even')).toBe(-2n);
      expect(RefRational.fromDecimalString('-3.5').round('round_half_even')).toBe(-4n);
      expect(RefRational.fromDecimalString('-4.5').round('round_half_even')).toBe(-4n);
      expect(RefRational.fromDecimalString('-5.5').round('round_half_even')).toBe(-6n);

      // Above half magnitude -> nearest integer
      expect(RefRational.fromDecimalString('-2.51').round('round_half_even')).toBe(-3n);
      expect(RefRational.fromDecimalString('-3.51').round('round_half_even')).toBe(-4n);
    });
  });

  describe('RefRational exact arithmetic operations', () => {
    it('preserves exact fractional operations with GCD reduction', () => {
      const a = new RefRational(1n, 3n);
      const b = new RefRational(1n, 6n);
      const sum = a.add(b);
      expect(sum.numerator).toBe(1n);
      expect(sum.denominator).toBe(2n);

      const diff = a.subtract(b);
      expect(diff.numerator).toBe(1n);
      expect(diff.denominator).toBe(6n);

      const prod = a.multiply(b);
      expect(prod.numerator).toBe(1n);
      expect(prod.denominator).toBe(18n);

      const quot = a.divide(b);
      expect(quot.numerator).toBe(2n);
      expect(quot.denominator).toBe(1n);
    });

    it('rejects division by zero rational', () => {
      const a = RefRational.fromNumber(10);
      const zero = RefRational.zero();
      expect(() => a.divide(zero)).toThrow('RefRational divide by zero rational');
    });

    it('formats exact decimal string representation', () => {
      expect(new RefRational(1n, 4n).toDecimalString()).toBe('0.25');
      expect(new RefRational(-1n, 8n).toDecimalString()).toBe('-0.125');
      expect(new RefRational(5n, 1n).toDecimalString()).toBe('5');
    });
  });
});
