import { describe, expect, it } from 'vitest';
import { verifyRulePackContentHash } from '../hashing/content-hash';
import { isSyntheticPackKey } from '../schema/validator';
import {
  SYNTHETIC_TEST_PACKS,
  TEST_EBOOK_STANDARD_1_0_0,
  TEST_HARDCOVER_GLOBAL_1_0_0,
  TEST_PAPERBACK_US_1_0_0,
  TEST_PAPERBACK_US_2_0_0,
} from './test-packs';

describe('Built-in Synthetic Rule Packs', () => {
  it('contains exactly 4 built-in synthetic test packs', () => {
    expect(SYNTHETIC_TEST_PACKS.length).toBe(4);
    expect(Object.isFrozen(SYNTHETIC_TEST_PACKS)).toBe(true);
  });

  it('all synthetic packs adhere to TEST_ naming prefix convention (ADR-006)', () => {
    for (const pack of SYNTHETIC_TEST_PACKS) {
      expect(isSyntheticPackKey(pack.packKey)).toBe(true);
      expect(pack.status).toBe('published');
      expect(pack.sourceRef).toContain('Synthetic Test Specification');
    }
  });

  it('all synthetic packs possess valid and verified content hashes', () => {
    for (const pack of SYNTHETIC_TEST_PACKS) {
      expect(pack.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(verifyRulePackContentHash(pack)).toBe(true);
    }
  });

  it('TEST_EBOOK_STANDARD_1_0_0 has expected structure and parameters', () => {
    expect(TEST_EBOOK_STANDARD_1_0_0.format).toBe('ebook');
    expect(TEST_EBOOK_STANDARD_1_0_0.currency).toBe('USD');
    expect(TEST_EBOOK_STANDARD_1_0_0.content.rounding.mode).toBe('round_half_up');
    expect(TEST_EBOOK_STANDARD_1_0_0.content.rounding.point).toBe('per_unit');
    expect(TEST_EBOOK_STANDARD_1_0_0.content.printCost).toBeNull();
    expect(TEST_EBOOK_STANDARD_1_0_0.content.deliveryCost?.costPerMbMinor).toBe(15);
    expect(TEST_EBOOK_STANDARD_1_0_0.content.royalty.tiers.length).toBe(3);
  });

  it('TEST_PAPERBACK_US_1_0_0 and 2_0_0 model consecutive versioned time windows', () => {
    expect(TEST_PAPERBACK_US_1_0_0.effectiveFrom).toBe('2025-01-01');
    expect(TEST_PAPERBACK_US_1_0_0.effectiveTo).toBe('2025-12-31');
    expect(TEST_PAPERBACK_US_1_0_0.content.printCost?.baseCostMinor).toBe(100);

    expect(TEST_PAPERBACK_US_2_0_0.effectiveFrom).toBe('2026-01-01');
    expect(TEST_PAPERBACK_US_2_0_0.effectiveTo).toBeNull();
    expect(TEST_PAPERBACK_US_2_0_0.content.printCost?.baseCostMinor).toBe(120);
  });

  it('TEST_HARDCOVER_GLOBAL_1_0_0 models international EUR currency with round_down/per_total', () => {
    expect(TEST_HARDCOVER_GLOBAL_1_0_0.format).toBe('hardcover');
    expect(TEST_HARDCOVER_GLOBAL_1_0_0.currency).toBe('EUR');
    expect(TEST_HARDCOVER_GLOBAL_1_0_0.content.rounding.mode).toBe('round_down');
    expect(TEST_HARDCOVER_GLOBAL_1_0_0.content.rounding.point).toBe('per_total');
    expect(TEST_HARDCOVER_GLOBAL_1_0_0.content.printCost?.baseCostMinor).toBe(600);
  });
});
