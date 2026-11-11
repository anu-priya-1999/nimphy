import { describe, expect, it } from 'vitest';
import { compareSemver, isValidSemver, parseSemver } from './semver';

describe('SemVer 2.0.0 Validation & Comparison', () => {
  it('validates standard SemVer strings correctly', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('0.1.0')).toBe(true);
    expect(isValidSemver('10.20.30')).toBe(true);
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-alpha.1')).toBe(true);
    expect(isValidSemver('1.0.0-0.3.7')).toBe(true);
    expect(isValidSemver('1.0.0-x.7.z.92')).toBe(true);
    expect(isValidSemver('1.0.0-alpha+001')).toBe(true);
    expect(isValidSemver('1.0.0+20130313144700')).toBe(true);
    expect(isValidSemver('1.0.0-beta+exp.sha.5114f85')).toBe(true);
  });

  it('rejects invalid SemVer strings', () => {
    expect(isValidSemver('')).toBe(false);
    expect(isValidSemver('1')).toBe(false);
    expect(isValidSemver('1.0')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false); // Leading 'v' is not SemVer
    expect(isValidSemver('01.1.1')).toBe(false); // Leading zeros not permitted
    expect(isValidSemver('1.01.1')).toBe(false);
    expect(isValidSemver('1.1.01')).toBe(false);
    expect(isValidSemver('1.0.0-')).toBe(false);
    expect(isValidSemver('1.0.0+')).toBe(false);
    expect(isValidSemver(123)).toBe(false);
    expect(isValidSemver(null)).toBe(false);
    expect(isValidSemver(undefined)).toBe(false);
  });

  it('parses SemVer correctly with exact decimal strings', () => {
    const parsed = parseSemver('1.2.3-alpha.1+build.42');
    expect(parsed.major).toBe('1');
    expect(parsed.minor).toBe('2');
    expect(parsed.patch).toBe('3');
    expect(parsed.prerelease).toBe('alpha.1');
    expect(parsed.build).toBe('build.42');
  });

  it('throws when parsing invalid SemVer', () => {
    expect(() => parseSemver('invalid')).toThrow('Invalid SemVer string');
  });

  it('compares standard major/minor/patch versions correctly', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
    expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1);
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares prerelease vs normal releases per SemVer 2.0.0 §9', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha')).toBe(0);
  });

  it('compares prerelease identifiers per SemVer 2.0.0 §11', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-beta')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.gamma')).toBe(-1);
    expect(compareSemver('1.0.0-beta', '1.0.0-beta.2')).toBe(-1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareSemver('1.0.0-beta.11', '1.0.0-rc.1')).toBe(-1);
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(-1);
    // Non-numeric vs numeric identifier precedence: non-numeric > numeric
    expect(compareSemver('1.0.0-beta', '1.0.0-1')).toBe(1);
    expect(compareSemver('1.0.0-1', '1.0.0-beta')).toBe(-1);
  });

  it('ignores build metadata in precedence comparison per SemVer 2.0.0 §10', () => {
    expect(compareSemver('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
    expect(compareSemver('1.0.0', '1.0.0+build.1')).toBe(0);
  });

  describe('Exact SemVer comparison for large numeric identifiers (> Number.MAX_SAFE_INTEGER)', () => {
    const large1 = '9007199254740992'; // Number.MAX_SAFE_INTEGER + 1
    const large2 = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    const veryLarge = '10000000000000000000'; // 20 digits

    it('parses large identifiers without numeric precision loss', () => {
      const parsed = parseSemver(`${large1}.${large2}.99999999999999999-alpha.${veryLarge}+meta`);
      expect(parsed.major).toBe(large1);
      expect(parsed.minor).toBe(large2);
      expect(parsed.patch).toBe('99999999999999999');
      expect(parsed.prerelease).toBe(`alpha.${veryLarge}`);
      expect(parsed.build).toBe('meta');
    });

    it('compares major components larger than Number.MAX_SAFE_INTEGER', () => {
      // Two distinct adjacent large identifiers must remain distinguishable
      expect(compareSemver(`${large1}.0.0`, `${large2}.0.0`)).toBe(-1);
      expect(compareSemver(`${large2}.0.0`, `${large1}.0.0`)).toBe(1);
      // Identical large identifiers
      expect(compareSemver(`${large1}.0.0`, `${large1}.0.0`)).toBe(0);
      // Differing string lengths: 20 digits > 16 digits
      expect(compareSemver(`${veryLarge}.0.0`, `${large1}.0.0`)).toBe(1);
      expect(compareSemver(`${large1}.0.0`, `${veryLarge}.0.0`)).toBe(-1);
    });

    it('compares minor components larger than Number.MAX_SAFE_INTEGER', () => {
      expect(compareSemver(`1.${large1}.0`, `1.${large2}.0`)).toBe(-1);
      expect(compareSemver(`1.${large2}.0`, `1.${large1}.0`)).toBe(1);
      expect(compareSemver(`1.${large1}.0`, `1.${large1}.0`)).toBe(0);
      expect(compareSemver(`1.${veryLarge}.0`, `1.${large2}.0`)).toBe(1);
    });

    it('compares patch components larger than Number.MAX_SAFE_INTEGER', () => {
      expect(compareSemver(`1.0.${large1}`, `1.0.${large2}`)).toBe(-1);
      expect(compareSemver(`1.0.${large2}`, `1.0.${large1}`)).toBe(1);
      expect(compareSemver(`1.0.${large1}`, `1.0.${large1}`)).toBe(0);
      expect(compareSemver(`1.0.${veryLarge}`, `1.0.${large2}`)).toBe(1);
    });

    it('compares numeric prerelease identifiers larger than Number.MAX_SAFE_INTEGER', () => {
      expect(compareSemver(`1.0.0-alpha.${large1}`, `1.0.0-alpha.${large2}`)).toBe(-1);
      expect(compareSemver(`1.0.0-alpha.${large2}`, `1.0.0-alpha.${large1}`)).toBe(1);
      expect(compareSemver(`1.0.0-alpha.${large1}`, `1.0.0-alpha.${large1}`)).toBe(0);
      expect(compareSemver(`1.0.0-alpha.${veryLarge}`, `1.0.0-alpha.${large1}`)).toBe(1);
      expect(compareSemver(`1.0.0-alpha.${large1}`, `1.0.0-alpha.${veryLarge}`)).toBe(-1);
    });

    it('preserves normal release versus prerelease precedence for large versions', () => {
      expect(compareSemver(`${large1}.0.0`, `${large1}.0.0-alpha`)).toBe(1);
      expect(compareSemver(`${large1}.0.0-alpha`, `${large1}.0.0`)).toBe(-1);
      expect(compareSemver(`1.${large1}.0`, `1.${large1}.0-rc.1`)).toBe(1);
    });

    it('preserves numeric versus non-numeric prerelease precedence with large identifiers', () => {
      // Numeric identifiers have lower precedence than non-numeric per SemVer 2.0.0 §11.4.3
      expect(compareSemver(`1.0.0-${large1}`, '1.0.0-alpha')).toBe(-1);
      expect(compareSemver('1.0.0-alpha', `1.0.0-${large1}`)).toBe(1);
      expect(compareSemver(`1.0.0-${veryLarge}`, '1.0.0-beta')).toBe(-1);
      expect(compareSemver('1.0.0-beta', `1.0.0-${veryLarge}`)).toBe(1);
    });

    it('ignores build metadata on large versions per SemVer 2.0.0 §10', () => {
      expect(
        compareSemver(`${large1}.0.0+build.${large2}`, `${large1}.0.0+build.${veryLarge}`),
      ).toBe(0);
      expect(compareSemver(`${large1}.0.0`, `${large1}.0.0+build.${large2}`)).toBe(0);
    });
  });
});
