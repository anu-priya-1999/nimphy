import { describe, expect, it } from 'vitest';
import { RulePackInvalidError } from '../errors/rule-pack-error';
import { computeRulePackContentHash } from '../hashing/content-hash';
import {
  assertSyntheticPackKey,
  isSyntheticPackKey,
  isValidCalendarDate,
  parseRulePack,
  safeParseRulePack,
  validateRulePack,
} from './validator';

describe('Rule Pack Schema Validation & Parsing', () => {
  const validEbookContent = {
    rounding: {
      mode: 'round_half_up' as const,
      point: 'per_unit' as const,
    },
    royalty: {
      tiers: [
        {
          name: 'standard_low',
          minPriceMinor: 99,
          maxPriceMinor: 298,
          royaltyRateDecimal: '0.35',
        },
        {
          name: 'standard_mid',
          minPriceMinor: 299,
          maxPriceMinor: 999,
          royaltyRateDecimal: '0.70',
        },
        {
          name: 'standard_high',
          minPriceMinor: 1000,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.35',
        },
      ],
    },
    printCost: null,
    deliveryCost: {
      costPerMbMinor: 15,
    },
    limits: {
      minListPriceMinor: 99,
      maxListPriceMinor: 20000,
      minPages: null,
      maxPages: null,
    },
  };

  const validEbookRaw = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    packKey: 'TEST_EBOOK_STANDARD',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'ebook',
    currency: 'USD',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    sourceRef: 'Synthetic Test Specification SYNTH-001',
    sourceRetrievedAt: '2026-01-01',
    content: validEbookContent,
  };

  const validPaperbackContent = {
    rounding: {
      mode: 'round_half_even' as const,
      point: 'per_unit' as const,
    },
    royalty: {
      tiers: [
        {
          name: 'flat_paperback',
          minPriceMinor: 0,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.60',
        },
      ],
    },
    printCost: {
      baseCostMinor: 100,
      costPerPageMinor: 2,
      pageThreshold: 24,
    },
    deliveryCost: null,
    limits: {
      minListPriceMinor: 500,
      maxListPriceMinor: 25000,
      minPages: 24,
      maxPages: 800,
    },
  };

  const validPaperbackRaw = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    packKey: 'TEST_PAPERBACK_US',
    version: '1.0.0',
    status: 'published',
    marketplace: 'TEST_MARKETPLACE',
    format: 'paperback',
    currency: 'USD',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    sourceRef: 'Synthetic Test Specification SYNTH-PRINT-001',
    sourceRetrievedAt: '2025-01-01',
    content: validPaperbackContent,
  };

  it('validates and parses a valid ebook Rule Pack and deep freezes it', () => {
    const pack = parseRulePack(validEbookRaw);

    expect(pack.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(pack.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(pack.version).toBe('1.0.0');
    expect(pack.status).toBe('published');
    expect(pack.marketplace).toBe('TEST_MARKETPLACE');
    expect(pack.format).toBe('ebook');
    expect(pack.currency).toBe('USD');
    expect(pack.effectiveFrom).toBe('2026-01-01');
    expect(pack.effectiveTo).toBeNull();
    expect(pack.sourceRef).toBe('Synthetic Test Specification SYNTH-001');
    expect(pack.sourceRetrievedAt).toBe('2026-01-01');

    // Content hash automatically computed and attached
    expect(pack.contentHash).toBe(computeRulePackContentHash(validEbookContent));

    // Deep immutability
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.content)).toBe(true);
    expect(Object.isFrozen(pack.content.rounding)).toBe(true);
    expect(Object.isFrozen(pack.content.royalty)).toBe(true);
    expect(Object.isFrozen(pack.content.royalty.tiers)).toBe(true);
    expect(Object.isFrozen(pack.content.limits)).toBe(true);
  });

  it('validates and parses a valid paperback Rule Pack with bounded effectiveTo', () => {
    const pack = parseRulePack(validPaperbackRaw);

    expect(pack.format).toBe('paperback');
    expect(pack.effectiveFrom).toBe('2025-01-01');
    expect(pack.effectiveTo).toBe('2025-12-31');
    expect(pack.content.printCost?.baseCostMinor).toBe(100);
    expect(pack.content.printCost?.costPerPageMinor).toBe(2);
    expect(pack.content.printCost?.pageThreshold).toBe(24);
    expect(pack.content.limits.minPages).toBe(24);
    expect(pack.content.limits.maxPages).toBe(800);
  });

  it('accepts snake_case database aliases seamlessly', () => {
    const snakeCaseRaw = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      pack_key: 'TEST_EBOOK_STANDARD',
      version: '1.0.0',
      status: 'published',
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      currency: 'USD',
      effective_from: '2026-01-01',
      effective_to: null,
      source_ref: 'Synthetic Test Specification SYNTH-001',
      source_retrieved_at: '2026-01-01',
      content: validEbookContent,
    };

    const pack = parseRulePack(snakeCaseRaw);
    expect(pack.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(pack.effectiveFrom).toBe('2026-01-01');
    expect(pack.sourceRef).toBe('Synthetic Test Specification SYNTH-001');
    expect(pack.sourceRetrievedAt).toBe('2026-01-01');
  });

  it('rejects non-object root input', () => {
    expect(() => parseRulePack(null)).toThrow(RulePackInvalidError);
    expect(() => parseRulePack('string')).toThrow(RulePackInvalidError);
    expect(() => parseRulePack([1, 2, 3])).toThrow(RulePackInvalidError);
  });

  it('rejects invalid UUID identifiers', () => {
    const invalid = { ...validEbookRaw, id: 'not-a-uuid' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_IDENTIFIER')).toBe(true);
  });

  it('rejects invalid SemVer', () => {
    const invalid = { ...validEbookRaw, version: '1.0' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_SEMVER')).toBe(true);
  });

  it('rejects invalid status', () => {
    const invalid = { ...validEbookRaw, status: 'archived' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_STATUS')).toBe(true);
  });

  it('rejects unsupported currency', () => {
    const invalid = { ...validEbookRaw, currency: 'XYZ' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'UNSUPPORTED_CURRENCY')).toBe(true);
  });

  it('rejects invalid format', () => {
    const invalid = { ...validEbookRaw, format: 'audiobook' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_FORMAT')).toBe(true);
  });

  it('rejects invalid calendar dates', () => {
    expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 not a leap year
    expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 was leap year
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days

    const invalid = { ...validEbookRaw, effectiveFrom: '2026-02-29' };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.path === 'effectiveFrom')).toBe(true);
  });

  it('rejects effectiveTo earlier than or equal to effectiveFrom (doc 06 §3)', () => {
    const invalid1 = {
      ...validPaperbackRaw,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-01-01', // equal
    };
    const res1 = validateRulePack(invalid1);
    expect(res1.valid).toBe(false);
    expect(res1.issues.some((i) => i.code === 'INVALID_DATE_RANGE')).toBe(true);

    const invalid2 = {
      ...validPaperbackRaw,
      effectiveFrom: '2026-06-01',
      effectiveTo: '2026-01-01', // earlier
    };
    const res2 = validateRulePack(invalid2);
    expect(res2.valid).toBe(false);
    expect(res2.issues.some((i) => i.code === 'INVALID_DATE_RANGE')).toBe(true);
  });

  it('rejects missing or invalid rounding policy (ADR-005)', () => {
    const missingRounding = {
      ...validEbookRaw,
      content: { ...validEbookContent, rounding: undefined },
    };
    const res1 = validateRulePack(missingRounding);
    expect(res1.valid).toBe(false);
    expect(res1.issues.some((i) => i.path === 'content.rounding')).toBe(true);

    const invalidMode = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        rounding: { mode: 'invalid_mode', point: 'per_unit' },
      },
    };
    const res2 = validateRulePack(invalidMode);
    expect(res2.valid).toBe(false);
    expect(res2.issues.some((i) => i.code === 'INVALID_ROUNDING_MODE')).toBe(true);

    const invalidPoint = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        rounding: { mode: 'round_half_up', point: 'per_thousand' },
      },
    };
    const res3 = validateRulePack(invalidPoint);
    expect(res3.valid).toBe(false);
    expect(res3.issues.some((i) => i.code === 'INVALID_ROUNDING_POINT')).toBe(true);
  });

  it('rejects invalid royalty policy and tiers', () => {
    // Empty tiers
    const emptyTiers = {
      ...validEbookRaw,
      content: { ...validEbookContent, royalty: { tiers: [] } },
    };
    expect(validateRulePack(emptyTiers).valid).toBe(false);

    // Negative min price
    const negPrice = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        royalty: {
          tiers: [
            {
              name: 'tier1',
              minPriceMinor: -10,
              maxPriceMinor: 100,
              royaltyRateDecimal: '0.70',
            },
          ],
        },
      },
    };
    expect(validateRulePack(negPrice).valid).toBe(false);

    // Max price <= min price
    const invertedBounds = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        royalty: {
          tiers: [
            {
              name: 'tier1',
              minPriceMinor: 500,
              maxPriceMinor: 400,
              royaltyRateDecimal: '0.70',
            },
          ],
        },
      },
    };
    expect(validateRulePack(invertedBounds).valid).toBe(false);

    // Overlapping tiers
    const overlapping = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        royalty: {
          tiers: [
            {
              name: 'tier1',
              minPriceMinor: 100,
              maxPriceMinor: 500,
              royaltyRateDecimal: '0.35',
            },
            {
              name: 'tier2',
              minPriceMinor: 400, // overlaps with 500
              maxPriceMinor: 1000,
              royaltyRateDecimal: '0.70',
            },
          ],
        },
      },
    };
    const resOverlap = validateRulePack(overlapping);
    expect(resOverlap.valid).toBe(false);
    expect(resOverlap.issues.some((i) => i.code === 'OVERLAPPING_TIER')).toBe(true);

    // Invalid rate decimal
    const badRate = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        royalty: {
          tiers: [
            {
              name: 'tier1',
              minPriceMinor: 100,
              maxPriceMinor: null,
              royaltyRateDecimal: '1.50', // > 1
            },
          ],
        },
      },
    };
    expect(validateRulePack(badRate).valid).toBe(false);
  });

  it('rejects unexpected printCost for ebook format', () => {
    const invalid = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        printCost: { baseCostMinor: 100, costPerPageMinor: 2 },
      },
    };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'UNEXPECTED_FIELD')).toBe(true);
  });

  it('rejects missing printCost for physical format', () => {
    const invalid = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        printCost: null,
      },
    };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'MISSING_FIELD')).toBe(true);
  });

  it('rejects missing page limits for physical format', () => {
    const invalid = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        limits: {
          minListPriceMinor: 500,
          maxListPriceMinor: 25000,
          minPages: null,
          maxPages: null,
        },
      },
    };
    const res = validateRulePack(invalid);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'INVALID_MIN_PAGES')).toBe(true);
  });

  it('verifies declared contentHash and rejects tampered contentHash', () => {
    const actualHash = computeRulePackContentHash(validEbookContent);

    // Declaring correct contentHash passes
    const validWithHash = {
      ...validEbookRaw,
      contentHash: actualHash,
    };
    expect(validateRulePack(validWithHash).valid).toBe(true);

    // Declaring incorrect contentHash fails with CONTENT_HASH_MISMATCH
    const tampered = {
      ...validEbookRaw,
      contentHash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    };
    const res = validateRulePack(tampered);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'CONTENT_HASH_MISMATCH')).toBe(true);
  });

  it('identifies and asserts synthetic pack keys correctly', () => {
    expect(isSyntheticPackKey('TEST_EBOOK_STANDARD')).toBe(true);
    expect(isSyntheticPackKey('TEST_PAPERBACK_US')).toBe(true);
    expect(isSyntheticPackKey('AMAZON_KDP_US')).toBe(false);
    expect(isSyntheticPackKey('')).toBe(false);

    expect(() => assertSyntheticPackKey('TEST_VALID')).not.toThrow();
    expect(() => assertSyntheticPackKey('REAL_PROD_PACK')).toThrow(RulePackInvalidError);
  });

  it('safeParseRulePack returns error instead of throwing on invalid input', () => {
    const result = safeParseRulePack({ bad: 'input' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(RulePackInvalidError);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('safeParseRulePack returns success with validated RulePack on valid input', () => {
    const result = safeParseRulePack(validEbookRaw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.packKey).toBe('TEST_EBOOK_STANDARD');
    }
  });

  it('validates and rejects all remaining invalid content and envelope edge cases', () => {
    // 1. Missing packKey, marketplace, sourceRef, sourceRetrievedAt
    expect(
      validateRulePack({ ...validEbookRaw, packKey: '' }).issues.some(
        (i) => i.code === 'INVALID_PACK_KEY',
      ),
    ).toBe(true);
    expect(
      validateRulePack({ ...validEbookRaw, marketplace: '' }).issues.some(
        (i) => i.code === 'INVALID_MARKETPLACE',
      ),
    ).toBe(true);
    expect(
      validateRulePack({ ...validEbookRaw, sourceRef: '' }).issues.some(
        (i) => i.code === 'INVALID_SOURCE_REF',
      ),
    ).toBe(true);
    expect(
      validateRulePack({ ...validEbookRaw, sourceRetrievedAt: 'not-a-date' }).issues.some(
        (i) => i.path === 'sourceRetrievedAt',
      ),
    ).toBe(true);

    // 2. Missing content
    expect(validateRulePack({ ...validEbookRaw, content: null }).valid).toBe(false);

    // 3. Invalid print cost details (physical format)
    const badBaseCost = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        printCost: { baseCostMinor: -1, costPerPageMinor: 2, pageThreshold: 24 },
      },
    };
    expect(validateRulePack(badBaseCost).issues.some((i) => i.code === 'INVALID_BASE_COST')).toBe(
      true,
    );

    const badPerPageCost = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        printCost: { baseCostMinor: 100, costPerPageMinor: -5, pageThreshold: 24 },
      },
    };
    expect(
      validateRulePack(badPerPageCost).issues.some((i) => i.code === 'INVALID_COST_PER_PAGE'),
    ).toBe(true);

    const badThreshold = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        printCost: { baseCostMinor: 100, costPerPageMinor: 2, pageThreshold: -1 },
      },
    };
    expect(
      validateRulePack(badThreshold).issues.some((i) => i.code === 'INVALID_PAGE_THRESHOLD'),
    ).toBe(true);

    // 4. Invalid delivery cost details
    const badDeliveryType = {
      ...validEbookRaw,
      content: { ...validEbookContent, deliveryCost: 'not-an-object' },
    };
    expect(validateRulePack(badDeliveryType).issues.some((i) => i.code === 'INVALID_TYPE')).toBe(
      true,
    );

    const negDeliveryCost = {
      ...validEbookRaw,
      content: { ...validEbookContent, deliveryCost: { costPerMbMinor: -10 } },
    };
    expect(
      validateRulePack(negDeliveryCost).issues.some((i) => i.code === 'INVALID_COST_PER_MB'),
    ).toBe(true);

    // 5. Limits validation edge cases
    const badMaxPages = {
      ...validPaperbackRaw,
      content: {
        ...validPaperbackContent,
        limits: { minListPriceMinor: 500, maxListPriceMinor: 25000, minPages: 100, maxPages: 50 },
      },
    };
    expect(validateRulePack(badMaxPages).issues.some((i) => i.code === 'INVALID_MAX_PAGES')).toBe(
      true,
    );

    const ebookWithPages = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        limits: { minListPriceMinor: 99, maxListPriceMinor: 20000, minPages: 50, maxPages: 100 },
      },
    };
    const resEbookPages = validateRulePack(ebookWithPages);
    expect(resEbookPages.issues.some((i) => i.path === 'content.limits.minPages')).toBe(true);
    expect(resEbookPages.issues.some((i) => i.path === 'content.limits.maxPages')).toBe(true);

    // 6. Custom parameters validation
    const badCustomParams = {
      ...validEbookRaw,
      content: { ...validEbookContent, customParameters: 'not-an-object' },
    };
    expect(
      validateRulePack(badCustomParams).issues.some((i) => i.path === 'content.customParameters'),
    ).toBe(true);

    const validCustomParams = {
      ...validEbookRaw,
      content: { ...validEbookContent, customParameters: { note: 'test parameter' } },
    };
    const parsedCustom = parseRulePack(validCustomParams);
    expect(parsedCustom.content.customParameters?.note).toBe('test parameter');

    // 7. createdAt validation
    const badCreatedAt = { ...validEbookRaw, createdAt: 12345 };
    expect(validateRulePack(badCreatedAt).issues.some((i) => i.code === 'INVALID_TIMESTAMP')).toBe(
      true,
    );

    const validCreatedAt = { ...validEbookRaw, createdAt: '2026-01-01T00:00:00Z' };
    expect(parseRulePack(validCreatedAt).createdAt).toBe('2026-01-01T00:00:00Z');

    // 8. contentHash invalid type
    const badHashType = { ...validEbookRaw, contentHash: 12345 };
    expect(validateRulePack(badHashType).issues.some((i) => i.code === 'INVALID_HASH_TYPE')).toBe(
      true,
    );

    // 9. safeParseRulePack re-throws unexpected non-RulePackInvalidError
    const thrower = {
      get id() {
        throw new TypeError('Unexpected runtime exception');
      },
    };
    expect(() => safeParseRulePack(thrower)).toThrow(TypeError);

    // 10. Missing content.royalty or non-object royalty
    const missingRoyalty = {
      ...validEbookRaw,
      content: { ...validEbookContent, royalty: null },
    };
    expect(validateRulePack(missingRoyalty).issues.some((i) => i.path === 'content.royalty')).toBe(
      true,
    );

    // 11. Tier invalid type (not an object) and invalid tier name
    const nullTier = {
      ...validEbookRaw,
      content: { ...validEbookContent, royalty: { tiers: [null] } },
    };
    expect(validateRulePack(nullTier).issues.some((i) => i.code === 'INVALID_TYPE')).toBe(true);

    const emptyTierName = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        royalty: {
          tiers: [{ ...validEbookContent.royalty.tiers[0], name: '  ' }],
        },
      },
    };
    expect(validateRulePack(emptyTierName).issues.some((i) => i.code === 'INVALID_NAME')).toBe(
      true,
    );

    // 12. Missing content.limits or non-object limits
    const missingLimits = {
      ...validEbookRaw,
      content: { ...validEbookContent, limits: null },
    };
    expect(validateRulePack(missingLimits).issues.some((i) => i.path === 'content.limits')).toBe(
      true,
    );

    // 13. Invalid minListPriceMinor (<=0 or not integer)
    const invalidMinPrice = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        limits: { ...validEbookContent.limits, minListPriceMinor: -5 },
      },
    };
    expect(
      validateRulePack(invalidMinPrice).issues.some(
        (i) => i.path === 'content.limits.minListPriceMinor',
      ),
    ).toBe(true);

    // 14. Invalid maxListPriceMinor (<= minListPriceMinor)
    const invalidMaxPrice = {
      ...validEbookRaw,
      content: {
        ...validEbookContent,
        limits: { ...validEbookContent.limits, minListPriceMinor: 500, maxListPriceMinor: 400 },
      },
    };
    expect(
      validateRulePack(invalidMaxPrice).issues.some(
        (i) => i.path === 'content.limits.maxListPriceMinor',
      ),
    ).toBe(true);

    // 15. Invalid effectiveTo calendar date format
    const invalidEffectiveToDate = {
      ...validEbookRaw,
      effectiveTo: 'invalid-date-format',
    };
    expect(
      validateRulePack(invalidEffectiveToDate).issues.some(
        (i) => i.path === 'effectiveTo' && i.code === 'INVALID_DATE',
      ),
    ).toBe(true);
  });
});
