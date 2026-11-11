/**
 * SemVer 2.0.0 validation and comparison utilities.
 * Follows the official SemVer 2.0.0 specification (https://semver.org/).
 */

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parsed SemVer structure.
 * Major, minor, and patch are preserved as exact decimal strings to guarantee
 * precision when version components exceed JavaScript's safe integer range (Number.MAX_SAFE_INTEGER).
 */
export interface ParsedSemver {
  readonly major: string;
  readonly minor: string;
  readonly patch: string;
  readonly prerelease: string | null;
  readonly build: string | null;
}

/**
 * Checks whether a given string is a valid SemVer 2.0.0 string.
 */
export function isValidSemver(version: unknown): version is string {
  if (typeof version !== 'string') return false;
  return SEMVER_REGEX.test(version.trim());
}

/**
 * Parses a valid SemVer string into its constituent exact decimal string parts and tags.
 * Throws an Error if the string is not valid SemVer.
 */
export function parseSemver(version: string): ParsedSemver {
  const trimmed = version.trim();
  const match = SEMVER_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid SemVer string: "${version}"`);
  }

  return {
    major: match[1]!,
    minor: match[2]!,
    patch: match[3]!,
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
  };
}

/**
 * Compares two non-negative decimal integer strings by numerical value without converting to Number.
 * Non-negative integer strings are compared by length first, then lexicographically.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
function compareNumericIdentifiers(a: string, b: string): number {
  if (a === b) return 0;
  // Normalize any leading zeros while preserving at least one digit
  const normA = a.replace(/^0+(?=\d)/, '');
  const normB = b.replace(/^0+(?=\d)/, '');
  if (normA.length !== normB.length) {
    return normA.length < normB.length ? -1 : 1;
  }
  return normA < normB ? -1 : 1;
}

/**
 * Compares two SemVer strings according to SemVer 2.0.0 precedence rules.
 * Returns:
 * - -1 if v1 < v2
 * -  0 if v1 === v2
 * -  1 if v1 > v2
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  // 1. Compare major numerically
  const cmpMajor = compareNumericIdentifiers(p1.major, p2.major);
  if (cmpMajor !== 0) return cmpMajor;

  // 2. Compare minor numerically
  const cmpMinor = compareNumericIdentifiers(p1.minor, p2.minor);
  if (cmpMinor !== 0) return cmpMinor;

  // 3. Compare patch numerically
  const cmpPatch = compareNumericIdentifiers(p1.patch, p2.patch);
  if (cmpPatch !== 0) return cmpPatch;

  // 4. Compare prerelease
  // Normal version has higher precedence than prerelease per SemVer 2.0.0 §9
  if (p1.prerelease === null && p2.prerelease !== null) return 1;
  if (p1.prerelease !== null && p2.prerelease === null) return -1;
  if (p1.prerelease === null && p2.prerelease === null) return 0;

  // Both have prereleases: compare dot-separated identifiers per SemVer 2.0.0 §11
  const parts1 = (p1.prerelease as string).split('.');
  const parts2 = (p2.prerelease as string).split('.');
  const minLen = Math.min(parts1.length, parts2.length);

  for (let i = 0; i < minLen; i++) {
    const id1 = parts1[i]!;
    const id2 = parts2[i]!;

    const isNum1 = /^\d+$/.test(id1);
    const isNum2 = /^\d+$/.test(id2);

    if (isNum1 && isNum2) {
      // Both numeric: compare numerically
      const cmp = compareNumericIdentifiers(id1, id2);
      if (cmp !== 0) return cmp;
    } else if (isNum1 && !isNum2) {
      // Numeric identifiers always have lower precedence than non-numeric identifiers per SemVer 2.0.0 §11.4.3
      return -1;
    } else if (!isNum1 && isNum2) {
      return 1;
    } else {
      // Both non-numeric: compare lexically in ASCII sort order
      if (id1 !== id2) return id1 < id2 ? -1 : 1;
    }
  }

  // A larger set of pre-release fields has a higher precedence than a smaller set per SemVer 2.0.0 §11.4.4
  if (parts1.length !== parts2.length) {
    return parts1.length < parts2.length ? -1 : 1;
  }

  // Build metadata is ignored in precedence per SemVer 2.0.0 §10
  return 0;
}
