import { describe, expect, it } from 'vitest';
import * as Rules from './index';

describe('@nimphy/rules Barrel Export Integration', () => {
  it('exports module metadata constants', () => {
    expect(Rules.RULES_MODULE_NAME).toBe('rules');
    expect(Rules.RULES_MODULE_VERSION).toBe('0.1.0');
  });

  it('exports domain error classes', () => {
    expect(typeof Rules.RulePackError).toBe('function');
    expect(typeof Rules.RulePackInvalidError).toBe('function');
    expect(typeof Rules.RulePackNotFoundError).toBe('function');
  });

  it('exports vocabulary constants and type guards', () => {
    expect(Array.isArray(Rules.RULE_PACK_STATUSES)).toBe(true);
    expect(Rules.isRulePackStatus('published')).toBe(true);
    expect(Rules.isRulePackStatus(123)).toBe(false);

    expect(Array.isArray(Rules.ROUNDING_MODES)).toBe(true);
    expect(Rules.isRoundingMode('round_half_up')).toBe(true);
    expect(Rules.isRoundingMode(null)).toBe(false);

    expect(Array.isArray(Rules.ROUNDING_POINTS)).toBe(true);
    expect(Rules.isRoundingPoint('per_unit')).toBe(true);
    expect(Rules.isRoundingPoint(undefined)).toBe(false);
  });

  it('exports semver utilities', () => {
    expect(typeof Rules.isValidSemver).toBe('function');
    expect(typeof Rules.parseSemver).toBe('function');
    expect(typeof Rules.compareSemver).toBe('function');
  });

  it('exports validation functions', () => {
    expect(typeof Rules.isSyntheticPackKey).toBe('function');
    expect(typeof Rules.assertSyntheticPackKey).toBe('function');
    expect(typeof Rules.isValidCalendarDate).toBe('function');
    expect(typeof Rules.validateRulePackContent).toBe('function');
    expect(typeof Rules.validateRulePack).toBe('function');
    expect(typeof Rules.parseRulePack).toBe('function');
    expect(typeof Rules.safeParseRulePack).toBe('function');
  });

  it('exports content hashing functions', () => {
    expect(typeof Rules.computeRulePackContentHash).toBe('function');
    expect(typeof Rules.verifyRulePackContentHash).toBe('function');
    expect(typeof Rules.computeRulePackEnvelopeHash).toBe('function');
  });

  it('exports loader and selector utilities', () => {
    expect(typeof Rules.normalizeAsOfDate).toBe('function');
    expect(typeof Rules.findRulePacks).toBe('function');
    expect(typeof Rules.selectRulePack).toBe('function');
    expect(typeof Rules.RulePackLoader).toBe('function');
    expect(typeof Rules.loadRulePackFromFile).toBe('function');
    expect(typeof Rules.loadRulePacksFromDirectory).toBe('function');
  });

  it('exports built-in synthetic test packs', () => {
    expect(Rules.TEST_EBOOK_STANDARD_1_0_0.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(Rules.TEST_PAPERBACK_US_1_0_0.packKey).toBe('TEST_PAPERBACK_US');
    expect(Rules.TEST_PAPERBACK_US_2_0_0.packKey).toBe('TEST_PAPERBACK_US');
    expect(Rules.TEST_HARDCOVER_GLOBAL_1_0_0.packKey).toBe('TEST_HARDCOVER_GLOBAL');
    expect(Rules.SYNTHETIC_TEST_PACKS.length).toBe(4);
  });
});
