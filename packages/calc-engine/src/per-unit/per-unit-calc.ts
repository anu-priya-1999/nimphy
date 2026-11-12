import {
  type BookFormat,
  type CurrencyCode,
  isBookFormat,
  isSupportedCurrency,
  Money,
  parseCurrencyCode,
} from '@nimphy/domain';
import {
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcInputValidationError,
  CalcOverflowError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
} from '../errors/calc-error';
import { Rational } from '../math/rational';
import type {
  CalcRulePack,
  CalculationTrace,
  CalculationTraceStep,
  CostBreakdown,
  PerUnitCalcInput,
  PerUnitEconomics,
  RoundingOperation,
} from './types';

export const CALC_ENGINE_MODULE_VERSION = '0.1.0';

/**
 * Validates calculation input and Rule Pack compatibility.
 */
function validateInputs(
  input: PerUnitCalcInput,
  rulePack: CalcRulePack,
): {
  currency: CurrencyCode;
  format: BookFormat;
  listPriceMinor: number;
} {
  if (!input || typeof input !== 'object') {
    throw new CalcInputValidationError('INVALID_INPUT', 'Calculation input must be an object');
  }

  if (!rulePack || typeof rulePack !== 'object' || !rulePack.content) {
    throw new CalcInputValidationError('INVALID_RULE_PACK', 'Valid Rule Pack must be provided');
  }

  // 1. Currency validation
  if (!input.currency || typeof input.currency !== 'string') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'Currency is required in calculation input',
    );
  }

  if (!isSupportedCurrency(input.currency)) {
    throw new CalcInputValidationError(
      'UNSUPPORTED_CURRENCY',
      `Currency "${input.currency}" is not supported`,
    );
  }

  const validatedCurrency = parseCurrencyCode(input.currency);
  const rulePackCurrency = parseCurrencyCode(rulePack.currency);

  if (validatedCurrency !== rulePackCurrency) {
    throw new CalcCurrencyMismatchError(validatedCurrency, rulePackCurrency);
  }

  // 2. Format validation
  if (!input.format || typeof input.format !== 'string') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'Format is required in calculation input',
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

  // 3. List price validation
  if (typeof input.listPriceMinor !== 'number') {
    throw new CalcInputValidationError(
      'MISSING_REQUIRED_INPUT',
      'listPriceMinor must be a number in calculation input',
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

  const limits = rulePack.content.limits;
  if (limits) {
    if (input.listPriceMinor < limits.minListPriceMinor) {
      throw new CalcInputValidationError(
        'PRICE_OUT_OF_BOUNDS',
        `listPriceMinor ${input.listPriceMinor} is below minimum allowed price ${limits.minListPriceMinor} ${validatedCurrency}`,
        { listPriceMinor: input.listPriceMinor, minAllowed: limits.minListPriceMinor },
      );
    }
    if (input.listPriceMinor > limits.maxListPriceMinor) {
      throw new CalcInputValidationError(
        'PRICE_OUT_OF_BOUNDS',
        `listPriceMinor ${input.listPriceMinor} exceeds maximum allowed price ${limits.maxListPriceMinor} ${validatedCurrency}`,
        { listPriceMinor: input.listPriceMinor, maxAllowed: limits.maxListPriceMinor },
      );
    }
  }

  // 4. Format-specific field validation
  if (validatedFormat === 'ebook') {
    if (input.pages !== undefined) {
      throw new CalcInputValidationError(
        'UNSUPPORTED_FORMAT_INPUT',
        'Field "pages" is not supported for ebook format',
      );
    }
    if (input.fileSizeMb === undefined) {
      throw new CalcInputValidationError(
        'MISSING_REQUIRED_INPUT',
        'Field "fileSizeMb" is required for ebook format',
      );
    }
    if (typeof input.fileSizeMb !== 'string') {
      throw new CalcInputValidationError(
        'DELIVERY_SIZE_INVALID',
        `Field "fileSizeMb" must be a string decimal, received: ${typeof input.fileSizeMb}`,
      );
    }
    const trimmed = input.fileSizeMb.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      throw new CalcInputValidationError(
        'DELIVERY_SIZE_INVALID',
        'Field "fileSizeMb" cannot be empty or excessively long',
      );
    }
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new CalcInputValidationError(
        'DELIVERY_SIZE_INVALID',
        `Field "fileSizeMb" must be a positive decimal string (e.g. "0.5", "2.1"), received: "${input.fileSizeMb}"`,
      );
    }
    const fileSizeRational = Rational.fromDecimal(trimmed);
    if (fileSizeRational.isZero() || fileSizeRational.isNegative()) {
      throw new CalcInputValidationError(
        'DELIVERY_SIZE_INVALID',
        `Field "fileSizeMb" must be strictly greater than zero, received: "${input.fileSizeMb}"`,
      );
    }
  } else {
    // Physical format (paperback, hardcover)
    if (input.fileSizeMb !== undefined) {
      throw new CalcInputValidationError(
        'UNSUPPORTED_FORMAT_INPUT',
        `Field "fileSizeMb" is not supported for ${validatedFormat} format`,
      );
    }
    if (input.pages === undefined) {
      throw new CalcInputValidationError(
        'MISSING_REQUIRED_INPUT',
        `Field "pages" is required for ${validatedFormat} format`,
      );
    }
    if (
      typeof input.pages !== 'number' ||
      !Number.isFinite(input.pages) ||
      !Number.isSafeInteger(input.pages) ||
      input.pages <= 0
    ) {
      throw new CalcInputValidationError(
        'PAGES_OUT_OF_BOUNDS',
        `Field "pages" must be a positive safe integer, received: ${String(input.pages)}`,
      );
    }
    if (limits) {
      if (limits.minPages !== null && input.pages < limits.minPages) {
        throw new CalcInputValidationError(
          'PAGES_OUT_OF_BOUNDS',
          `Page count ${input.pages} is below minimum allowed pages ${limits.minPages}`,
          { pages: input.pages, minPages: limits.minPages },
        );
      }
      if (limits.maxPages !== null && input.pages > limits.maxPages) {
        throw new CalcInputValidationError(
          'PAGES_OUT_OF_BOUNDS',
          `Page count ${input.pages} exceeds maximum allowed pages ${limits.maxPages}`,
          { pages: input.pages, maxPages: limits.maxPages },
        );
      }
    }
  }

  return {
    currency: validatedCurrency,
    format: validatedFormat,
    listPriceMinor: input.listPriceMinor,
  };
}

/**
 * Calculates per-unit economics (gross royalty, production/distribution costs, and net contribution)
 * under a validated Rule Pack.
 *
 * Guarantees:
 * - Deterministic, pure TypeScript with zero I/O, zero AI, and zero floating-point arithmetic.
 * - Exact rational calculations using BigInt.
 * - Strict adherence to declared Rule Pack rounding policy (mode and point).
 * - Full structured calculation trace for bit-for-bit replay.
 */
export function calculatePerUnitEconomics(
  input: PerUnitCalcInput,
  rulePack: CalcRulePack,
): PerUnitEconomics {
  const { currency, format, listPriceMinor } = validateInputs(input, rulePack);

  const steps: CalculationTraceStep[] = [
    {
      step: 'input_validated',
      listPriceMinor,
      currency,
      format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
  ];

  // 1. Tier Selection
  const tiers = rulePack.content.royalty.tiers;
  const matchedTier = tiers.find(
    (tier) =>
      tier.minPriceMinor <= listPriceMinor &&
      (tier.maxPriceMinor === null || listPriceMinor <= tier.maxPriceMinor),
  );

  if (!matchedTier) {
    throw new NoMatchingRoyaltyTierError(listPriceMinor, currency);
  }

  const rateRational = Rational.fromDecimal(matchedTier.royaltyRateDecimal);

  steps.push({
    step: 'tier_selected',
    tierName: matchedTier.name,
    minPriceMinor: matchedTier.minPriceMinor,
    maxPriceMinor: matchedTier.maxPriceMinor,
    royaltyRateDecimal: matchedTier.royaltyRateDecimal,
    rateNumerator: rateRational.numerator.toString(),
    rateDenominator: rateRational.denominator.toString(),
  });

  // 2. Gross Royalty Calculation
  const listPriceRational = Rational.from(listPriceMinor);
  const exactGrossRoyalty = listPriceRational.multiply(rateRational);

  steps.push({
    step: 'gross_royalty_calculated',
    exactNumerator: exactGrossRoyalty.numerator.toString(),
    exactDenominator: exactGrossRoyalty.denominator.toString(),
    exactDecimalString: exactGrossRoyalty.toDecimalString(),
  });

  // 3. Cost Calculation (Print or Delivery)
  let costBreakdown: CostBreakdown;
  let exactApplicableCost: Rational;

  if (format === 'ebook') {
    const deliveryPolicy = rulePack.content.deliveryCost;
    if (!deliveryPolicy) {
      costBreakdown = {
        kind: 'none',
        totalCostMinor: 0,
        exactCostNumerator: '0',
        exactCostDenominator: '1',
        exactCostDecimalString: '0',
        roundedCostMinor: 0,
      };
      exactApplicableCost = Rational.zero();
    } else {
      const fileSizeStr = input.fileSizeMb!.trim();
      const costPerMb = deliveryPolicy.costPerMbMinor;
      const fileSizeRational = Rational.fromDecimal(fileSizeStr);
      const costPerMbRational = Rational.from(costPerMb);
      exactApplicableCost = fileSizeRational.multiply(costPerMbRational);

      if (
        exactApplicableCost.numerator > BigInt(Number.MAX_SAFE_INTEGER) ||
        exactApplicableCost.numerator < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        throw new CalcOverflowError(
          `Delivery cost calculation overflowed safe integer bounds: ${fileSizeStr} MB * ${costPerMb}`,
        );
      }

      costBreakdown = {
        kind: 'delivery',
        fileSizeMb: fileSizeStr,
        costPerMbMinor: costPerMb,
        exactCostNumerator: exactApplicableCost.numerator.toString(),
        exactCostDenominator: exactApplicableCost.denominator.toString(),
        exactCostDecimalString: exactApplicableCost.toDecimalString(),
        totalCostMinor: null,
        roundedCostMinor: null,
      };
    }
  } else {
    // Paperback or Hardcover
    const printPolicy = rulePack.content.printCost;
    if (!printPolicy) {
      throw new RulePackIncompatibleError(
        'PRINT_COST_POLICY_MISSING',
        `Rule Pack for physical format "${format}" is missing required printCost policy`,
      );
    }

    const pages = input.pages!;
    const threshold = printPolicy.pageThreshold ?? 0;
    const excessPages = Math.max(0, pages - threshold);
    const perPageCostMinor = excessPages * printPolicy.costPerPageMinor;
    const totalCostMinor = printPolicy.baseCostMinor + perPageCostMinor;

    if (!Number.isSafeInteger(totalCostMinor)) {
      throw new CalcOverflowError(
        `Print cost calculation overflowed safe integer bounds for ${pages} pages`,
      );
    }

    exactApplicableCost = Rational.from(totalCostMinor);

    costBreakdown = {
      kind: 'print',
      baseCostMinor: printPolicy.baseCostMinor,
      costPerPageMinor: printPolicy.costPerPageMinor,
      pages,
      pageThreshold: threshold,
      excessPages,
      perPageCostMinor,
      totalCostMinor,
      exactCostNumerator: exactApplicableCost.numerator.toString(),
      exactCostDenominator: exactApplicableCost.denominator.toString(),
      exactCostDecimalString: exactApplicableCost.toDecimalString(),
      roundedCostMinor: totalCostMinor,
    };
  }

  // 4. Net Per-Unit Contribution (Exact Rational)
  const exactNetContribution = exactGrossRoyalty.subtract(exactApplicableCost);

  // 5. Rounding Policy Application
  const roundingPolicy = rulePack.content.rounding;
  const roundingOperations: RoundingOperation[] = [];

  let grossRoyaltyMoney: Money | null = null;
  let applicableCostMoney: Money | null = null;
  let netContributionMoney: Money | null = null;

  if (roundingPolicy.point === 'per_unit') {
    // 5a. Round gross royalty
    const roundedGrossBig = exactGrossRoyalty.round(roundingPolicy.mode);

    if (
      roundedGrossBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      roundedGrossBig < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new CalcOverflowError(
        `Rounded gross royalty ${roundedGrossBig} exceeds safe integer range`,
      );
    }

    const roundedGrossMinor = Number(roundedGrossBig);
    grossRoyaltyMoney = Money.of(roundedGrossMinor, currency);

    const grossOp: RoundingOperation = {
      target: 'gross_royalty',
      mode: roundingPolicy.mode,
      point: 'per_unit',
      unroundedNumerator: exactGrossRoyalty.numerator.toString(),
      unroundedDenominator: exactGrossRoyalty.denominator.toString(),
      unroundedDecimal: exactGrossRoyalty.toDecimalString(),
      roundedMinor: roundedGrossMinor,
    };
    roundingOperations.push(grossOp);

    // 5b. Round production/distribution cost if fractional
    let finalCostMinor: number;
    if (!exactApplicableCost.isInteger()) {
      const roundedCostBig = exactApplicableCost.round(roundingPolicy.mode);
      finalCostMinor = Number(roundedCostBig);
      applicableCostMoney = Money.of(finalCostMinor, currency);

      const costOp: RoundingOperation = {
        target: 'production_cost',
        mode: roundingPolicy.mode,
        point: 'per_unit',
        unroundedNumerator: exactApplicableCost.numerator.toString(),
        unroundedDenominator: exactApplicableCost.denominator.toString(),
        unroundedDecimal: exactApplicableCost.toDecimalString(),
        roundedMinor: finalCostMinor,
      };
      roundingOperations.push(costOp);
    } else {
      finalCostMinor = Number(exactApplicableCost.numerator);
      applicableCostMoney = Money.of(finalCostMinor, currency);
    }

    costBreakdown = {
      ...costBreakdown,
      totalCostMinor: finalCostMinor,
      roundedCostMinor: finalCostMinor,
    };

    steps.push({
      step: 'cost_calculated',
      costBreakdown: Object.freeze({ ...costBreakdown }),
    });

    for (const op of roundingOperations) {
      steps.push({
        step: 'rounding_applied',
        operation: Object.freeze({ ...op }),
      });
    }

    // 5c. Net Contribution: rounded gross royalty minus rounded cost
    netContributionMoney = grossRoyaltyMoney.subtract(applicableCostMoney);

    steps.push({
      step: 'contribution_calculated',
      exactNumerator: exactNetContribution.numerator.toString(),
      exactDenominator: exactNetContribution.denominator.toString(),
      exactDecimalString: exactNetContribution.toDecimalString(),
      roundedMinor: netContributionMoney.amountMinor,
    });
  } else {
    // point === 'per_total': per-unit rounding is explicitly deferred until total aggregation in STEP-006.
    // Unrounded rational amounts are preserved in exactGrossRoyalty and exactApplicableCost.
    if (exactApplicableCost.isInteger()) {
      const costMinor = Number(exactApplicableCost.numerator);
      applicableCostMoney = Money.of(costMinor, currency);
      costBreakdown = {
        ...costBreakdown,
        totalCostMinor: costMinor,
        roundedCostMinor: null,
      };
    } else {
      applicableCostMoney = null;
      costBreakdown = {
        ...costBreakdown,
        totalCostMinor: null,
        roundedCostMinor: null,
      };
    }

    steps.push({
      step: 'cost_calculated',
      costBreakdown: Object.freeze({ ...costBreakdown }),
    });

    steps.push({
      step: 'rounding_deferred',
      point: 'per_total',
      reason:
        'Rounding point is per_total; per-unit values are preserved as exact unrounded rational amounts for aggregation in STEP-006.',
    });

    steps.push({
      step: 'contribution_calculated',
      exactNumerator: exactNetContribution.numerator.toString(),
      exactDenominator: exactNetContribution.denominator.toString(),
      exactDecimalString: exactNetContribution.toDecimalString(),
      roundedMinor: null,
    });
  }

  // 6. Assemble Trace
  const trace: CalculationTrace = Object.freeze({
    engineVersion: CALC_ENGINE_MODULE_VERSION,
    rulePackRef: Object.freeze({
      id: String(rulePack.id),
      packKey: rulePack.packKey,
      version: rulePack.version,
      contentHash: rulePack.contentHash,
    }),
    input: Object.freeze({
      listPriceMinor,
      currency,
      format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    }),
    selectedTier: Object.freeze({
      name: matchedTier.name,
      minPriceMinor: matchedTier.minPriceMinor,
      maxPriceMinor: matchedTier.maxPriceMinor,
      royaltyRateDecimal: matchedTier.royaltyRateDecimal,
      rateNumerator: rateRational.numerator.toString(),
      rateDenominator: rateRational.denominator.toString(),
    }),
    costBreakdown: Object.freeze({ ...costBreakdown }),
    exactCalculations: Object.freeze({
      grossRoyalty: Object.freeze({
        numerator: exactGrossRoyalty.numerator.toString(),
        denominator: exactGrossRoyalty.denominator.toString(),
        decimalString: exactGrossRoyalty.toDecimalString(),
      }),
      applicableCost: Object.freeze({
        numerator: exactApplicableCost.numerator.toString(),
        denominator: exactApplicableCost.denominator.toString(),
        decimalString: exactApplicableCost.toDecimalString(),
      }),
      netContribution: Object.freeze({
        numerator: exactNetContribution.numerator.toString(),
        denominator: exactNetContribution.denominator.toString(),
        decimalString: exactNetContribution.toDecimalString(),
      }),
    }),
    rounding: Object.freeze({
      mode: roundingPolicy.mode,
      point: roundingPolicy.point,
      operations: Object.freeze([...roundingOperations]),
    }),
    finalSummary: Object.freeze({
      grossRoyaltyMinor: grossRoyaltyMoney !== null ? grossRoyaltyMoney.amountMinor : null,
      applicableCostMinor: applicableCostMoney !== null ? applicableCostMoney.amountMinor : null,
      netContributionMinor: netContributionMoney !== null ? netContributionMoney.amountMinor : null,
      currency,
    }),
    steps: Object.freeze([...steps]),
  });

  return Object.freeze({
    format,
    currency,
    listPrice: Money.of(listPriceMinor, currency),
    royaltyTier: Object.freeze({
      name: matchedTier.name,
      minPriceMinor: matchedTier.minPriceMinor,
      maxPriceMinor: matchedTier.maxPriceMinor,
      royaltyRateDecimal: matchedTier.royaltyRateDecimal,
    }),
    exactGrossRoyalty,
    exactApplicableCost,
    exactNetContribution,
    costBreakdown: Object.freeze({ ...costBreakdown }),
    rounding: Object.freeze({
      mode: roundingPolicy.mode,
      point: roundingPolicy.point,
    }),
    grossRoyalty: grossRoyaltyMoney,
    applicableCost: applicableCostMoney,
    netContribution: netContributionMoney,
    isRounded: roundingPolicy.point === 'per_unit',
    trace,
  });
}
