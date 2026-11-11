import { InvalidIdentifierError } from '../errors/domain-error';

declare const BrandSymbol: unique symbol;

/**
 * Branded type utility creating nominal type safety from underlying primitives.
 * Prevents accidental cross-assignment between differing domain identifier types (e.g. UserId vs CaseId).
 * AGENTS.md §4, doc 05 §M-01.
 */
export type Branded<T, BrandName extends string> = T & {
  readonly [BrandSymbol]: BrandName;
};

// Authorized domain identifiers from canonical database architecture (doc 06 §4)
export type UserId = Branded<string, 'UserId'>;
export type CaseId = Branded<string, 'CaseId'>;
export type RevisionId = Branded<string, 'RevisionId'>;
export type EvidenceId = Branded<string, 'EvidenceId'>;
export type RulePackId = Branded<string, 'RulePackId'>;
export type RunId = Branded<string, 'RunId'>;
export type MemoId = Branded<string, 'MemoId'>;
export type DossierId = Branded<string, 'DossierId'>;
export type PricePointId = Branded<string, 'PricePointId'>;
export type OrderId = Branded<string, 'OrderId'>;
export type PaymentEventId = Branded<string, 'PaymentEventId'>;
export type EntitlementId = Branded<string, 'EntitlementId'>;

/**
 * Canonical 128-bit UUID textual format regex (case-insensitive, 8-4-4-4-12 hex digits).
 * Validates canonical UUID structural layout (32 hexadecimal digits separated by hyphens)
 * conforming to PostgreSQL's native `uuid` type (doc 06 §4) across all versions/variants
 * (e.g. v4 from gen_random_uuid(), v7, nil, and deterministic test fixtures).
 */
const CANONICAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks if a string is a valid canonical UUID in 8-4-4-4-12 hexadecimal format.
 */
export function isUuidString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return CANONICAL_UUID_REGEX.test(value.trim());
}

/**
 * Generic factory validating and branding an untrusted string as a typed identifier.
 * Validates canonical 8-4-4-4-12 UUID textual format and normalizes to lowercase.
 */
export function parseBrandedId<B extends string>(value: unknown, brandName: B): Branded<string, B> {
  if (typeof value !== 'string') {
    throw new InvalidIdentifierError(brandName, value, 'Must be a string');
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidIdentifierError(brandName, value, 'Identifier cannot be empty');
  }

  if (!CANONICAL_UUID_REGEX.test(trimmed)) {
    throw new InvalidIdentifierError(brandName, value, 'Must be a valid UUID in 8-4-4-4-12 format');
  }

  return trimmed.toLowerCase() as Branded<string, B>;
}

// Specialized parsers for domain entities
export function parseUserId(value: unknown): UserId {
  return parseBrandedId(value, 'UserId');
}

export function parseCaseId(value: unknown): CaseId {
  return parseBrandedId(value, 'CaseId');
}

export function parseRevisionId(value: unknown): RevisionId {
  return parseBrandedId(value, 'RevisionId');
}

export function parseEvidenceId(value: unknown): EvidenceId {
  return parseBrandedId(value, 'EvidenceId');
}

export function parseRulePackId(value: unknown): RulePackId {
  return parseBrandedId(value, 'RulePackId');
}

export function parseRunId(value: unknown): RunId {
  return parseBrandedId(value, 'RunId');
}

export function parseMemoId(value: unknown): MemoId {
  return parseBrandedId(value, 'MemoId');
}

export function parseDossierId(value: unknown): DossierId {
  return parseBrandedId(value, 'DossierId');
}

export function parsePricePointId(value: unknown): PricePointId {
  return parseBrandedId(value, 'PricePointId');
}

export function parseOrderId(value: unknown): OrderId {
  return parseBrandedId(value, 'OrderId');
}

export function parsePaymentEventId(value: unknown): PaymentEventId {
  return parseBrandedId(value, 'PaymentEventId');
}

export function parseEntitlementId(value: unknown): EntitlementId {
  return parseBrandedId(value, 'EntitlementId');
}

// Specialized type guards
export function isUserId(value: unknown): value is UserId {
  return isUuidString(value);
}

export function isCaseId(value: unknown): value is CaseId {
  return isUuidString(value);
}

export function isRevisionId(value: unknown): value is RevisionId {
  return isUuidString(value);
}

export function isEvidenceId(value: unknown): value is EvidenceId {
  return isUuidString(value);
}

export function isRulePackId(value: unknown): value is RulePackId {
  return isUuidString(value);
}

export function isRunId(value: unknown): value is RunId {
  return isUuidString(value);
}

export function isMemoId(value: unknown): value is MemoId {
  return isUuidString(value);
}

export function isDossierId(value: unknown): value is DossierId {
  return isUuidString(value);
}

export function isPricePointId(value: unknown): value is PricePointId {
  return isUuidString(value);
}

export function isOrderId(value: unknown): value is OrderId {
  return isUuidString(value);
}

export function isPaymentEventId(value: unknown): value is PaymentEventId {
  return isUuidString(value);
}

export function isEntitlementId(value: unknown): value is EntitlementId {
  return isUuidString(value);
}
