import { DomainError } from '@nimphy/domain';

/**
 * Validation issue encountered when validating a Rule Pack document or schema.
 */
export interface RulePackValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/**
 * Base abstract error class for all rule pack domain errors.
 */
export abstract class RulePackError extends DomainError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details);
  }
}

/**
 * Thrown when a Rule Pack fails schema validation, has invalid dates/versions,
 * or possesses an invalid or corrupted content hash.
 * Stable error code: RULE_PACK_INVALID (doc 05 §M-03).
 */
export class RulePackInvalidError extends RulePackError {
  readonly issues: readonly RulePackValidationIssue[];

  constructor(
    message: string,
    issues: readonly RulePackValidationIssue[] = [],
    details?: Record<string, unknown>,
  ) {
    const frozenIssues = Object.freeze([...issues]);
    super(message, 'RULE_PACK_INVALID', {
      ...details,
      issues: frozenIssues,
    });
    this.issues = frozenIssues;
  }
}

/**
 * Thrown when no applicable Rule Pack is found matching selection criteria
 * (marketplace, format, asOf date).
 * Stable error code: RULE_PACK_NOT_FOUND (doc 05 §M-03).
 */
export class RulePackNotFoundError extends RulePackError {
  readonly criteria?: Readonly<Record<string, unknown>>;

  constructor(message: string, criteria?: Record<string, unknown>) {
    const frozenCriteria = criteria ? Object.freeze({ ...criteria }) : undefined;
    super(message, 'RULE_PACK_NOT_FOUND', frozenCriteria);
    this.criteria = frozenCriteria;
  }
}
