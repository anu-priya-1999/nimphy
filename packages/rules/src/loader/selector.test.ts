import { describe, expect, it } from 'vitest';
import { RulePackInvalidError, RulePackNotFoundError } from '../errors/rule-pack-error';
import { SYNTHETIC_TEST_PACKS, TEST_EBOOK_STANDARD_1_0_0 } from '../synthetic/test-packs';
import { findRulePacks, normalizeAsOfDate, selectRulePack } from './selector';

describe('Rule Pack Selector & Date-Based Matching', () => {
  it('normalizes valid asOf date string and Date object', () => {
    expect(normalizeAsOfDate('2026-06-15')).toBe('2026-06-15');

    const date = new Date(Date.UTC(2026, 5, 15)); // June 15, 2026
    expect(normalizeAsOfDate(date)).toBe('2026-06-15');
  });

  it('rejects invalid asOf date formats', () => {
    expect(() => normalizeAsOfDate('invalid-date')).toThrow(RulePackInvalidError);
    expect(() => normalizeAsOfDate('2026-02-29')).toThrow(RulePackInvalidError);
    expect(() => normalizeAsOfDate(new Date('invalid'))).toThrow(RulePackInvalidError);
    expect(() => normalizeAsOfDate(12345 as unknown as string)).toThrow(RulePackInvalidError);
  });

  it('selects pack on exact effectiveFrom date boundary', () => {
    const selected = selectRulePack(SYNTHETIC_TEST_PACKS, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-01-01', // exact effectiveFrom of TEST_EBOOK_STANDARD_1_0_0
    });
    expect(selected.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(selected.version).toBe('1.0.0');
  });

  it('rejects date strictly before effectiveFrom with RULE_PACK_NOT_FOUND', () => {
    expect(() =>
      selectRulePack(SYNTHETIC_TEST_PACKS, {
        marketplace: 'TEST_MARKETPLACE',
        format: 'ebook',
        asOf: '2025-12-31', // 1 day before effectiveFrom (2026-01-01)
      }),
    ).toThrow(RulePackNotFoundError);
  });

  it('selects historical pack on exact effectiveTo date boundary', () => {
    // TEST_PAPERBACK_US_1_0_0 is effective 2025-01-01 to 2025-12-31
    const selected = selectRulePack(SYNTHETIC_TEST_PACKS, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'paperback',
      asOf: '2025-12-31', // exact effectiveTo
    });
    expect(selected.packKey).toBe('TEST_PAPERBACK_US');
    expect(selected.version).toBe('1.0.0');
  });

  it('selects successor version on transition date (2026-01-01)', () => {
    // TEST_PAPERBACK_US_2_0_0 is effective 2026-01-01 to null
    const selected = selectRulePack(SYNTHETIC_TEST_PACKS, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'paperback',
      asOf: '2026-01-01',
    });
    expect(selected.packKey).toBe('TEST_PAPERBACK_US');
    expect(selected.version).toBe('2.0.0');
  });

  it('selects successor version on far-future date with open-ended effectiveTo', () => {
    const selected = selectRulePack(SYNTHETIC_TEST_PACKS, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'paperback',
      asOf: '2030-10-15',
    });
    expect(selected.packKey).toBe('TEST_PAPERBACK_US');
    expect(selected.version).toBe('2.0.0');
  });

  it('resolves highest SemVer when multiple versions overlap on a date', () => {
    // Create an overlapping version 1.1.0 for ebook
    const ebookV1_1 = {
      ...TEST_EBOOK_STANDARD_1_0_0,
      version: '1.1.0',
    };

    const packs = [TEST_EBOOK_STANDARD_1_0_0, ebookV1_1];

    const selected = selectRulePack(packs, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    });

    expect(selected.version).toBe('1.1.0');
  });

  it('throws RULE_PACK_NOT_FOUND when marketplace does not match', () => {
    expect(() =>
      selectRulePack(SYNTHETIC_TEST_PACKS, {
        marketplace: 'NON_EXISTENT_MARKETPLACE',
        format: 'ebook',
        asOf: '2026-06-01',
      }),
    ).toThrow(RulePackNotFoundError);
  });

  it('throws RULE_PACK_NOT_FOUND when format does not match', () => {
    expect(() =>
      selectRulePack(SYNTHETIC_TEST_PACKS, {
        marketplace: 'TEST_GLOBAL',
        format: 'ebook', // TEST_GLOBAL only has hardcover
        asOf: '2026-06-01',
      }),
    ).toThrow(RulePackNotFoundError);
  });

  it('filters by status: draft packs are ignored by default', () => {
    const draftPack = {
      ...TEST_EBOOK_STANDARD_1_0_0,
      status: 'draft' as const,
      version: '2.0.0',
    };

    const packs = [TEST_EBOOK_STANDARD_1_0_0, draftPack];

    // Default status is 'published'
    const publishedSelected = selectRulePack(packs, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    });
    expect(publishedSelected.version).toBe('1.0.0');

    // Explicitly querying for draft
    const draftSelected = selectRulePack(packs, {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
      status: 'draft',
    });
    expect(draftSelected.version).toBe('2.0.0');
  });

  it('findRulePacks returns all matching packs sorted by SemVer descending', () => {
    const ebookV1_0 = TEST_EBOOK_STANDARD_1_0_0;
    const ebookV1_1 = { ...TEST_EBOOK_STANDARD_1_0_0, version: '1.1.0' };
    const ebookV2_0 = { ...TEST_EBOOK_STANDARD_1_0_0, version: '2.0.0' };

    const matches = findRulePacks([ebookV1_0, ebookV2_0, ebookV1_1], {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    });

    expect(matches.map((p) => p.version)).toEqual(['2.0.0', '1.1.0', '1.0.0']);
  });

  it('tie-breaks identical SemVer by packKey lexicographically', () => {
    const packA = { ...TEST_EBOOK_STANDARD_1_0_0, packKey: 'TEST_PACK_A' };
    const packB = { ...TEST_EBOOK_STANDARD_1_0_0, packKey: 'TEST_PACK_B' };

    const selected = selectRulePack([packB, packA], {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    });

    expect(selected.packKey).toBe('TEST_PACK_A');
  });
});
