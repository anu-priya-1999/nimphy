/**
 * SemVer 2.0.0 validation and comparison utilities.
 * Follows the official SemVer 2.0.0 specification (https://semver.org/).
 */

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parsed SemVer structure.
 */
export interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
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
 * Parses a valid SemVer string into its constituent numeric and tag parts.
 * Throws an Error if the string is not valid SemVer.
 */
export function parseSemver(version: string): ParsedSemver {
  const trimmed = version.trim();
  const match = SEMVER_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid SemVer string: "${version}"`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
  };
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

  // 1. Compare major
  if (p1.major !== p2.major) {
    return p1.major < p2.major ? -1 : 1;
  }

  // 2. Compare minor
  if (p1.minor !== p2.minor) {
    return p1.minor < p2.minor ? -1 : 1;
  }

  // 3. Compare patch
  if (p1.patch !== p2.patch) {
    return p1.patch < p2.patch ? -1 : 1;
  }

  // 4. Compare prerelease
  // Normal version has higher precedence than prerelease
  if (p1.prerelease === null && p2.prerelease !== null) return 1;
  if (p1.prerelease !== null && p2.prerelease === null) return -1;
  if (p1.prerelease === null && p2.prerelease === null) return 0;

  // Both have prereleases: compare dot-separated identifiers
  const parts1 = (p1.prerelease as string).split('.');
  const parts2 = (p2.prerelease as string).split('.');
  const minLen = Math.min(parts1.length, parts2.length);

  for (let i = 0; i < minLen; i++) {
    const id1 = parts1[i] ?? '';
    const id2 = parts2[i] ?? '';

    const isNum1 = /^\d+$/.test(id1);
    const isNum2 = /^\d+$/.test(id2);

    if (isNum1 && isNum2) {
      const num1 = Number(id1);
      const num2 = Number(id2);
      if (num1 !== num2) return num1 < num2 ? -1 : 1;
    } else if (isNum1 && !isNum2) {
      // Numeric identifiers always have lower precedence than non-numeric identifiers
      return -1;
    } else if (!isNum1 && isNum2) {
      return 1;
    } else {
      // Both non-numeric: compare lexically in ASCII sort order
      if (id1 !== id2) return id1 < id2 ? -1 : 1;
    }
  }

  // A larger set of pre-release fields has a higher precedence than a smaller set
  if (parts1.length !== parts2.length) {
    return parts1.length < parts2.length ? -1 : 1;
  }

  // Build metadata is ignored in precedence per SemVer 2.0.0 §10
  return 0;
}
