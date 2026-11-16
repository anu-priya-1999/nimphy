import { describe, expect, it } from 'vitest';
import { SCENARIO_DISCLAIMER_TEXT } from '@nimphy/domain';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import { CalcInputValidationError, CalcOverflowError } from '../errors/calc-error';
import { Rational } from '../math/rational';
import { calculatePerUnitEconomics } from '../per-unit/per-unit-calc';
import type { CalcRulePack } from '../per-unit/types';
import {
  calculateSingleScenario,
  calculateTriadScenarios,
  deepFreeze,
  evaluateScenarioOrdering,
} from './scenario-calc';
import type { CaseScenariosInput, SingleScenarioInput } from './types';

describe('Scenario Calculation Engine (STEP-006 Unit & Validation Suite)', () => {
  const ebookPack = ebookPackJson as unknown as CalcRulePack;
  const paperbackV1Pack = paperbackV1PackJson as unknown as CalcRulePack;
  const hardcoverPack = hardcoverPackJson as unknown as CalcRulePack;

  const validEbookSingle: SingleScenarioInput = {
    scenarioName: 'base',
    units: 500,
    listPriceMinor: 499,
    costVariancePercent: '0',
    currency: 'USD',
    format: 'ebook',
    fileSizeMb: '1',
  };

  const validTriadInput: CaseScenariosInput = {
    scenarios: {
      low: { units: 100, listPriceMinor: 299, costVariancePercent: '10' },
      base: { units: 400, listPriceMinor: 499, costVariancePercent: '0' },
      high: { units: 1200, listPriceMinor: 999, costVariancePercent: '-15' },
    },
    currency: 'USD',
    format: 'ebook',
    fileSizeMb: '1',
  };

  describe('Single Scenario Input Validation', () => {
    it('rejects null or non-object input', () => {
      expect(() =>
        calculateSingleScenario(null as unknown as SingleScenarioInput, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario('not an object' as unknown as SingleScenarioInput, ebookPack),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects invalid scenario name', () => {
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, scenarioName: 'medium' as unknown as 'base' },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects missing or invalid units', () => {
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, units: undefined as unknown as number },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() => calculateSingleScenario({ ...validEbookSingle, units: -10 }, ebookPack)).toThrow(
        CalcInputValidationError,
      );

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, units: 10.5 }, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() => calculateSingleScenario({ ...validEbookSingle, units: NaN }, ebookPack)).toThrow(
        CalcInputValidationError,
      );

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, units: Infinity }, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, units: Number.MAX_SAFE_INTEGER + 10 },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects missing or invalid listPriceMinor', () => {
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, listPriceMinor: undefined as unknown as number },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, listPriceMinor: -1 }, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, listPriceMinor: 499.5 }, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, listPriceMinor: NaN }, ebookPack),
      ).toThrow(CalcInputValidationError);
    });

    it('rejects listPriceMinor out of Rule Pack bounds', () => {
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, listPriceMinor: 50 }, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, listPriceMinor: 25000 }, ebookPack),
      ).toThrow(CalcInputValidationError);
    });

    it('validates costVariancePercent: enforces exact decimal string, rejects numbers and null, accepts -100%, and defaults omitted to zero', () => {
      // Rejection of JSON numeric values
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: 10 as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: 0 as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: -101 as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: NaN as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Rejection of explicit null
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: null as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Rejection of non-string types
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: true as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: {} as unknown as string },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Empty, whitespace, excessively long strings rejected
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '   ' }, ebookPack),
      ).toThrow(CalcInputValidationError);

      // Leading or trailing whitespace strictly rejected
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: ' 10 ' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '10 ' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: ' 10' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '\t10' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '\n10' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: '1'.repeat(55) },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Malformed strings and scientific notation rejected
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: 'invalid' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '1e5' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '1E-2' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '10.5.2' }, ebookPack),
      ).toThrow(CalcInputValidationError);

      // Values below -100% rejected
      expect(() =>
        calculateSingleScenario({ ...validEbookSingle, costVariancePercent: '-105' }, ebookPack),
      ).toThrow(CalcInputValidationError);
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, costVariancePercent: '-100.0001' },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // -100% accepted (reduces applicable cost to 0)
      const resMinus100 = calculateSingleScenario(
        { ...validEbookSingle, costVariancePercent: '-100' },
        ebookPack,
      );
      expect(resMinus100.applicableCost.amountMinor).toBe(0);

      // Omitted value defaults to zero
      const resOmitted = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: 500,
          listPriceMinor: 499,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        ebookPack,
      );
      expect(resOmitted.trace.input.costVariancePercent).toBe('0');
      expect(
        resOmitted.exactApplicableCostVaried.equals(
          resOmitted.perUnitEconomics.exactApplicableCost,
        ),
      ).toBe(true);
    });

    it('detects integer overflow for astronomical unit sales', () => {
      expect(() =>
        calculateSingleScenario(
          { ...validEbookSingle, units: 100_000_000, listPriceMinor: 20000 },
          ebookPack,
        ),
      ).not.toThrow();

      // Overflow safe integer on revenue / total royalty
      expect(() =>
        calculateSingleScenario(
          {
            ...validEbookSingle,
            units: 9007199254740991, // Number.MAX_SAFE_INTEGER
            listPriceMinor: 20000,
          },
          ebookPack,
        ),
      ).toThrow(CalcOverflowError);

      // Overflow on astronomical cost variance percent
      expect(() =>
        calculateSingleScenario(
          {
            ...validEbookSingle,
            units: 10,
            costVariancePercent: '99999999999999999999',
          },
          ebookPack,
        ),
      ).toThrow(CalcOverflowError);

      // Overflow on aggregate cost under per_unit (paperback: $5 list price, 10 trillion units, 800 pages)
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 10_000_000_000_000,
            listPriceMinor: 500,
            costVariancePercent: '0',
            currency: 'USD',
            format: 'paperback',
            pages: 800,
          },
          paperbackV1Pack,
        ),
      ).toThrow(CalcOverflowError);

      // Overflow on aggregate cost under per_total (hardcover: €15 list price, 5 trillion units, 1000 pages, +100% cost variance)
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 5_000_000_000_000,
            listPriceMinor: 1500,
            costVariancePercent: '100',
            currency: 'EUR',
            format: 'hardcover',
            pages: 1000,
          },
          hardcoverPack,
        ),
      ).toThrow(CalcOverflowError);
    });
  });

  describe('Zero Units Sold ($Q = 0$)', () => {
    it('produces exact zero totals for Q = 0', () => {
      const result = calculateSingleScenario({ ...validEbookSingle, units: 0 }, ebookPack);

      expect(result.units).toBe(0);
      expect(result.revenue.amountMinor).toBe(0);
      expect(result.grossRoyalty.amountMinor).toBe(0);
      expect(result.applicableCost.amountMinor).toBe(0);
      expect(result.netContribution.amountMinor).toBe(0);
      expect(result.exactTotalRoyalty.isZero()).toBe(true);
      expect(result.exactTotalCost.isZero()).toBe(true);
      expect(result.exactTotalContribution.isZero()).toBe(true);
      expect(result.isIllustrative).toBe(true);
    });
  });

  describe('Triad Scenario Calculation (Low, Base, High)', () => {
    it('calculates low, base, and high scenarios independently with distinct parameters', () => {
      const triad = calculateTriadScenarios(validTriadInput, ebookPack);

      // Verify independence
      expect(triad.scenarios.low.units).toBe(100);
      expect(triad.scenarios.low.listPrice.amountMinor).toBe(299);
      expect(triad.scenarios.low.revenue.amountMinor).toBe(29900);

      expect(triad.scenarios.base.units).toBe(400);
      expect(triad.scenarios.base.listPrice.amountMinor).toBe(499);
      expect(triad.scenarios.base.revenue.amountMinor).toBe(199600);

      expect(triad.scenarios.high.units).toBe(1200);
      expect(triad.scenarios.high.listPrice.amountMinor).toBe(999);
      expect(triad.scenarios.high.revenue.amountMinor).toBe(1198800);

      // Verify totals summary
      expect(triad.totals.low.netContribution.amountMinor).toBe(
        triad.scenarios.low.netContribution.amountMinor,
      );
      expect(triad.totals.base.netContribution.amountMinor).toBe(
        triad.scenarios.base.netContribution.amountMinor,
      );
      expect(triad.totals.high.netContribution.amountMinor).toBe(
        triad.scenarios.high.netContribution.amountMinor,
      );

      // Verify mandatory disclaimer
      expect(triad.disclaimer).toBe(
        'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
      );
      expect(triad.totals.low.isIllustrative).toBe(true);
      expect(triad.totals.base.isIllustrative).toBe(true);
      expect(triad.totals.high.isIllustrative).toBe(true);
    });

    it('rejects invalid triad inputs missing required scenario fields', () => {
      expect(() =>
        calculateTriadScenarios(null as unknown as CaseScenariosInput, ebookPack),
      ).toThrow(CalcInputValidationError);

      expect(() => calculateTriadScenarios({} as unknown as CaseScenariosInput, ebookPack)).toThrow(
        CalcInputValidationError,
      );

      expect(() =>
        calculateTriadScenarios(
          {
            ...validTriadInput,
            scenarios: {
              low: validTriadInput.scenarios.low,
              base: validTriadInput.scenarios.base,
            } as unknown as CaseScenariosInput['scenarios'],
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('enforces scenario name agreement with triad keys when scenarioName is explicitly provided', () => {
      // Explicit matching names succeed
      const matchingInput: CaseScenariosInput = {
        ...validTriadInput,
        scenarios: {
          low: { ...validTriadInput.scenarios.low, scenarioName: 'low' },
          base: { ...validTriadInput.scenarios.base, scenarioName: 'base' },
          high: { ...validTriadInput.scenarios.high, scenarioName: 'high' },
        },
      };
      const result = calculateTriadScenarios(matchingInput, ebookPack);
      expect(result.scenarios.low.scenarioName).toBe('low');
      expect(result.scenarios.base.scenarioName).toBe('base');
      expect(result.scenarios.high.scenarioName).toBe('high');

      // Mismatched low scenario name throws
      expect(() =>
        calculateTriadScenarios(
          {
            ...validTriadInput,
            scenarios: {
              ...validTriadInput.scenarios,
              low: { ...validTriadInput.scenarios.low, scenarioName: 'high' },
            },
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Mismatched base scenario name throws
      expect(() =>
        calculateTriadScenarios(
          {
            ...validTriadInput,
            scenarios: {
              ...validTriadInput.scenarios,
              base: { ...validTriadInput.scenarios.base, scenarioName: 'low' },
            },
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);

      // Mismatched high scenario name throws
      expect(() =>
        calculateTriadScenarios(
          {
            ...validTriadInput,
            scenarios: {
              ...validTriadInput.scenarios,
              high: { ...validTriadInput.scenarios.high, scenarioName: 'base' },
            },
          },
          ebookPack,
        ),
      ).toThrow(CalcInputValidationError);
    });

    it('confirms monotonic ordering when inputs are ordered economically', () => {
      const triad = calculateTriadScenarios(validTriadInput, ebookPack);

      expect(triad.ordering.areInputsMonotonicallyOrdered).toBe(true);
      expect(triad.ordering.areTotalsMonotonicallyOrdered).toBe(true);
      expect(triad.ordering.netContributionOrderingSatisfied).toBe(true);
      expect(triad.ordering.revenueOrderingSatisfied).toBe(true);

      expect(triad.totals.low.netContribution.amountMinor).toBeLessThanOrEqual(
        triad.totals.base.netContribution.amountMinor,
      );
      expect(triad.totals.base.netContribution.amountMinor).toBeLessThanOrEqual(
        triad.totals.high.netContribution.amountMinor,
      );
    });

    it('reports unordered user inputs faithfully without silently reordering them', () => {
      const invertedInput: CaseScenariosInput = {
        scenarios: {
          low: { units: 1000, listPriceMinor: 999 }, // Low has more units and higher price
          base: { units: 500, listPriceMinor: 499 },
          high: { units: 100, listPriceMinor: 299 },
        },
        currency: 'USD',
        format: 'ebook',
        fileSizeMb: '1',
      };

      const triad = calculateTriadScenarios(invertedInput, ebookPack);

      // Faithfully reflects inputs
      expect(triad.scenarios.low.units).toBe(1000);
      expect(triad.scenarios.high.units).toBe(100);

      // Ordering correctly reports false
      expect(triad.ordering.areInputsMonotonicallyOrdered).toBe(false);
      expect(triad.ordering.areTotalsMonotonicallyOrdered).toBe(false);
      expect(triad.ordering.netContributionOrderingSatisfied).toBe(false);
    });
  });

  describe('Scenario Ordering Evaluation Function', () => {
    it('evaluates scenario ordering helper correctly without input context', () => {
      const triad = calculateTriadScenarios(validTriadInput, ebookPack);
      const evalWithoutInputs = evaluateScenarioOrdering(triad);

      expect(evalWithoutInputs.areInputsMonotonicallyOrdered).toBe(false);
      expect(evalWithoutInputs.netContributionOrderingSatisfied).toBe(true);
      expect(evalWithoutInputs.revenueOrderingSatisfied).toBe(true);
      expect(evalWithoutInputs.areTotalsMonotonicallyOrdered).toBe(true);
    });
  });

  describe('Deep Immutability & Trace Auditability', () => {
    it('exhaustively enforces deep immutability across single-scenario results, traces, and per-unit structures', () => {
      const result = calculateSingleScenario(
        {
          scenarioName: 'low',
          units: 150,
          listPriceMinor: 1299,
          costVariancePercent: '20',
          currency: 'USD',
          format: 'paperback',
          pages: 150,
        },
        paperbackV1Pack,
      );

      // 1. The cost_variance_applied trace step is frozen
      const costVarianceStep = result.trace.steps.find((s) => s.step === 'cost_variance_applied');
      expect(costVarianceStep).toBeDefined();
      expect(Object.isFrozen(costVarianceStep)).toBe(true);

      // 2. The scenario_aggregation trace step is frozen
      const aggregationStep = result.trace.steps.find((s) => s.step === 'scenario_aggregation');
      expect(aggregationStep).toBeDefined();
      expect(Object.isFrozen(aggregationStep)).toBe(true);

      // 3. Every rounding-operation entry is frozen
      expect(result.trace.roundingOperations.length).toBeGreaterThan(0);
      for (const op of result.trace.roundingOperations) {
        expect(Object.isFrozen(op)).toBe(true);
      }

      // 4. Nested trace objects and arrays are frozen
      expect(Object.isFrozen(result.trace)).toBe(true);
      expect(Object.isFrozen(result.trace.steps)).toBe(true);
      expect(Object.isFrozen(result.trace.roundingOperations)).toBe(true);
      expect(Object.isFrozen(result.trace.input)).toBe(true);
      expect(Object.isFrozen(result.trace.perUnitSummary)).toBe(true);
      expect(Object.isFrozen(result.trace.perUnitSummary.exactGrossRoyalty)).toBe(true);
      expect(Object.isFrozen(result.trace.perUnitSummary.exactApplicableCost)).toBe(true);
      expect(Object.isFrozen(result.trace.perUnitSummary.exactApplicableCostVaried)).toBe(true);
      expect(Object.isFrozen(result.trace.aggregation)).toBe(true);
      expect(Object.isFrozen(result.trace.aggregation.exactTotalRoyalty)).toBe(true);
      expect(Object.isFrozen(result.trace.aggregation.exactTotalCost)).toBe(true);
      expect(Object.isFrozen(result.trace.aggregation.exactTotalContribution)).toBe(true);
      expect(Object.isFrozen(result.trace.rulePackRef)).toBe(true);

      // 5. Existing per-unit trace entries remain frozen
      expect(Object.isFrozen(result.perUnitEconomics)).toBe(true);
      expect(Object.isFrozen(result.perUnitEconomics.trace)).toBe(true);
      expect(Object.isFrozen(result.perUnitEconomics.trace.steps)).toBe(true);
      for (const step of result.perUnitEconomics.trace.steps) {
        expect(Object.isFrozen(step)).toBe(true);
      }
      for (const op of result.perUnitEconomics.trace.rounding.operations) {
        expect(Object.isFrozen(op)).toBe(true);
      }
      for (const step of result.trace.steps) {
        expect(Object.isFrozen(step)).toBe(true);
      }

      // 6. Attempts to mutate trace-step properties throw TypeError in strict mode
      expect(() => {
        (costVarianceStep as unknown as Record<string, unknown>).costVariancePercent = '99';
      }).toThrow(TypeError);
      expect(() => {
        (aggregationStep as unknown as Record<string, unknown>).quantity = 999;
      }).toThrow(TypeError);
      for (const step of result.trace.steps) {
        expect(() => {
          (step as unknown as Record<string, unknown>).step = 'mutated';
        }).toThrow(TypeError);
      }
      for (const step of result.perUnitEconomics.trace.steps) {
        expect(() => {
          (step as unknown as Record<string, unknown>).step = 'mutated';
        }).toThrow(TypeError);
      }

      // 7. Attempts to mutate every rounding-operation entry throw TypeError in strict mode
      for (const op of result.trace.roundingOperations) {
        expect(() => {
          (op as unknown as Record<string, unknown>).roundedMinor = 999999;
        }).toThrow(TypeError);
      }
      for (const op of result.perUnitEconomics.trace.rounding.operations) {
        expect(() => {
          (op as unknown as Record<string, unknown>).roundedMinor = 999999;
        }).toThrow(TypeError);
      }

      // 8. Attempts to mutate nested structures throw TypeError
      expect(() => {
        (
          result.trace.aggregation.exactTotalRoyalty as unknown as Record<string, unknown>
        ).numerator = '99';
      }).toThrow(TypeError);
      expect(() => {
        (
          result.trace.perUnitSummary.exactGrossRoyalty as unknown as Record<string, unknown>
        ).numerator = '99';
      }).toThrow(TypeError);
      expect(() => {
        (result.trace.input as unknown as Record<string, unknown>).units = 999;
      }).toThrow(TypeError);
      expect(() => {
        (result.trace.rulePackRef as unknown as Record<string, unknown>).version = '9.9.9';
      }).toThrow(TypeError);
      expect(() => {
        (result.trace.steps as unknown as unknown[]).push({} as unknown);
      }).toThrow(TypeError);
      expect(() => {
        (result.trace.roundingOperations as unknown as unknown[]).push({} as unknown);
      }).toThrow(TypeError);

      // 9. Result objects and their nested monetary values remain immutable
      expect(Object.isFrozen(result.grossRoyalty)).toBe(true);
      expect(Object.isFrozen(result.applicableCost)).toBe(true);
      expect(Object.isFrozen(result.netContribution)).toBe(true);
      expect(Object.isFrozen(result.revenue)).toBe(true);
      expect(Object.isFrozen(result.listPrice)).toBe(true);
      expect(() => {
        (result as unknown as Record<string, unknown>).units = 999;
      }).toThrow(TypeError);
      expect(() => {
        (result.grossRoyalty as unknown as Record<string, unknown>).amountMinor = 99999;
      }).toThrow(TypeError);
      expect(() => {
        (result.applicableCost as unknown as Record<string, unknown>).amountMinor = 99999;
      }).toThrow(TypeError);
      expect(() => {
        (result.netContribution as unknown as Record<string, unknown>).amountMinor = 99999;
      }).toThrow(TypeError);
      expect(() => {
        (result.revenue as unknown as Record<string, unknown>).amountMinor = 99999;
      }).toThrow(TypeError);
      expect(() => {
        (result.listPrice as unknown as Record<string, unknown>).amountMinor = 99999;
      }).toThrow(TypeError);

      // Disclaimer and illustrative flags
      expect(result.disclaimer).toBe(SCENARIO_DISCLAIMER_TEXT);
      expect(result.isIllustrative).toBe(true);
    });

    it('ensures triad scenario outputs, totals, ordering, and disclaimers are deeply frozen and immutable', () => {
      const triad = calculateTriadScenarios(validTriadInput, ebookPack);

      expect(Object.isFrozen(triad)).toBe(true);
      expect(Object.isFrozen(triad.scenarios)).toBe(true);
      expect(Object.isFrozen(triad.totals)).toBe(true);
      expect(Object.isFrozen(triad.ordering)).toBe(true);
      expect(Object.isFrozen(triad.ordering.details)).toBe(true);
      expect(Object.isFrozen(triad.rulePackRef)).toBe(true);
      expect(Object.isFrozen(triad.scenarios.low)).toBe(true);
      expect(Object.isFrozen(triad.scenarios.base)).toBe(true);
      expect(Object.isFrozen(triad.scenarios.high)).toBe(true);
      expect(Object.isFrozen(triad.totals.low)).toBe(true);
      expect(Object.isFrozen(triad.totals.base)).toBe(true);
      expect(Object.isFrozen(triad.totals.high)).toBe(true);

      // Mutating totals fails
      expect(() => {
        (triad.totals as unknown as Record<string, unknown>).base = null;
      }).toThrow(TypeError);

      // Mutating nested scenario results fails
      expect(() => {
        (triad.scenarios.base as unknown as Record<string, unknown>).units = 0;
      }).toThrow(TypeError);

      // Mutating monetary values in totals fails
      expect(() => {
        (triad.totals.base.netContribution as unknown as Record<string, unknown>).amountMinor = 0;
      }).toThrow(TypeError);

      // Mutating ordering details fails
      expect(() => {
        (triad.ordering.details as unknown as Record<string, unknown>).lowContributionMinor = 0;
      }).toThrow(TypeError);

      // Disclaimer and isIllustrative exposed consistently on triad
      expect(triad.isIllustrative).toBe(true);
      expect(triad.disclaimer).toBe(SCENARIO_DISCLAIMER_TEXT);
      expect(triad.totals.low.isIllustrative).toBe(true);
      expect(triad.totals.base.isIllustrative).toBe(true);
      expect(triad.totals.high.isIllustrative).toBe(true);
      expect(triad.scenarios.low.isIllustrative).toBe(true);
      expect(triad.scenarios.low.disclaimer).toBe(SCENARIO_DISCLAIMER_TEXT);
    });

    it('handles cyclic structures, already-frozen parents, and property getters in deepFreeze without infinite recursion or getter side-effects', () => {
      // 10a. Cyclic-object handling does not cause infinite recursion
      const cyclicRoot: Record<string, unknown> = {
        name: 'cyclicRoot',
        nested: { label: 'child' },
      };
      (cyclicRoot.nested as Record<string, unknown>).parent = cyclicRoot;
      cyclicRoot.self = cyclicRoot;

      const frozenCyclic = deepFreeze(cyclicRoot);
      expect(Object.isFrozen(frozenCyclic)).toBe(true);
      expect(Object.isFrozen(frozenCyclic.nested)).toBe(true);
      expect(frozenCyclic.self).toBe(frozenCyclic);
      expect(() => {
        (frozenCyclic as Record<string, unknown>).name = 'mutated';
      }).toThrow(TypeError);
      expect(() => {
        (frozenCyclic.nested as Record<string, unknown>).label = 'mutated';
      }).toThrow(TypeError);

      // 10b. Already-frozen parent with unfrozen descendant
      const inner = { count: 42 };
      const child = Object.freeze({ inner });
      const parent = Object.freeze({ child });
      const frozenParent = deepFreeze(parent);
      expect(Object.isFrozen(frozenParent)).toBe(true);
      expect(Object.isFrozen(frozenParent.child)).toBe(true);
      expect(Object.isFrozen(frozenParent.child.inner)).toBe(true);
      expect(() => {
        (frozenParent.child.inner as Record<string, unknown>).count = 100;
      }).toThrow(TypeError);

      // 10c. Getters are not invoked merely to discover nested values
      let getterInvoked = false;
      const objectWithGetter = {
        get dangerous() {
          getterInvoked = true;
          return { nested: 'should not be read' };
        },
        safe: { regular: 'value' },
      };
      deepFreeze(objectWithGetter);
      expect(getterInvoked).toBe(false);
      expect(Object.isFrozen(objectWithGetter)).toBe(true);
      expect(Object.isFrozen(objectWithGetter.safe)).toBe(true);

      // 10d. Non-object or null inputs return directly without error
      expect(deepFreeze(null as unknown as object)).toBe(null);
      expect(deepFreeze('str' as unknown as object)).toBe('str');
      expect(deepFreeze(123 as unknown as object)).toBe(123);
    });

    it('contains full audit trace steps for cost variance and aggregation', () => {
      const result = calculateSingleScenario(
        {
          scenarioName: 'low',
          units: 150,
          listPriceMinor: 1299,
          costVariancePercent: '20',
          currency: 'USD',
          format: 'paperback',
          pages: 150,
        },
        paperbackV1Pack,
      );

      const steps = result.trace.steps;
      expect(steps.some((s) => s.step === 'cost_variance_applied')).toBe(true);
      expect(steps.some((s) => s.step === 'scenario_aggregation')).toBe(true);

      const varianceStep = steps.find((s) => s.step === 'cost_variance_applied') as Record<
        string,
        unknown
      >;
      expect(varianceStep.costVariancePercent).toBe('20');
    });
  });

  describe('README API Examples Parity', () => {
    it('executes the Single Scenario README example accurately', () => {
      const result = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: 500,
          listPriceMinor: 999, // $9.99
          costVariancePercent: '0',
          currency: 'USD',
          format: 'paperback',
          pages: 200,
        },
        paperbackV1Pack,
      );

      expect(result.units).toBe(500);
      expect(result.revenue.amountMinor).toBe(499500);
      expect(result.grossRoyalty.amountMinor).toBe(299500);
      expect(result.applicableCost.amountMinor).toBe(226000);
      expect(result.netContribution.amountMinor).toBe(73500);
      expect(result.isIllustrative).toBe(true);
      expect(result.disclaimer).toBe(
        'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
      );
    });

    it('executes the Triad Scenarios README example accurately', () => {
      const triad = calculateTriadScenarios(
        {
          scenarios: {
            low: { units: 100, listPriceMinor: 799, costVariancePercent: '10' },
            base: { units: 500, listPriceMinor: 999, costVariancePercent: '0' },
            high: { units: 2500, listPriceMinor: 1299, costVariancePercent: '-10' },
          },
          currency: 'USD',
          format: 'paperback',
          pages: 200,
        },
        paperbackV1Pack,
      );

      expect(triad.ordering.areTotalsMonotonicallyOrdered).toBe(true);
      expect(triad.totals.base.netContribution.amountMinor).toBe(73500);
      expect(triad.disclaimer).toBe(
        'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.',
      );
    });

    it('executes the Per-Unit Economics README example accurately', () => {
      const perUnit = calculatePerUnitEconomics(
        {
          listPriceMinor: 499, // $4.99
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1.5',
        },
        ebookPack,
      );

      expect(perUnit.format).toBe('ebook');
      expect(perUnit.currency).toBe('USD');
      expect(perUnit.listPrice.amountMinor).toBe(499);
      expect(perUnit.grossRoyalty?.amountMinor).toBe(349);
      expect(perUnit.applicableCost?.amountMinor).toBe(23);
      expect(perUnit.netContribution?.amountMinor).toBe(326);
      expect(perUnit.trace).toBeDefined();
    });
  });

  describe('Rational Overflow Guard & Precision Regression (Section 3 Mandatory Regression)', () => {
    it('preserves exact varied cost as Rational and succeeds when numerator exceeds Number.MAX_SAFE_INTEGER but monetary amount is safe', () => {
      // Setup: Exact Rule Pack applicable cost = 1,000 minor units ($10.00)
      // Using TEST_PAPERBACK_US (baseCost: 100, costPerPage: 2, threshold: 24)
      // With pages: 474 -> cost = 100 + (474 - 24) * 2 = 1,000 minor units
      const input: SingleScenarioInput = {
        scenarioName: 'base',
        units: 100,
        listPriceMinor: 2000,
        costVariancePercent: '0.0000000000000001', // 16 decimal places: 10^-16%
        currency: 'USD',
        format: 'paperback',
        pages: 474,
      };

      const result = calculateSingleScenario(input, paperbackV1Pack);

      // Verify exact baseline cost is exactly 1,000 minor units
      expect(result.perUnitEconomics.exactApplicableCost.numerator).toBe(1000n);
      expect(result.perUnitEconomics.exactApplicableCost.denominator).toBe(1n);

      // Exact varied cost: 1000 * (10^18 + 1) / 10^18 = (10^18 + 1) / 10^15
      // Numerator: 1000000000000000001n
      // Note: Number.MAX_SAFE_INTEGER = 9007199254740991n
      // The reduced BigInt numerator is 1,000,000,000,000,000,001n, which is > Number.MAX_SAFE_INTEGER!
      expect(result.exactApplicableCostVaried.numerator > BigInt(Number.MAX_SAFE_INTEGER)).toBe(
        true,
      );
      expect(result.exactApplicableCostVaried.numerator.toString()).toBe('1000000000000000001');
      expect(result.exactApplicableCostVaried.denominator.toString()).toBe('1000000000000000');

      // The exact varied cost is preserved as a Rational
      expect(result.exactApplicableCostVaried.toDecimalString()).toBe('1000.000000000000001');

      // The correctly rounded final cost remains safe
      expect(result.applicableCost.amountMinor).toBe(100000); // 1,000 cents * 100 units = 100,000 cents ($1,000.00)
      expect(result.applicableCost.currency).toBe('USD');
      expect(Number.isSafeInteger(result.applicableCost.amountMinor)).toBe(true);
    });

    it('preserves exact varied cost and succeeds under per_total when numerator exceeds Number.MAX_SAFE_INTEGER', () => {
      const perTotalPack: CalcRulePack = {
        ...paperbackV1Pack,
        content: {
          ...paperbackV1Pack.content,
          rounding: {
            mode: 'round_half_even',
            point: 'per_total',
          },
        },
      };

      const input: SingleScenarioInput = {
        scenarioName: 'base',
        units: 100,
        listPriceMinor: 2000,
        costVariancePercent: '0.0000000000000001',
        currency: 'USD',
        format: 'paperback',
        pages: 474,
      };

      const result = calculateSingleScenario(input, perTotalPack);

      expect(result.exactApplicableCostVaried.numerator > BigInt(Number.MAX_SAFE_INTEGER)).toBe(
        true,
      );
      expect(result.exactTotalCost.toDecimalString()).toBe('100000.0000000000001');
      expect(result.applicableCost.amountMinor).toBe(100000);
      expect(Number.isSafeInteger(result.applicableCost.amountMinor)).toBe(true);
    });

    it('rejects actual monetary overflow when varied cost monetary magnitude exceeds safe integer range', () => {
      // Astronomical cost variance percent that causes actual monetary overflow under per_unit
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 10,
            listPriceMinor: 2000,
            costVariancePercent: '99999999999999999999',
            currency: 'USD',
            format: 'paperback',
            pages: 474,
          },
          paperbackV1Pack,
        ),
      ).toThrow(CalcOverflowError);
    });

    it('preserves exact varied per-unit cost under per_total and succeeds with zero aggregate cost for zero units even when exact per-unit cost exceeds Number.MAX_SAFE_INTEGER', () => {
      // 1. A valid Rule Pack with per_total rounding policy
      expect(hardcoverPack.content.rounding.point).toBe('per_total');

      // 2. A cost variance producing an exact per-unit cost greater than Number.MAX_SAFE_INTEGER:
      // Base hardcover print cost for 1000 pages = 600 + (1000 - 75) * 3 = 3375 minor units.
      // With costVariancePercent = "99999999999999999999", the exact per-unit varied cost is:
      // 3375 * (100 + 99999999999999999999) / 100 > 3.375 * 10^21, which far exceeds Number.MAX_SAFE_INTEGER (~9.007 * 10^15).
      const input: SingleScenarioInput = {
        scenarioName: 'base',
        units: 0,
        listPriceMinor: 1500,
        costVariancePercent: '99999999999999999999',
        currency: 'EUR',
        format: 'hardcover',
        pages: 1000,
      };

      const result = calculateSingleScenario(input, hardcoverPack);

      // Verify exact per-unit varied cost exceeds Number.MAX_SAFE_INTEGER
      const maxSafeRational = Rational.from(Number.MAX_SAFE_INTEGER);
      expect(result.exactApplicableCostVaried.compare(maxSafeRational)).toBeGreaterThan(0);

      // 3. Zero units
      expect(result.units).toBe(0);

      // 4. Expected aggregate cost: exactly zero
      expect(result.applicableCost.amountMinor).toBe(0);
      expect(result.applicableCost.currency).toBe('EUR');
      expect(result.revenue.amountMinor).toBe(0);
      expect(result.grossRoyalty.amountMinor).toBe(0);
      expect(result.netContribution.amountMinor).toBe(0);

      // 5. Expected result: succeeds without an overflow error
      expect(result.exactTotalCost.isZero()).toBe(true);
      expect(result.exactTotalRoyalty.isZero()).toBe(true);
      expect(result.exactTotalContribution.isZero()).toBe(true);
    });

    it('rejects genuine aggregate cost overflow under per_total when monetary result being materialized exceeds safe integer range', () => {
      // When units > 0 with the same astronomical cost variance under per_total, aggregate cost overflows
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 1,
            listPriceMinor: 1500,
            costVariancePercent: '99999999999999999999',
            currency: 'EUR',
            format: 'hardcover',
            pages: 1000,
          },
          hardcoverPack,
        ),
      ).toThrow(CalcOverflowError);
    });
  });

  describe('Rounding Verification: Scenario-Adjusted Cost across all 4 modes (Section 4)', () => {
    // Base cost: 100 minor units ($1.00)
    // Using paperback with pages: 24 -> print cost = 100 minor units
    // costVariancePercent: "0.5" -> M = (100 + 0.5) / 100 = 1.005
    // exactApplicableCostVaried = 100 * 1.005 = 100.5 minor units (exact tie halfway between 100 and 101)
    // Quantity Q = 3 units
    //
    // Under per_unit:
    // - round_down: round(100.5) = 100; total = 100 * 3 = 300
    // - round_up: round(100.5) = 101; total = 101 * 3 = 303
    // - round_half_up: round(100.5) = 101; total = 101 * 3 = 303
    // - round_half_even: round(100.5) = 100 (100 is even); total = 100 * 3 = 300
    //
    // Under per_total:
    // exactTotalCost = 100.5 * 3 = 301.5 minor units (exact tie halfway between 301 and 302)
    // - round_down: round(301.5) = 301
    // - round_up: round(301.5) = 302
    // - round_half_up: round(301.5) = 302
    // - round_half_even: round(301.5) = 302 (302 is even)

    const modes = ['round_half_even', 'round_half_up', 'round_down', 'round_up'] as const;

    const expectedPerUnit = {
      round_half_even: 300,
      round_half_up: 303,
      round_down: 300,
      round_up: 303,
    };

    const expectedPerTotal = {
      round_half_even: 302,
      round_half_up: 302,
      round_down: 301,
      round_up: 302,
    };

    for (const mode of modes) {
      it(`verifies scenario-adjusted cost under per_unit with mode ${mode}`, () => {
        const pack: CalcRulePack = {
          ...paperbackV1Pack,
          content: {
            ...paperbackV1Pack.content,
            rounding: { mode, point: 'per_unit' },
          },
        };

        const result = calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 3,
            listPriceMinor: 1000,
            costVariancePercent: '0.5',
            currency: 'USD',
            format: 'paperback',
            pages: 24,
          },
          pack,
        );

        expect(result.exactApplicableCostVaried.toDecimalString()).toBe('100.5');
        expect(result.applicableCost.amountMinor).toBe(expectedPerUnit[mode]);
      });

      it(`verifies scenario-adjusted cost under per_total with mode ${mode}`, () => {
        const pack: CalcRulePack = {
          ...paperbackV1Pack,
          content: {
            ...paperbackV1Pack.content,
            rounding: { mode, point: 'per_total' },
          },
        };

        const result = calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 3,
            listPriceMinor: 1000,
            costVariancePercent: '0.5',
            currency: 'USD',
            format: 'paperback',
            pages: 24,
          },
          pack,
        );

        expect(result.exactApplicableCostVaried.toDecimalString()).toBe('100.5');
        expect(result.exactTotalCost.toDecimalString()).toBe('301.5');
        expect(result.applicableCost.amountMinor).toBe(expectedPerTotal[mode]);
      });
    }
  });

  describe('Mandatory Monetary Integrity & Boundary Regression (STEP-006 Final Audit)', () => {
    const openLimits = {
      minListPriceMinor: 0,
      maxListPriceMinor: Number.MAX_SAFE_INTEGER,
      minPages: null,
      maxPages: null,
    };

    it('1. rejects aggregate revenue overflow and accepts exact MAX_SAFE_INTEGER revenue boundary', () => {
      const openLimitsEbookPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          limits: openLimits,
          deliveryCost: null,
          royalty: {
            tiers: [
              {
                name: 'open_tier',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '0.35',
              },
            ],
          },
        },
      };

      // Valid boundary: listPriceMinor = 1, units = MAX_SAFE_INTEGER
      const boundaryResult = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 1,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '0.1',
        },
        openLimitsEbookPack,
      );
      expect(boundaryResult.revenue.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // Overflow: listPriceMinor = 2, units = Math.floor(MAX_SAFE_INTEGER / 2) + 1
      const overflowUnits = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: overflowUnits,
            listPriceMinor: 2,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '0.1',
          },
          openLimitsEbookPack,
        ),
      ).toThrow(CalcOverflowError);
    });

    it('2. rejects aggregate royalty overflow under per_unit while revenue remains safe, and accepts exact MAX_SAFE_INTEGER royalty boundary', () => {
      // Pack with 100% royalty tier under per_unit
      const fullRoyaltyPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: '100_percent',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '1.00',
              },
            ],
          },
          deliveryCost: null,
        },
      };

      // Valid boundary: listPrice = 1, units = MAX_SAFE_INTEGER -> royalty = MAX_SAFE_INTEGER
      const boundary = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 1,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        fullRoyaltyPack,
      );
      expect(boundary.grossRoyalty.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // Synthetic pack with 150% royalty tier under per_unit
      const superRoyaltyPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          rounding: { mode: 'round_half_up', point: 'per_unit' },
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: 'super',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '1.50',
              },
            ],
          },
        },
      };

      // When listPrice = 1, units = 7_000_000_000_000_000:
      // Revenue = 1 * 7_000_000_000_000_000 = 7_000_000_000_000_000 <= MAX_SAFE_INTEGER (safe!)
      // Unit royalty = round(1 * 1.50) = 2
      // Total royalty = 2 * 7_000_000_000_000_000 = 14_000_000_000_000_000 > MAX_SAFE_INTEGER!
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 7_000_000_000_000_000,
            listPriceMinor: 1,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '0.1',
          },
          superRoyaltyPack,
        ),
      ).toThrow(CalcOverflowError);
    });

    it('3. rejects aggregate royalty overflow under per_total while revenue remains safe, and accepts exact MAX_SAFE_INTEGER royalty boundary', () => {
      // Pack with 100% royalty tier under per_total
      const fullRoyaltyPackPerTotal: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          rounding: { mode: 'round_half_up', point: 'per_total' },
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: '100_percent',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '1.00',
              },
            ],
          },
          deliveryCost: null,
        },
      };

      // Valid boundary: listPrice = 1, units = MAX_SAFE_INTEGER -> royalty = MAX_SAFE_INTEGER
      const boundary = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 1,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        fullRoyaltyPackPerTotal,
      );
      expect(boundary.grossRoyalty.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // Synthetic pack with 150% royalty tier under per_total
      const superRoyaltyPackPerTotal: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          rounding: { mode: 'round_half_up', point: 'per_total' },
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: 'super',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '1.50',
              },
            ],
          },
        },
      };

      // When listPrice = 1, units = 7_000_000_000_000_000:
      // Revenue = 7_000_000_000_000_000 <= MAX_SAFE_INTEGER (safe!)
      // Exact total royalty = 1.50 * 7_000_000_000_000_000 = 10_500_000_000_000_000 > MAX_SAFE_INTEGER!
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: 7_000_000_000_000_000,
            listPriceMinor: 1,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '0.1',
          },
          superRoyaltyPackPerTotal,
        ),
      ).toThrow(CalcOverflowError);
    });

    it('4. proves aggregate net contribution boundaries and independent safety checks', () => {
      // Synthetic pack where delivery cost is 0 and royalty rate is 100%
      const maxContributionPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: '100_percent',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '1.00',
              },
            ],
          },
          deliveryCost: null,
        },
      };

      // Maximum positive net contribution: R = MAX_SAFE_INTEGER, C = 0 -> Net Contribution = MAX_SAFE_INTEGER
      const maxContribResult = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 1,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        maxContributionPack,
      );
      expect(maxContribResult.netContribution.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // Minimum negative net contribution: R = 0, C = MAX_SAFE_INTEGER -> Net Contribution = MIN_SAFE_INTEGER (-MAX_SAFE_INTEGER)
      // Pack where royalty is 0% and delivery fee is 1 minor unit per MB
      const minContributionPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: 'zero_royalty',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '0.00',
              },
            ],
          },
          deliveryCost: {
            costPerMbMinor: 1,
          },
        },
      };

      const minContribResult = calculateSingleScenario(
        {
          scenarioName: 'low',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 0,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        minContributionPack,
      );
      expect(minContribResult.netContribution.amountMinor).toBe(-Number.MAX_SAFE_INTEGER);
      expect(minContribResult.netContribution.amountMinor).toBe(Number.MIN_SAFE_INTEGER);
      expect(minContribResult.netContribution.isNegative()).toBe(true);
    });

    it('5. accepts exact MAX_SAFE_INTEGER aggregate cost under per_unit and per_total, and rejects overflow', () => {
      // Pack with 1 minor unit delivery fee per MB
      const unitCostPack: CalcRulePack = {
        ...ebookPack,
        content: {
          ...ebookPack.content,
          limits: openLimits,
          royalty: {
            tiers: [
              {
                name: 'zero_royalty',
                minPriceMinor: 0,
                maxPriceMinor: null,
                royaltyRateDecimal: '0.00',
              },
            ],
          },
          deliveryCost: {
            costPerMbMinor: 1,
          },
        },
      };

      // per_unit boundary: units = MAX_SAFE_INTEGER, unit cost = 1 -> total cost = MAX_SAFE_INTEGER
      const perUnitBoundary = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 0,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        unitCostPack,
      );
      expect(perUnitBoundary.applicableCost.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // per_unit overflow: units = Math.floor(MAX_SAFE_INTEGER / 2) + 1, unit cost = 2 -> total cost > MAX_SAFE_INTEGER
      const overflowUnits = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: overflowUnits,
            listPriceMinor: 0,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '2',
          },
          unitCostPack,
        ),
      ).toThrow(CalcOverflowError);

      // per_total boundary: units = MAX_SAFE_INTEGER, unit cost = 1 -> total cost = MAX_SAFE_INTEGER
      const perTotalUnitCostPack: CalcRulePack = {
        ...unitCostPack,
        content: {
          ...unitCostPack.content,
          rounding: { mode: 'round_half_up', point: 'per_total' },
        },
      };
      const perTotalBoundary = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: Number.MAX_SAFE_INTEGER,
          listPriceMinor: 0,
          currency: 'USD',
          format: 'ebook',
          fileSizeMb: '1',
        },
        perTotalUnitCostPack,
      );
      expect(perTotalBoundary.applicableCost.amountMinor).toBe(Number.MAX_SAFE_INTEGER);

      // per_total overflow: units = Math.floor(MAX_SAFE_INTEGER / 2) + 1, unit cost = 2 -> total cost > MAX_SAFE_INTEGER
      expect(() =>
        calculateSingleScenario(
          {
            scenarioName: 'base',
            units: overflowUnits,
            listPriceMinor: 0,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '2',
          },
          perTotalUnitCostPack,
        ),
      ).toThrow(CalcOverflowError);
    });
  });
});
