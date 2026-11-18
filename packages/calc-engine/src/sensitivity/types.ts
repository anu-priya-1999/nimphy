import type { BookFormat, CurrencyCode, Money, ScenarioName } from '@nimphy/domain';
import type { ScenarioCalculationTrace, SingleScenarioResult } from '../scenarios/types';

/**
 * Declared sensitivity analysis driver identifiers.
 * Strictly limited to FR-006 / FR-008 allow-list: units, listPriceMinor, costVariancePercent.
 */
export type SensitivityDriver = 'units' | 'listPriceMinor' | 'costVariancePercent';

/**
 * Immutable runtime array of supported sensitivity drivers for boundary checking.
 */
export const SUPPORTED_SENSITIVITY_DRIVERS: readonly SensitivityDriver[] = Object.freeze([
  'units',
  'listPriceMinor',
  'costVariancePercent',
] as const);

/**
 * Type guard for SensitivityDriver.
 */
export function isSensitivityDriver(value: unknown): value is SensitivityDriver {
  return (
    typeof value === 'string' &&
    (SUPPORTED_SENSITIVITY_DRIVERS as readonly string[]).includes(value)
  );
}

/**
 * Perturbation configuration for units sold.
 */
export interface UnitsSensitivityConfig {
  readonly driver: 'units';
  readonly perturbation: number;
}

/**
 * Perturbation configuration for retail list price in minor units.
 */
export interface ListPriceSensitivityConfig {
  readonly driver: 'listPriceMinor';
  readonly perturbation: number;
}

/**
 * Perturbation configuration for production cost variance in percentage points.
 * Must be an exact decimal string (e.g. "5", "2.5").
 */
export interface CostVarianceSensitivityConfig {
  readonly driver: 'costVariancePercent';
  readonly perturbation: string;
}

/**
 * Discriminated union of driver perturbation configurations.
 */
export type SensitivityDriverConfig =
  | UnitsSensitivityConfig
  | ListPriceSensitivityConfig
  | CostVarianceSensitivityConfig;

/**
 * Baseline scenario parameters for sensitivity analysis.
 * Conforms to SingleScenarioInput while allowing optional scenarioName (defaults to 'base').
 */
export interface SensitivityBaselineInput {
  readonly units: number;
  readonly listPriceMinor: number;
  readonly costVariancePercent?: string;
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
  readonly scenarioName?: ScenarioName;
}

/**
 * Complete input contract for sensitivity analysis.
 */
export interface SensitivityInput {
  readonly baseline: SensitivityBaselineInput;
  readonly drivers: readonly SensitivityDriverConfig[];
}

/**
 * Base properties shared across all sensitivity driver results.
 */
export interface BaseSensitivityDriverResult {
  readonly rank: number;
  readonly impactScoreMinor: number;
  readonly impactScore: Money;
  readonly baselineNetContribution: Money;
  readonly lowerNetContribution: Money;
  readonly upperNetContribution: Money;
  readonly deltaLower: Money;
  readonly deltaUpper: Money;
  readonly baselineRevenue: Money;
  readonly lowerRevenue: Money;
  readonly upperRevenue: Money;
  readonly deltaLowerRevenue: Money;
  readonly deltaUpperRevenue: Money;
  readonly lowerScenario: SingleScenarioResult;
  readonly upperScenario: SingleScenarioResult;
}

/**
 * Evaluated sensitivity result for the 'units' driver.
 */
export interface UnitsSensitivityDriverResult extends BaseSensitivityDriverResult {
  readonly driver: 'units';
  readonly perturbation: number;
  readonly baselineValue: number;
  readonly lowerValue: number;
  readonly upperValue: number;
}

/**
 * Evaluated sensitivity result for the 'listPriceMinor' driver.
 */
export interface ListPriceSensitivityDriverResult extends BaseSensitivityDriverResult {
  readonly driver: 'listPriceMinor';
  readonly perturbation: number;
  readonly baselineValue: number;
  readonly lowerValue: number;
  readonly upperValue: number;
}

/**
 * Evaluated sensitivity result for the 'costVariancePercent' driver.
 */
export interface CostVarianceSensitivityDriverResult extends BaseSensitivityDriverResult {
  readonly driver: 'costVariancePercent';
  readonly perturbation: string;
  readonly baselineValue: string;
  readonly lowerValue: string;
  readonly upperValue: string;
}

/**
 * Discriminated union of evaluated driver results.
 */
export type SensitivityDriverResult =
  | UnitsSensitivityDriverResult
  | ListPriceSensitivityDriverResult
  | CostVarianceSensitivityDriverResult;

/**
 * Recorded decision during deterministic ranking and tie-breaking.
 */
export interface SensitivityRankDecision {
  readonly rank: number;
  readonly driver: SensitivityDriver;
  readonly impactScoreMinor: number;
  readonly tieBrokenByDriverName: boolean;
}

/**
 * Detailed evaluation trace for a single sensitivity driver.
 */
export interface SensitivityTraceDriverEvaluation {
  readonly driver: SensitivityDriver;
  readonly perturbation: number | string;
  readonly baselineValue: number | string;
  readonly lowerValue: number | string;
  readonly upperValue: number | string;
  readonly baselineContributionMinor: number;
  readonly lowerContributionMinor: number;
  readonly upperContributionMinor: number;
  readonly deltaLowerMinor: number;
  readonly deltaUpperMinor: number;
  readonly absDeltaLowerMinor: number;
  readonly absDeltaUpperMinor: number;
  readonly impactScoreMinor: number;
  readonly rank: number;
  readonly lowerScenarioTrace: ScenarioCalculationTrace;
  readonly upperScenarioTrace: ScenarioCalculationTrace;
}

/**
 * Deterministic audit trace for reproducing sensitivity calculations bit-for-bit.
 */
export interface SensitivityCalculationTrace {
  readonly engineVersion: string;
  readonly rulePackRef: {
    readonly id: string;
    readonly packKey: string;
    readonly version: string;
    readonly contentHash: string;
  };
  readonly baselineInput: {
    readonly scenarioName: ScenarioName;
    readonly units: number;
    readonly listPriceMinor: number;
    readonly costVariancePercent: string;
    readonly currency: CurrencyCode;
    readonly format: BookFormat;
    readonly pages?: number;
    readonly fileSizeMb?: string;
  };
  readonly unchangedInputs: {
    readonly currency: CurrencyCode;
    readonly format: BookFormat;
    readonly pages?: number;
    readonly fileSizeMb?: string;
  };
  readonly declaredDrivers: readonly {
    readonly driver: SensitivityDriver;
    readonly perturbation: number | string;
  }[];
  readonly rankingMetric: 'total_net_contribution';
  readonly baselineScenarioTrace: ScenarioCalculationTrace;
  readonly driverEvaluations: readonly SensitivityTraceDriverEvaluation[];
  readonly rankingDecisions: readonly SensitivityRankDecision[];
  readonly rankedDriverOrder: readonly SensitivityDriver[];
}

/**
 * Strongly typed result contract for sensitivity analysis (STEP-008).
 */
export interface SensitivityResult {
  readonly baseline: SingleScenarioResult;
  readonly currency: CurrencyCode;
  readonly declaredDrivers: readonly SensitivityDriverConfig[];
  readonly rankedDrivers: readonly SensitivityDriverResult[];
  readonly drivers: readonly SensitivityDriverResult[];
  readonly rankingMetric: 'total_net_contribution';
  readonly isIllustrative: true;
  readonly disclaimer: string;
  readonly trace: SensitivityCalculationTrace;
}
