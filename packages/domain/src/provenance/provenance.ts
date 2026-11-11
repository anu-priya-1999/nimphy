import { InvalidProvenanceError } from '../errors/domain-error';

/**
 * Canonical provenance classifications defined by the architecture.
 * Principle P-07 (Honest uncertainty), doc 03 §1, doc 06 §4 (evidence_items), doc 07 §4.
 */
export const PROVENANCE_VALUES = Object.freeze([
  'user_input',
  'official_fact',
  'estimate',
  'assumption',
] as const);

export type Provenance = (typeof PROVENANCE_VALUES)[number];

/**
 * Human-readable descriptions for each provenance level.
 */
export const PROVENANCE_DESCRIPTIONS: Readonly<Record<Provenance, string>> = Object.freeze({
  user_input: 'Direct input provided by the author or operator without third-party evidence.',
  official_fact:
    'Fact verified against authoritative marketplace documentation, publisher guidelines, or rate cards.',
  estimate:
    'Calculated or extrapolated figure based on comparable historical data or industry benchmarks.',
  assumption: 'Working hypothesis or unverified projection requiring sensitivity analysis.',
});

/**
 * Runtime type guard validating whether a value is a valid Provenance classification.
 */
export function isProvenance(value: unknown): value is Provenance {
  if (typeof value !== 'string') return false;
  return (PROVENANCE_VALUES as readonly string[]).includes(value);
}

/**
 * Asserts that a value is a valid Provenance classification, throwing InvalidProvenanceError otherwise.
 */
export function assertProvenance(value: unknown): asserts value is Provenance {
  if (!isProvenance(value)) {
    throw new InvalidProvenanceError(value, PROVENANCE_VALUES);
  }
}

/**
 * Validates and returns a strongly-typed Provenance classification from untrusted input.
 * Strips surrounding whitespace and checks against the canonical vocabulary.
 */
export function parseProvenance(value: unknown): Provenance {
  if (typeof value !== 'string') {
    throw new InvalidProvenanceError(value, PROVENANCE_VALUES);
  }
  const trimmed = value.trim();
  if (!isProvenance(trimmed)) {
    throw new InvalidProvenanceError(trimmed, PROVENANCE_VALUES);
  }
  return trimmed;
}

/**
 * Checks if a provenance classification implies uncertainty (estimate or assumption).
 * Used for triggering uncertainty disclosures, illustrative disclaimers, and AI evaluation metrics.
 * Principle P-07, doc 03, doc 12 §9.
 */
export function isUncertain(provenance: Provenance): boolean {
  assertProvenance(provenance);
  return provenance === 'estimate' || provenance === 'assumption';
}

/**
 * Provenanced value wrapper pairing any domain value with its explicit provenance classification
 * and optional references to evidence items.
 */
export interface Provenanced<T> {
  readonly value: T;
  readonly provenance: Provenance;
  readonly evidenceRefs?: readonly string[];
}

/**
 * Factory creating an immutable Provenanced<T> wrapper.
 * Validates that provenance is valid, defensively copies and freezes evidenceRefs,
 * and freezes the wrapper object. Leaves caller-owned generic payload value intact.
 */
export function createProvenanced<T>(
  value: T,
  provenance: Provenance,
  evidenceRefs?: readonly string[],
): Provenanced<T> {
  assertProvenance(provenance);
  const frozenRefs = evidenceRefs ? Object.freeze([...evidenceRefs]) : undefined;
  return Object.freeze({
    value,
    provenance,
    ...(frozenRefs !== undefined ? { evidenceRefs: frozenRefs } : {}),
  });
}
