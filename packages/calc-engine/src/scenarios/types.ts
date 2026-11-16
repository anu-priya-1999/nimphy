import type {
  BookFormat,
  CurrencyCode,
  Money,
  ScenarioName,
  ScenarioParameters,
  ScenarioTotals,
} from '@nimphy/domain';
import type { Rational, RoundingMode, RoundingPoint } from '../math/rational';
import type { CalculationTraceStep, PerUnitEconomics, RoundingOperation } from '../per-unit/types';

/**
 * Parameters for an individual scenario within a triad calculation.
 * Conforms to FR-006: units sold, price, cost variance.
 *
 * In a triad structure (CaseScenariosInput), the record keys (low, base, high)
 * govern scenario naming responsibility. An optional scenarioName is permitted
 * for compatibility with domain ScenarioParameters.
 */
export interface ScenarioParametersInput {
  readonly units: number;
  readonly listPriceMinor: number;
  readonly costVariancePercent?: string;
  readonly scenarioName?: ScenarioName;
}

/**
 * Input contract for calculating a single scenario's totals and economics.
 * Conforms to domain ScenarioParameters, requiring an explicit scenarioName.
 */
export interface SingleScenarioInput extends ScenarioParameters {
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
}

/**
 * Input contract for calculating the complete triad of scenarios (low, base, high).
 */
export interface CaseScenariosInput {
  readonly scenarios: {
    readonly low: ScenarioParametersInput;
    readonly base: ScenarioParametersInput;
    readonly high: ScenarioParametersInput;
  };
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
}

/**
 * Detailed step recorded in the scenario calculation trace.
 */
export type ScenarioTraceStep =
  | CalculationTraceStep
  | {
      readonly step: 'cost_variance_applied';
      readonly costVariancePercent: string;
      readonly varianceMultiplierNumerator: string;
      readonly varianceMultiplierDenominator: string;
      readonly baseCostNumerator: string;
      readonly baseCostDenominator: string;
      readonly variedCostNumerator: string;
      readonly variedCostDenominator: string;
      readonly variedCostDecimalString: string;
    }
  | {
      readonly step: 'scenario_aggregation';
      readonly quantity: number;
      readonly roundingPoint: RoundingPoint;
      readonly roundingMode: RoundingMode;
      readonly exactTotalRoyaltyNumerator: string;
      readonly exactTotalRoyaltyDenominator: string;
      readonly exactTotalCostNumerator: string;
      readonly exactTotalCostDenominator: string;
      readonly totalRoyaltyMinor: number;
      readonly totalCostMinor: number;
      readonly totalContributionMinor: number;
      readonly totalRevenueMinor: number;
    };

/**
 * Deterministic audit trace for reproducing scenario totals bit-for-bit.
 */
export interface ScenarioCalculationTrace {
  readonly engineVersion: string;
  readonly scenarioName: ScenarioName;
  readonly rulePackRef: {
    readonly id: string;
    readonly packKey: string;
    readonly version: string;
    readonly contentHash: string;
  };
  readonly input: {
    readonly scenarioName: ScenarioName;
    readonly units: number;
    readonly listPriceMinor: number;
    readonly costVariancePercent: string;
    readonly currency: CurrencyCode;
    readonly format: BookFormat;
    readonly pages?: number;
    readonly fileSizeMb?: string;
  };
  readonly perUnitSummary: {
    readonly listPriceMinor: number;
    readonly exactGrossRoyalty: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly exactApplicableCost: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly exactApplicableCostVaried: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly costVariancePercent: string;
    readonly perUnitGrossRoyaltyMinor: number | null;
    readonly perUnitApplicableCostMinor: number | null;
    readonly perUnitNetContributionMinor: number | null;
  };
  readonly aggregation: {
    readonly quantity: number;
    readonly roundingPoint: RoundingPoint;
    readonly roundingMode: RoundingMode;
    readonly exactTotalRoyalty: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly exactTotalCost: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly exactTotalContribution: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly totalRoyaltyMinor: number;
    readonly totalCostMinor: number;
    readonly totalContributionMinor: number;
    readonly totalRevenueMinor: number;
  };
  readonly roundingOperations: readonly RoundingOperation[];
  readonly steps: readonly ScenarioTraceStep[];
}

/**
 * Result entity for a single scenario calculation.
 */
export interface SingleScenarioResult {
  readonly scenarioName: ScenarioName;
  readonly units: number;
  readonly listPrice: Money;
  readonly revenue: Money;
  readonly grossRoyalty: Money;
  readonly applicableCost: Money;
  readonly netContribution: Money;
  readonly isIllustrative: true;
  readonly disclaimer: string;
  readonly perUnitEconomics: PerUnitEconomics;
  readonly exactCostVarianceMultiplier: Rational;
  readonly exactApplicableCostVaried: Rational;
  readonly exactTotalRoyalty: Rational;
  readonly exactTotalCost: Rational;
  readonly exactTotalContribution: Rational;
  readonly trace: ScenarioCalculationTrace;
}

/**
 * Monotonic ordering evaluation report across low, base, and high scenarios.
 */
export interface ScenarioOrderingEvaluation {
  readonly areInputsMonotonicallyOrdered: boolean;
  readonly areTotalsMonotonicallyOrdered: boolean;
  readonly netContributionOrderingSatisfied: boolean;
  readonly revenueOrderingSatisfied: boolean;
  readonly details: {
    readonly lowContributionMinor: number;
    readonly baseContributionMinor: number;
    readonly highContributionMinor: number;
    readonly lowRevenueMinor: number;
    readonly baseRevenueMinor: number;
    readonly highRevenueMinor: number;
  };
}

/**
 * Complete triad scenario calculation result containing low, base, and high scenarios.
 */
export interface TriadScenariosResult {
  readonly scenarios: {
    readonly low: SingleScenarioResult;
    readonly base: SingleScenarioResult;
    readonly high: SingleScenarioResult;
  };
  readonly totals: {
    readonly low: ScenarioTotals;
    readonly base: ScenarioTotals;
    readonly high: ScenarioTotals;
  };
  readonly rulePackRef: {
    readonly id: string;
    readonly packKey: string;
    readonly version: string;
    readonly contentHash: string;
  };
  readonly engineVersion: string;
  readonly isIllustrative: true;
  readonly disclaimer: string;
  readonly ordering: ScenarioOrderingEvaluation;
}

// Re-export domain Scenario types for convenience
export type { ScenarioName, ScenarioParameters, ScenarioTotals };
