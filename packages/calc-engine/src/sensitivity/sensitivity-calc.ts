import { Money, SCENARIO_DISCLAIMER_TEXT } from '@nimphy/domain';
import { CalcInputValidationError, CalcOverflowError } from '../errors/calc-error';
import { Rational } from '../math/rational';
import { CALC_ENGINE_MODULE_VERSION } from '../per-unit/per-unit-calc';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario, deepFreeze } from '../scenarios/scenario-calc';
import type { SingleScenarioInput } from '../scenarios/types';
import {
  isSensitivityDriver,
  type CostVarianceSensitivityDriverResult,
  type ListPriceSensitivityDriverResult,
  type SensitivityCalculationTrace,
  type SensitivityDriver,
  type SensitivityDriverResult,
  type SensitivityInput,
  type SensitivityRankDecision,
  type SensitivityResult,
  type SensitivityTraceDriverEvaluation,
  type UnitsSensitivityDriverResult,
} from './types';

/**
 * Validates the sensitivity analysis input structure, drivers, and perturbation parameters.
 */
function validateSensitivityInput(input: SensitivityInput, rulePack: CalcRulePack): void {
  if (!input || typeof input !== 'object') {
    throw new CalcInputValidationError('INVALID_INPUT', 'Sensitivity input must be an object');
  }

  if (!rulePack || typeof rulePack !== 'object' || !rulePack.content) {
    throw new CalcInputValidationError('INVALID_RULE_PACK', 'Valid Rule Pack must be provided');
  }

  if (!input.baseline || typeof input.baseline !== 'object') {
    throw new CalcInputValidationError(
      'INVALID_BASELINE_INPUT',
      'Baseline scenario input must be an object',
    );
  }

  if (!Array.isArray(input.drivers)) {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'Sensitivity input must include a drivers array',
    );
  }

  if (input.drivers.length === 0) {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'Sensitivity analysis requires at least one declared driver',
    );
  }

  const seenDrivers = new Set<SensitivityDriver>();

  for (const config of input.drivers) {
    if (!config || typeof config !== 'object') {
      throw new CalcInputValidationError(
        'INVALID_DRIVER_CONFIG',
        'Each driver configuration must be an object',
      );
    }

    if (!isSensitivityDriver(config.driver)) {
      throw new CalcInputValidationError(
        'UNSUPPORTED_DRIVER',
        `Sensitivity driver "${String(config.driver)}" is not supported. Supported drivers: units, listPriceMinor, costVariancePercent`,
      );
    }

    if (seenDrivers.has(config.driver)) {
      throw new CalcInputValidationError(
        'DUPLICATE_DRIVER',
        `Duplicate sensitivity driver declared: "${config.driver}"`,
      );
    }
    seenDrivers.add(config.driver);

    // Perturbation validation per driver type
    if (config.driver === 'units') {
      const p = config.perturbation;
      if (typeof p !== 'number' || !Number.isFinite(p) || !Number.isSafeInteger(p)) {
        throw new CalcInputValidationError(
          'INVALID_INTEGER',
          `Perturbation for driver "units" must be a safe integer, received: ${String(p)}`,
        );
      }
      if (p <= 0) {
        throw new CalcInputValidationError(
          'PERTURBATION_OUT_OF_BOUNDS',
          `Perturbation size for units must be strictly positive, received: ${p}`,
        );
      }
    } else if (config.driver === 'listPriceMinor') {
      const p = config.perturbation;
      if (typeof p !== 'number' || !Number.isFinite(p) || !Number.isSafeInteger(p)) {
        throw new CalcInputValidationError(
          'INVALID_INTEGER',
          `Perturbation for driver "listPriceMinor" must be a safe integer, received: ${String(p)}`,
        );
      }
      if (p <= 0) {
        throw new CalcInputValidationError(
          'PERTURBATION_OUT_OF_BOUNDS',
          `Perturbation size for listPriceMinor must be strictly positive, received: ${p}`,
        );
      }
    } else {
      // costVariancePercent
      const p = config.perturbation;
      if (typeof p !== 'string') {
        throw new CalcInputValidationError(
          'INVALID_DECIMAL',
          `Perturbation for driver "costVariancePercent" must be an exact decimal string, received: ${typeof p}`,
        );
      }
      if (p !== p.trim() || !/^\d+(\.\d+)?$/.test(p)) {
        throw new CalcInputValidationError(
          'COST_VARIANCE_INVALID',
          `Perturbation for driver "costVariancePercent" must be a valid non-negative decimal string, received: "${p}"`,
        );
      }
      const rational = Rational.fromDecimal(p);
      if (rational.compare(Rational.zero()) <= 0) {
        throw new CalcInputValidationError(
          'PERTURBATION_OUT_OF_BOUNDS',
          `Perturbation size for costVariancePercent must be strictly positive, received: "${p}"`,
        );
      }
    }
  }
}

/**
 * Computes the delta in minor units between perturbed and baseline net contribution,
 * guarding against safe integer overflow.
 */
function computeDeltaMinor(
  perturbedContributionMinor: number,
  baselineContributionMinor: number,
  label: string,
): number {
  const diffBig = BigInt(perturbedContributionMinor) - BigInt(baselineContributionMinor);
  /* v8 ignore start - mathematically unreachable under valid scenario bounds:
   * calculateSingleScenario validates that total revenue listPrice * units <= MAX_SAFE_INTEGER
   * and total costs are bounded by safe integers, guaranteeing that net contribution is bounded
   * within [MIN_SAFE_INTEGER, MAX_SAFE_INTEGER] and realistic one-at-a-time deltas cannot overflow.
   */
  if (diffBig > BigInt(Number.MAX_SAFE_INTEGER) || diffBig < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new CalcOverflowError(`Net contribution ${label} delta exceeded safe integer bounds`);
  }
  /* v8 ignore stop */
  return Number(diffBig);
}

/**
 * Intermediate evaluation container before final ranking and trace assembly.
 */
interface IntermediateDriverEval {
  driver: SensitivityDriver;
  perturbation: number | string;
  baselineValue: number | string;
  lowerValue: number | string;
  upperValue: number | string;
  baselineContributionMinor: number;
  lowerContributionMinor: number;
  upperContributionMinor: number;
  deltaLowerMinor: number;
  deltaUpperMinor: number;
  absDeltaLowerMinor: number;
  absDeltaUpperMinor: number;
  impactScoreMinor: number;
  impactScore: Money;
  deltaLower: Money;
  deltaUpper: Money;
  deltaLowerRevenue: Money;
  deltaUpperRevenue: Money;
  lowerScenario: ReturnType<typeof calculateSingleScenario>;
  upperScenario: ReturnType<typeof calculateSingleScenario>;
  toResult: (rank: number) => SensitivityDriverResult;
}

/**
 * Performs deterministic sensitivity analysis (STEP-008) on a scenario.
 *
 * Conforms to:
 * - Principle P-01: Deterministic core, probabilistic edge (pure function, zero I/O, zero AI, no floats).
 * - Principle P-03: Traceability (full structured deterministic calculation trace).
 * - Principle P-04: Immutability for evidence (deepFreeze on returned results).
 * - FR-008: Reproducible one-at-a-time perturbations of declared drivers with recorded perturbation sizes and ranked results.
 *
 * @param input The sensitivity analysis parameters including baseline and declared drivers.
 * @param rulePack The applicable Rule Pack governing royalties, costs, limits, and rounding.
 * @returns Immutable SensitivityResult with baseline, ranked drivers, deltas, and audit trace.
 */
export function calculateSensitivity(
  input: SensitivityInput,
  rulePack: CalcRulePack,
): SensitivityResult {
  validateSensitivityInput(input, rulePack);

  const baselineScenarioInput: SingleScenarioInput = {
    scenarioName: input.baseline.scenarioName ?? 'base',
    units: input.baseline.units,
    listPriceMinor: input.baseline.listPriceMinor,
    costVariancePercent: input.baseline.costVariancePercent,
    currency: input.baseline.currency,
    format: input.baseline.format,
    pages: input.baseline.pages,
    fileSizeMb: input.baseline.fileSizeMb,
  };

  // Evaluate baseline scenario
  const baselineResult = calculateSingleScenario(baselineScenarioInput, rulePack);
  const currency = baselineResult.netContribution.currency;
  const baselineContributionMinor = baselineResult.netContribution.amountMinor;

  const intermediateEvaluations: IntermediateDriverEval[] = [];

  // Evaluate each declared driver via one-at-a-time perturbation
  for (const driverConfig of input.drivers) {
    if (driverConfig.driver === 'units') {
      const deltaUnits = driverConfig.perturbation;
      const lowerUnits = baselineScenarioInput.units - deltaUnits;

      const upperUnitsBig = BigInt(baselineScenarioInput.units) + BigInt(deltaUnits);
      if (upperUnitsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new CalcOverflowError(
          `Perturbed units exceeded safe integer bounds: ${baselineScenarioInput.units} + ${deltaUnits}`,
        );
      }
      const upperUnits = Number(upperUnitsBig);

      const lowerInput: SingleScenarioInput = { ...baselineScenarioInput, units: lowerUnits };
      const upperInput: SingleScenarioInput = { ...baselineScenarioInput, units: upperUnits };

      const lowerScenario = calculateSingleScenario(lowerInput, rulePack);
      const upperScenario = calculateSingleScenario(upperInput, rulePack);

      const lowerContributionMinor = lowerScenario.netContribution.amountMinor;
      const upperContributionMinor = upperScenario.netContribution.amountMinor;

      const deltaLowerMinor = computeDeltaMinor(
        lowerContributionMinor,
        baselineContributionMinor,
        'lower',
      );
      const deltaUpperMinor = computeDeltaMinor(
        upperContributionMinor,
        baselineContributionMinor,
        'upper',
      );
      const absDeltaLowerMinor = Math.abs(deltaLowerMinor);
      const absDeltaUpperMinor = Math.abs(deltaUpperMinor);
      const impactScoreMinor = Math.max(absDeltaLowerMinor, absDeltaUpperMinor);

      const impactScore = Money.of(impactScoreMinor, currency);
      const deltaLower = Money.of(deltaLowerMinor, currency);
      const deltaUpper = Money.of(deltaUpperMinor, currency);
      const deltaLowerRevenue = lowerScenario.revenue.subtract(baselineResult.revenue);
      const deltaUpperRevenue = upperScenario.revenue.subtract(baselineResult.revenue);

      intermediateEvaluations.push({
        driver: 'units',
        perturbation: deltaUnits,
        baselineValue: baselineScenarioInput.units,
        lowerValue: lowerUnits,
        upperValue: upperUnits,
        baselineContributionMinor,
        lowerContributionMinor,
        upperContributionMinor,
        deltaLowerMinor,
        deltaUpperMinor,
        absDeltaLowerMinor,
        absDeltaUpperMinor,
        impactScoreMinor,
        impactScore,
        deltaLower,
        deltaUpper,
        deltaLowerRevenue,
        deltaUpperRevenue,
        lowerScenario,
        upperScenario,
        toResult: (rank: number): UnitsSensitivityDriverResult => ({
          driver: 'units',
          rank,
          impactScoreMinor,
          impactScore,
          perturbation: deltaUnits,
          baselineValue: baselineScenarioInput.units,
          lowerValue: lowerUnits,
          upperValue: upperUnits,
          baselineNetContribution: baselineResult.netContribution,
          lowerNetContribution: lowerScenario.netContribution,
          upperNetContribution: upperScenario.netContribution,
          deltaLower,
          deltaUpper,
          baselineRevenue: baselineResult.revenue,
          lowerRevenue: lowerScenario.revenue,
          upperRevenue: upperScenario.revenue,
          deltaLowerRevenue,
          deltaUpperRevenue,
          lowerScenario,
          upperScenario,
        }),
      });
    } else if (driverConfig.driver === 'listPriceMinor') {
      const deltaPrice = driverConfig.perturbation;
      const lowerPrice = baselineScenarioInput.listPriceMinor - deltaPrice;

      const upperPriceBig = BigInt(baselineScenarioInput.listPriceMinor) + BigInt(deltaPrice);
      if (upperPriceBig > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new CalcOverflowError(
          `Perturbed list price exceeded safe integer bounds: ${baselineScenarioInput.listPriceMinor} + ${deltaPrice}`,
        );
      }
      const upperPrice = Number(upperPriceBig);

      const lowerInput: SingleScenarioInput = {
        ...baselineScenarioInput,
        listPriceMinor: lowerPrice,
      };
      const upperInput: SingleScenarioInput = {
        ...baselineScenarioInput,
        listPriceMinor: upperPrice,
      };

      const lowerScenario = calculateSingleScenario(lowerInput, rulePack);
      const upperScenario = calculateSingleScenario(upperInput, rulePack);

      const lowerContributionMinor = lowerScenario.netContribution.amountMinor;
      const upperContributionMinor = upperScenario.netContribution.amountMinor;

      const deltaLowerMinor = computeDeltaMinor(
        lowerContributionMinor,
        baselineContributionMinor,
        'lower',
      );
      const deltaUpperMinor = computeDeltaMinor(
        upperContributionMinor,
        baselineContributionMinor,
        'upper',
      );
      const absDeltaLowerMinor = Math.abs(deltaLowerMinor);
      const absDeltaUpperMinor = Math.abs(deltaUpperMinor);
      const impactScoreMinor = Math.max(absDeltaLowerMinor, absDeltaUpperMinor);

      const impactScore = Money.of(impactScoreMinor, currency);
      const deltaLower = Money.of(deltaLowerMinor, currency);
      const deltaUpper = Money.of(deltaUpperMinor, currency);
      const deltaLowerRevenue = lowerScenario.revenue.subtract(baselineResult.revenue);
      const deltaUpperRevenue = upperScenario.revenue.subtract(baselineResult.revenue);

      intermediateEvaluations.push({
        driver: 'listPriceMinor',
        perturbation: deltaPrice,
        baselineValue: baselineScenarioInput.listPriceMinor,
        lowerValue: lowerPrice,
        upperValue: upperPrice,
        baselineContributionMinor,
        lowerContributionMinor,
        upperContributionMinor,
        deltaLowerMinor,
        deltaUpperMinor,
        absDeltaLowerMinor,
        absDeltaUpperMinor,
        impactScoreMinor,
        impactScore,
        deltaLower,
        deltaUpper,
        deltaLowerRevenue,
        deltaUpperRevenue,
        lowerScenario,
        upperScenario,
        toResult: (rank: number): ListPriceSensitivityDriverResult => ({
          driver: 'listPriceMinor',
          rank,
          impactScoreMinor,
          impactScore,
          perturbation: deltaPrice,
          baselineValue: baselineScenarioInput.listPriceMinor,
          lowerValue: lowerPrice,
          upperValue: upperPrice,
          baselineNetContribution: baselineResult.netContribution,
          lowerNetContribution: lowerScenario.netContribution,
          upperNetContribution: upperScenario.netContribution,
          deltaLower,
          deltaUpper,
          baselineRevenue: baselineResult.revenue,
          lowerRevenue: lowerScenario.revenue,
          upperRevenue: upperScenario.revenue,
          deltaLowerRevenue,
          deltaUpperRevenue,
          lowerScenario,
          upperScenario,
        }),
      });
    } else {
      // costVariancePercent
      const baseVarianceStr = baselineScenarioInput.costVariancePercent ?? '0';
      const baseVarianceRational = Rational.fromDecimal(baseVarianceStr);
      const deltaVarianceRational = Rational.fromDecimal(driverConfig.perturbation);

      const lowerVarianceRational = baseVarianceRational.subtract(deltaVarianceRational);
      const upperVarianceRational = baseVarianceRational.add(deltaVarianceRational);

      const lowerVarianceStr = lowerVarianceRational.toDecimalString();
      const upperVarianceStr = upperVarianceRational.toDecimalString();

      const lowerInput: SingleScenarioInput = {
        ...baselineScenarioInput,
        costVariancePercent: lowerVarianceStr,
      };
      const upperInput: SingleScenarioInput = {
        ...baselineScenarioInput,
        costVariancePercent: upperVarianceStr,
      };

      const lowerScenario = calculateSingleScenario(lowerInput, rulePack);
      const upperScenario = calculateSingleScenario(upperInput, rulePack);

      const lowerContributionMinor = lowerScenario.netContribution.amountMinor;
      const upperContributionMinor = upperScenario.netContribution.amountMinor;

      const deltaLowerMinor = computeDeltaMinor(
        lowerContributionMinor,
        baselineContributionMinor,
        'lower',
      );
      const deltaUpperMinor = computeDeltaMinor(
        upperContributionMinor,
        baselineContributionMinor,
        'upper',
      );
      const absDeltaLowerMinor = Math.abs(deltaLowerMinor);
      const absDeltaUpperMinor = Math.abs(deltaUpperMinor);
      const impactScoreMinor = Math.max(absDeltaLowerMinor, absDeltaUpperMinor);

      const impactScore = Money.of(impactScoreMinor, currency);
      const deltaLower = Money.of(deltaLowerMinor, currency);
      const deltaUpper = Money.of(deltaUpperMinor, currency);
      const deltaLowerRevenue = lowerScenario.revenue.subtract(baselineResult.revenue);
      const deltaUpperRevenue = upperScenario.revenue.subtract(baselineResult.revenue);

      intermediateEvaluations.push({
        driver: 'costVariancePercent',
        perturbation: driverConfig.perturbation,
        baselineValue: baseVarianceStr,
        lowerValue: lowerVarianceStr,
        upperValue: upperVarianceStr,
        baselineContributionMinor,
        lowerContributionMinor,
        upperContributionMinor,
        deltaLowerMinor,
        deltaUpperMinor,
        absDeltaLowerMinor,
        absDeltaUpperMinor,
        impactScoreMinor,
        impactScore,
        deltaLower,
        deltaUpper,
        deltaLowerRevenue,
        deltaUpperRevenue,
        lowerScenario,
        upperScenario,
        toResult: (rank: number): CostVarianceSensitivityDriverResult => ({
          driver: 'costVariancePercent',
          rank,
          impactScoreMinor,
          impactScore,
          perturbation: driverConfig.perturbation,
          baselineValue: baseVarianceStr,
          lowerValue: lowerVarianceStr,
          upperValue: upperVarianceStr,
          baselineNetContribution: baselineResult.netContribution,
          lowerNetContribution: lowerScenario.netContribution,
          upperNetContribution: upperScenario.netContribution,
          deltaLower,
          deltaUpper,
          baselineRevenue: baselineResult.revenue,
          lowerRevenue: lowerScenario.revenue,
          upperRevenue: upperScenario.revenue,
          deltaLowerRevenue,
          deltaUpperRevenue,
          lowerScenario,
          upperScenario,
        }),
      });
    }
  }

  // Deterministic ranking and tie-breaking:
  // 1. Impact score descending (larger impact comes first)
  // 2. Stable driver identifier ascending via deterministic UTF-16 code-point comparison
  const sorted = [...intermediateEvaluations].sort((a, b) => {
    if (b.impactScoreMinor !== a.impactScoreMinor) {
      return b.impactScoreMinor - a.impactScoreMinor;
    }
    // Stable driver identifier ascending via deterministic UTF-16 code-point comparison
    // Note: duplicate drivers are rejected during validation, so a.driver !== b.driver is guaranteed
    return a.driver < b.driver ? -1 : 1;
  });

  // Track ties for auditability
  const scoreCounts = new Map<number, number>();
  for (const item of sorted) {
    scoreCounts.set(item.impactScoreMinor, (scoreCounts.get(item.impactScoreMinor) ?? 0) + 1);
  }

  const rankingDecisions: SensitivityRankDecision[] = [];
  const rankedDrivers: SensitivityDriverResult[] = sorted.map((item, index) => {
    const rank = index + 1;
    const isTied = scoreCounts.get(item.impactScoreMinor)! > 1;
    rankingDecisions.push({
      rank,
      driver: item.driver,
      impactScoreMinor: item.impactScoreMinor,
      tieBrokenByDriverName: isTied,
    });
    return item.toResult(rank);
  });

  // Construct driver evaluation trace entries (in evaluated order)
  const driverEvaluations: SensitivityTraceDriverEvaluation[] = intermediateEvaluations.map(
    (evalItem) => {
      const rankedItem = rankedDrivers.find((r) => r.driver === evalItem.driver)!;
      return {
        driver: evalItem.driver,
        perturbation: evalItem.perturbation,
        baselineValue: evalItem.baselineValue,
        lowerValue: evalItem.lowerValue,
        upperValue: evalItem.upperValue,
        baselineContributionMinor: evalItem.baselineContributionMinor,
        lowerContributionMinor: evalItem.lowerContributionMinor,
        upperContributionMinor: evalItem.upperContributionMinor,
        deltaLowerMinor: evalItem.deltaLowerMinor,
        deltaUpperMinor: evalItem.deltaUpperMinor,
        absDeltaLowerMinor: evalItem.absDeltaLowerMinor,
        absDeltaUpperMinor: evalItem.absDeltaUpperMinor,
        impactScoreMinor: evalItem.impactScoreMinor,
        rank: rankedItem.rank,
        lowerScenarioTrace: evalItem.lowerScenario.trace,
        upperScenarioTrace: evalItem.upperScenario.trace,
      };
    },
  );

  const trace: SensitivityCalculationTrace = {
    engineVersion: CALC_ENGINE_MODULE_VERSION,
    rulePackRef: baselineResult.trace.rulePackRef,
    baselineInput: {
      scenarioName: baselineScenarioInput.scenarioName,
      units: baselineScenarioInput.units,
      listPriceMinor: baselineScenarioInput.listPriceMinor,
      costVariancePercent: baselineScenarioInput.costVariancePercent ?? '0',
      currency: baselineResult.trace.input.currency,
      format: baselineResult.trace.input.format,
      pages: baselineScenarioInput.pages,
      fileSizeMb: baselineScenarioInput.fileSizeMb,
    },
    unchangedInputs: {
      currency: baselineResult.trace.input.currency,
      format: baselineResult.trace.input.format,
      pages: baselineScenarioInput.pages,
      fileSizeMb: baselineScenarioInput.fileSizeMb,
    },
    declaredDrivers: input.drivers.map((d) => ({
      driver: d.driver,
      perturbation: d.perturbation,
    })),
    rankingMetric: 'total_net_contribution',
    baselineScenarioTrace: baselineResult.trace,
    driverEvaluations,
    rankingDecisions,
    rankedDriverOrder: rankedDrivers.map((d) => d.driver),
  };

  const result: SensitivityResult = {
    baseline: baselineResult,
    currency,
    declaredDrivers: Object.freeze([...input.drivers]),
    rankedDrivers: Object.freeze(rankedDrivers),
    drivers: Object.freeze(rankedDrivers),
    rankingMetric: 'total_net_contribution',
    isIllustrative: true,
    disclaimer: SCENARIO_DISCLAIMER_TEXT,
    trace,
  };

  return deepFreeze(result);
}
