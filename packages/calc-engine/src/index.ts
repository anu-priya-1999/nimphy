/**
 * @nimphy/calc-engine (M-02)
 *
 * Pure, deterministic, I/O-free financial calculation engine.
 *
 * Conforms to:
 * - Principle P-01: Deterministic core, probabilistic edge (pure code, zero I/O, zero AI, no floats).
 * - Principle P-03: Traceability (full structured deterministic calculation trace).
 * - Principle P-09: Testability (pure functions, golden fixtures, 100% branch coverage).
 * - ADR-004: Pure calculation engine.
 * - ADR-005: Money as integer minor units; rounding policy declared in Rule Packs.
 * - Doc 05 §M-02: Financial calculation engine component responsibilities.
 */

export const CALC_ENGINE_MODULE_NAME = 'calc-engine';
export { CALC_ENGINE_MODULE_VERSION } from './per-unit/per-unit-calc';

// Errors
export {
  CalcEngineError,
  CalcInputValidationError,
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
  CalcOverflowError,
} from './errors';

// Exact Rational Mathematics
export { Rational, type RoundingMode, type RoundingPoint } from './math';

// Per-Unit Financial Calculations
export {
  calculatePerUnitEconomics,
  type CalcRulePack,
  type CalcRulePackContent,
  type CalcRoyaltyTier,
  type CalcPrintCostPolicy,
  type CalcDeliveryCostPolicy,
  type CalcRoundingPolicy,
  type CalcBookLimitsPolicy,
  type PerUnitCalcInput,
  type PerUnitEconomics,
  type CostBreakdown,
  type RoundingOperation,
  type CalculationTraceStep,
  type CalculationTrace,
} from './per-unit';
