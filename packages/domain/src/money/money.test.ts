import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  InvalidMoneyError,
  MoneyOverflowError,
  UnsupportedCurrencyError,
} from '../errors/domain-error';
import { Money } from './money';

describe('Money Value Object', () => {
  describe('Construction & Factory Methods', () => {
    it('constructs valid positive, negative, and zero money amounts', () => {
      const positive = Money.of(1999, 'USD');
      expect(positive.amountMinor).toBe(1999);
      expect(positive.currency).toBe('USD');

      const negative = Money.of(-450, 'USD');
      expect(negative.amountMinor).toBe(-450);
      expect(negative.currency).toBe('USD');

      const zero = Money.of(0, 'USD');
      expect(zero.amountMinor).toBe(0);
      expect(zero.currency).toBe('USD');
    });

    it('normalizes negative zero to positive zero', () => {
      const negZero = Money.of(-0, 'USD');
      expect(Object.is(negZero.amountMinor, 0)).toBe(true);
      expect(Object.is(negZero.amountMinor, -0)).toBe(false);
    });

    it('creates zero money via Money.zero factory', () => {
      const zeroUSD = Money.zero('USD');
      expect(zeroUSD.amountMinor).toBe(0);
      expect(zeroUSD.currency).toBe('USD');
      expect(zeroUSD.isZero()).toBe(true);
    });

    it('normalizes currency code casing and whitespace in construction', () => {
      const money = Money.of(100, '  usd ');
      expect(money.currency).toBe('USD');
    });

    it('rejects non-numeric values for amountMinor', () => {
      expect(() => Money.of('100' as unknown as number, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(null as unknown as number, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(undefined as unknown as number, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of({} as unknown as number, 'USD')).toThrow(InvalidMoneyError);
    });

    it('rejects non-finite values (NaN, Infinity, -Infinity)', () => {
      expect(() => Money.of(NaN, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(Infinity, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(-Infinity, 'USD')).toThrow(InvalidMoneyError);
    });

    it('rejects fractional minor-unit amounts', () => {
      expect(() => Money.of(10.5, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(0.1, 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.of(-99.99, 'USD')).toThrow(InvalidMoneyError);
    });

    it('rejects amounts exceeding safe integer bounds', () => {
      expect(() => Money.of(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow(MoneyOverflowError);
      expect(() => Money.of(Number.MIN_SAFE_INTEGER - 1, 'USD')).toThrow(MoneyOverflowError);

      // Safe integer boundary values succeed
      expect(() => Money.of(Number.MAX_SAFE_INTEGER, 'USD')).not.toThrow();
      expect(() => Money.of(Number.MIN_SAFE_INTEGER, 'USD')).not.toThrow();
    });

    it('rejects unsupported currency codes', () => {
      expect(() => Money.of(100, 'XYZ')).toThrow(UnsupportedCurrencyError);
      expect(() => Money.of(100, '')).toThrow(UnsupportedCurrencyError);
    });

    it('enforces runtime immutability via Object.freeze', () => {
      const money = Money.of(1500, 'USD');
      expect(Object.isFrozen(money)).toBe(true);

      expect(() => {
        // @ts-expect-error mutating readonly property
        money.amountMinor = 2000;
      }).toThrow();

      expect(() => {
        // @ts-expect-error mutating readonly property
        money.currency = 'EUR';
      }).toThrow();
    });
  });

  describe('Decimal String Parsing (Money.fromDecimal)', () => {
    it('parses standard 2-decimal fiat amounts without floating point math', () => {
      expect(Money.fromDecimal('19.99', 'USD').amountMinor).toBe(1999);
      expect(Money.fromDecimal('14.50', 'USD').amountMinor).toBe(1450);
      expect(Money.fromDecimal('14.5', 'USD').amountMinor).toBe(1450);
      expect(Money.fromDecimal('14', 'USD').amountMinor).toBe(1400);
      expect(Money.fromDecimal('0.05', 'USD').amountMinor).toBe(5);
      expect(Money.fromDecimal('0.00', 'USD').amountMinor).toBe(0);
      expect(Money.fromDecimal('-4.50', 'USD').amountMinor).toBe(-450);
      expect(Money.fromDecimal('-0.99', 'USD').amountMinor).toBe(-99);
    });

    it('parses 0-decimal currencies (JPY) without fractions', () => {
      expect(Money.fromDecimal('2500', 'JPY').amountMinor).toBe(2500);
      expect(Money.fromDecimal('-1000', 'JPY').amountMinor).toBe(-1000);
      expect(Money.fromDecimal('0', 'JPY').amountMinor).toBe(0);
      // Trailing zero fraction is tolerated if 0
      expect(Money.fromDecimal('2500.0', 'JPY').amountMinor).toBe(2500);
    });

    it('rejects JPY amounts with non-zero fractional decimals', () => {
      expect(() => Money.fromDecimal('2500.5', 'JPY')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal('100.01', 'JPY')).toThrow(InvalidMoneyError);
    });

    it('rejects decimal strings exceeding allowed decimal places to prevent silent rounding', () => {
      expect(() => Money.fromDecimal('19.995', 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal('19.9901', 'EUR')).toThrow(InvalidMoneyError);
    });

    it('rejects malformed decimal strings', () => {
      expect(() => Money.fromDecimal('abc', 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal('19..99', 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal('1e5', 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal('', 'USD')).toThrow(InvalidMoneyError);
      expect(() => Money.fromDecimal(null as unknown as string, 'USD')).toThrow(InvalidMoneyError);
    });
  });

  describe('fromJSON Reconstruction', () => {
    it('reconstructs valid Money instance from DTO', () => {
      const money = Money.fromJSON({ amountMinor: 1499, currency: 'USD' });
      expect(money).toBeInstanceOf(Money);
      expect(money.amountMinor).toBe(1499);
      expect(money.currency).toBe('USD');
    });

    it('rejects invalid or incomplete DTOs', () => {
      expect(() => Money.fromJSON(null)).toThrow(InvalidMoneyError);
      expect(() => Money.fromJSON({})).toThrow(InvalidMoneyError);
      expect(() => Money.fromJSON({ amountMinor: '1499', currency: 'USD' })).toThrow(
        InvalidMoneyError,
      );
      expect(() => Money.fromJSON({ amountMinor: 1499, currency: 123 })).toThrow(InvalidMoneyError);
    });
  });

  describe('Arithmetic Operations', () => {
    const a = Money.of(1500, 'USD');
    const b = Money.of(500, 'USD');
    const eur = Money.of(500, 'EUR');

    it('adds two amounts of the same currency', () => {
      const result = a.add(b);
      expect(result.amountMinor).toBe(2000);
      expect(result.currency).toBe('USD');
    });

    it('subtracts two amounts of the same currency', () => {
      const result = a.subtract(b);
      expect(result.amountMinor).toBe(1000);
      expect(result.currency).toBe('USD');
    });

    it('rejects addition or subtraction between mismatched currencies', () => {
      expect(() => a.add(eur)).toThrow(CurrencyMismatchError);
      expect(() => a.subtract(eur)).toThrow(CurrencyMismatchError);
    });

    it('guards against arithmetic overflow in addition and subtraction', () => {
      const max = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
      const min = Money.of(Number.MIN_SAFE_INTEGER, 'USD');
      const one = Money.of(1, 'USD');

      expect(() => max.add(one)).toThrow(MoneyOverflowError);
      expect(() => min.subtract(one)).toThrow(MoneyOverflowError);
    });

    it('multiplies by exact integer factors', () => {
      expect(a.multiply(2).amountMinor).toBe(3000);
      expect(a.multiply(0).amountMinor).toBe(0);
      expect(a.multiply(-1).amountMinor).toBe(-1500);
    });

    it('rejects non-integer numeric factors in multiply() to prevent IEEE-754 inaccuracies', () => {
      const even = Money.of(1000, 'USD');
      expect(() => even.multiply(1.5)).toThrow(InvalidMoneyError);
      expect(() => even.multiply(0.29)).toThrow(InvalidMoneyError);
    });

    it('guards against non-finite factors and overflow in integer multiplication', () => {
      expect(() => a.multiply(NaN)).toThrow(InvalidMoneyError);
      expect(() => a.multiply(Infinity)).toThrow(InvalidMoneyError);
      expect(() => a.multiply(Number.MAX_SAFE_INTEGER)).toThrow(MoneyOverflowError);
    });

    describe('Exact Decimal Multiplication (multiplyDecimal)', () => {
      it('multiplies by exact decimal string factors without IEEE-754 float error (0.29 * 100 === 29)', () => {
        // Core reproduction case: 100 * 0.29 in floats is 28.999999999999996
        const hundred = Money.of(100, 'USD');
        const product = hundred.multiplyDecimal('0.29');
        expect(product.amountMinor).toBe(29);
        expect(product.currency).toBe('USD');

        const even = Money.of(1000, 'USD');
        expect(even.multiplyDecimal('1.5').amountMinor).toBe(1500);
        expect(even.multiplyDecimal('-0.5').amountMinor).toBe(-500);
        expect(even.multiplyDecimal('0').amountMinor).toBe(0);

        const negative = Money.of(-1000, 'USD');
        expect(negative.multiplyDecimal('0.5').amountMinor).toBe(-500);
        expect(negative.multiplyDecimal('-0.5').amountMinor).toBe(500);

        const zero = Money.of(0, 'USD');
        expect(zero.multiplyDecimal('0.29').amountMinor).toBe(0);
      });

      it('rejects decimal multiplication that produces fractional minor units', () => {
        const hundred = Money.of(100, 'USD');
        // 100 * 0.295 = 29.5 (fractional minor unit)
        expect(() => hundred.multiplyDecimal('0.295')).toThrow(InvalidMoneyError);

        const odd = Money.of(1001, 'USD');
        expect(() => odd.multiplyDecimal('1.5')).toThrow(InvalidMoneyError);
      });

      it('rejects invalid decimal strings or non-string inputs', () => {
        const m = Money.of(100, 'USD');
        expect(() => m.multiplyDecimal('')).toThrow(InvalidMoneyError);
        expect(() => m.multiplyDecimal('abc')).toThrow(InvalidMoneyError);
        expect(() => m.multiplyDecimal('1.2.3')).toThrow(InvalidMoneyError);
        expect(() => m.multiplyDecimal(null as unknown as string)).toThrow(InvalidMoneyError);
        expect(() => m.multiplyDecimal(undefined as unknown as string)).toThrow(InvalidMoneyError);
      });

      it('guards against overflow in decimal multiplication', () => {
        const max = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
        expect(() => max.multiplyDecimal('2')).toThrow(MoneyOverflowError);
      });
    });

    describe('Exact Rational Multiplication (multiplyRatio)', () => {
      it('multiplies by exact BigInt and integer ratios without rounding', () => {
        const hundred = Money.of(100, 'USD');
        expect(hundred.multiplyRatio(29n, 100n).amountMinor).toBe(29);
        expect(hundred.multiplyRatio(29, 100).amountMinor).toBe(29);

        const even = Money.of(1000, 'USD');
        expect(even.multiplyRatio(3n, 2n).amountMinor).toBe(1500);
        expect(even.multiplyRatio(-1n, 2n).amountMinor).toBe(-500);
        expect(even.multiplyRatio(1n, -2n).amountMinor).toBe(-500);
        expect(even.multiplyRatio(-1n, -2n).amountMinor).toBe(500);
        expect(even.multiplyRatio(0n, 1n).amountMinor).toBe(0);
      });

      it('rejects zero denominator in rational multiplication', () => {
        const m = Money.of(100, 'USD');
        expect(() => m.multiplyRatio(1n, 0n)).toThrow(InvalidMoneyError);
        expect(() => m.multiplyRatio(1, 0)).toThrow(InvalidMoneyError);
      });

      it('rejects non-integer ratio terms', () => {
        const m = Money.of(100, 'USD');
        expect(() => m.multiplyRatio(1.5, 2)).toThrow(InvalidMoneyError);
        expect(() => m.multiplyRatio(1, 2.5)).toThrow(InvalidMoneyError);
      });

      it('rejects rational multiplication that produces fractional minor units', () => {
        const hundred = Money.of(100, 'USD');
        expect(() => hundred.multiplyRatio(1n, 3n)).toThrow(InvalidMoneyError);
        expect(() => hundred.multiplyRatio(1, 3)).toThrow(InvalidMoneyError);
      });

      it('guards against overflow in rational multiplication', () => {
        const max = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
        expect(() => max.multiplyRatio(2n, 1n)).toThrow(MoneyOverflowError);
      });
    });

    it('negates amounts correctly', () => {
      expect(Money.of(500, 'USD').negate().amountMinor).toBe(-500);
      expect(Money.of(-500, 'USD').negate().amountMinor).toBe(500);
      expect(Money.of(0, 'USD').negate().amountMinor).toBe(0);
    });

    it('calculates absolute values', () => {
      expect(Money.of(-750, 'USD').abs().amountMinor).toBe(750);
      expect(Money.of(750, 'USD').abs().amountMinor).toBe(750);
    });
  });

  describe('Equality & Comparison', () => {
    const m1 = Money.of(1000, 'USD');
    const m2 = Money.of(1000, 'USD');
    const m3 = Money.of(2000, 'USD');
    const eur = Money.of(1000, 'EUR');

    it('correctly evaluates value equality', () => {
      expect(m1.equals(m2)).toBe(true);
      expect(m1.equals(m3)).toBe(false);
      expect(m1.equals(eur)).toBe(false);
      expect(m1.equals(null)).toBe(false);
      expect(m1.equals(undefined)).toBe(false);
      expect(m1.equals({ amountMinor: 1000, currency: 'USD' })).toBe(false);
    });

    it('compares amounts of the same currency', () => {
      expect(m1.compare(m2)).toBe(0);
      expect(m1.compare(m3)).toBe(-1);
      expect(m3.compare(m1)).toBe(1);

      expect(m3.greaterThan(m1)).toBe(true);
      expect(m1.greaterThan(m3)).toBe(false);

      expect(m3.greaterThanOrEqual(m1)).toBe(true);
      expect(m1.greaterThanOrEqual(m2)).toBe(true);

      expect(m1.lessThan(m3)).toBe(true);
      expect(m3.lessThan(m1)).toBe(false);

      expect(m1.lessThanOrEqual(m3)).toBe(true);
      expect(m1.lessThanOrEqual(m2)).toBe(true);
    });

    it('rejects comparison across differing currencies', () => {
      expect(() => m1.compare(eur)).toThrow(CurrencyMismatchError);
      expect(() => m1.greaterThan(eur)).toThrow(CurrencyMismatchError);
      expect(() => m1.lessThan(eur)).toThrow(CurrencyMismatchError);
    });

    it('reports sign predicates accurately', () => {
      expect(Money.of(10, 'USD').isPositive()).toBe(true);
      expect(Money.of(10, 'USD').isNegative()).toBe(false);
      expect(Money.of(10, 'USD').isZero()).toBe(false);

      expect(Money.of(-10, 'USD').isPositive()).toBe(false);
      expect(Money.of(-10, 'USD').isNegative()).toBe(true);
      expect(Money.of(-10, 'USD').isZero()).toBe(false);

      expect(Money.of(0, 'USD').isPositive()).toBe(false);
      expect(Money.of(0, 'USD').isNegative()).toBe(false);
      expect(Money.of(0, 'USD').isZero()).toBe(true);
    });
  });

  describe('Formatting & Serialization', () => {
    it('serializes to JSON format matching API and DB schemas', () => {
      const money = Money.of(1999, 'USD');
      expect(money.toJSON()).toEqual({
        amountMinor: 1999,
        currency: 'USD',
      });
      expect(JSON.stringify(money)).toBe('{"amountMinor":1999,"currency":"USD"}');
    });

    it('converts to deterministic decimal string', () => {
      expect(Money.of(1999, 'USD').toDecimalString()).toBe('19.99');
      expect(Money.of(5, 'USD').toDecimalString()).toBe('0.05');
      expect(Money.of(0, 'USD').toDecimalString()).toBe('0.00');
      expect(Money.of(-450, 'USD').toDecimalString()).toBe('-4.50');
      expect(Money.of(2500, 'JPY').toDecimalString()).toBe('2500');
      expect(Money.of(-1000, 'JPY').toDecimalString()).toBe('-1000');
    });

    it('formats with currency symbol', () => {
      expect(Money.of(1999, 'USD').toFormattedString()).toBe('$19.99');
      expect(Money.of(-450, 'USD').toFormattedString()).toBe('-$4.50');
      expect(Money.of(2500, 'JPY').toFormattedString()).toBe('¥2500');
      expect(Money.of(-2500, 'JPY').toFormattedString()).toBe('-¥2500');
      expect(Money.of(1500, 'EUR').toFormattedString()).toBe('€15.00');
      expect(Money.of(1250, 'GBP').toFormattedString()).toBe('£12.50');
    });

    it('converts to readable string', () => {
      expect(Money.of(1999, 'USD').toString()).toBe('19.99 USD');
      expect(Money.of(2500, 'JPY').toString()).toBe('2500 JPY');
    });

    it('handles safe integer boundary values in formatting', () => {
      const max = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
      expect(max.toDecimalString()).toBe('90071992547409.91');
      expect(max.toFormattedString()).toBe('$90071992547409.91');

      const min = Money.of(Number.MIN_SAFE_INTEGER, 'USD');
      expect(min.toDecimalString()).toBe('-90071992547409.91');
      expect(min.toFormattedString()).toBe('-$90071992547409.91');
    });

    it('rejects decimal amounts that exceed safe integer range in fromDecimal', () => {
      expect(() => Money.fromDecimal('9007199254740992', 'JPY')).toThrow(MoneyOverflowError);
      expect(() => Money.fromDecimal('-9007199254740992', 'JPY')).toThrow(MoneyOverflowError);
      expect(() => Money.fromDecimal('900719925474099.99', 'USD')).toThrow(MoneyOverflowError);
    });
  });

  describe('Mathematical Properties (Pure Value Object Invariants)', () => {
    it('satisfies additive identity: a + 0 === a', () => {
      const a = Money.of(1234, 'USD');
      const zero = Money.zero('USD');
      expect(a.add(zero).equals(a)).toBe(true);
    });

    it('satisfies additive inverse: a + (-a) === 0', () => {
      const a = Money.of(1234, 'USD');
      expect(a.add(a.negate()).isZero()).toBe(true);
    });

    it('satisfies commutativity: a + b === b + a', () => {
      const a = Money.of(1234, 'USD');
      const b = Money.of(5678, 'USD');
      expect(a.add(b).equals(b.add(a))).toBe(true);
    });

    it('satisfies associativity: (a + b) + c === a + (b + c)', () => {
      const a = Money.of(100, 'USD');
      const b = Money.of(200, 'USD');
      const c = Money.of(300, 'USD');
      expect(
        a
          .add(b)
          .add(c)
          .equals(a.add(b.add(c))),
      ).toBe(true);
    });
  });
});
