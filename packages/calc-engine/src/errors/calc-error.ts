import { DomainError } from '@nimphy/domain';

/**
 * Base abstract error class for all calculation engine errors.
 * Inherits from DomainError to ensure consistent error handling across layers.
 */
export abstract class CalcEngineError extends DomainError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
}

/**
 * Thrown when calculation input fails validation
 * (e.g. missing fields, invalid integer types, unsafe integers, out-of-range values).
 */
export class CalcInputValidationError extends CalcEngineError {
  readonly reason: string;

  constructor(reason: string, message: string, details?: Record<string, unknown>) {
    super(message, 'CALC_INPUT_INVALID', { reason, ...details });
    this.reason = reason;
  }
}

/**
 * Thrown when the currency in calculation input does not match the Rule Pack currency.
 */
export class CalcCurrencyMismatchError extends CalcEngineError {
  constructor(inputCurrency: string, rulePackCurrency: string) {
    super(
      `Calculation currency mismatch: input currency "${inputCurrency}" does not match Rule Pack currency "${rulePackCurrency}"`,
      'CALC_CURRENCY_MISMATCH',
      { inputCurrency, rulePackCurrency },
    );
  }
}

/**
 * Thrown when the book format in calculation input does not match the Rule Pack format.
 */
export class CalcFormatMismatchError extends CalcEngineError {
  constructor(inputFormat: string, rulePackFormat: string) {
    super(
      `Calculation format mismatch: input format "${inputFormat}" does not match Rule Pack format "${rulePackFormat}"`,
      'CALC_FORMAT_MISMATCH',
      { inputFormat, rulePackFormat },
    );
  }
}

/**
 * Thrown when no royalty tier in the Rule Pack covers the input list price.
 */
export class NoMatchingRoyaltyTierError extends CalcEngineError {
  constructor(listPriceMinor: number, currency: string) {
    super(
      `No matching royalty tier found for list price ${listPriceMinor} ${currency}`,
      'NO_MATCHING_ROYALTY_TIER',
      { listPriceMinor, currency },
    );
  }
}

/**
 * Thrown when a Rule Pack is missing necessary policy definitions for calculation
 * (e.g. missing printCost for a physical book format).
 */
export class RulePackIncompatibleError extends CalcEngineError {
  constructor(reason: string, message: string, details?: Record<string, unknown>) {
    super(message, 'RULE_PACK_INCOMPATIBLE', { reason, ...details });
  }
}

/**
 * Thrown when a calculation produces an amount exceeding JavaScript safe integer bounds.
 */
export class CalcOverflowError extends CalcEngineError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CALC_OVERFLOW', details);
  }
}
