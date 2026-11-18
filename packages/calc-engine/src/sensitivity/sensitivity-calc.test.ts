import { SCENARIO_DISCLAIMER_TEXT, toCanonicalJson } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import {
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
} from '../errors/calc-error';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario } from '../scenarios/scenario-calc';
import type { SingleScenarioInput } from '../scenarios/types';
import { calculateSensitivity } from './sensitivity-calc';
import {
  isSensitivityDriver,
  SUPPORTED_SENSITIVITY_DRIVERS,
  type SensitivityDriverConfig,
  type SensitivityInput,
} from './types';

describe('calculateSensitivity — Unit, Boundary, and Contract Tests', () => {
  const ebookPack = ebookPackJson as unknown as CalcRulePack;
  const paperbackV1Pack = paperbackV1PackJson as unknown as CalcRulePack;

  describe('1. Input Validation and Guard Clauses', () => {
    it('validates supported driver type guard', () => {
      expect(isSensitivityDriver('units')).toBe(true);
      expect(isSensitivityDriver('listPriceMinor')).toBe(true);
      expect(isSensitivityDriver('costVariancePercent')).toBe(true);
      expect(isSensitivityDriver('pages')).toBe(false);
      expect(isSensitivityDriver('currency')).toBe(false);
      expect(isSensitivityDriver(null)).toBe(false);
      expect(isSensitivityDriver(undefined)).toBe(false);
      expect(isSensitivityDriver(123)).toBe(false);
      expect(SUPPORTED_SENSITIVITY_DRIVERS).toEqual([
        'units',
        'listPriceMinor',
        'costVariancePercent',
      ]);
    });

    it('rejects non-object input', () => {
      expect(() => calculateSensitivity(null as unknown as SensitivityInput, ebookPack)).toThrow(
        CalcInputValidationError,
      );
      expect(() =>
        calculateSensitivity(undefined as unknown as SensitivityInput, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSensitivity('string' as unknown as SensitivityInput, ebookPack),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid Rule Pack', () => {
      const validInput: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 10 }],
      };
      expect(() => calculateSensitivity(validInput, null as unknown as CalcRulePack)).toThrow(
        CalcInputValidationError,
      );
      expect(() => calculateSensitivity(validInput, {} as unknown as CalcRulePack)).toThrow(
        CalcInputValidationError,
      );
    });

    it('rejects non-object baseline', () => {
      const input = {
        baseline: null,
        drivers: [{ driver: 'units', perturbation: 10 }],
      } as unknown as SensitivityInput;
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcInputValidationError);
    });

    it('rejects missing or empty drivers array', () => {
      expect(() =>
        calculateSensitivity(
          {
            baseline: {
              units: 100,
              listPriceMinor: 499,
              currency: 'USD',
              format: 'ebook',
              fileSizeMb: '1',
            },
            drivers: null as unknown as SensitivityDriverConfig[],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: {
              units: 100,
              listPriceMinor: 499,
              currency: 'USD',
              format: 'ebook',
              fileSizeMb: '1',
            },
            drivers: [],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects non-object driver config item', () => {
      expect(() =>
        calculateSensitivity(
          {
            baseline: {
              units: 100,
              listPriceMinor: 499,
              currency: 'USD',
              format: 'ebook',
              fileSizeMb: '1',
            },
            drivers: [null as unknown as SensitivityDriverConfig],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects unsupported driver names', () => {
      expect(() =>
        calculateSensitivity(
          {
            baseline: {
              units: 100,
              listPriceMinor: 499,
              currency: 'USD',
              format: 'ebook',
              fileSizeMb: '1',
            },
            drivers: [{ driver: 'unsupported' as unknown as 'units', perturbation: 10 }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects duplicate driver declarations', () => {
      expect(() =>
        calculateSensitivity(
          {
            baseline: {
              units: 100,
              listPriceMinor: 499,
              currency: 'USD',
              format: 'ebook',
              fileSizeMb: '1',
            },
            drivers: [
              { driver: 'units', perturbation: 10 },
              { driver: 'units', perturbation: 20 },
            ],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid perturbation for units (non-integer, zero, negative, NaN, unsafe integer)', () => {
      const base = {
        units: 100,
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'units', perturbation: 0 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'units', perturbation: -10 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'units', perturbation: 10.5 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'units', perturbation: NaN }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'units', perturbation: Infinity }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'units', perturbation: Number.MAX_SAFE_INTEGER + 10 }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid perturbation for listPriceMinor', () => {
      const base = {
        units: 100,
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'listPriceMinor', perturbation: 0 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'listPriceMinor', perturbation: -50 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'listPriceMinor', perturbation: 50.25 }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          { baseline: base, drivers: [{ driver: 'listPriceMinor', perturbation: NaN }] },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'listPriceMinor', perturbation: Number.MAX_SAFE_INTEGER + 10 }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid perturbation for costVariancePercent (non-string, zero, negative, whitespace, malformed)', () => {
      const base = {
        units: 100,
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };
      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [
              {
                driver: 'costVariancePercent',
                perturbation: 10 as unknown as string,
              },
            ],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'costVariancePercent', perturbation: '0' }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'costVariancePercent', perturbation: '0.0' }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'costVariancePercent', perturbation: '-5' }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'costVariancePercent', perturbation: ' 10 ' }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSensitivity(
          {
            baseline: base,
            drivers: [{ driver: 'costVariancePercent', perturbation: 'invalid' }],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });
  });

  describe('2. Perturbation Boundary Failures (Explicit Errors without Silently Clamping)', () => {
    it('fails when lower units perturbation yields negative units', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 50,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 100 }], // 50 - 100 = -50
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcInputValidationError);
    });

    it('fails when lower price perturbation falls below minListPriceMinor', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 500, // minListPriceMinor for paperback v1 is 500
          currency: 'USD',
          format: 'paperback',
          pages: 100,
        },
        drivers: [{ driver: 'listPriceMinor', perturbation: 50 }], // 500 - 50 = 450 < 500
      };
      expect(() => calculateSensitivity(input, paperbackV1Pack)).toThrow(CalcInputValidationError);
    });

    it('fails when upper price perturbation exceeds maxListPriceMinor', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 20000, // maxListPriceMinor for ebook is 20000
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'listPriceMinor', perturbation: 100 }], // 20000 + 100 = 20100 > 20000
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcInputValidationError);
    });

    it('fails when lower cost variance perturbation falls below -100%', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 499,
          costVariancePercent: '-95',
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'costVariancePercent', perturbation: '10' }], // -95 - 10 = -105% < -100%
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcInputValidationError);
    });

    it('fails when perturbed units addition overflows safe integer bounds', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: Number.MAX_SAFE_INTEGER - 50 }],
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcOverflowError);
    });

    it('fails when perturbed list price addition overflows safe integer bounds', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 10,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'listPriceMinor', perturbation: Number.MAX_SAFE_INTEGER - 50 }],
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcOverflowError);
    });

    it('fails when baseline currency mismatches Rule Pack', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 499,
          currency: 'EUR', // Rule pack is USD
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 10 }],
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcCurrencyMismatchError);
    });

    it('fails when baseline format mismatches Rule Pack', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 100,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'paperback', // Rule pack is ebook
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 10 }],
      };
      expect(() => calculateSensitivity(input, ebookPack)).toThrow(CalcFormatMismatchError);
    });
  });

  describe('3. Analytic Sign Invariants (Economic Direction Verification)', () => {
    it('verifies that increasing units increases total net contribution when unit contribution > 0', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 100 }],
      };
      const result = calculateSensitivity(input, ebookPack);
      const unitsResult = result.rankedDrivers[0]!;

      expect(unitsResult.lowerValue).toBe(400);
      expect(unitsResult.upperValue).toBe(600);
      expect(unitsResult.deltaLower.amountMinor).toBeLessThan(0);
      expect(unitsResult.deltaUpper.amountMinor).toBeGreaterThan(0);
      expect(unitsResult.lowerNetContribution.amountMinor).toBeLessThan(
        result.baseline.netContribution.amountMinor,
      );
      expect(unitsResult.upperNetContribution.amountMinor).toBeGreaterThan(
        result.baseline.netContribution.amountMinor,
      );
    });

    it('verifies that increasing list price increases net contribution within an unchanged royalty tier', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'listPriceMinor', perturbation: 100 }], // 399 and 599 both in 70% tier
      };
      const result = calculateSensitivity(input, ebookPack);
      const priceResult = result.rankedDrivers[0]!;

      expect(priceResult.deltaLower.amountMinor).toBeLessThan(0);
      expect(priceResult.deltaUpper.amountMinor).toBeGreaterThan(0);
      expect(priceResult.lowerNetContribution.amountMinor).toBeLessThan(
        result.baseline.netContribution.amountMinor,
      );
      expect(priceResult.upperNetContribution.amountMinor).toBeGreaterThan(
        result.baseline.netContribution.amountMinor,
      );
    });

    it('verifies that increasing cost variance reduces net contribution when production cost > 0', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'costVariancePercent', perturbation: '10' }],
      };
      const result = calculateSensitivity(input, ebookPack);
      const costResult = result.rankedDrivers[0]!;

      // Lower cost variance (negative variance) reduces cost, so contribution increases: deltaLower > 0
      expect(costResult.deltaLower.amountMinor).toBeGreaterThan(0);
      // Upper cost variance (positive variance) increases cost, so contribution decreases: deltaUpper < 0
      expect(costResult.deltaUpper.amountMinor).toBeLessThan(0);
      expect(costResult.lowerNetContribution.amountMinor).toBeGreaterThan(
        result.baseline.netContribution.amountMinor,
      );
      expect(costResult.upperNetContribution.amountMinor).toBeLessThan(
        result.baseline.netContribution.amountMinor,
      );
    });
  });

  describe('4. Deterministic Ranking, Tie-Breaking, and Order Independence', () => {
    it('ranks strictly descending by impact score when scores are unequal', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [
          { driver: 'costVariancePercent', perturbation: '10' }, // impact 1,000
          { driver: 'units', perturbation: 100 }, // impact 33,400
          { driver: 'listPriceMinor', perturbation: 100 }, // impact 35,000
        ],
      };
      const result = calculateSensitivity(input, ebookPack);

      expect(result.rankedDrivers[0]!.driver).toBe('listPriceMinor');
      expect(result.rankedDrivers[0]!.rank).toBe(1);
      expect(result.rankedDrivers[0]!.impactScoreMinor).toBe(35000);

      expect(result.rankedDrivers[1]!.driver).toBe('units');
      expect(result.rankedDrivers[1]!.rank).toBe(2);
      expect(result.rankedDrivers[1]!.impactScoreMinor).toBe(33400);

      expect(result.rankedDrivers[2]!.driver).toBe('costVariancePercent');
      expect(result.rankedDrivers[2]!.rank).toBe(3);
      expect(result.rankedDrivers[2]!.impactScoreMinor).toBe(1000);
    });

    it('breaks ties deterministically using UTF-16 code-point comparison regardless of declaration order', () => {
      // With units = 0, both listPriceMinor and costVariancePercent have impact score 0
      const input1: SensitivityInput = {
        baseline: {
          units: 0,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [
          { driver: 'listPriceMinor', perturbation: 100 },
          { driver: 'costVariancePercent', perturbation: '10' },
        ],
      };
      const result1 = calculateSensitivity(input1, ebookPack);

      expect(result1.rankedDrivers[0]!.impactScoreMinor).toBe(0);
      expect(result1.rankedDrivers[1]!.impactScoreMinor).toBe(0);

      // 'costVariancePercent' < 'listPriceMinor' in code points
      expect(result1.rankedDrivers[0]!.driver).toBe('costVariancePercent');
      expect(result1.rankedDrivers[0]!.rank).toBe(1);
      expect(result1.rankedDrivers[1]!.driver).toBe('listPriceMinor');
      expect(result1.rankedDrivers[1]!.rank).toBe(2);

      // Verify reverse input declaration order produces the exact same tie-broken ranking
      const input2: SensitivityInput = {
        baseline: {
          units: 0,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [
          { driver: 'costVariancePercent', perturbation: '10' },
          { driver: 'listPriceMinor', perturbation: 100 },
        ],
      };
      const result2 = calculateSensitivity(input2, ebookPack);

      expect(result2.rankedDrivers[0]!.driver).toBe('costVariancePercent');
      expect(result2.rankedDrivers[0]!.rank).toBe(1);
      expect(result2.rankedDrivers[1]!.driver).toBe('listPriceMinor');
      expect(result2.rankedDrivers[1]!.rank).toBe(2);

      // Verify tieBrokenByDriverName flag in trace
      expect(result1.trace.rankingDecisions[0]!.tieBrokenByDriverName).toBe(true);
      expect(result1.trace.rankingDecisions[1]!.tieBrokenByDriverName).toBe(true);
    });

    it('produces identical ranked output order regardless of input driver declaration order', () => {
      const base = {
        units: 500,
        listPriceMinor: 499,
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };

      const perm1: SensitivityInput = {
        baseline: base,
        drivers: [
          { driver: 'units', perturbation: 100 },
          { driver: 'listPriceMinor', perturbation: 100 },
          { driver: 'costVariancePercent', perturbation: '10' },
        ],
      };

      const perm2: SensitivityInput = {
        baseline: base,
        drivers: [
          { driver: 'costVariancePercent', perturbation: '10' },
          { driver: 'units', perturbation: 100 },
          { driver: 'listPriceMinor', perturbation: 100 },
        ],
      };

      const perm3: SensitivityInput = {
        baseline: base,
        drivers: [
          { driver: 'listPriceMinor', perturbation: 100 },
          { driver: 'costVariancePercent', perturbation: '10' },
          { driver: 'units', perturbation: 100 },
        ],
      };

      const res1 = calculateSensitivity(perm1, ebookPack);
      const res2 = calculateSensitivity(perm2, ebookPack);
      const res3 = calculateSensitivity(perm3, ebookPack);

      const order1 = res1.rankedDrivers.map((d) => d.driver);
      const order2 = res2.rankedDrivers.map((d) => d.driver);
      const order3 = res3.rankedDrivers.map((d) => d.driver);

      expect(order1).toEqual(['listPriceMinor', 'units', 'costVariancePercent']);
      expect(order2).toEqual(order1);
      expect(order3).toEqual(order1);
    });

    it('is bit-for-bit deterministic across repeated invocations', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [
          { driver: 'units', perturbation: 100 },
          { driver: 'listPriceMinor', perturbation: 100 },
          { driver: 'costVariancePercent', perturbation: '10' },
        ],
      };

      const res1 = calculateSensitivity(input, ebookPack);
      const res2 = calculateSensitivity(input, ebookPack);

      expect(toCanonicalJson(res1)).toBe(toCanonicalJson(res2));
    });
  });

  describe('5. Audit Trace and Metadata Completeness', () => {
    it('records comprehensive calculation trace with engine version, inputs, and step traces', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [
          { driver: 'units', perturbation: 100 },
          { driver: 'listPriceMinor', perturbation: 100 },
        ],
      };
      const result = calculateSensitivity(input, ebookPack);

      expect(result.trace.engineVersion).toBe('0.1.0');
      expect(result.trace.rulePackRef.packKey).toBe('TEST_EBOOK_STANDARD');
      expect(result.trace.rulePackRef.version).toBe('1.0.0');
      expect(result.trace.rulePackRef.contentHash).toBe(ebookPack.contentHash);
      expect(result.trace.baselineInput.units).toBe(500);
      expect(result.trace.baselineInput.listPriceMinor).toBe(499);
      expect(result.trace.unchangedInputs.format).toBe('ebook');
      expect(result.trace.unchangedInputs.currency).toBe('USD');
      expect(result.trace.rankingMetric).toBe('total_net_contribution');
      expect(result.trace.driverEvaluations.length).toBe(2);
      expect(result.trace.declaredDrivers).toEqual([
        { driver: 'units', perturbation: 100 },
        { driver: 'listPriceMinor', perturbation: 100 },
      ]);
      expect(result.trace.driverEvaluations[0]!.driver).toBe('units');
      expect(result.trace.driverEvaluations[0]!.perturbation).toBe(100);
      expect(result.trace.driverEvaluations[1]!.driver).toBe('listPriceMinor');
      expect(result.trace.driverEvaluations[1]!.perturbation).toBe(100);
      expect(result.trace.rankingDecisions.length).toBe(2);
      expect(result.trace.rankedDriverOrder).toEqual(['listPriceMinor', 'units']);
      expect(result.isIllustrative).toBe(true);
      expect(result.disclaimer).toBe(SCENARIO_DISCLAIMER_TEXT);
    });

    it('enforces deep immutability across all returned objects and collections', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        drivers: [{ driver: 'units', perturbation: 100 }],
      };
      const result = calculateSensitivity(input, ebookPack);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.rankedDrivers)).toBe(true);
      expect(Object.isFrozen(result.rankedDrivers[0])).toBe(true);
      expect(Object.isFrozen(result.trace)).toBe(true);
      expect(Object.isFrozen(result.trace.driverEvaluations)).toBe(true);
      expect(Object.isFrozen(result.trace.rankingDecisions)).toBe(true);

      // Attempting mutation in strict mode throws TypeError
      expect(() => {
        // @ts-expect-error mutating frozen object
        result.currency = 'EUR';
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error mutating frozen array
        result.rankedDrivers.push({} as unknown as (typeof result.rankedDrivers)[0]);
      }).toThrow(TypeError);
    });
  });

  describe('6. Agreement with calculateSingleScenario', () => {
    it('verifies that each driver lower and upper scenario matches independent calculateSingleScenario', () => {
      const input: SensitivityInput = {
        baseline: {
          units: 400,
          listPriceMinor: 1500,
          costVariancePercent: '5',
          currency: 'USD',
          format: 'paperback',
          pages: 200,
        },
        drivers: [
          { driver: 'units', perturbation: 50 },
          { driver: 'listPriceMinor', perturbation: 200 },
          { driver: 'costVariancePercent', perturbation: '10' },
        ],
      };
      const result = calculateSensitivity(input, paperbackV1Pack);

      for (const driverResult of result.rankedDrivers) {
        if (driverResult.driver === 'units') {
          const expectedLower = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 350,
              listPriceMinor: 1500,
              costVariancePercent: '5',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          const expectedUpper = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 450,
              listPriceMinor: 1500,
              costVariancePercent: '5',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          expect(driverResult.lowerScenario.netContribution.amountMinor).toBe(
            expectedLower.netContribution.amountMinor,
          );
          expect(driverResult.upperScenario.netContribution.amountMinor).toBe(
            expectedUpper.netContribution.amountMinor,
          );
        } else if (driverResult.driver === 'listPriceMinor') {
          const expectedLower = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 400,
              listPriceMinor: 1300,
              costVariancePercent: '5',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          const expectedUpper = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 400,
              listPriceMinor: 1700,
              costVariancePercent: '5',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          expect(driverResult.lowerScenario.netContribution.amountMinor).toBe(
            expectedLower.netContribution.amountMinor,
          );
          expect(driverResult.upperScenario.netContribution.amountMinor).toBe(
            expectedUpper.netContribution.amountMinor,
          );
        } else {
          // costVariancePercent
          const expectedLower = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 400,
              listPriceMinor: 1500,
              costVariancePercent: '-5',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          const expectedUpper = calculateSingleScenario(
            {
              scenarioName: 'base',
              units: 400,
              listPriceMinor: 1500,
              costVariancePercent: '15',
              currency: 'USD',
              format: 'paperback',
              pages: 200,
            },
            paperbackV1Pack,
          );
          expect(driverResult.lowerScenario.netContribution.amountMinor).toBe(
            expectedLower.netContribution.amountMinor,
          );
          expect(driverResult.upperScenario.netContribution.amountMinor).toBe(
            expectedUpper.netContribution.amountMinor,
          );
        }
      }
    });
  });

  describe('7. Complete Rounding Mode and Accumulation Point Matrix (8 Combinations)', () => {
    const modes = ['round_half_up', 'round_half_even', 'round_down', 'round_up'] as const;
    const points = ['per_unit', 'per_total'] as const;

    for (const point of points) {
      for (const mode of modes) {
        it(`evaluates sensitivity under ${point} with mode ${mode} matching calculateSingleScenario`, () => {
          const pack: CalcRulePack = {
            ...paperbackV1Pack,
            content: {
              ...paperbackV1Pack.content,
              rounding: { mode, point },
            },
          };

          const input: SensitivityInput = {
            baseline: {
              scenarioName: 'base',
              units: 300,
              listPriceMinor: 1000,
              costVariancePercent: '5',
              currency: 'USD',
              format: 'paperback',
              pages: 100,
            },
            drivers: [
              { driver: 'units', perturbation: 50 },
              { driver: 'listPriceMinor', perturbation: 100 },
              { driver: 'costVariancePercent', perturbation: '10' },
            ],
          };

          const result = calculateSensitivity(input, pack);

          // 1. Baseline matches calculateSingleScenario
          const expectedBaseline = calculateSingleScenario(
            { ...input.baseline, scenarioName: 'base' },
            pack,
          );
          expect(result.baseline.netContribution.amountMinor).toBe(
            expectedBaseline.netContribution.amountMinor,
          );

          // 2. Each driver lower and upper scenario matches independent calculateSingleScenario
          for (const driverRes of result.rankedDrivers) {
            let lowerInput: SingleScenarioInput;
            let upperInput: SingleScenarioInput;

            if (driverRes.driver === 'units') {
              lowerInput = { ...input.baseline, scenarioName: 'base', units: 300 - 50 };
              upperInput = { ...input.baseline, scenarioName: 'base', units: 300 + 50 };
            } else if (driverRes.driver === 'listPriceMinor') {
              lowerInput = { ...input.baseline, scenarioName: 'base', listPriceMinor: 1000 - 100 };
              upperInput = { ...input.baseline, scenarioName: 'base', listPriceMinor: 1000 + 100 };
            } else {
              lowerInput = { ...input.baseline, scenarioName: 'base', costVariancePercent: '-5' };
              upperInput = { ...input.baseline, scenarioName: 'base', costVariancePercent: '15' };
            }

            const indLower = calculateSingleScenario(lowerInput, pack);
            const indUpper = calculateSingleScenario(upperInput, pack);

            expect(driverRes.lowerNetContribution.amountMinor).toBe(
              indLower.netContribution.amountMinor,
            );
            expect(driverRes.upperNetContribution.amountMinor).toBe(
              indUpper.netContribution.amountMinor,
            );
            expect(driverRes.deltaLower.amountMinor).toBe(
              indLower.netContribution.amountMinor - expectedBaseline.netContribution.amountMinor,
            );
            expect(driverRes.deltaUpper.amountMinor).toBe(
              indUpper.netContribution.amountMinor - expectedBaseline.netContribution.amountMinor,
            );
            expect(driverRes.impactScoreMinor).toBe(
              Math.max(
                Math.abs(
                  indLower.netContribution.amountMinor -
                    expectedBaseline.netContribution.amountMinor,
                ),
                Math.abs(
                  indUpper.netContribution.amountMinor -
                    expectedBaseline.netContribution.amountMinor,
                ),
              ),
            );
          }
        });
      }
    }
  });
});
