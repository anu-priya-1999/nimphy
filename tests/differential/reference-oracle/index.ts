/**
 * Independent Reference Oracle module entry point (test-only).
 */

export { RefRational, type RefRoundingMode, type RefRoundingPoint } from './ref-rational';

export {
  refCalculatePerUnit,
  refCalculateSingleScenario,
  refCalculateTriadScenarios,
  refCalculateBreakEven,
  refCalculateSensitivity,
  type RefRoyaltyTier,
  type RefRoundingPolicy,
  type RefRulePack,
  type RefPerUnitInput,
  type RefPerUnitResult,
  type RefScenarioInput,
  type RefScenarioResult,
  type RefScenarioParametersInput,
  type RefCaseScenariosInput,
  type RefScenarioOrderingDetails,
  type RefScenarioOrderingEvaluation,
  type RefTriadScenariosResult,
  type RefBreakEvenInput,
  type RefBreakEvenResult,
  type RefSensitivityDriver,
  type RefSensitivityDriverConfig,
  type RefSensitivityDriverResult,
  type RefSensitivityInput,
  type RefSensitivityResult,
} from './ref-oracle';
