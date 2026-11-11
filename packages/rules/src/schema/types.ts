import type { BookFormat, CurrencyCode, MarketplaceKey, RulePackId } from '@nimphy/domain';
import type { RulePackValidationIssue } from '../errors/rule-pack-error';

/**
 * Lifecycle status of a Rule Pack.
 * Conforms to doc 06 §3 (check (status in ('draft','published','retired'))).
 */
export const RULE_PACK_STATUSES = Object.freeze(['draft', 'published', 'retired'] as const);
export type RulePackStatus = (typeof RULE_PACK_STATUSES)[number];

export function isRulePackStatus(value: unknown): value is RulePackStatus {
  if (typeof value !== 'string') return false;
  return (RULE_PACK_STATUSES as readonly string[]).includes(value);
}

/**
 * Rounding mode applied during financial calculations.
 * ADR-005, doc 12 §3.
 */
export const ROUNDING_MODES = Object.freeze([
  'round_half_up',
  'round_half_even',
  'round_down',
  'round_up',
] as const);
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export function isRoundingMode(value: unknown): value is RoundingMode {
  if (typeof value !== 'string') return false;
  return (ROUNDING_MODES as readonly string[]).includes(value);
}

/**
 * Accumulation point where rounding occurs (per-unit vs per-total).
 * ADR-005, doc 12 §3.
 */
export const ROUNDING_POINTS = Object.freeze(['per_unit', 'per_total'] as const);
export type RoundingPoint = (typeof ROUNDING_POINTS)[number];

export function isRoundingPoint(value: unknown): value is RoundingPoint {
  if (typeof value !== 'string') return false;
  return (ROUNDING_POINTS as readonly string[]).includes(value);
}

/**
 * Rounding policy declaration required on every Rule Pack.
 * Silent default modes are explicitly forbidden (ADR-005).
 */
export interface RoundingPolicy {
  readonly mode: RoundingMode;
  readonly point: RoundingPoint;
}

/**
 * Royalty tier for list price ranges.
 * Rates are expressed as exact decimal strings (e.g. "0.70") to eliminate float rounding errors.
 */
export interface RoyaltyTier {
  readonly name: string;
  readonly minPriceMinor: number;
  readonly maxPriceMinor: number | null;
  readonly royaltyRateDecimal: string;
}

/**
 * Declarative royalty policy containing one or more pricing tiers.
 */
export interface RoyaltyPolicy {
  readonly tiers: readonly RoyaltyTier[];
}

/**
 * Print cost specification for physical book formats (paperback, hardcover).
 * Integer minor units.
 */
export interface PrintCostPolicy {
  readonly baseCostMinor: number;
  readonly costPerPageMinor: number;
  readonly pageThreshold?: number;
}

/**
 * Delivery or digital distribution cost specification (ebooks).
 * Integer minor units.
 */
export interface DeliveryCostPolicy {
  readonly costPerMbMinor: number;
}

/**
 * Book specification limits (min/max list prices in minor units, min/max page counts).
 */
export interface BookLimitsPolicy {
  readonly minListPriceMinor: number;
  readonly maxListPriceMinor: number;
  readonly minPages: number | null;
  readonly maxPages: number | null;
}

/**
 * Parameter payload contained in the Rule Pack content column (doc 06 §3).
 */
export interface RulePackContent {
  readonly rounding: RoundingPolicy;
  readonly royalty: RoyaltyPolicy;
  readonly printCost: PrintCostPolicy | null;
  readonly deliveryCost: DeliveryCostPolicy | null;
  readonly limits: BookLimitsPolicy;
  readonly customParameters?: Readonly<Record<string, unknown>>;
}

/**
 * Complete immutable Rule Pack entity.
 * Directly corresponds to the database schema in doc 06 §3 and M-03 in doc 05 §M-03.
 */
export interface RulePack {
  readonly id: RulePackId;
  readonly packKey: string;
  readonly version: string;
  readonly status: RulePackStatus;
  readonly marketplace: MarketplaceKey;
  readonly format: BookFormat;
  readonly currency: CurrencyCode;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sourceRef: string;
  readonly sourceRetrievedAt: string;
  readonly content: RulePackContent;
  readonly contentHash: string;
  readonly createdAt?: string;
}

/**
 * Validation result returned by safe validation operations.
 */
export interface RulePackValidationResult {
  readonly valid: boolean;
  readonly issues: readonly RulePackValidationIssue[];
  readonly pack?: RulePack;
}
