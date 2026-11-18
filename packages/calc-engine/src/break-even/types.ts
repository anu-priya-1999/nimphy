import type { BookFormat, CurrencyCode, Money } from '@nimphy/domain';
import type { Rational, RoundingMode, RoundingPoint } from '../math/rational';
import type { CalculationTraceStep } from '../per-unit/types';

/**
 * Input contract for calculating break-even economics.
 *
 * Conforms to:
 * - FR-007: Break-even calculation (units and revenue); explicit "not reachable" result when unit contribution <= 0.
 * - Accepted ADR-005: Money as integer minor units; exact rational arithmetic; declared rounding policy.
 * - STEP-007 Scope: Pure calculation engine receiving explicit fixedCost as Money.
 */
export interface BreakEvenInput {
  readonly fixedCost: Money;
  readonly listPriceMinor: number;
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
  readonly costVariancePercent?: string;
}

/**
 * Specific reason when a break-even threshold is mathematically unreachable.
 */
export type BreakEvenUnreachableReason = 'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION';

/**
 * Detailed step recorded in the break-even calculation trace.
 */
export type BreakEvenTraceStep =
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
      readonly step: 'unit_contribution_evaluated';
      readonly roundingPoint: RoundingPoint;
      readonly roundingMode: RoundingMode;
      readonly exactNumerator: string;
      readonly exactDenominator: string;
      readonly exactDecimalString: string;
      readonly unitContributionMinor: number | null;
      readonly isPositive: boolean;
    }
  | {
      readonly step: 'break_even_ceiling_calculated';
      readonly fixedCostMinor: number;
      readonly numerator: string;
      readonly denominator: string;
      readonly quotient: string;
      readonly remainder: string;
      readonly isExactDivision: boolean;
      readonly ceilingApplied: boolean;
      readonly breakEvenUnits: number;
      readonly breakEvenRevenueMinor: number;
    }
  | {
      readonly step: 'break_even_unreachable';
      readonly reason: BreakEvenUnreachableReason;
      readonly unitContributionMinor: number | null;
      readonly exactDecimalString: string;
    };

/**
 * Deterministic audit trace for reproducing break-even calculations bit-for-bit.
 */
export interface BreakEvenCalculationTrace {
  readonly engineVersion: string;
  readonly rulePackRef: {
    readonly id: string;
    readonly packKey: string;
    readonly version: string;
    readonly contentHash: string;
  };
  readonly input: {
    readonly fixedCostMinor: number;
    readonly currency: CurrencyCode;
    readonly listPriceMinor: number;
    readonly format: BookFormat;
    readonly pages?: number;
    readonly fileSizeMb?: string;
    readonly costVariancePercent: string;
  };
  readonly unitContribution: {
    readonly roundingPoint: RoundingPoint;
    readonly roundingMode: RoundingMode;
    readonly exact: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly unitContributionMinor: number | null;
  };
  readonly division: {
    readonly numerator: string;
    readonly denominator: string;
    readonly quotient: string;
    readonly remainder: string;
    readonly isExactDivision: boolean;
    readonly ceilingApplied: boolean;
  } | null;
  readonly result: {
    readonly reachable: boolean;
    readonly unreachableReason?: BreakEvenUnreachableReason;
    readonly units?: number;
    readonly revenueMinor?: number;
  };
  readonly steps: readonly BreakEvenTraceStep[];
}

/**
 * Result entity for a break-even calculation.
 *
 * Implements a strict discriminated union on `reachable`:
 * - When `reachable === true`:
 *   - `units`: The formula-defined whole-unit break-even quantity required by the roadmap:
 *     Q_be = ceil(FixedCost / ExactUnitContribution).
 *   - `revenue`: Gross retail sales revenue at the whole-unit, formula-defined break-even threshold:
 *     revenue = listPriceMinor * breakEvenUnits.
 *     (Gross retail sales, not author royalty income, publisher proceeds, or net profit).
 * - When `reachable === false`: provides `unreachableReason: BreakEvenUnreachableReason`
 *   and strictly omits `units` and `revenue` to prevent misleading zero-unit or fabricated outputs.
 */
export type BreakEvenResult =
  | {
      readonly reachable: true;
      readonly units: number;
      readonly revenue: Money;
      readonly fixedCost: Money;
      readonly unitContributionMinor: number | null;
      readonly exactUnitContribution: Rational;
      readonly isIllustrative: true;
      readonly disclaimer: string;
      readonly trace: BreakEvenCalculationTrace;
    }
  | {
      readonly reachable: false;
      readonly unreachableReason: BreakEvenUnreachableReason;
      readonly fixedCost: Money;
      readonly unitContributionMinor: number | null;
      readonly exactUnitContribution: Rational;
      readonly isIllustrative: true;
      readonly disclaimer: string;
      readonly trace: BreakEvenCalculationTrace;
    };
