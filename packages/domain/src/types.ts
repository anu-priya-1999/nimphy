import { Money } from './money/money';

/**
 * Shared domain entity types and classifications defined in M-01 (doc 05 §M-01).
 */

/**
 * Scenario classifications evaluated by the deterministic calculation engine.
 * Doc 05 §M-02, doc 07 §4.
 */
export const SCENARIO_NAMES = Object.freeze(['low', 'base', 'high'] as const);
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export function isScenarioName(value: unknown): value is ScenarioName {
  if (typeof value !== 'string') return false;
  return (SCENARIO_NAMES as readonly string[]).includes(value);
}

/**
 * Input parameters defining an individual scenario.
 * Conforms to FR-006: units sold, price, cost variance.
 *
 * In self-contained contexts, scenarioName identifies the scenario classification.
 * Within a triad, the triad record keys (low, base, high) govern naming responsibility.
 */
export interface ScenarioParameters {
  readonly scenarioName: ScenarioName;
  readonly units: number;
  readonly listPriceMinor: number;
  readonly costVariancePercent?: string;
}

export function isScenarioParameters(value: unknown): value is ScenarioParameters {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (!isScenarioName(p.scenarioName)) return false;
  if (typeof p.units !== 'number' || !Number.isSafeInteger(p.units) || p.units < 0) return false;
  if (
    typeof p.listPriceMinor !== 'number' ||
    !Number.isSafeInteger(p.listPriceMinor) ||
    p.listPriceMinor < 0
  )
    return false;
  if (p.costVariancePercent !== undefined) {
    if (typeof p.costVariancePercent !== 'string') return false;
    const s = p.costVariancePercent;
    if (s.length === 0 || s.length > 50) return false;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return false;
    if (s.startsWith('-')) {
      const numPart = s.slice(1);
      const dotIndex = numPart.indexOf('.');
      const whole = dotIndex === -1 ? numPart : numPart.slice(0, dotIndex);
      const frac = dotIndex === -1 ? '' : numPart.slice(dotIndex + 1);
      if (BigInt(whole) > 100n) return false;
      if (BigInt(whole) === 100n && /[1-9]/.test(frac)) return false;
    }
  }
  return true;
}

/**
 * Aggregated monetary and financial totals for an individual scenario.
 */
export interface ScenarioTotals {
  readonly scenarioName: ScenarioName;
  readonly units: number;
  readonly listPrice: Money;
  readonly revenue: Money;
  readonly grossRoyalty: Money;
  readonly applicableCost: Money;
  readonly netContribution: Money;
  readonly isIllustrative: true;
}

export function isScenarioTotals(value: unknown): value is ScenarioTotals {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  if (!isScenarioName(t.scenarioName)) return false;
  if (typeof t.units !== 'number' || !Number.isSafeInteger(t.units) || t.units < 0) return false;
  if (t.isIllustrative !== true) return false;
  if (!(t.listPrice instanceof Money)) return false;
  if (!(t.revenue instanceof Money)) return false;
  if (!(t.grossRoyalty instanceof Money)) return false;
  if (!(t.applicableCost instanceof Money)) return false;
  if (!(t.netContribution instanceof Money)) return false;
  return true;
}

/**
 * Mandatory illustrative disclaimer text for scenarios per FR-006, FR-024, INV-12.
 */
export const SCENARIO_DISCLAIMER_TEXT =
  'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.';

/**
 * Publishing book format classifications.
 * Doc 05 §M-01, doc 07 §4.
 */
export const BOOK_FORMATS = Object.freeze(['ebook', 'paperback', 'hardcover'] as const);
export type BookFormat = (typeof BOOK_FORMATS)[number];

export function isBookFormat(value: unknown): value is BookFormat {
  if (typeof value !== 'string') return false;
  return (BOOK_FORMATS as readonly string[]).includes(value);
}

/**
 * Type representing a marketplace key identifier (e.g. "amazon_kdp", "EXAMPLE_MARKETPLACE").
 * Real marketplace values are governed by Rule Packs (ADR-006, OQ-005).
 */
export type MarketplaceKey = string;
