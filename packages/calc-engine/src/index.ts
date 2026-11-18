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

// Scenario Modeling and Total Economics (STEP-006)
export {
  calculateSingleScenario,
  calculateTriadScenarios,
  evaluateScenarioOrdering,
  type SingleScenarioInput,
  type CaseScenariosInput,
  type ScenarioParametersInput,
  type ScenarioTraceStep,
  type ScenarioCalculationTrace,
  type SingleScenarioResult,
  type ScenarioOrderingEvaluation,
  type TriadScenariosResult,
  type ScenarioName,
  type ScenarioParameters,
  type ScenarioTotals,
} from './scenarios';

// Break-Even Economics Engine (STEP-007)
export {
  calculateBreakEven,
  type BreakEvenInput,
  type BreakEvenResult,
  type BreakEvenUnreachableReason,
  type BreakEvenTraceStep,
  type BreakEvenCalculationTrace,
} from './break-even';

// Sensitivity Analysis Engine (STEP-008)
export {
  calculateSensitivity,
  SUPPORTED_SENSITIVITY_DRIVERS,
  isSensitivityDriver,
  type SensitivityDriver,
  type SensitivityDriverConfig,
  type UnitsSensitivityConfig,
  type ListPriceSensitivityConfig,
  type CostVarianceSensitivityConfig,
  type SensitivityBaselineInput,
  type SensitivityInput,
  type BaseSensitivityDriverResult,
  type UnitsSensitivityDriverResult,
  type ListPriceSensitivityDriverResult,
  type CostVarianceSensitivityDriverResult,
  type SensitivityDriverResult,
  type SensitivityRankDecision,
  type SensitivityTraceDriverEvaluation,
  type SensitivityCalculationTrace,
  type SensitivityResult,
} from './sensitivity';
