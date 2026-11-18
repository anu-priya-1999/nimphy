import { Money, type BookFormat, type CurrencyCode } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import {
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
} from '../errors/calc-error';
import type { CalcRulePack } from '../per-unit/types';
import { calculateBreakEven } from './break-even-calc';
import type { BreakEvenInput } from './types';

describe('calculateBreakEven — Unit and Boundary Tests', () => {
  const ebookPack = ebookPackJson as unknown as CalcRulePack;
  const paperbackV1Pack = paperbackV1PackJson as unknown as CalcRulePack;
  const hardcoverPack = hardcoverPackJson as unknown as CalcRulePack;

  describe('1. Input Validation and Guard Clauses', () => {
    it('rejects non-object input', () => {
      expect(() => calculateBreakEven(null as unknown as BreakEvenInput, ebookPack)).toThrow(
        CalcInputValidationError,
      );
      expect(() => calculateBreakEven(undefined as unknown as BreakEvenInput, ebookPack)).toThrow(
        CalcInputValidationError,
      );
      expect(() => calculateBreakEven('invalid' as unknown as BreakEvenInput, ebookPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects invalid Rule Pack', () => {
      const validFc = Money.of(1000, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: validFc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          null as unknown as CalcRulePack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: validFc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          {} as unknown as CalcRulePack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects missing or non-Money fixedCost', () => {
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: null as unknown as Money,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: { amountMinor: 1000, currency: 'USD' } as unknown as Money,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects negative fixedCost', () => {
      const negativeFc = Money.of(-500, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: negativeFc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects non-safe-integer fixedCost amount', () => {
      const unsafeFc = Object.create(Money.prototype);
      Object.assign(unsafeFc, { amountMinor: Number.MAX_SAFE_INTEGER + 10, currency: 'USD' });
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: unsafeFc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects missing or unsupported currency', () => {
      const fc = Money.of(1000, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: '' as unknown as CurrencyCode,
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'XYZ' as unknown as CurrencyCode,
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects currency mismatch between fixedCost and input currency', () => {
      const eurFc = Money.of(1000, 'EUR');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: eurFc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcCurrencyMismatchError);
    });

    it('rejects currency mismatch between input and Rule Pack', () => {
      const eurFc = Money.of(1000, 'EUR');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: eurFc,
            listPriceMinor: 999,
            currency: 'EUR',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack, // USD pack
        ),
      ).toThrow(CalcCurrencyMismatchError);
    });

    it('rejects missing, invalid, or mismatched format', () => {
      const fc = Money.of(1000, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: '' as unknown as BookFormat,
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'audiobook' as unknown as BookFormat,
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'paperback', // mismatched
            pages: 200,
          },
          ebookPack,
        ),
      ).toThrow(CalcFormatMismatchError);
    });

    it('rejects missing, non-safe-integer, or negative listPriceMinor', () => {
      const fc = Money.of(1000, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: undefined as unknown as number,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999.5,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: -100,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid costVariancePercent', () => {
      const fc = Money.of(1000, 'USD');
      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
            costVariancePercent: 10 as unknown as string, // non-string
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1',
            costVariancePercent: '-105', // < -100%
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });
  });

  describe('2. Exact Ceiling Division Semantics', () => {
    it('returns exact quotient when contribution exactly divides fixed cost', () => {
      // Unit contribution = 669 cents. Fixed cost = 669,000 cents.
      const fc = Money.of(669000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      expect(result.units).toBe(1000);
      expect(result.revenue.amountMinor).toBe(999000);
      expect(result.trace.division).toEqual({
        numerator: '669000',
        denominator: '669',
        quotient: '1000',
        remainder: '0',
        isExactDivision: true,
        ceilingApplied: false,
      });
    });

    it('applies ceiling (+1) when non-zero remainder exists', () => {
      // Unit contribution = 669 cents. Fixed cost = 669,001 cents.
      // 669,001 / 669 = 1000 remainder 1 -> ceil = 1001.
      const fc = Money.of(669001, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      expect(result.units).toBe(1001);
      expect(result.revenue.amountMinor).toBe(1001 * 999);
      expect(result.trace.division).toEqual({
        numerator: '669001',
        denominator: '669',
        quotient: '1000',
        remainder: '1',
        isExactDivision: false,
        ceilingApplied: true,
      });
    });

    it('handles one minor unit below exact divisibility', () => {
      // Unit contribution = 669 cents. Fixed cost = 668,999 cents.
      // 668,999 / 669 = 999 remainder 668 -> ceil = 1000.
      const fc = Money.of(668999, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      expect(result.units).toBe(1000);
      expect(result.trace.division?.remainder).toBe('668');
      expect(result.trace.division?.ceilingApplied).toBe(true);
    });

    it('handles fixed cost of exactly 1 minor unit', () => {
      const fc = Money.of(1, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      // 1 / 669 = 0 remainder 1 -> ceil = 1 unit
      expect(result.units).toBe(1);
      expect(result.revenue.amountMinor).toBe(999);
      expect(result.trace.division?.isExactDivision).toBe(false);
      expect(result.trace.division?.ceilingApplied).toBe(true);
    });

    it('handles minimum positive unit contribution of 1 minor unit', () => {
      // Paperback US v1: listPrice 500, pages = 24.
      // Royalty = 500 * 0.60 = 300 cents.
      // Base print cost: 100.
      // If we use cost variance to make print cost exactly 299 cents:
      // 100 * (1 + V/100) = 299 -> V = 199%
      const fc = Money.of(1000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 500,
          currency: 'USD',
          format: 'paperback',
          pages: 24,
          costVariancePercent: '199',
        },
        paperbackV1Pack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      // Royalty = 300, Cost = 299, Unit contribution = 1 cent.
      expect(result.unitContributionMinor).toBe(1);
      // 1000 / 1 = 1000 units.
      expect(result.units).toBe(1000);
      expect(result.revenue.amountMinor).toBe(500 * 1000);
      expect(result.trace.division?.isExactDivision).toBe(true);
    });
  });

  describe('3. Zero and Negative Contribution Boundaries (Unreachable)', () => {
    it('returns reachable: false with ZERO_CONTRIBUTION when contribution is zero', () => {
      // List price $3.00, fileSizeMb 14.0 -> royalty 210, cost 210, contribution 0
      const fc = Money.of(50000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 300,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '14.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(false);
      if (result.reachable) return;
      expect(result.unreachableReason).toBe('ZERO_CONTRIBUTION');
      expect(result.fixedCost.amountMinor).toBe(50000);
      expect(result.unitContributionMinor).toBe(0);
      expect(result.exactUnitContribution.isZero()).toBe(true);
      expect(result.trace.result.reachable).toBe(false);
      expect(result.trace.result.unreachableReason).toBe('ZERO_CONTRIBUTION');
    });

    it('returns reachable: false with NEGATIVE_CONTRIBUTION when contribution is negative', () => {
      // List price $3.00, fileSizeMb 15.0 -> royalty 210, cost 225, contribution -15
      const fc = Money.of(50000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 300,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '15.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(false);
      if (result.reachable) return;
      expect(result.unreachableReason).toBe('NEGATIVE_CONTRIBUTION');
      expect(result.unitContributionMinor).toBe(-15);
      expect(result.exactUnitContribution.isPositive()).toBe(false);
      expect(result.trace.result.reachable).toBe(false);
      expect(result.trace.result.unreachableReason).toBe('NEGATIVE_CONTRIBUTION');
    });

    it('treats zero fixed cost with negative contribution as unreachable', () => {
      const fc = Money.of(0, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 300,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '15.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(false);
      if (result.reachable) return;
      expect(result.unreachableReason).toBe('NEGATIVE_CONTRIBUTION');
      expect(result.fixedCost.amountMinor).toBe(0);
    });

    it('treats zero fixed cost with zero contribution as unreachable', () => {
      const fc = Money.of(0, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 300,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '14.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(false);
      if (result.reachable) return;
      expect(result.unreachableReason).toBe('ZERO_CONTRIBUTION');
    });
  });

  describe('4. Zero Fixed Cost Boundary with Positive Contribution', () => {
    it('returns 0 units and 0 revenue when fixed cost is zero and contribution is positive', () => {
      const fc = Money.of(0, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.reachable).toBe(true);
      if (!result.reachable) return;
      expect(result.units).toBe(0);
      expect(result.revenue.amountMinor).toBe(0);
      expect(result.fixedCost.amountMinor).toBe(0);
      expect(result.trace.division).toEqual({
        numerator: '0',
        denominator: '1',
        quotient: '0',
        remainder: '0',
        isExactDivision: true,
        ceilingApplied: false,
      });
    });
  });

  describe('5. Safe Integer Overflow Guards', () => {
    it('throws CalcOverflowError when break-even units exceed Number.MAX_SAFE_INTEGER', () => {
      // Under per_total with tiny positive rational contribution:
      // Hardcover Global: listPriceMinor 1500 (royalty 750), 125 pages (print cost 600 + 50*3 = 750).
      // Cost variance "-0.0001" yields varied cost 749.99925 cents.
      // Exact contribution is 750 - 749.99925 = 3 / 4000 cents (> 0).
      // Fixed cost at MAX_SAFE_INTEGER produces units = ceil(MAX_SAFE_INTEGER * 4000 / 3) > MAX_SAFE_INTEGER.
      const largeFc = Money.of(Number.MAX_SAFE_INTEGER, 'EUR');
      expect(() => {
        calculateBreakEven(
          {
            fixedCost: largeFc,
            listPriceMinor: 1500,
            currency: 'EUR',
            format: 'hardcover',
            pages: 125,
            costVariancePercent: '-0.0001',
          },
          hardcoverPack,
        );
      }).toThrow(CalcOverflowError);
    });

    it('throws CalcOverflowError when varied unit cost overflows safe integer bounds under per_unit', () => {
      const fc = Money.of(1000, 'USD');
      expect(() => {
        calculateBreakEven(
          {
            fixedCost: fc,
            listPriceMinor: 999,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1.0',
            costVariancePercent: '1000000000000000000',
          },
          ebookPack,
        );
      }).toThrow(CalcOverflowError);
    });

    it('throws CalcOverflowError when break-even revenue exceeds Number.MAX_SAFE_INTEGER', () => {
      // Units are within safe integer, but listPriceMinor * units exceeds MAX_SAFE_INTEGER
      // e.g. Fixed cost high, list price at max limit 50,000 cents ($500.00)
      const largeFc = Money.of(Number.MAX_SAFE_INTEGER - 100, 'EUR');
      expect(() => {
        calculateBreakEven(
          {
            fixedCost: largeFc,
            listPriceMinor: 50000,
            currency: 'EUR',
            format: 'hardcover',
            pages: 75, // contribution is 650
          },
          hardcoverPack,
        );
      }).toThrow(CalcOverflowError);
    });
  });

  describe('6. Trace Audit and Deep Immutability', () => {
    it('generates a frozen deterministic trace matching P-01 and P-04', () => {
      const fc = Money.of(100000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.trace)).toBe(true);
      expect(Object.isFrozen(result.trace.input)).toBe(true);
      expect(Object.isFrozen(result.trace.unitContribution)).toBe(true);
      expect(Object.isFrozen(result.trace.division)).toBe(true);
      expect(Object.isFrozen(result.trace.steps)).toBe(true);

      // Verify trace fields
      expect(result.trace.engineVersion).toBe('0.1.0');
      expect(result.trace.rulePackRef.packKey).toBe('TEST_EBOOK_STANDARD');
      expect(result.trace.input.fixedCostMinor).toBe(100000);
      expect(result.trace.input.listPriceMinor).toBe(999);
      expect(result.trace.unitContribution.unitContributionMinor).toBe(669);
    });

    it('includes illustrative disclaimer', () => {
      const fc = Money.of(100000, 'USD');
      const result = calculateBreakEven(
        {
          fixedCost: fc,
          listPriceMinor: 999,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '2.0',
        },
        ebookPack,
      );

      expect(result.isIllustrative).toBe(true);
      expect(result.disclaimer).toContain('Illustrative scenarios');
    });
  });
});
