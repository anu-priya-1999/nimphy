import {
  isScenarioName,
  Money,
  SCENARIO_DISCLAIMER_TEXT,
  type ScenarioName,
  type ScenarioTotals,
} from '@nimphy/domain';
import { CalcInputValidationError, CalcOverflowError } from '../errors/calc-error';
import { Rational } from '../math/rational';
import { CALC_ENGINE_MODULE_VERSION, calculatePerUnitEconomics } from '../per-unit/per-unit-calc';
import type { CalcRulePack, RoundingOperation } from '../per-unit/types';
import type {
  CaseScenariosInput,
  ScenarioCalculationTrace,
  ScenarioOrderingEvaluation,
  ScenarioTraceStep,
  SingleScenarioInput,
  SingleScenarioResult,
  TriadScenariosResult,
} from './types';

/**
 * Recursively freezes an object and all its nested properties and array elements.
 *
 * Robust implementation:
 * - Recursively visits descendants even if their parent is already frozen.
 * - Uses a WeakSet to avoid infinite recursion on cyclic references.
 * - Handles nested arrays and ordinary objects.
 * - Freezes every relevant nested object before returning.
 * - Does not invoke getters merely to discover nested values.
 * - Does not alter existing public result shapes.
 * - Does not mutate or weaken the existing per-unit calculation contracts.
 */
export function deepFreeze<T extends object>(
  obj: T,
  visited: WeakSet<object> = new WeakSet(),
): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (visited.has(obj)) {
    return obj;
  }
  visited.add(obj);

  const descriptors = Object.getOwnPropertyDescriptors(obj);
  for (const key of Reflect.ownKeys(descriptors)) {
    const desc = descriptors[key as keyof typeof descriptors];
    if (desc && 'value' in desc) {
      const val = desc.value;
      if (val !== null && typeof val === 'object') {
        deepFreeze(val, visited);
      }
    }
  }

  if (!Object.isFrozen(obj)) {
    Object.freeze(obj);
  }

  return obj;
}

/**
 * Parses and validates cost variance percentage into an exact Rational.
 *
 * Contract:
 * - Omitted values (undefined) default to zero ("0", Rational.zero()).
 * - Explicit null is rejected with CalcInputValidationError.
 * - JSON numeric values are rejected with CalcInputValidationError.
 * - Strings must be valid signed decimal representations parsed via Rational.fromDecimal.
 * - Scientific notation, empty strings, whitespace (including leading/trailing whitespace), and strings > 50 chars are rejected.
 * - Values below -100% are rejected; -100% is accepted.
 */
export function parseCostVariance(costVariancePercent?: string): {
  rational: Rational;
  percentString: string;
} {
  if (costVariancePercent === undefined) {
    return { rational: Rational.zero(), percentString: '0' };
  }

  if (typeof costVariancePercent !== 'string') {
    throw new CalcInputValidationError(
      'COST_VARIANCE_INVALID',
      `costVariancePercent must be an exact decimal string if provided, received: ${
        costVariancePercent === null ? 'null' : typeof costVariancePercent
      }`,
    );
  }

  if (costVariancePercent.length === 0 || costVariancePercent.length > 50) {
    throw new CalcInputValidationError(
      'COST_VARIANCE_INVALID',
      'costVariancePercent cannot be empty or excessively long',
    );
  }

  if (!/^-?\d+(\.\d+)?$/.test(costVariancePercent)) {
    throw new CalcInputValidationError(
      'COST_VARIANCE_INVALID',
      `costVariancePercent must be a valid signed decimal string, received: "${costVariancePercent}"`,
    );
  }

  const rational = Rational.fromDecimal(costVariancePercent);

  // Cost variance cannot reduce cost below 0 (-100% variance means 0 cost)
  const minAllowed = Rational.from(-100);
  if (rational.compare(minAllowed) < 0) {
    throw new CalcInputValidationError(
      'COST_VARIANCE_INVALID',
      `costVariancePercent cannot be less than -100%, received: ${costVariancePercent}%`,
      { costVariancePercent },
    );
  }

  return { rational, percentString: costVariancePercent };
}

/**
 * Validates single scenario input parameters.
 */
function validateSingleScenarioInput(input: SingleScenarioInput): {
  units: number;
  scenarioName: ScenarioName;
  costVarianceRational: Rational;
  costVarianceString: string;
  revenueMinor: number;
} {
  if (!input || typeof input !== 'object') {
    throw new CalcInputValidationError('INVALID_INPUT', 'Scenario input must be an object');
  }

  if (!isScenarioName(input.scenarioName)) {
    throw new CalcInputValidationError(
      'INVALID_SCENARIO_NAME',
      `scenarioName must be 'low', 'base', or 'high', received: ${String(input.scenarioName)}`,
    );
  }

  if (typeof input.units !== 'number') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'units is required and must be a number',
    );
  }

  if (!Number.isFinite(input.units) || !Number.isSafeInteger(input.units)) {
    throw new CalcInputValidationError(
      'INVALID_INTEGER',
      `units must be a safe integer, received: ${input.units}`,
    );
  }

  if (input.units < 0) {
    throw new CalcInputValidationError(
      'UNITS_OUT_OF_BOUNDS',
      `units cannot be negative, received: ${input.units}`,
    );
  }

  if (typeof input.listPriceMinor !== 'number') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'listPriceMinor is required in scenario input',
    );
  }

  if (!Number.isFinite(input.listPriceMinor) || !Number.isSafeInteger(input.listPriceMinor)) {
    throw new CalcInputValidationError(
      'INVALID_INTEGER',
      `listPriceMinor must be a safe integer, received: ${input.listPriceMinor}`,
    );
  }

  if (input.listPriceMinor < 0) {
    throw new CalcInputValidationError(
      'PRICE_OUT_OF_BOUNDS',
      `listPriceMinor cannot be negative, received: ${input.listPriceMinor}`,
    );
  }

  // Safe integer overflow guard for gross retail revenue
  const revenueBig = BigInt(input.listPriceMinor) * BigInt(input.units);
  if (
    revenueBig > BigInt(Number.MAX_SAFE_INTEGER) ||
    revenueBig < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new CalcOverflowError(
      `Scenario revenue calculation overflowed safe integer bounds: ${input.listPriceMinor} * ${input.units}`,
    );
  }

  const { rational: costVarianceRational, percentString: costVarianceString } = parseCostVariance(
    input.costVariancePercent,
  );

  return {
    units: input.units,
    scenarioName: input.scenarioName,
    costVarianceRational,
    costVarianceString,
    revenueMinor: Number(revenueBig),
  };
}

/**
 * Calculates financial totals and economics for a single scenario.
 *
 * Implements:
 * - FR-006: low/base/high scenario modeling with units sold, price, and cost variance.
 * - Accepted ADR-005 aggregation contract for 'per_unit' vs 'per_total' rounding points.
 * - Deterministic, pure arithmetic with zero floats and zero I/O.
 */
export function calculateSingleScenario(
  input: SingleScenarioInput,
  rulePack: CalcRulePack,
): SingleScenarioResult {
  const { units, scenarioName, costVarianceRational, costVarianceString, revenueMinor } =
    validateSingleScenarioInput(input);

  // 1. Calculate per-unit baseline economics under Rule Pack
  const perUnit = calculatePerUnitEconomics(
    {
      listPriceMinor: input.listPriceMinor,
      currency: input.currency,
      format: input.format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
    rulePack,
  );

  const currency = perUnit.currency;
  const listPriceMinor = input.listPriceMinor;
  const roundingPolicy = rulePack.content.rounding;
  const roundingOperations: RoundingOperation[] = [...perUnit.trace.rounding.operations];
  const steps: ScenarioTraceStep[] = [...perUnit.trace.steps];

  // 2. Compute Cost Variance Multiplier: M = (100 + costVariancePercent) / 100
  const hundred = Rational.from(100);
  const varianceMultiplier = hundred.add(costVarianceRational).divide(hundred);
  const exactApplicableCostVaried = perUnit.exactApplicableCost.multiply(varianceMultiplier);

  if (!costVarianceRational.isZero()) {
    steps.push(
      Object.freeze({
        step: 'cost_variance_applied',
        costVariancePercent: costVarianceString,
        varianceMultiplierNumerator: varianceMultiplier.numerator.toString(),
        varianceMultiplierDenominator: varianceMultiplier.denominator.toString(),
        baseCostNumerator: perUnit.exactApplicableCost.numerator.toString(),
        baseCostDenominator: perUnit.exactApplicableCost.denominator.toString(),
        variedCostNumerator: exactApplicableCostVaried.numerator.toString(),
        variedCostDenominator: exactApplicableCostVaried.denominator.toString(),
        variedCostDecimalString: exactApplicableCostVaried.toDecimalString(),
      }),
    );
  }

  // 3. Multi-unit Aggregation per Accepted ADR-005
  let grossRoyaltyMoney: Money;
  let applicableCostMoney: Money;
  let netContributionMoney: Money;
  let exactTotalRoyalty: Rational;
  let exactTotalCost: Rational;

  const quantityRational = Rational.from(units);
  const revenueMoney = Money.of(revenueMinor, currency);

  if (units === 0) {
    // Quantity 0 boundary condition
    exactTotalRoyalty = Rational.zero();
    exactTotalCost = Rational.zero();
    grossRoyaltyMoney = Money.of(0, currency);
    applicableCostMoney = Money.of(0, currency);
    netContributionMoney = Money.of(0, currency);
  } else if (roundingPolicy.point === 'per_total') {
    // ADR-005 §A: per_total
    // exactTotalRoyalty = exactPerUnitRoyalty * Q
    // exactTotalCost = exactPerUnitCost * Q
    // roundedTotalRoyalty = round(exactTotalRoyalty, rulePack.rounding.mode)
    // roundedTotalCost = round(exactTotalCost, rulePack.rounding.mode)
    // totalContribution = roundedTotalRoyalty - roundedTotalCost
    exactTotalRoyalty = perUnit.exactGrossRoyalty.multiply(quantityRational);
    exactTotalCost = exactApplicableCostVaried.multiply(quantityRational);

    const roundedRoyaltyBig = exactTotalRoyalty.round(roundingPolicy.mode);
    const roundedCostBig = exactTotalCost.round(roundingPolicy.mode);

    if (
      roundedRoyaltyBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      roundedRoyaltyBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate royalty calculation overflowed safe integer bounds: ${roundedRoyaltyBig}`,
      );
    }

    if (
      roundedCostBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      roundedCostBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate cost calculation overflowed safe integer bounds: ${roundedCostBig}`,
      );
    }

    const netContributionBig = roundedRoyaltyBig - roundedCostBig;
    /* v8 ignore start - mathematically unreachable under complete validated input constraints:
     * With non-negative inputs (units >= 0, listPrice >= 0, royaltyRate >= 0, print/delivery cost >= 0, costVariancePercent >= -100%),
     * both exactTotalRoyalty and exactTotalCost are non-negative rationals. Rounding any non-negative rational produces a non-negative
     * integer, so 0 <= roundedRoyaltyBig and 0 <= roundedCostBig.
     * The preceding explicit guards guarantee roundedRoyaltyBig <= MAX_SAFE_INTEGER and roundedCostBig <= MAX_SAFE_INTEGER.
     * Bounds on netContributionBig = roundedRoyaltyBig - roundedCostBig:
     *   Upper bound (roundedCostBig = 0): roundedRoyaltyBig - 0 <= MAX_SAFE_INTEGER.
     *   Lower bound (roundedRoyaltyBig = 0): 0 - roundedCostBig >= -MAX_SAFE_INTEGER = MIN_SAFE_INTEGER.
     * Therefore, MIN_SAFE_INTEGER <= netContributionBig <= MAX_SAFE_INTEGER is guaranteed, making both positive
     * overflow (> MAX_SAFE_INTEGER) and negative overflow (< MIN_SAFE_INTEGER) mathematically unreachable.
     */
    if (
      netContributionBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      netContributionBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate net contribution calculation overflowed safe integer bounds: ${netContributionBig}`,
      );
    }
    /* v8 ignore stop */

    const roundedRoyaltyMinor = Number(roundedRoyaltyBig);
    const roundedCostMinor = Number(roundedCostBig);
    const netContributionMinor = Number(netContributionBig);

    grossRoyaltyMoney = Money.of(roundedRoyaltyMinor, currency);
    applicableCostMoney = Money.of(roundedCostMinor, currency);
    netContributionMoney = Money.of(netContributionMinor, currency);

    // Record aggregate rounding operations
    const royOp: RoundingOperation = Object.freeze({
      target: 'gross_royalty',
      mode: roundingPolicy.mode,
      point: 'per_total',
      unroundedNumerator: exactTotalRoyalty.numerator.toString(),
      unroundedDenominator: exactTotalRoyalty.denominator.toString(),
      unroundedDecimal: exactTotalRoyalty.toDecimalString(),
      roundedMinor: roundedRoyaltyMinor,
    });
    const costOp: RoundingOperation = Object.freeze({
      target: 'production_cost',
      mode: roundingPolicy.mode,
      point: 'per_total',
      unroundedNumerator: exactTotalCost.numerator.toString(),
      unroundedDenominator: exactTotalCost.denominator.toString(),
      unroundedDecimal: exactTotalCost.toDecimalString(),
      roundedMinor: roundedCostMinor,
    });
    roundingOperations.push(royOp, costOp);
  } else {
    // ADR-005 §B: per_unit
    // Aggregate already-rounded per-unit royalty and applicable cost
    exactTotalRoyalty = perUnit.exactGrossRoyalty.multiply(quantityRational);
    exactTotalCost = exactApplicableCostVaried.multiply(quantityRational);

    const unitRoyaltyMinor = perUnit.grossRoyalty!.amountMinor;
    const totalRoyaltyBig = BigInt(unitRoyaltyMinor) * BigInt(units);
    if (
      totalRoyaltyBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      totalRoyaltyBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate royalty calculation overflowed safe integer bounds: ${unitRoyaltyMinor} * ${units}`,
      );
    }
    const totalRoyaltyMinor = Number(totalRoyaltyBig);
    grossRoyaltyMoney = Money.of(totalRoyaltyMinor, currency);

    let unitCostMinor: number;
    if (costVarianceRational.isZero()) {
      unitCostMinor = perUnit.applicableCost!.amountMinor;
    } else {
      // Under per_unit, varied unit cost is rounded per unit using the declared rounding mode
      const roundedUnitCostBig = exactApplicableCostVaried.round(roundingPolicy.mode);
      if (
        roundedUnitCostBig > BigInt(Number.MAX_SAFE_INTEGER) ||
        roundedUnitCostBig < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        throw new CalcOverflowError(
          `Varied unit cost calculation overflowed safe integer bounds: ${roundedUnitCostBig}`,
        );
      }
      unitCostMinor = Number(roundedUnitCostBig);
      const varianceCostOp: RoundingOperation = Object.freeze({
        target: 'production_cost',
        mode: roundingPolicy.mode,
        point: 'per_unit',
        unroundedNumerator: exactApplicableCostVaried.numerator.toString(),
        unroundedDenominator: exactApplicableCostVaried.denominator.toString(),
        unroundedDecimal: exactApplicableCostVaried.toDecimalString(),
        roundedMinor: unitCostMinor,
      });
      roundingOperations.push(varianceCostOp);
    }

    const totalCostBig = BigInt(unitCostMinor) * BigInt(units);
    if (
      totalCostBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      totalCostBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate cost calculation overflowed safe integer bounds: ${unitCostMinor} * ${units}`,
      );
    }
    const totalCostMinor = Number(totalCostBig);
    applicableCostMoney = Money.of(totalCostMinor, currency);

    const netContributionBig = totalRoyaltyBig - totalCostBig;
    /* v8 ignore start - mathematically unreachable under complete validated input constraints:
     * With non-negative inputs (units >= 0, listPrice >= 0, royaltyRate >= 0, print/delivery cost >= 0, costVariancePercent >= -100%),
     * unitRoyaltyMinor >= 0 and unitCostMinor >= 0. Since units >= 0, totalRoyaltyBig >= 0 and totalCostBig >= 0.
     * The preceding explicit guards guarantee totalRoyaltyBig <= MAX_SAFE_INTEGER and totalCostBig <= MAX_SAFE_INTEGER.
     * Bounds on netContributionBig = totalRoyaltyBig - totalCostBig:
     *   Upper bound (totalCostBig = 0): totalRoyaltyBig - 0 <= MAX_SAFE_INTEGER.
     *   Lower bound (totalRoyaltyBig = 0): 0 - totalCostBig >= -MAX_SAFE_INTEGER = MIN_SAFE_INTEGER.
     * Therefore, MIN_SAFE_INTEGER <= netContributionBig <= MAX_SAFE_INTEGER is guaranteed, making both positive
     * overflow (> MAX_SAFE_INTEGER) and negative overflow (< MIN_SAFE_INTEGER) mathematically unreachable.
     */
    if (
      netContributionBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      netContributionBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Aggregate net contribution calculation overflowed safe integer bounds: ${netContributionBig}`,
      );
    }
    /* v8 ignore stop */
    const netContributionMinor = Number(netContributionBig);
    netContributionMoney = Money.of(netContributionMinor, currency);
  }

  const exactTotalContribution = exactTotalRoyalty.subtract(exactTotalCost);

  steps.push(
    Object.freeze({
      step: 'scenario_aggregation',
      quantity: units,
      roundingPoint: roundingPolicy.point,
      roundingMode: roundingPolicy.mode,
      exactTotalRoyaltyNumerator: exactTotalRoyalty.numerator.toString(),
      exactTotalRoyaltyDenominator: exactTotalRoyalty.denominator.toString(),
      exactTotalCostNumerator: exactTotalCost.numerator.toString(),
      exactTotalCostDenominator: exactTotalCost.denominator.toString(),
      totalRoyaltyMinor: grossRoyaltyMoney.amountMinor,
      totalCostMinor: applicableCostMoney.amountMinor,
      totalContributionMinor: netContributionMoney.amountMinor,
      totalRevenueMinor: revenueMoney.amountMinor,
    }),
  );

  // 4. Assemble Scenario Calculation Trace
  const trace: ScenarioCalculationTrace = deepFreeze({
    engineVersion: CALC_ENGINE_MODULE_VERSION,
    scenarioName,
    rulePackRef: {
      id: String(rulePack.id),
      packKey: rulePack.packKey,
      version: rulePack.version,
      contentHash: rulePack.contentHash,
    },
    input: {
      scenarioName,
      units,
      listPriceMinor,
      costVariancePercent: costVarianceString,
      currency,
      format: perUnit.format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
    perUnitSummary: {
      listPriceMinor,
      exactGrossRoyalty: {
        numerator: perUnit.exactGrossRoyalty.numerator.toString(),
        denominator: perUnit.exactGrossRoyalty.denominator.toString(),
        decimalString: perUnit.exactGrossRoyalty.toDecimalString(),
      },
      exactApplicableCost: {
        numerator: perUnit.exactApplicableCost.numerator.toString(),
        denominator: perUnit.exactApplicableCost.denominator.toString(),
        decimalString: perUnit.exactApplicableCost.toDecimalString(),
      },
      exactApplicableCostVaried: {
        numerator: exactApplicableCostVaried.numerator.toString(),
        denominator: exactApplicableCostVaried.denominator.toString(),
        decimalString: exactApplicableCostVaried.toDecimalString(),
      },
      costVariancePercent: costVarianceString,
      perUnitGrossRoyaltyMinor: perUnit.grossRoyalty?.amountMinor ?? null,
      perUnitApplicableCostMinor: perUnit.applicableCost?.amountMinor ?? null,
      perUnitNetContributionMinor: perUnit.netContribution?.amountMinor ?? null,
    },
    aggregation: {
      quantity: units,
      roundingPoint: roundingPolicy.point,
      roundingMode: roundingPolicy.mode,
      exactTotalRoyalty: {
        numerator: exactTotalRoyalty.numerator.toString(),
        denominator: exactTotalRoyalty.denominator.toString(),
        decimalString: exactTotalRoyalty.toDecimalString(),
      },
      exactTotalCost: {
        numerator: exactTotalCost.numerator.toString(),
        denominator: exactTotalCost.denominator.toString(),
        decimalString: exactTotalCost.toDecimalString(),
      },
      exactTotalContribution: {
        numerator: exactTotalContribution.numerator.toString(),
        denominator: exactTotalContribution.denominator.toString(),
        decimalString: exactTotalContribution.toDecimalString(),
      },
      totalRoyaltyMinor: grossRoyaltyMoney.amountMinor,
      totalCostMinor: applicableCostMoney.amountMinor,
      totalContributionMinor: netContributionMoney.amountMinor,
      totalRevenueMinor: revenueMoney.amountMinor,
    },
    roundingOperations: [...roundingOperations],
    steps: [...steps],
  });

  return deepFreeze({
    scenarioName,
    units,
    listPrice: Money.of(listPriceMinor, currency),
    revenue: revenueMoney,
    grossRoyalty: grossRoyaltyMoney,
    applicableCost: applicableCostMoney,
    netContribution: netContributionMoney,
    isIllustrative: true,
    disclaimer: SCENARIO_DISCLAIMER_TEXT,
    perUnitEconomics: perUnit,
    exactCostVarianceMultiplier: varianceMultiplier,
    exactApplicableCostVaried,
    exactTotalRoyalty,
    exactTotalCost,
    exactTotalContribution,
    trace,
  });
}

/**
 * Evaluates whether scenario input parameters and calculated totals follow monotonic economic ordering.
 */
export function evaluateScenarioOrdering(
  triad: Pick<TriadScenariosResult, 'scenarios'>,
  inputs?: CaseScenariosInput['scenarios'],
): ScenarioOrderingEvaluation {
  const low = triad.scenarios.low;
  const base = triad.scenarios.base;
  const high = triad.scenarios.high;

  let areInputsMonotonicallyOrdered = false;

  if (inputs) {
    const lowCostVar = parseCostVariance(inputs.low.costVariancePercent).rational;
    const baseCostVar = parseCostVariance(inputs.base.costVariancePercent).rational;
    const highCostVar = parseCostVariance(inputs.high.costVariancePercent).rational;

    // Price ordering: low <= base <= high
    const priceOrdered =
      inputs.low.listPriceMinor <= inputs.base.listPriceMinor &&
      inputs.base.listPriceMinor <= inputs.high.listPriceMinor;

    // Units ordering: low <= base <= high
    const unitsOrdered =
      inputs.low.units <= inputs.base.units && inputs.base.units <= inputs.high.units;

    // Cost variance ordering: low >= base >= high (higher cost variance is adverse, reducing contribution)
    const costVarianceOrdered =
      lowCostVar.compare(baseCostVar) >= 0 && baseCostVar.compare(highCostVar) >= 0;

    areInputsMonotonicallyOrdered = priceOrdered && unitsOrdered && costVarianceOrdered;
  }

  const netContributionOrderingSatisfied =
    low.netContribution.amountMinor <= base.netContribution.amountMinor &&
    base.netContribution.amountMinor <= high.netContribution.amountMinor;

  const revenueOrderingSatisfied =
    low.revenue.amountMinor <= base.revenue.amountMinor &&
    base.revenue.amountMinor <= high.revenue.amountMinor;

  const areTotalsMonotonicallyOrdered =
    netContributionOrderingSatisfied && revenueOrderingSatisfied;

  return deepFreeze({
    areInputsMonotonicallyOrdered,
    areTotalsMonotonicallyOrdered,
    netContributionOrderingSatisfied,
    revenueOrderingSatisfied,
    details: {
      lowContributionMinor: low.netContribution.amountMinor,
      baseContributionMinor: base.netContribution.amountMinor,
      highContributionMinor: high.netContribution.amountMinor,
      lowRevenueMinor: low.revenue.amountMinor,
      baseRevenueMinor: base.revenue.amountMinor,
      highRevenueMinor: high.revenue.amountMinor,
    },
  });
}

/**
 * Calculates the complete triad of low, base, and high scenarios.
 *
 * Guarantees:
 * - Scenarios are calculated independently with their own parameters.
 * - Does NOT manufacture low/high by scaling base totals.
 * - Produces exact ScenarioTotals matching domain contracts.
 * - Includes mandatory illustrative disclaimer per FR-006 / FR-024 / INV-12.
 */
export function calculateTriadScenarios(
  input: CaseScenariosInput,
  rulePack: CalcRulePack,
): TriadScenariosResult {
  if (!input || typeof input !== 'object') {
    throw new CalcInputValidationError('INVALID_INPUT', 'CaseScenariosInput must be an object');
  }

  if (!input.scenarios || typeof input.scenarios !== 'object') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'CaseScenariosInput must contain "scenarios" object',
    );
  }

  const { low, base, high } = input.scenarios;
  if (!low || !base || !high) {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'CaseScenariosInput must provide low, base, and high scenarios',
    );
  }

  if (low.scenarioName !== undefined && low.scenarioName !== 'low') {
    throw new CalcInputValidationError(
      'SCENARIO_NAME_MISMATCH',
      `Triad "low" scenario contains mismatched scenarioName: "${String(low.scenarioName)}"`,
    );
  }
  if (base.scenarioName !== undefined && base.scenarioName !== 'base') {
    throw new CalcInputValidationError(
      'SCENARIO_NAME_MISMATCH',
      `Triad "base" scenario contains mismatched scenarioName: "${String(base.scenarioName)}"`,
    );
  }
  if (high.scenarioName !== undefined && high.scenarioName !== 'high') {
    throw new CalcInputValidationError(
      'SCENARIO_NAME_MISMATCH',
      `Triad "high" scenario contains mismatched scenarioName: "${String(high.scenarioName)}"`,
    );
  }

  const sharedProps = {
    currency: input.currency,
    format: input.format,
    pages: input.pages,
    fileSizeMb: input.fileSizeMb,
  };

  // Calculate each scenario independently
  const lowResult = calculateSingleScenario(
    {
      scenarioName: 'low',
      units: low.units,
      listPriceMinor: low.listPriceMinor,
      costVariancePercent: low.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  const baseResult = calculateSingleScenario(
    {
      scenarioName: 'base',
      units: base.units,
      listPriceMinor: base.listPriceMinor,
      costVariancePercent: base.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  const highResult = calculateSingleScenario(
    {
      scenarioName: 'high',
      units: high.units,
      listPriceMinor: high.listPriceMinor,
      costVariancePercent: high.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  const lowTotals: ScenarioTotals = deepFreeze({
    scenarioName: 'low',
    units: lowResult.units,
    listPrice: lowResult.listPrice,
    revenue: lowResult.revenue,
    grossRoyalty: lowResult.grossRoyalty,
    applicableCost: lowResult.applicableCost,
    netContribution: lowResult.netContribution,
    isIllustrative: true,
  });

  const baseTotals: ScenarioTotals = deepFreeze({
    scenarioName: 'base',
    units: baseResult.units,
    listPrice: baseResult.listPrice,
    revenue: baseResult.revenue,
    grossRoyalty: baseResult.grossRoyalty,
    applicableCost: baseResult.applicableCost,
    netContribution: baseResult.netContribution,
    isIllustrative: true,
  });

  const highTotals: ScenarioTotals = deepFreeze({
    scenarioName: 'high',
    units: highResult.units,
    listPrice: highResult.listPrice,
    revenue: highResult.revenue,
    grossRoyalty: highResult.grossRoyalty,
    applicableCost: highResult.applicableCost,
    netContribution: highResult.netContribution,
    isIllustrative: true,
  });

  const ordering = evaluateScenarioOrdering(
    {
      scenarios: {
        low: lowResult,
        base: baseResult,
        high: highResult,
      },
    },
    input.scenarios,
  );

  return deepFreeze({
    scenarios: {
      low: lowResult,
      base: baseResult,
      high: highResult,
    },
    totals: {
      low: lowTotals,
      base: baseTotals,
      high: highTotals,
    },
    rulePackRef: {
      id: String(rulePack.id),
      packKey: rulePack.packKey,
      version: rulePack.version,
      contentHash: rulePack.contentHash,
    },
    engineVersion: CALC_ENGINE_MODULE_VERSION,
    isIllustrative: true,
    disclaimer: SCENARIO_DISCLAIMER_TEXT,
    ordering,
  });
}
