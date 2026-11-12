import { describe, expect, it } from 'vitest';
import {
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
} from '../errors/calc-error';
import { calculatePerUnitEconomics } from './per-unit-calc';
import type { CalcRulePack, PerUnitCalcInput } from './types';

describe('Per-Unit Economics Calculation Engine', () => {
  const sampleEbookPack: CalcRulePack = Object.freeze({
    id: '550e8400-e29b-41d4-a716-446655440001',
    packKey: 'TEST_EBOOK_STANDARD',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'ebook',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    content: Object.freeze({
      rounding: Object.freeze({
        mode: 'round_half_up',
        point: 'per_unit',
      }),
      royalty: Object.freeze({
        tiers: Object.freeze([
          Object.freeze({
            name: 'standard_low',
            minPriceMinor: 99,
            maxPriceMinor: 298,
            royaltyRateDecimal: '0.35',
          }),
          Object.freeze({
            name: 'standard_mid',
            minPriceMinor: 299,
            maxPriceMinor: 999,
            royaltyRateDecimal: '0.70',
          }),
          Object.freeze({
            name: 'standard_high',
            minPriceMinor: 1000,
            maxPriceMinor: null,
            royaltyRateDecimal: '0.35',
          }),
        ]),
      }),
      printCost: null,
      deliveryCost: Object.freeze({
        costPerMbMinor: 15,
      }),
      limits: Object.freeze({
        minListPriceMinor: 99,
        maxListPriceMinor: 20000,
        minPages: null,
        maxPages: null,
      }),
    }),
    contentHash: 'sha256:bd44021f5ba36887d329b32f56455855ed1152b9a951e64e1f04dea4eaeeb627',
  });

  const samplePaperbackPack: CalcRulePack = Object.freeze({
    id: '550e8400-e29b-41d4-a716-446655440002',
    packKey: 'TEST_PAPERBACK_US',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'paperback',
    currency: 'USD',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    content: Object.freeze({
      rounding: Object.freeze({
        mode: 'round_half_even',
        point: 'per_unit',
      }),
      royalty: Object.freeze({
        tiers: Object.freeze([
          Object.freeze({
            name: 'fixed_60',
            minPriceMinor: 0,
            maxPriceMinor: null,
            royaltyRateDecimal: '0.60',
          }),
        ]),
      }),
      printCost: Object.freeze({
        baseCostMinor: 100,
        costPerPageMinor: 2,
        pageThreshold: 24,
      }),
      deliveryCost: null,
      limits: Object.freeze({
        minListPriceMinor: 500,
        maxListPriceMinor: 25000,
        minPages: 24,
        maxPages: 800,
      }),
    }),
    contentHash: 'sha256:2402d7652e25333aa0a7fe1e752ef91f9f7e523192599156a911568811867e50',
  });

  const samplePaperbackV2Pack: CalcRulePack = Object.freeze({
    id: '550e8400-e29b-41d4-a716-446655440003',
    packKey: 'TEST_PAPERBACK_US',
    version: '2.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'paperback',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    content: Object.freeze({
      rounding: Object.freeze({
        mode: 'round_half_even',
        point: 'per_unit',
      }),
      royalty: Object.freeze({
        tiers: Object.freeze([
          Object.freeze({
            name: 'fixed_60',
            minPriceMinor: 0,
            maxPriceMinor: null,
            royaltyRateDecimal: '0.60',
          }),
        ]),
      }),
      printCost: Object.freeze({
        baseCostMinor: 120,
        costPerPageMinor: 2,
        pageThreshold: 24,
      }),
      deliveryCost: null,
      limits: Object.freeze({
        minListPriceMinor: 500,
        maxListPriceMinor: 25000,
        minPages: 24,
        maxPages: 800,
      }),
    }),
    contentHash: 'sha256:f9b8875ff012e1702ac54a3c38fde1477e14c8d9674a11823c61db94f4ea3d15',
  });

  const sampleHardcoverPack: CalcRulePack = Object.freeze({
    id: '550e8400-e29b-41d4-a716-446655440004',
    packKey: 'TEST_HARDCOVER_GLOBAL',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_GLOBAL',
    format: 'hardcover',
    currency: 'EUR',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    content: Object.freeze({
      rounding: Object.freeze({
        mode: 'round_down',
        point: 'per_total',
      }),
      royalty: Object.freeze({
        tiers: Object.freeze([
          Object.freeze({
            name: 'fixed_50',
            minPriceMinor: 0,
            maxPriceMinor: null,
            royaltyRateDecimal: '0.50',
          }),
        ]),
      }),
      printCost: Object.freeze({
        baseCostMinor: 600,
        costPerPageMinor: 3,
        pageThreshold: 75,
      }),
      deliveryCost: null,
      limits: Object.freeze({
        minListPriceMinor: 1500,
        maxListPriceMinor: 50000,
        minPages: 75,
        maxPages: 1000,
      }),
    }),
    contentHash: 'sha256:dca0b1b6c0343c957cae70130e0b1c266c6c1af06e25d337f959cf8c59012f51',
  });

  describe('Input Validation & Boundary Checking', () => {
    it('rejects non-object input', () => {
      // @ts-expect-error Testing invalid runtime input
      expect(() => calculatePerUnitEconomics(null, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );
      // @ts-expect-error Testing invalid runtime input
      expect(() => calculatePerUnitEconomics('not-an-object', sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects invalid rule pack', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      // @ts-expect-error Testing invalid runtime rule pack
      expect(() => calculatePerUnitEconomics(input, null)).toThrow(CalcInputValidationError);
      // @ts-expect-error Testing invalid runtime rule pack
      expect(() => calculatePerUnitEconomics(input, {})).toThrow(CalcInputValidationError);
    });

    it('rejects missing or invalid currency', () => {
      const inputMissing = {
        listPriceMinor: 299,
        format: 'ebook',
        fileSizeMb: '1',
      } as unknown as PerUnitCalcInput;
      expect(() => calculatePerUnitEconomics(inputMissing, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );

      const inputInvalid = {
        listPriceMinor: 299,
        currency: 'INVALID_CURRENCY',
        format: 'ebook',
        fileSizeMb: '1',
      } as unknown as PerUnitCalcInput;
      expect(() => calculatePerUnitEconomics(inputInvalid, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects currency mismatch between input and rule pack', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'EUR',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() => calculatePerUnitEconomics(input, sampleEbookPack)).toThrow(
        CalcCurrencyMismatchError,
      );
    });

    it('rejects missing or invalid format', () => {
      const inputMissing = {
        listPriceMinor: 299,
        currency: 'USD',
        fileSizeMb: '1',
      } as unknown as PerUnitCalcInput;
      expect(() => calculatePerUnitEconomics(inputMissing, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );

      const inputInvalid = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'audiobook',
        fileSizeMb: '1',
      } as unknown as PerUnitCalcInput;
      expect(() => calculatePerUnitEconomics(inputInvalid, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects format mismatch between input and rule pack', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 200,
      };
      expect(() => calculatePerUnitEconomics(input, sampleEbookPack)).toThrow(
        CalcFormatMismatchError,
      );
    });

    it('rejects invalid listPriceMinor types (non-number, float, NaN, unsafe integer, negative)', () => {
      const base = { currency: 'USD', format: 'ebook', fileSizeMb: '1' };

      expect(() =>
        calculatePerUnitEconomics(
          { ...base, listPriceMinor: '299' as unknown as number },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics({ ...base, listPriceMinor: 299.99 }, sampleEbookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics({ ...base, listPriceMinor: NaN }, sampleEbookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics(
          { ...base, listPriceMinor: Number.MAX_SAFE_INTEGER + 10 },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics({ ...base, listPriceMinor: -100 }, sampleEbookPack),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects list price outside Rule Pack limits', () => {
      const inputBelow: PerUnitCalcInput = {
        listPriceMinor: 50,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() => calculatePerUnitEconomics(inputBelow, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );

      const inputAbove: PerUnitCalcInput = {
        listPriceMinor: 25000,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() => calculatePerUnitEconomics(inputAbove, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects ebook with pages or missing/invalid fileSizeMb', () => {
      const withPages: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
        pages: 150,
      };
      expect(() => calculatePerUnitEconomics(withPages, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );

      const missingFileSize: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
      };
      expect(() => calculatePerUnitEconomics(missingFileSize, sampleEbookPack)).toThrow(
        CalcInputValidationError,
      );

      // Non-string
      expect(() =>
        calculatePerUnitEconomics(
          {
            listPriceMinor: 299,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: 1 as unknown as string,
          },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Empty string
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Whitespace
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '   ' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Negative size
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '-1' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '-0.5' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Zero size
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '0' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '0.00' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Non-numeric
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: 'abc' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // NaN / Infinity
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: 'NaN' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: 'Infinity' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Scientific notation
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '1e5' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Malformed decimal
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '.5' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '1.' },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Excessively long input string (> 50 chars)
      expect(() =>
        calculatePerUnitEconomics(
          { listPriceMinor: 299, currency: 'USD', format: 'ebook', fileSizeMb: '1'.repeat(55) },
          sampleEbookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects physical format with fileSizeMb or missing/invalid pages', () => {
      const withFileSize: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 200,
        fileSizeMb: '2',
      };
      expect(() => calculatePerUnitEconomics(withFileSize, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );

      const missingPages: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
      };
      expect(() => calculatePerUnitEconomics(missingPages, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );

      const invalidPages: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 0,
      };
      expect(() => calculatePerUnitEconomics(invalidPages, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );

      const pagesBelowMin: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 10, // minPages is 24
      };
      expect(() => calculatePerUnitEconomics(pagesBelowMin, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );

      const pagesAboveMax: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 1000, // maxPages is 800
      };
      expect(() => calculatePerUnitEconomics(pagesAboveMax, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('throws NoMatchingRoyaltyTierError when list price falls into an uncovered tier gap', () => {
      const packWithGaps: CalcRulePack = {
        ...sampleEbookPack,
        content: {
          ...sampleEbookPack.content,
          royalty: {
            tiers: [
              {
                name: 'tier1',
                minPriceMinor: 100,
                maxPriceMinor: 200,
                royaltyRateDecimal: '0.35',
              },
              {
                name: 'tier2',
                minPriceMinor: 300,
                maxPriceMinor: null,
                royaltyRateDecimal: '0.70',
              },
            ],
          },
          limits: {
            minListPriceMinor: 100,
            maxListPriceMinor: 500,
            minPages: null,
            maxPages: null,
          },
        },
      };

      const inputInGap: PerUnitCalcInput = {
        listPriceMinor: 250, // Between 200 and 300
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };

      expect(() => calculatePerUnitEconomics(inputInGap, packWithGaps)).toThrow(
        NoMatchingRoyaltyTierError,
      );
    });

    it('throws RulePackIncompatibleError if physical format is missing printCost policy', () => {
      const defectivePhysicalPack: CalcRulePack = {
        ...samplePaperbackPack,
        content: {
          ...samplePaperbackPack.content,
          printCost: null,
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 200,
      };

      expect(() => calculatePerUnitEconomics(input, defectivePhysicalPack)).toThrow(
        RulePackIncompatibleError,
      );
    });

    it('handles ebook with null deliveryCost policy (0 delivery cost)', () => {
      const freeDeliveryEbookPack: CalcRulePack = {
        ...sampleEbookPack,
        content: {
          ...sampleEbookPack.content,
          deliveryCost: null,
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '5',
      };

      const result = calculatePerUnitEconomics(input, freeDeliveryEbookPack);
      expect(result.applicableCost?.amountMinor).toBe(0);
      expect(result.costBreakdown.kind).toBe('none');
      expect(result.costBreakdown.totalCostMinor).toBe(0);
      expect(result.grossRoyalty?.amountMinor).toBe(209);
      expect(result.netContribution?.amountMinor).toBe(209);
    });
  });

  describe('Financial Calculations & Rounding Points', () => {
    it('calculates ebook per_unit economics with round_half_up correctly', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '2',
      };

      const result = calculatePerUnitEconomics(input, sampleEbookPack);

      expect(result.format).toBe('ebook');
      expect(result.currency).toBe('USD');
      expect(result.listPrice.amountMinor).toBe(499);
      expect(result.royaltyTier.name).toBe('standard_mid');
      expect(result.royaltyTier.royaltyRateDecimal).toBe('0.70');

      // 499 * 0.70 = 349.30 -> rounds to 349
      expect(result.exactGrossRoyalty.toDecimalString()).toBe('349.3');
      expect(result.grossRoyalty?.amountMinor).toBe(349);

      // 2 MB * 15 = 30 cents
      expect(result.applicableCost?.amountMinor).toBe(30);
      expect(result.costBreakdown.totalCostMinor).toBe(30);

      // Net contribution: 349 - 30 = 319 cents
      expect(result.netContribution?.amountMinor).toBe(319);
      expect(result.exactNetContribution.toDecimalString()).toBe('319.3');
      expect(result.isRounded).toBe(true);
    });

    it('calculates proportional fractional ebook delivery costs accurately for all owner-approved examples', () => {
      // Example A: 0.5 MB -> 15 * 0.5 = 7.5 cents -> rounds to 8 cents under round_half_up
      // Gross royalty 499 * 70% = 349.3 -> rounds to 349. Net contribution = 349 - 8 = 341 cents ($3.41)
      const res05 = calculatePerUnitEconomics(
        { listPriceMinor: 499, currency: 'USD', format: 'ebook', fileSizeMb: '0.5' },
        sampleEbookPack,
      );
      expect(res05.exactApplicableCost.numerator.toString()).toBe('15');
      expect(res05.exactApplicableCost.denominator.toString()).toBe('2');
      expect(res05.exactApplicableCost.toDecimalString()).toBe('7.5');
      expect(res05.applicableCost?.amountMinor).toBe(8);
      expect(res05.grossRoyalty?.amountMinor).toBe(349);
      expect(res05.netContribution?.amountMinor).toBe(341);
      expect(res05.exactNetContribution.toDecimalString()).toBe('341.8');

      // Example B: 2.1 MB -> 15 * 2.1 = 31.5 cents -> rounds to 32 cents
      // Net contribution = 349 - 32 = 317 cents ($3.17)
      const res21 = calculatePerUnitEconomics(
        { listPriceMinor: 499, currency: 'USD', format: 'ebook', fileSizeMb: '2.1' },
        sampleEbookPack,
      );
      expect(res21.exactApplicableCost.numerator.toString()).toBe('63');
      expect(res21.exactApplicableCost.denominator.toString()).toBe('2');
      expect(res21.exactApplicableCost.toDecimalString()).toBe('31.5');
      expect(res21.applicableCost?.amountMinor).toBe(32);
      expect(res21.grossRoyalty?.amountMinor).toBe(349);
      expect(res21.netContribution?.amountMinor).toBe(317);
      expect(res21.exactNetContribution.toDecimalString()).toBe('317.8');

      // Example C: 1.25 MB -> 15 * 1.25 = 18.75 cents -> rounds to 19 cents
      // Net contribution = 349 - 19 = 330 cents ($3.30)
      const res125 = calculatePerUnitEconomics(
        { listPriceMinor: 499, currency: 'USD', format: 'ebook', fileSizeMb: '1.25' },
        sampleEbookPack,
      );
      expect(res125.exactApplicableCost.numerator.toString()).toBe('75');
      expect(res125.exactApplicableCost.denominator.toString()).toBe('4');
      expect(res125.exactApplicableCost.toDecimalString()).toBe('18.75');
      expect(res125.applicableCost?.amountMinor).toBe(19);
      expect(res125.grossRoyalty?.amountMinor).toBe(349);
      expect(res125.netContribution?.amountMinor).toBe(330);
      expect(res125.exactNetContribution.toDecimalString()).toBe('330.55');

      // Example D: 0.1 MB -> 15 * 0.1 = 1.5 cents -> rounds to 2 cents
      // Net contribution = 349 - 2 = 347 cents ($3.47)
      const res01 = calculatePerUnitEconomics(
        { listPriceMinor: 499, currency: 'USD', format: 'ebook', fileSizeMb: '0.1' },
        sampleEbookPack,
      );
      expect(res01.exactApplicableCost.toDecimalString()).toBe('1.5');
      expect(res01.applicableCost?.amountMinor).toBe(2);
      expect(res01.netContribution?.amountMinor).toBe(347);

      // Example E: 10.25 MB -> 15 * 10.25 = 153.75 cents -> rounds to 154 cents
      // Net contribution = 349 - 154 = 195 cents ($1.95)
      const res1025 = calculatePerUnitEconomics(
        { listPriceMinor: 499, currency: 'USD', format: 'ebook', fileSizeMb: '10.25' },
        sampleEbookPack,
      );
      expect(res1025.exactApplicableCost.toDecimalString()).toBe('153.75');
      expect(res1025.applicableCost?.amountMinor).toBe(154);
      expect(res1025.netContribution?.amountMinor).toBe(195);
    });

    it('calculates paperback per_unit economics with round_half_even correctly', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 1499,
        currency: 'USD',
        format: 'paperback',
        pages: 200,
      };

      const result = calculatePerUnitEconomics(input, samplePaperbackPack);

      expect(result.listPrice.amountMinor).toBe(1499);
      expect(result.royaltyTier.name).toBe('fixed_60');
      // 1499 * 0.60 = 899.40 -> rounds to 899
      expect(result.exactGrossRoyalty.toDecimalString()).toBe('899.4');
      expect(result.grossRoyalty?.amountMinor).toBe(899);

      // Print cost: 100 base + (200 - 24) * 2 = 100 + 352 = 452
      expect(result.applicableCost?.amountMinor).toBe(452);
      expect(result.costBreakdown.excessPages).toBe(176);
      expect(result.costBreakdown.perPageCostMinor).toBe(352);
      expect(result.costBreakdown.totalCostMinor).toBe(452);

      // Contribution: 899 - 452 = 447
      expect(result.netContribution?.amountMinor).toBe(447);
      expect(result.isRounded).toBe(true);
    });

    it('calculates paperback v1 print cost at 108 pages and 500 pages correctly with threshold 24', () => {
      // 108 pages: base 100 + (108 - 24) * 2 = 100 + 168 = 268 minor units
      const result108 = calculatePerUnitEconomics(
        { listPriceMinor: 1499, currency: 'USD', format: 'paperback', pages: 108 },
        samplePaperbackPack,
      );
      expect(result108.applicableCost?.amountMinor).toBe(268);
      expect(result108.costBreakdown.excessPages).toBe(84);
      expect(result108.netContribution?.amountMinor).toBe(631);

      // 500 pages: base 100 + (500 - 24) * 2 = 100 + 952 = 1052 minor units
      const result500 = calculatePerUnitEconomics(
        { listPriceMinor: 1999, currency: 'USD', format: 'paperback', pages: 500 },
        samplePaperbackPack,
      );
      expect(result500.applicableCost?.amountMinor).toBe(1052);
      expect(result500.costBreakdown.excessPages).toBe(476);
      expect(result500.netContribution?.amountMinor).toBe(147);

      // Print cost with pageThreshold omitted (defaults to 0)
      const zeroThresholdPack: CalcRulePack = {
        ...samplePaperbackPack,
        content: {
          ...samplePaperbackPack.content,
          printCost: {
            baseCostMinor: 100,
            costPerPageMinor: 2,
            pageThreshold: undefined,
          },
        },
      };
      const resultZeroThreshold = calculatePerUnitEconomics(
        { listPriceMinor: 1499, currency: 'USD', format: 'paperback', pages: 100 },
        zeroThresholdPack,
      );
      // threshold defaults to 0, so excessPages = 100, cost = 100 + 100 * 2 = 300
      expect(resultZeroThreshold.costBreakdown.pageThreshold).toBe(0);
      expect(resultZeroThreshold.costBreakdown.excessPages).toBe(100);
      expect(resultZeroThreshold.applicableCost?.amountMinor).toBe(300);
    });

    it('calculates paperback v2 print cost at 100 pages and 150 pages correctly with base 120 and threshold 24', () => {
      // 100 pages: base 120 + (100 - 24) * 2 = 120 + 152 = 272 minor units
      const result100 = calculatePerUnitEconomics(
        { listPriceMinor: 1499, currency: 'USD', format: 'paperback', pages: 100 },
        samplePaperbackV2Pack,
      );
      expect(result100.applicableCost?.amountMinor).toBe(272);
      expect(result100.costBreakdown.excessPages).toBe(76);
      expect(result100.netContribution?.amountMinor).toBe(627);

      // 150 pages: base 120 + (150 - 24) * 2 = 120 + 252 = 372 minor units
      const result150 = calculatePerUnitEconomics(
        { listPriceMinor: 1499, currency: 'USD', format: 'paperback', pages: 150 },
        samplePaperbackV2Pack,
      );
      expect(result150.applicableCost?.amountMinor).toBe(372);
      expect(result150.costBreakdown.excessPages).toBe(126);
      expect(result150.netContribution?.amountMinor).toBe(527);
    });

    it('calculates hardcover print cost at 100 pages, 300 pages (€35.00), and 500 pages (€15.00) correctly', () => {
      // 100 pages: base 600 + (100 - 75) * 3 = 600 + 75 = 675 minor units (€6.75)
      const result100 = calculatePerUnitEconomics(
        { listPriceMinor: 2500, currency: 'EUR', format: 'hardcover', pages: 100 },
        sampleHardcoverPack,
      );
      expect(result100.applicableCost?.amountMinor).toBe(675);
      expect(result100.costBreakdown.excessPages).toBe(25);
      expect(result100.exactNetContribution.toDecimalString()).toBe('575');
      expect(result100.grossRoyalty).toBeNull();
      expect(result100.netContribution).toBeNull();

      // 300 pages at €35.00: royalty 3500 * 50% = 1750 cents (€17.50)
      // cost: 600 + (300 - 75) * 3 = 600 + 675 = 1275 cents (€12.75)
      // contribution: 1750 - 1275 = 475 cents (€4.75)
      const result300 = calculatePerUnitEconomics(
        { listPriceMinor: 3500, currency: 'EUR', format: 'hardcover', pages: 300 },
        sampleHardcoverPack,
      );
      expect(result300.exactGrossRoyalty.toDecimalString()).toBe('1750');
      expect(result300.applicableCost?.amountMinor).toBe(1275);
      expect(result300.exactNetContribution.toDecimalString()).toBe('475');
      expect(result300.grossRoyalty).toBeNull();
      expect(result300.netContribution).toBeNull();

      // 500 pages at €15.00: royalty 1500 * 50% = 750 cents (€7.50)
      // cost: 600 + (500 - 75) * 3 = 600 + 1275 = 1875 cents (€18.75)
      // contribution: 750 - 1875 = -1125 cents (€-11.25)
      const result500 = calculatePerUnitEconomics(
        { listPriceMinor: 1500, currency: 'EUR', format: 'hardcover', pages: 500 },
        sampleHardcoverPack,
      );
      expect(result500.exactGrossRoyalty.toDecimalString()).toBe('750');
      expect(result500.applicableCost?.amountMinor).toBe(1875);
      expect(result500.exactNetContribution.toDecimalString()).toBe('-1125');
      expect(result500.grossRoyalty).toBeNull();
      expect(result500.netContribution).toBeNull();
    });

    it('evaluates exact mathematical half-cent tie ($3.05 * 0.70 = 213.5 cents -> 214 cents under round_half_up)', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 305,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };

      const result = calculatePerUnitEconomics(input, sampleEbookPack);

      expect(result.exactGrossRoyalty.numerator.toString()).toBe('427');
      expect(result.exactGrossRoyalty.denominator.toString()).toBe('2');
      expect(result.exactGrossRoyalty.toDecimalString()).toBe('213.5');
      // Under round_half_up, 213.5 rounds away from zero to 214
      expect(result.grossRoyalty?.amountMinor).toBe(214);
      expect(result.applicableCost?.amountMinor).toBe(15);
      expect(result.netContribution?.amountMinor).toBe(199);
    });

    it('preserves exact unrounded rational amounts under per_total rounding for physical book', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 2999,
        currency: 'EUR',
        format: 'hardcover',
        pages: 200,
      };

      const result = calculatePerUnitEconomics(input, sampleHardcoverPack);

      expect(result.rounding.point).toBe('per_total');
      expect(result.rounding.mode).toBe('round_down');

      // Gross royalty: 2999 * 0.50 = 1499.50 cents
      expect(result.exactGrossRoyalty.toDecimalString()).toBe('1499.5');
      // Under per_total, per-unit rounded gross royalty Money is null
      expect(result.grossRoyalty).toBeNull();

      // Print cost is exact integer: 600 + (200 - 75) * 3 = 975 cents
      expect(result.applicableCost?.amountMinor).toBe(975);

      // Contribution exact: 1499.50 - 975 = 524.50 cents
      expect(result.exactNetContribution.toDecimalString()).toBe('524.5');
      expect(result.netContribution).toBeNull();
      expect(result.isRounded).toBe(false);
    });

    it('defers rounding and preserves fractional delivery cost under test-only per_total ebook pack', () => {
      const perTotalEbookPack: CalcRulePack = {
        ...sampleEbookPack,
        id: '999e8400-e29b-41d4-a716-446655440099',
        packKey: 'TEST_EBOOK_PER_TOTAL',
        content: {
          ...sampleEbookPack.content,
          rounding: {
            mode: 'round_half_up',
            point: 'per_total',
          },
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '0.5',
      };

      const result = calculatePerUnitEconomics(input, perTotalEbookPack);

      // Exact gross royalty: 499 * 0.70 = 349.3 cents (3493/10)
      expect(result.exactGrossRoyalty.numerator.toString()).toBe('3493');
      expect(result.exactGrossRoyalty.denominator.toString()).toBe('10');
      expect(result.exactGrossRoyalty.toDecimalString()).toBe('349.3');

      // Exact delivery cost: 15 * 0.5 = 7.5 cents (15/2)
      expect(result.exactApplicableCost.numerator.toString()).toBe('15');
      expect(result.exactApplicableCost.denominator.toString()).toBe('2');
      expect(result.exactApplicableCost.toDecimalString()).toBe('7.5');

      // Exact contribution: 349.3 - 7.5 = 341.8 cents (1709/5)
      expect(result.exactNetContribution.numerator.toString()).toBe('1709');
      expect(result.exactNetContribution.denominator.toString()).toBe('5');
      expect(result.exactNetContribution.toDecimalString()).toBe('341.8');

      // No premature rounding
      expect(result.grossRoyalty).toBeNull();
      expect(result.applicableCost).toBeNull();
      expect(result.netContribution).toBeNull();
      expect(result.isRounded).toBe(false);
      expect(result.costBreakdown.totalCostMinor).toBeNull();
      expect(result.costBreakdown.roundedCostMinor).toBeNull();
      expect(result.trace.finalSummary.grossRoyaltyMinor).toBeNull();
      expect(result.trace.finalSummary.applicableCostMinor).toBeNull();
      expect(result.trace.finalSummary.netContributionMinor).toBeNull();
    });

    it('rejects invalid $4.00 paperback input (below minListPriceMinor 500)', () => {
      const invalidLowPrice: PerUnitCalcInput = {
        listPriceMinor: 400,
        currency: 'USD',
        format: 'paperback',
        pages: 300,
      };

      expect(() => calculatePerUnitEconomics(invalidLowPrice, samplePaperbackPack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('verifies paperback minimum price boundary conditions ($4.00 reject, $4.50 reject, $4.99 reject, $5.00 accept, $5.01 accept)', () => {
      const basePaperbackInput = {
        currency: 'USD',
        format: 'paperback' as const,
        pages: 300,
      };

      // 1. $4.00 (400 minor units): reject (below minListPriceMinor 500)
      expect(() =>
        calculatePerUnitEconomics(
          { ...basePaperbackInput, listPriceMinor: 400 },
          samplePaperbackPack,
        ),
      ).toThrow(CalcInputValidationError);

      // 2. $4.50 (450 minor units): reject (below minListPriceMinor 500)
      expect(() =>
        calculatePerUnitEconomics(
          { ...basePaperbackInput, listPriceMinor: 450 },
          samplePaperbackPack,
        ),
      ).toThrow(CalcInputValidationError);

      // 3. $4.99 (499 minor units): reject (one cent below minListPriceMinor 500)
      expect(() =>
        calculatePerUnitEconomics(
          { ...basePaperbackInput, listPriceMinor: 499 },
          samplePaperbackPack,
        ),
      ).toThrow(CalcInputValidationError);

      // 4. $5.00 (500 minor units): accept (exact minimum boundary)
      const res500 = calculatePerUnitEconomics(
        { ...basePaperbackInput, listPriceMinor: 500 },
        samplePaperbackPack,
      );
      expect(res500.grossRoyalty?.amountMinor).toBe(300);
      expect(res500.applicableCost?.amountMinor).toBe(652);
      expect(res500.netContribution?.amountMinor).toBe(-352);

      // 5. $5.01 (501 minor units): accept (one cent above minimum boundary)
      const res501 = calculatePerUnitEconomics(
        { ...basePaperbackInput, listPriceMinor: 501 },
        samplePaperbackPack,
      );
      expect(res501.exactGrossRoyalty.toDecimalString()).toBe('300.6');
      expect(res501.grossRoyalty?.amountMinor).toBe(301);
      expect(res501.applicableCost?.amountMinor).toBe(652);
      expect(res501.exactNetContribution.toDecimalString()).toBe('-351.4');
      expect(res501.netContribution?.amountMinor).toBe(-351);
    });

    it('evaluates valid $5.00 paperback negative contribution at 300 pages (Decision D)', () => {
      const validNegative: PerUnitCalcInput = {
        listPriceMinor: 500,
        currency: 'USD',
        format: 'paperback',
        pages: 300,
      };

      const result = calculatePerUnitEconomics(validNegative, samplePaperbackPack);

      // Royalty: 500 * 0.60 = 300 cents
      expect(result.grossRoyalty?.amountMinor).toBe(300);

      // Print cost: 100 + (300 - 24) * 2 = 100 + 552 = 652 cents
      expect(result.applicableCost?.amountMinor).toBe(652);
      expect(result.costBreakdown.totalCostMinor).toBe(652);

      // Net contribution: 300 - 652 = -352 cents (USD -3.52)
      expect(result.netContribution?.amountMinor).toBe(-352);
      expect(result.netContribution?.currency).toBe('USD');
      expect(result.exactNetContribution.toDecimalString()).toBe('-352');
      expect(result.isRounded).toBe(true);
    });

    it('evaluates all 4 approved rounding modes correctly under Decision A', () => {
      const makePackWithMode = (
        mode: 'round_half_up' | 'round_half_even' | 'round_down' | 'round_up',
      ): CalcRulePack => ({
        ...sampleEbookPack,
        id: `pack-${mode}`,
        content: {
          ...sampleEbookPack.content,
          rounding: {
            mode,
            point: 'per_unit',
          },
        },
      });

      // round_half_up: exact tie 213.5 -> 214; delivery cost 7.5 -> 8
      const rHalfUp = calculatePerUnitEconomics(
        { listPriceMinor: 305, currency: 'USD', format: 'ebook', fileSizeMb: '0.5' },
        makePackWithMode('round_half_up'),
      );
      expect(rHalfUp.grossRoyalty?.amountMinor).toBe(214); // 213.5 -> 214
      expect(rHalfUp.applicableCost?.amountMinor).toBe(8); // 7.5 -> 8
      expect(rHalfUp.netContribution?.amountMinor).toBe(214 - 8);

      // round_half_even: 213.5 has odd whole part (213) -> rounds to even 214; 7.5 has odd whole part (7) -> 8
      const rHalfEven = calculatePerUnitEconomics(
        { listPriceMinor: 305, currency: 'USD', format: 'ebook', fileSizeMb: '0.5' },
        makePackWithMode('round_half_even'),
      );
      expect(rHalfEven.grossRoyalty?.amountMinor).toBe(214); // 213.5 -> 214 (even)
      expect(rHalfEven.applicableCost?.amountMinor).toBe(8); // 7.5 -> 8 (even)

      // round_down: truncates towards zero. 213.5 -> 213; 7.5 -> 7
      const rDown = calculatePerUnitEconomics(
        { listPriceMinor: 305, currency: 'USD', format: 'ebook', fileSizeMb: '0.5' },
        makePackWithMode('round_down'),
      );
      expect(rDown.grossRoyalty?.amountMinor).toBe(213);
      expect(rDown.applicableCost?.amountMinor).toBe(7);
      expect(rDown.netContribution?.amountMinor).toBe(213 - 7);

      // round_up: away from zero. 213.5 -> 214; 7.5 -> 8
      const rUp = calculatePerUnitEconomics(
        { listPriceMinor: 305, currency: 'USD', format: 'ebook', fileSizeMb: '0.5' },
        makePackWithMode('round_up'),
      );
      expect(rUp.grossRoyalty?.amountMinor).toBe(214);
      expect(rUp.applicableCost?.amountMinor).toBe(8);
      expect(rUp.netContribution?.amountMinor).toBe(214 - 8);
    });

    it('correctly handles negative net contribution in Money value object', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 99,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '10', // 10 MB * 15 = 150 cents
      };

      const result = calculatePerUnitEconomics(input, sampleEbookPack);

      // Gross royalty = 99 * 0.35 = 34.65 -> 35 cents
      expect(result.grossRoyalty?.amountMinor).toBe(35);
      expect(result.applicableCost?.amountMinor).toBe(150);

      // Net contribution = 35 - 150 = -115 cents
      expect(result.netContribution?.amountMinor).toBe(-115);
      expect(result.netContribution?.isNegative()).toBe(true);
      expect(result.exactNetContribution.toDecimalString()).toBe('-115.35');
    });

    it('throws CalcOverflowError when delivery cost calculation overflows safe integer bounds', () => {
      const overflowDeliveryPack: CalcRulePack = {
        ...sampleEbookPack,
        content: {
          ...sampleEbookPack.content,
          deliveryCost: {
            costPerMbMinor: 1000,
          },
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '999999999999999999999',
      };

      expect(() => calculatePerUnitEconomics(input, overflowDeliveryPack)).toThrow(
        CalcOverflowError,
      );
    });

    it('throws CalcOverflowError when print cost calculation overflows safe integer bounds', () => {
      const overflowPrintPack: CalcRulePack = {
        ...samplePaperbackPack,
        content: {
          ...samplePaperbackPack.content,
          printCost: {
            baseCostMinor: 100,
            costPerPageMinor: 1000000000,
            pageThreshold: 24,
          },
          limits: {
            minListPriceMinor: 500,
            maxListPriceMinor: 25000,
            minPages: 24,
            maxPages: null,
          },
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: 1299,
        currency: 'USD',
        format: 'paperback',
        pages: 1000000000,
      };

      expect(() => calculatePerUnitEconomics(input, overflowPrintPack)).toThrow(CalcOverflowError);
    });

    it('throws CalcOverflowError when rounded gross royalty exceeds safe integer range', () => {
      const hugeRoyaltyPack: CalcRulePack = {
        ...sampleEbookPack,
        content: {
          ...sampleEbookPack.content,
          royalty: {
            tiers: [
              {
                name: 'huge_tier',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '2.00',
              },
            ],
          },
          limits: {
            minListPriceMinor: 0,
            maxListPriceMinor: Number.MAX_SAFE_INTEGER,
            minPages: null,
            maxPages: null,
          },
        },
      };

      const input: PerUnitCalcInput = {
        listPriceMinor: Number.MAX_SAFE_INTEGER,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };

      expect(() => calculatePerUnitEconomics(input, hugeRoyaltyPack)).toThrow(CalcOverflowError);
    });

    it('enforces immutability: returns frozen objects and does not mutate inputs', () => {
      const input: PerUnitCalcInput = {
        listPriceMinor: 299,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      const inputCopy = JSON.parse(JSON.stringify(input));
      const packCopy = JSON.parse(JSON.stringify(sampleEbookPack));

      const result = calculatePerUnitEconomics(input, sampleEbookPack);

      expect(input).toEqual(inputCopy);
      expect(sampleEbookPack).toEqual(packCopy);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.costBreakdown)).toBe(true);
      expect(Object.isFrozen(result.royaltyTier)).toBe(true);
      expect(Object.isFrozen(result.rounding)).toBe(true);
      expect(Object.isFrozen(result.trace)).toBe(true);
    });
  });
});
