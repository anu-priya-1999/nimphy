import { describe, expect, it } from 'vitest';
import { parseRulePackId } from '@nimphy/domain';
import { RulePackInvalidError } from '../errors/rule-pack-error';
import { computeRulePackContentHash } from '../hashing/content-hash';
import {
  SYNTHETIC_TEST_PACKS,
  TEST_EBOOK_STANDARD_1_0_0,
  TEST_PAPERBACK_US_1_0_0,
} from '../synthetic/test-packs';
import { RulePackLoader } from './rule-pack-loader';

describe('RulePackLoader Registry & Operations', () => {
  it('initializes empty loader and registers packs', () => {
    const loader = new RulePackLoader();
    expect(loader.size).toBe(0);

    const registered = loader.register(TEST_EBOOK_STANDARD_1_0_0);
    expect(loader.size).toBe(1);

    expect(loader.getById(TEST_EBOOK_STANDARD_1_0_0.id)).toBe(registered);
    expect(loader.getById(TEST_EBOOK_STANDARD_1_0_0.id)).toEqual(TEST_EBOOK_STANDARD_1_0_0);
    expect(loader.getByKeyAndVersion('TEST_EBOOK_STANDARD', '1.0.0')).toBe(registered);
  });

  it('initializes with initial packs collection', () => {
    const loader = new RulePackLoader(SYNTHETIC_TEST_PACKS);
    expect(loader.size).toBe(SYNTHETIC_TEST_PACKS.length);
    expect(loader.list().length).toBe(SYNTHETIC_TEST_PACKS.length);
    expect(Object.isFrozen(loader.list())).toBe(true);
  });

  it('registers multiple packs using registerAll()', () => {
    const loader = new RulePackLoader();
    loader.registerAll([TEST_EBOOK_STANDARD_1_0_0, TEST_PAPERBACK_US_1_0_0]);
    expect(loader.size).toBe(2);
  });

  it('permits idempotent re-registration of identical immutable pack', () => {
    const loader = new RulePackLoader([TEST_EBOOK_STANDARD_1_0_0]);
    expect(() => loader.register(TEST_EBOOK_STANDARD_1_0_0)).not.toThrow();
    expect(loader.size).toBe(1);
  });

  it('strictly rejects overwrite of same packKey and version with differing content (ADR-006)', () => {
    const loader = new RulePackLoader([TEST_EBOOK_STANDARD_1_0_0]);

    const tamperedContent = {
      ...TEST_EBOOK_STANDARD_1_0_0.content,
      limits: {
        ...TEST_EBOOK_STANDARD_1_0_0.content.limits,
        minListPriceMinor: 150, // modified
      },
    };
    const tamperedPack = {
      ...TEST_EBOOK_STANDARD_1_0_0,
      content: tamperedContent,
      contentHash: computeRulePackContentHash(tamperedContent),
    };

    expect(() => loader.register(tamperedPack)).toThrow(RulePackInvalidError);
    try {
      loader.register(tamperedPack);
    } catch (err) {
      expect(err).toBeInstanceOf(RulePackInvalidError);
      expect((err as RulePackInvalidError).issues[0]?.code).toBe('IMMUTABLE_OVERWRITE_FORBIDDEN');
    }
  });

  it('loads valid pack from JSON string', () => {
    const loader = new RulePackLoader();
    const jsonStr = JSON.stringify(TEST_EBOOK_STANDARD_1_0_0);
    const loaded = loader.loadFromJson(jsonStr);

    expect(loaded.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(loaded.version).toBe('1.0.0');
    expect(loader.size).toBe(1);
  });

  it('throws RulePackInvalidError with INVALID_JSON on malformed JSON string', () => {
    const loader = new RulePackLoader();
    expect(() => loader.loadFromJson('{ bad json: ]')).toThrow(RulePackInvalidError);
  });

  it('loads valid pack from raw in-memory object', () => {
    const loader = new RulePackLoader();
    const loaded = loader.loadFromObject(TEST_PAPERBACK_US_1_0_0);

    expect(loaded.packKey).toBe('TEST_PAPERBACK_US');
    expect(loader.size).toBe(1);
  });

  it('delegates select() to selector correctly', () => {
    const loader = new RulePackLoader(SYNTHETIC_TEST_PACKS);
    const selected = loader.select({
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    });

    expect(selected.packKey).toBe('TEST_EBOOK_STANDARD');
  });

  it('delegates findAll() to selector correctly', () => {
    const loader = new RulePackLoader(SYNTHETIC_TEST_PACKS);
    const allPaperbacks = loader.findAll({
      marketplace: 'TEST_MARKETPLACE',
      format: 'paperback',
      asOf: '2026-06-01',
    });

    expect(allPaperbacks.length).toBe(1);
    expect(allPaperbacks[0]?.version).toBe('2.0.0');
  });

  it('returns undefined for non-existent id or key/version', () => {
    const loader = new RulePackLoader(SYNTHETIC_TEST_PACKS);
    expect(loader.getById(parseRulePackId('00000000-0000-0000-0000-000000000000'))).toBeUndefined();
    expect(loader.getByKeyAndVersion('UNKNOWN_KEY', '1.0.0')).toBeUndefined();
  });
});
