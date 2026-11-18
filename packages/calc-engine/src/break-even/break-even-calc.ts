import {
  type BookFormat,
  type CurrencyCode,
  isBookFormat,
  isSupportedCurrency,
  Money,
  parseCurrencyCode,
  SCENARIO_DISCLAIMER_TEXT,
} from '@nimphy/domain';
import {
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
} from '../errors/calc-error';
import { Rational } from '../math/rational';
import { CALC_ENGINE_MODULE_VERSION, calculatePerUnitEconomics } from '../per-unit/per-unit-calc';
import type { CalcRulePack } from '../per-unit/types';
import { deepFreeze, parseCostVariance } from '../scenarios/scenario-calc';
import type {
  BreakEvenCalculationTrace,
  BreakEvenInput,
  BreakEvenResult,
  BreakEvenTraceStep,
  BreakEvenUnreachableReason,
} from './types';

/**
 * Validates break-even input parameters and currency consistency.
 */
function validateBreakEvenInput(
  input: BreakEvenInput,
  rulePack: CalcRulePack,
): {
  fixedCost: Money;
  currency: CurrencyCode;
  format: BookFormat;
  listPriceMinor: number;
  costVarianceRational: Rational;
  costVarianceString: string;
} {
  if (!input || typeof input !== 'object') {
    throw new CalcInputValidationError('INVALID_INPUT', 'Break-even input must be an object');
  }

  if (!rulePack || typeof rulePack !== 'object' || !rulePack.content) {
    throw new CalcInputValidationError('INVALID_RULE_PACK', 'Valid Rule Pack must be provided');
  }

  // 1. Fixed cost validation
  if (!input.fixedCost || !(input.fixedCost instanceof Money)) {
    throw new CalcInputValidationError(
      'INVALID_FIXED_COST',
      'fixedCost must be a valid Money instance in break-even input',
    );
  }

  if (input.fixedCost.amountMinor < 0) {
    throw new CalcInputValidationError(
      'FIXED_COST_OUT_OF_BOUNDS',
      `fixedCost cannot be negative, received: ${input.fixedCost.amountMinor}`,
    );
  }

  if (!Number.isSafeInteger(input.fixedCost.amountMinor)) {
    throw new CalcInputValidationError(
      'INVALID_INTEGER',
      `fixedCost amountMinor must be a safe integer, received: ${input.fixedCost.amountMinor}`,
    );
  }

  // 2. Currency validation
  if (!input.currency || typeof input.currency !== 'string') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'currency is required in break-even input',
    );
  }

  if (!isSupportedCurrency(input.currency)) {
    throw new CalcInputValidationError(
      'UNSUPPORTED_CURRENCY',
      `Currency "${input.currency}" is not supported`,
    );
  }

  const validatedCurrency = parseCurrencyCode(input.currency);
  const fixedCostCurrency = input.fixedCost.currency;

  if (fixedCostCurrency !== validatedCurrency) {
    throw new CalcCurrencyMismatchError(fixedCostCurrency, validatedCurrency);
  }

  const rulePackCurrency = parseCurrencyCode(rulePack.currency);
  if (validatedCurrency !== rulePackCurrency) {
    throw new CalcCurrencyMismatchError(validatedCurrency, rulePackCurrency);
  }

  // 3. Format validation
  if (!input.format || typeof input.format !== 'string') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'format is required in break-even input',
    );
  }

  if (!isBookFormat(input.format)) {
    throw new CalcInputValidationError(
      'UNSUPPORTED_FORMAT',
      `Format "${input.format}" is not a recognized BookFormat`,
    );
  }

  const validatedFormat = input.format;
  if (validatedFormat !== rulePack.format) {
    throw new CalcFormatMismatchError(validatedFormat, String(rulePack.format));
  }

  // 4. List price validation
  if (typeof input.listPriceMinor !== 'number') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'listPriceMinor is required in break-even input',
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

  // 5. Cost variance validation
  const { rational: costVarianceRational, percentString: costVarianceString } = parseCostVariance(
    input.costVariancePercent,
  );

  return {
    fixedCost: input.fixedCost,
    currency: validatedCurrency,
    format: validatedFormat,
    listPriceMinor: input.listPriceMinor,
    costVarianceRational,
    costVarianceString,
  };
}

/**
 * Calculates deterministic break-even units and revenue under declared Rule Pack economics.
 *
 * Conforms to:
 * - Principle P-01: Deterministic core (pure code, zero I/O, zero AI, zero floating-point math).
 * - Principle P-03: Traceability (full structured calculation trace).
 * - Principle P-04: Immutability (all results and nested traces deep-frozen).
 * - FR-007: Break-even units and revenue; explicit unreachable result when unit contribution <= 0.
 * - Accepted ADR-005: Respects declared rounding policy ('per_unit' vs 'per_total').
 *
 * Exact roadmap ceiling formula:
 * \[
 * Q_{\text{be}} = \left\lceil \frac{\text{FixedCost}}{\text{ExactUnitContribution}} \right\rceil
 * \]
 * implemented via native BigInt integer division and remainder without floating-point arithmetic.
 * Represents the formula-defined break-even quantity required by the roadmap (distinct from an
 * iterative search for minimum quantity covering independently rounded aggregate ledger components).
 */
export function calculateBreakEven(input: BreakEvenInput, rulePack: CalcRulePack): BreakEvenResult {
  const { fixedCost, currency, format, listPriceMinor, costVarianceRational, costVarianceString } =
    validateBreakEvenInput(input, rulePack);

  // 1. Calculate baseline per-unit economics under Rule Pack
  const perUnit = calculatePerUnitEconomics(
    {
      listPriceMinor,
      currency,
      format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
    rulePack,
  );

  const roundingPolicy = rulePack.content.rounding;
  const steps: BreakEvenTraceStep[] = [...perUnit.trace.steps];

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

  // 3. Derive applicable Unit Contribution per Accepted ADR-005
  let unitContributionMinor: number | null;
  let exactUnitContribution: Rational;

  if (roundingPolicy.point === 'per_unit') {
    // Under per_unit: uses already-rounded per-unit royalty and varied unit cost
    const unitRoyaltyMinor = perUnit.grossRoyalty!.amountMinor;
    let unitCostMinor: number;

    if (costVarianceRational.isZero()) {
      unitCostMinor = perUnit.applicableCost!.amountMinor;
    } else {
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
    }

    const netContribBig = BigInt(unitRoyaltyMinor) - BigInt(unitCostMinor);
    /* v8 ignore start - mathematically unreachable under complete validated input constraints:
     * With non-negative inputs (listPrice >= 0, royaltyRate >= 0, print/delivery cost >= 0, costVariancePercent >= -100%),
     * unitRoyaltyMinor >= 0 and unitCostMinor >= 0. Both are bounded <= MAX_SAFE_INTEGER by prior validation.
     * Difference netContribBig = unitRoyaltyMinor - unitCostMinor is strictly within [-MAX_SAFE_INTEGER, MAX_SAFE_INTEGER].
     */
    if (
      netContribBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      netContribBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Unit contribution calculation overflowed safe integer bounds: ${netContribBig}`,
      );
    }
    /* v8 ignore stop */

    unitContributionMinor = Number(netContribBig);
    exactUnitContribution = Rational.from(unitContributionMinor);
  } else {
    // Under per_total: preserves exact rational difference until aggregate evaluation
    exactUnitContribution = perUnit.exactGrossRoyalty.subtract(exactApplicableCostVaried);
    unitContributionMinor =
      exactUnitContribution.denominator === 1n &&
      exactUnitContribution.numerator <= BigInt(Number.MAX_SAFE_INTEGER) &&
      exactUnitContribution.numerator >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(exactUnitContribution.numerator)
        : null;
  }

  const isPositiveContribution = exactUnitContribution.isPositive();

  steps.push(
    Object.freeze({
      step: 'unit_contribution_evaluated',
      roundingPoint: roundingPolicy.point,
      roundingMode: roundingPolicy.mode,
      exactNumerator: exactUnitContribution.numerator.toString(),
      exactDenominator: exactUnitContribution.denominator.toString(),
      exactDecimalString: exactUnitContribution.toDecimalString(),
      unitContributionMinor,
      isPositive: isPositiveContribution,
    }),
  );

  // 4. Handle Unreachable Cases (zero or negative unit contribution)
  // Per FR-007 and P-07: A zero or negative unit contribution must not be labelled reachable
  // merely because fixed cost is zero.
  if (!isPositiveContribution) {
    const unreachableReason: BreakEvenUnreachableReason = exactUnitContribution.isZero()
      ? 'ZERO_CONTRIBUTION'
      : 'NEGATIVE_CONTRIBUTION';

    steps.push(
      Object.freeze({
        step: 'break_even_unreachable',
        reason: unreachableReason,
        unitContributionMinor,
        exactDecimalString: exactUnitContribution.toDecimalString(),
      }),
    );

    const trace: BreakEvenCalculationTrace = Object.freeze({
      engineVersion: CALC_ENGINE_MODULE_VERSION,
      rulePackRef: Object.freeze({
        id: String(rulePack.id),
        packKey: rulePack.packKey,
        version: rulePack.version,
        contentHash: rulePack.contentHash,
      }),
      input: Object.freeze({
        fixedCostMinor: fixedCost.amountMinor,
        currency,
        listPriceMinor,
        format,
        pages: input.pages,
        fileSizeMb: input.fileSizeMb,
        costVariancePercent: costVarianceString,
      }),
      unitContribution: Object.freeze({
        roundingPoint: roundingPolicy.point,
        roundingMode: roundingPolicy.mode,
        exact: Object.freeze({
          numerator: exactUnitContribution.numerator.toString(),
          denominator: exactUnitContribution.denominator.toString(),
          decimalString: exactUnitContribution.toDecimalString(),
        }),
        unitContributionMinor,
      }),
      division: null,
      result: Object.freeze({
        reachable: false,
        unreachableReason,
      }),
      steps: Object.freeze(steps.map((s) => Object.freeze({ ...s }))),
    });

    const result: BreakEvenResult = Object.freeze({
      reachable: false,
      unreachableReason,
      fixedCost,
      unitContributionMinor,
      exactUnitContribution,
      isIllustrative: true,
      disclaimer: SCENARIO_DISCLAIMER_TEXT,
      trace,
    });

    return deepFreeze(result);
  }

  // 5. Reachable Break-Even Calculation
  let breakEvenUnits: number;
  let revenueMoney: Money;
  let divisionInfo: {
    numerator: string;
    denominator: string;
    quotient: string;
    remainder: string;
    isExactDivision: boolean;
    ceilingApplied: boolean;
  };

  if (fixedCost.amountMinor === 0) {
    // Zero fixed cost with positive contribution requires 0 units to break even
    breakEvenUnits = 0;
    revenueMoney = Money.of(0, currency);
    divisionInfo = {
      numerator: '0',
      denominator: '1',
      quotient: '0',
      remainder: '0',
      isExactDivision: true,
      ceilingApplied: false,
    };

    steps.push(
      Object.freeze({
        step: 'break_even_ceiling_calculated',
        fixedCostMinor: 0,
        numerator: '0',
        denominator: '1',
        quotient: '0',
        remainder: '0',
        isExactDivision: true,
        ceilingApplied: false,
        breakEvenUnits: 0,
        breakEvenRevenueMinor: 0,
      }),
    );
  } else {
    // Positive fixed cost and positive contribution: calculate exact ceiling
    // Q_be = ceil( FixedCost / UnitContribution )
    //      = ceil( (FixedCost * U_den) / U_num )
    const fixedCostBig = BigInt(fixedCost.amountMinor);
    const uNum = exactUnitContribution.numerator;
    const uDen = exactUnitContribution.denominator;

    const numeratorBig = fixedCostBig * uDen;
    const denominatorBig = uNum;

    const quotientBig = numeratorBig / denominatorBig;
    const remainderBig = numeratorBig % denominatorBig;

    const isExactDivision = remainderBig === 0n;
    const ceilingApplied = !isExactDivision;
    const breakEvenUnitsBig = isExactDivision ? quotientBig : quotientBig + 1n;

    if (
      breakEvenUnitsBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      breakEvenUnitsBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Break-even units calculation overflowed safe integer bounds: ${breakEvenUnitsBig}`,
      );
    }

    breakEvenUnits = Number(breakEvenUnitsBig);

    // Compute gross retail sales revenue at the whole-unit, formula-defined break-even threshold:
    // revenue = listPriceMinor * breakEvenUnits
    // Precise semantic meaning: Gross retail sales revenue (not author royalties, publisher proceeds, or net profit).
    const revenueBig = BigInt(listPriceMinor) * breakEvenUnitsBig;
    if (
      revenueBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      revenueBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Break-even revenue calculation overflowed safe integer bounds: ${listPriceMinor} * ${breakEvenUnits}`,
      );
    }

    const revenueMinor = Number(revenueBig);
    revenueMoney = Money.of(revenueMinor, currency);

    divisionInfo = {
      numerator: numeratorBig.toString(),
      denominator: denominatorBig.toString(),
      quotient: quotientBig.toString(),
      remainder: remainderBig.toString(),
      isExactDivision,
      ceilingApplied,
    };

    steps.push(
      Object.freeze({
        step: 'break_even_ceiling_calculated',
        fixedCostMinor: fixedCost.amountMinor,
        numerator: numeratorBig.toString(),
        denominator: denominatorBig.toString(),
        quotient: quotientBig.toString(),
        remainder: remainderBig.toString(),
        isExactDivision,
        ceilingApplied,
        breakEvenUnits,
        breakEvenRevenueMinor: revenueMinor,
      }),
    );
  }

  const trace: BreakEvenCalculationTrace = Object.freeze({
    engineVersion: CALC_ENGINE_MODULE_VERSION,
    rulePackRef: Object.freeze({
      id: String(rulePack.id),
      packKey: rulePack.packKey,
      version: rulePack.version,
      contentHash: rulePack.contentHash,
    }),
    input: Object.freeze({
      fixedCostMinor: fixedCost.amountMinor,
      currency,
      listPriceMinor,
      format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
      costVariancePercent: costVarianceString,
    }),
    unitContribution: Object.freeze({
      roundingPoint: roundingPolicy.point,
      roundingMode: roundingPolicy.mode,
      exact: Object.freeze({
        numerator: exactUnitContribution.numerator.toString(),
        denominator: exactUnitContribution.denominator.toString(),
        decimalString: exactUnitContribution.toDecimalString(),
      }),
      unitContributionMinor,
    }),
    division: Object.freeze({ ...divisionInfo }),
    result: Object.freeze({
      reachable: true,
      units: breakEvenUnits,
      revenueMinor: revenueMoney.amountMinor,
    }),
    steps: Object.freeze(steps.map((s) => Object.freeze({ ...s }))),
  });

  const result: BreakEvenResult = Object.freeze({
    reachable: true,
    units: breakEvenUnits,
    revenue: revenueMoney,
    fixedCost,
    unitContributionMinor,
    exactUnitContribution,
    isIllustrative: true,
    disclaimer: SCENARIO_DISCLAIMER_TEXT,
    trace,
  });

  return deepFreeze(result);
}
