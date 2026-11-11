import { describe, expect, it } from 'vitest';
import { DomainError } from '@nimphy/domain';
import { RulePackError, RulePackInvalidError, RulePackNotFoundError } from './rule-pack-error';

describe('RulePackError Hierarchy', () => {
  it('RulePackInvalidError correctly inherits from RulePackError and DomainError', () => {
    const issues = [
      { path: 'version', code: 'INVALID_SEMVER', message: 'Version is not valid semver' },
    ];
    const error = new RulePackInvalidError('Rule Pack validation failed', issues, {
      packKey: 'TEST_PACK',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(RulePackError);
    expect(error).toBeInstanceOf(RulePackInvalidError);

    expect(error.name).toBe('RulePackInvalidError');
    expect(error.code).toBe('RULE_PACK_INVALID');
    expect(error.message).toBe('Rule Pack validation failed');
    expect(error.issues).toEqual(issues);
    expect(Object.isFrozen(error.issues)).toBe(true);
    expect(error.details?.packKey).toBe('TEST_PACK');
    expect(error.details?.issues).toEqual(issues);
  });

  it('RulePackInvalidError works with default empty issues array', () => {
    const error = new RulePackInvalidError('Malformed rule pack');
    expect(error.issues).toEqual([]);
    expect(Object.isFrozen(error.issues)).toBe(true);
    expect(error.code).toBe('RULE_PACK_INVALID');
  });

  it('RulePackNotFoundError correctly inherits from RulePackError and DomainError', () => {
    const criteria = {
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      asOf: '2026-06-01',
    };
    const error = new RulePackNotFoundError('No rule pack found for criteria', criteria);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(RulePackError);
    expect(error).toBeInstanceOf(RulePackNotFoundError);

    expect(error.name).toBe('RulePackNotFoundError');
    expect(error.code).toBe('RULE_PACK_NOT_FOUND');
    expect(error.message).toBe('No rule pack found for criteria');
    expect(error.criteria).toEqual(criteria);
    expect(Object.isFrozen(error.criteria)).toBe(true);
  });

  it('RulePackNotFoundError handles undefined criteria', () => {
    const error = new RulePackNotFoundError('Pack not found');
    expect(error.criteria).toBeUndefined();
    expect(error.code).toBe('RULE_PACK_NOT_FOUND');
  });
});
