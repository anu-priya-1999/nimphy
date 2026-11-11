import { hashCanonicalJson } from '@nimphy/domain';
import type { RulePack } from '../schema/types';

/**
 * Computes a stable, deterministic content hash for a Rule Pack's content object.
 * Uses canonical JSON serialization conforming to RFC 8785 (JSON Canonicalization Scheme / JCS)
 * (UTF-16 property name sorting, IEEE 754 number formatting, strict Unicode validation)
 * and pure SHA-256 cryptographic hashing to produce a standard "sha256:<64-hex>" digest.
 *
 * @param content The rule pack content object
 * @returns Deterministic SHA-256 digest string prefixed with "sha256:"
 */
export function computeRulePackContentHash(content: unknown): string {
  return hashCanonicalJson(content);
}

/**
 * Verifies that a Rule Pack's declared contentHash matches the actual computed
 * hash of its content payload.
 *
 * @param pack An object with content and contentHash
 * @returns True if the declared hash matches the actual computed hash bit-for-bit
 */
export function verifyRulePackContentHash(pack: {
  readonly content: unknown;
  readonly contentHash: string;
}): boolean {
  if (typeof pack.contentHash !== 'string' || !pack.contentHash.startsWith('sha256:')) {
    return false;
  }
  const actualHash = computeRulePackContentHash(pack.content);
  return pack.contentHash === actualHash;
}

/**
 * Computes a deterministic hash over the full canonical metadata envelope of a Rule Pack
 * (excluding dynamic runtime fields like createdAt).
 *
 * @param pack The complete Rule Pack
 * @returns Deterministic SHA-256 digest string prefixed with "sha256:"
 */
export function computeRulePackEnvelopeHash(pack: RulePack): string {
  const envelope = {
    contentHash: pack.contentHash,
    currency: pack.currency,
    effectiveFrom: pack.effectiveFrom,
    effectiveTo: pack.effectiveTo,
    format: pack.format,
    id: pack.id,
    marketplace: pack.marketplace,
    packKey: pack.packKey,
    sourceRef: pack.sourceRef,
    sourceRetrievedAt: pack.sourceRetrievedAt,
    status: pack.status,
    version: pack.version,
  };
  return hashCanonicalJson(envelope);
}
