/**
 * @nimphy/domain (M-01)
 *
 * Core domain primitives, immutable value objects, branded identifiers,
 * provenance classifications, domain error hierarchy, and deterministic canonical serialization.
 *
 * Conforms to:
 * - Principle P-01: Deterministic core, probabilistic edge (pure code, zero I/O, zero AI, no floats).
 * - Principle P-04: Immutability for evidence.
 * - Principle P-05: Verify at the boundary.
 * - Principle P-07: Honest uncertainty.
 * - ADR-005: Money as integer minor units; explicit currency codes; no silent rounding.
 * - Doc 05 §M-01: Shared domain types and invariants.
 */

export const DOMAIN_MODULE_NAME = 'domain';
export const DOMAIN_MODULE_VERSION = '0.1.0';

// Domain Errors
export {
  DomainError,
  InvalidMoneyError,
  CurrencyMismatchError,
  MoneyOverflowError,
  UnsupportedCurrencyError,
  InvalidProvenanceError,
  InvalidIdentifierError,
  CanonicalSerializationError,
} from './errors';

// Currency
export {
  SUPPORTED_CURRENCIES,
  CURRENCY_METADATA,
  type CurrencyCode,
  type CurrencyMetadata,
  isSupportedCurrency,
  assertSupportedCurrency,
  parseCurrencyCode,
  getCurrencyMetadata,
  getMinorUnitExponent,
} from './money';

// Money Value Object
export { Money } from './money';

// Provenance
export {
  PROVENANCE_VALUES,
  PROVENANCE_DESCRIPTIONS,
  type Provenance,
  isProvenance,
  assertProvenance,
  parseProvenance,
  isUncertain,
  type Provenanced,
  createProvenanced,
} from './provenance';

// Branded Identifiers
export {
  type Branded,
  type UserId,
  type CaseId,
  type RevisionId,
  type EvidenceId,
  type RulePackId,
  type RunId,
  type MemoId,
  type DossierId,
  type PricePointId,
  type OrderId,
  type PaymentEventId,
  type EntitlementId,
  isUuidString,
  parseBrandedId,
  parseUserId,
  parseCaseId,
  parseRevisionId,
  parseEvidenceId,
  parseRulePackId,
  parseRunId,
  parseMemoId,
  parseDossierId,
  parsePricePointId,
  parseOrderId,
  parsePaymentEventId,
  parseEntitlementId,
  isUserId,
  isCaseId,
  isRevisionId,
  isEvidenceId,
  isRulePackId,
  isRunId,
  isMemoId,
  isDossierId,
  isPricePointId,
  isOrderId,
  isPaymentEventId,
  isEntitlementId,
} from './identifiers';

// Canonical JSON and SHA-256 Hashing
export { sha256Hex, toCanonicalJson, canonicalJson, hashCanonicalJson } from './canonical';

// Shared Domain Enums & Types
export {
  SCENARIO_NAMES,
  type ScenarioName,
  isScenarioName,
  BOOK_FORMATS,
  type BookFormat,
  isBookFormat,
  type MarketplaceKey,
} from './types';
