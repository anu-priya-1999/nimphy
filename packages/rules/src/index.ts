/**
 * @nimphy/rules (M-03)
 *
 * Rule Pack schema, deterministic loader, SemVer selection, and content hashing.
 *
 * Conforms to:
 * - Principle P-01: Deterministic core (pure calculation parameters, zero AI, exact rational math).
 * - Principle P-03: Traceability (all runs trace to exact rule pack and content hash).
 * - Principle P-04: Immutability for evidence (rule packs immutable once published).
 * - Principle P-05: Verify at the boundary (strict schema validation).
 * - ADR-005: Rounding mode and rounding point declared per rule pack.
 * - ADR-006: Immutable, versioned Rule Packs with content hash and synthetic TEST_* fixtures.
 * - Doc 05 §M-03: Rule Pack schema, loader, and selection interface.
 * - Doc 06 §3: rule_packs table schema alignment.
 * - Doc 12 §4: Royalty-rule test fixtures and synthetic test constraints.
 */

export const RULES_MODULE_NAME = 'rules';
export const RULES_MODULE_VERSION = '0.1.0';

// Domain Errors
export {
  type RulePackValidationIssue,
  RulePackError,
  RulePackInvalidError,
  RulePackNotFoundError,
} from './errors';

// Schema Types & Vocabularies
export {
  RULE_PACK_STATUSES,
  type RulePackStatus,
  isRulePackStatus,
  ROUNDING_MODES,
  type RoundingMode,
  isRoundingMode,
  ROUNDING_POINTS,
  type RoundingPoint,
  isRoundingPoint,
  type RoundingPolicy,
  type RoyaltyTier,
  type RoyaltyPolicy,
  type PrintCostPolicy,
  type DeliveryCostPolicy,
  type BookLimitsPolicy,
  type RulePackContent,
  type RulePack,
  type RulePackValidationResult,
} from './schema';

// SemVer Utilities
export { isValidSemver, parseSemver, compareSemver, type ParsedSemver } from './schema';

// Schema Validation & Type Guards
export {
  isSyntheticPackKey,
  assertSyntheticPackKey,
  isValidCalendarDate,
  validateRulePackContent,
  validateRulePack,
  parseRulePack,
  safeParseRulePack,
} from './schema';

// Content Hashing
export {
  computeRulePackContentHash,
  verifyRulePackContentHash,
  computeRulePackEnvelopeHash,
} from './hashing';

// Loader & Selector
export {
  type RulePackSelectionCriteria,
  normalizeAsOfDate,
  findRulePacks,
  selectRulePack,
  RulePackLoader,
  loadRulePackFromFile,
  loadRulePacksFromDirectory,
} from './loader';

// Built-in Synthetic Test Packs
export {
  TEST_EBOOK_STANDARD_1_0_0,
  TEST_PAPERBACK_US_1_0_0,
  TEST_PAPERBACK_US_2_0_0,
  TEST_HARDCOVER_GLOBAL_1_0_0,
  SYNTHETIC_TEST_PACKS,
} from './synthetic';
