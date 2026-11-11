import { describe, expect, it } from 'vitest';
import { InvalidIdentifierError } from '../errors/domain-error';
import {
  isCaseId,
  isDossierId,
  isEntitlementId,
  isEvidenceId,
  isMemoId,
  isOrderId,
  isPaymentEventId,
  isPricePointId,
  isRevisionId,
  isRulePackId,
  isRunId,
  isUserId,
  isUuidString,
  parseBrandedId,
  parseCaseId,
  parseDossierId,
  parseEntitlementId,
  parseEvidenceId,
  parseMemoId,
  parseOrderId,
  parsePaymentEventId,
  parsePricePointId,
  parseRevisionId,
  parseRulePackId,
  parseRunId,
  parseUserId,
} from './branded-ids';

describe('Branded Domain Identifiers', () => {
  const validUuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const uppercaseUuid = 'F47AC10B-58CC-4372-A567-0E02B2C3D479';
  const nilUuid = '00000000-0000-0000-0000-000000000000';
  const v7Uuid = '018f4a7c-1234-7123-8123-123456789abc';
  const syntheticUuid = '11111111-2222-3333-4444-555555555555';

  describe('isUuidString', () => {
    it('returns true for valid standard UUIDs across versions and cases', () => {
      expect(isUuidString(validUuid)).toBe(true);
      expect(isUuidString(uppercaseUuid)).toBe(true);
      expect(isUuidString(nilUuid)).toBe(true);
      expect(isUuidString(v7Uuid)).toBe(true);
      expect(isUuidString(syntheticUuid)).toBe(true);
      expect(isUuidString(` ${validUuid} `)).toBe(true);
    });

    it('returns false for invalid UUID strings or other types', () => {
      expect(isUuidString('not-a-uuid')).toBe(false);
      expect(isUuidString('')).toBe(false);
      expect(isUuidString('   ')).toBe(false);
      expect(isUuidString('12345')).toBe(false);
      // Non-hex character 'g'
      expect(isUuidString('g47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);
      // Missing hyphens
      expect(isUuidString('f47ac10b58cc4372a5670e02b2c3d479')).toBe(false);
      // Incorrect group lengths (7-4-4-4-12 instead of 8-4-4-4-12)
      expect(isUuidString('f47ac10-58cc-4372-a567-0e02b2c3d479')).toBe(false);
      // Extra trailing character
      expect(isUuidString('f47ac10b-58cc-4372-a567-0e02b2c3d479a')).toBe(false);
      expect(isUuidString(null)).toBe(false);
      expect(isUuidString(undefined)).toBe(false);
      expect(isUuidString(123)).toBe(false);
      expect(isUuidString({})).toBe(false);
    });
  });

  describe('parseBrandedId', () => {
    it('parses and normalizes valid UUID to lowercase', () => {
      const id = parseBrandedId(uppercaseUuid, 'CustomId');
      expect(id).toBe(validUuid);
    });

    it('rejects empty or whitespace-only strings', () => {
      expect(() => parseBrandedId('', 'TestId')).toThrow(InvalidIdentifierError);
      expect(() => parseBrandedId('   ', 'TestId')).toThrow(InvalidIdentifierError);
    });

    it('rejects non-string values', () => {
      expect(() => parseBrandedId(null, 'TestId')).toThrow(InvalidIdentifierError);
      expect(() => parseBrandedId(undefined, 'TestId')).toThrow(InvalidIdentifierError);
      expect(() => parseBrandedId(12345, 'TestId')).toThrow(InvalidIdentifierError);
    });

    it('rejects malformed UUIDs', () => {
      expect(() => parseBrandedId('invalid-uuid-string', 'TestId')).toThrow(InvalidIdentifierError);
      expect(() => parseBrandedId('f47ac10b-58cc-4372-a567', 'TestId')).toThrow(
        InvalidIdentifierError,
      );
    });
  });

  describe('Entity-Specific Parsers', () => {
    it('correctly constructs all 12 authorized entity identifier types', () => {
      expect(parseUserId(validUuid)).toBe(validUuid);
      expect(parseCaseId(validUuid)).toBe(validUuid);
      expect(parseRevisionId(validUuid)).toBe(validUuid);
      expect(parseEvidenceId(validUuid)).toBe(validUuid);
      expect(parseRulePackId(validUuid)).toBe(validUuid);
      expect(parseRunId(validUuid)).toBe(validUuid);
      expect(parseMemoId(validUuid)).toBe(validUuid);
      expect(parseDossierId(validUuid)).toBe(validUuid);
      expect(parsePricePointId(validUuid)).toBe(validUuid);
      expect(parseOrderId(validUuid)).toBe(validUuid);
      expect(parsePaymentEventId(validUuid)).toBe(validUuid);
      expect(parseEntitlementId(validUuid)).toBe(validUuid);
    });

    it('throws InvalidIdentifierError when invalid inputs are passed to specialized parsers', () => {
      expect(() => parseUserId('bad-id')).toThrow(InvalidIdentifierError);
      expect(() => parseCaseId('bad-id')).toThrow(InvalidIdentifierError);
      expect(() => parseOrderId('')).toThrow(InvalidIdentifierError);
      expect(() => parseEntitlementId(null)).toThrow(InvalidIdentifierError);
    });
  });

  describe('Entity-Specific Type Guards', () => {
    it('validates IDs using specific type guards', () => {
      expect(isUserId(validUuid)).toBe(true);
      expect(isCaseId(validUuid)).toBe(true);
      expect(isRevisionId(validUuid)).toBe(true);
      expect(isEvidenceId(validUuid)).toBe(true);
      expect(isRulePackId(validUuid)).toBe(true);
      expect(isRunId(validUuid)).toBe(true);
      expect(isMemoId(validUuid)).toBe(true);
      expect(isDossierId(validUuid)).toBe(true);
      expect(isPricePointId(validUuid)).toBe(true);
      expect(isOrderId(validUuid)).toBe(true);
      expect(isPaymentEventId(validUuid)).toBe(true);
      expect(isEntitlementId(validUuid)).toBe(true);

      expect(isUserId('invalid')).toBe(false);
      expect(isOrderId(123)).toBe(false);
    });
  });
});
