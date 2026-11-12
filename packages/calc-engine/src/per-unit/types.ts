import type { BookFormat, CurrencyCode, Money } from '@nimphy/domain';
import type { Rational, RoundingMode, RoundingPoint } from '../math/rational';

/**
 * Royalty tier definition required by calculation engine.
 * Structurally compatible with RulePack schema from @nimphy/rules.
 */
export interface CalcRoyaltyTier {
  readonly name: string;
  readonly minPriceMinor: number;
  readonly maxPriceMinor: number | null;
  readonly royaltyRateDecimal: string;
}

/**
 * Physical print cost policy.
 */
export interface CalcPrintCostPolicy {
  readonly baseCostMinor: number;
  readonly costPerPageMinor: number;
  readonly pageThreshold?: number;
}

/**
 * Ebook digital delivery cost policy.
 */
export interface CalcDeliveryCostPolicy {
  readonly costPerMbMinor: number;
}

/**
 * Rounding policy declaration.
 */
export interface CalcRoundingPolicy {
  readonly mode: RoundingMode;
  readonly point: RoundingPoint;
}

/**
 * Price and specification limit policy.
 */
export interface CalcBookLimitsPolicy {
  readonly minListPriceMinor: number;
  readonly maxListPriceMinor: number;
  readonly minPages: number | null;
  readonly maxPages: number | null;
}

/**
 * Rule Pack content parameters payload.
 */
export interface CalcRulePackContent {
  readonly rounding: CalcRoundingPolicy;
  readonly royalty: {
    readonly tiers: readonly CalcRoyaltyTier[];
  };
  readonly printCost: CalcPrintCostPolicy | null;
  readonly deliveryCost: CalcDeliveryCostPolicy | null;
  readonly limits: CalcBookLimitsPolicy;
  readonly customParameters?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal structural Rule Pack interface required by calc-engine.
 * Avoids direct dependency on @nimphy/rules while maintaining 100% type compatibility.
 */
export interface CalcRulePack {
  readonly id: string;
  readonly packKey: string;
  readonly version: string;
  readonly status: string;
  readonly marketplace: string;
  readonly format: BookFormat | string;
  readonly currency: CurrencyCode | string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly content: CalcRulePackContent;
  readonly contentHash: string;
  readonly sourceRef?: string;
  readonly sourceRetrievedAt?: string;
}

/**
 * Input contract for per-unit financial calculations.
 */
export interface PerUnitCalcInput {
  readonly listPriceMinor: number;
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
}

/**
 * Breakdown of production or distribution costs.
 */
export interface CostBreakdown {
  readonly kind: 'print' | 'delivery' | 'none';
  readonly totalCostMinor: number | null;
  readonly baseCostMinor?: number;
  readonly costPerPageMinor?: number;
  readonly pages?: number;
  readonly pageThreshold?: number;
  readonly excessPages?: number;
  readonly perPageCostMinor?: number;
  readonly fileSizeMb?: string;
  readonly costPerMbMinor?: number;
  readonly exactCostNumerator?: string;
  readonly exactCostDenominator?: string;
  readonly exactCostDecimalString?: string;
  readonly roundedCostMinor?: number | null;
}

/**
 * Audit record of an applied rounding operation.
 */
export interface RoundingOperation {
  readonly target: 'gross_royalty' | 'production_cost';
  readonly mode: RoundingMode;
  readonly point: RoundingPoint;
  readonly unroundedNumerator: string;
  readonly unroundedDenominator: string;
  readonly unroundedDecimal: string;
  readonly roundedMinor: number;
}

/**
 * Discriminated trace step entries for calculation replay.
 */
export type CalculationTraceStep =
  | {
      readonly step: 'input_validated';
      readonly listPriceMinor: number;
      readonly currency: CurrencyCode;
      readonly format: BookFormat;
      readonly pages?: number;
      readonly fileSizeMb?: string;
    }
  | {
      readonly step: 'tier_selected';
      readonly tierName: string;
      readonly minPriceMinor: number;
      readonly maxPriceMinor: number | null;
      readonly royaltyRateDecimal: string;
      readonly rateNumerator: string;
      readonly rateDenominator: string;
    }
  | {
      readonly step: 'gross_royalty_calculated';
      readonly exactNumerator: string;
      readonly exactDenominator: string;
      readonly exactDecimalString: string;
    }
  | {
      readonly step: 'cost_calculated';
      readonly costBreakdown: CostBreakdown;
    }
  | {
      readonly step: 'rounding_applied';
      readonly operation: RoundingOperation;
    }
  | {
      readonly step: 'rounding_deferred';
      readonly point: 'per_total';
      readonly reason: string;
    }
  | {
      readonly step: 'contribution_calculated';
      readonly exactNumerator: string;
      readonly exactDenominator: string;
      readonly exactDecimalString: string;
      readonly roundedMinor: number | null;
    };

/**
 * Deterministic calculation trace structure for reproducing results bit-for-bit.
 */
export interface CalculationTrace {
  readonly engineVersion: string;
  readonly rulePackRef: {
    readonly id: string;
    readonly packKey: string;
    readonly version: string;
    readonly contentHash: string;
  };
  readonly input: {
    readonly listPriceMinor: number;
    readonly currency: CurrencyCode;
    readonly format: BookFormat;
    readonly pages?: number;
    readonly fileSizeMb?: string;
  };
  readonly selectedTier: {
    readonly name: string;
    readonly minPriceMinor: number;
    readonly maxPriceMinor: number | null;
    readonly royaltyRateDecimal: string;
    readonly rateNumerator: string;
    readonly rateDenominator: string;
  };
  readonly costBreakdown: CostBreakdown;
  readonly exactCalculations: {
    readonly grossRoyalty: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly applicableCost: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
    readonly netContribution: {
      readonly numerator: string;
      readonly denominator: string;
      readonly decimalString: string;
    };
  };
  readonly rounding: {
    readonly mode: RoundingMode;
    readonly point: RoundingPoint;
    readonly operations: readonly RoundingOperation[];
  };
  readonly finalSummary: {
    readonly grossRoyaltyMinor: number | null;
    readonly applicableCostMinor: number | null;
    readonly netContributionMinor: number | null;
    readonly currency: CurrencyCode;
  };
  readonly steps: readonly CalculationTraceStep[];
}

/**
 * Primary per-unit calculation result entity.
 */
export interface PerUnitEconomics {
  readonly format: BookFormat;
  readonly currency: CurrencyCode;
  readonly listPrice: Money;
  readonly royaltyTier: {
    readonly name: string;
    readonly minPriceMinor: number;
    readonly maxPriceMinor: number | null;
    readonly royaltyRateDecimal: string;
  };
  readonly exactGrossRoyalty: Rational;
  readonly exactApplicableCost: Rational;
  readonly exactNetContribution: Rational;
  readonly costBreakdown: CostBreakdown;
  readonly rounding: {
    readonly mode: RoundingMode;
    readonly point: RoundingPoint;
  };
  /**
   * Rounded Money values.
   * Under 'per_unit' rounding, grossRoyalty, applicableCost, and netContribution are populated with rounded Money.
   * Under 'per_total' rounding, per-unit rounding is deferred until total aggregation in STEP-006;
   * exact unrounded rational amounts are preserved in exactGrossRoyalty, exactApplicableCost, and exactNetContribution.
   * If a cost component is already an exact integer minor unit, applicableCost contains that exact Money;
   * if fractional, applicableCost is null to prevent silent premature rounding.
   * grossRoyalty and netContribution remain null under 'per_total'.
   */
  readonly grossRoyalty: Money | null;
  readonly applicableCost: Money | null;
  readonly netContribution: Money | null;
  readonly isRounded: boolean;
  readonly trace: CalculationTrace;
}
