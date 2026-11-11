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
