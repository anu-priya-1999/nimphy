import type { BookFormat, MarketplaceKey } from '@nimphy/domain';
import { RulePackInvalidError, RulePackNotFoundError } from '../errors/rule-pack-error';
import { compareSemver } from '../schema/semver';
import { isValidCalendarDate } from '../schema/validator';
import type { RulePack, RulePackStatus } from '../schema/types';

/**
 * Selection criteria for resolving an applicable Rule Pack.
 * Conforms to doc 05 §M-03 (selectRulePack(marketplace, format, asOf)).
 */
export interface RulePackSelectionCriteria {
  readonly marketplace: MarketplaceKey;
  readonly format: BookFormat;
  readonly asOf: string | Date;
  readonly status?: RulePackStatus;
}

/**
 * Normalizes an asOf parameter (Date or ISO date string) into a canonical YYYY-MM-DD string.
 */
export function normalizeAsOfDate(asOf: string | Date): string {
  if (asOf instanceof Date) {
    if (Number.isNaN(asOf.getTime())) {
      throw new RulePackInvalidError('Invalid asOf Date object provided to selector', [
        {
          path: 'asOf',
          code: 'INVALID_DATE',
          message: 'asOf Date instance is invalid (NaN timestamp)',
        },
      ]);
    }
    const y = asOf.getUTCFullYear();
    const m = String(asOf.getUTCMonth() + 1).padStart(2, '0');
    const d = String(asOf.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof asOf === 'string') {
    const trimmed = asOf.trim();
    if (!isValidCalendarDate(trimmed)) {
      throw new RulePackInvalidError(
        `Invalid asOf date string: "${asOf}". Expected ISO calendar format YYYY-MM-DD`,
        [
          {
            path: 'asOf',
            code: 'INVALID_DATE',
            message: `asOf date must be a valid ISO calendar date (YYYY-MM-DD). Received: "${asOf}"`,
          },
        ],
      );
    }
    return trimmed;
  }

  throw new RulePackInvalidError('asOf must be an ISO date string or Date object', [
    {
      path: 'asOf',
      code: 'INVALID_TYPE',
      message: `asOf must be string or Date. Received: ${typeof asOf}`,
    },
  ]);
}

/**
 * Finds all candidate Rule Packs matching the selection criteria.
 * Sorted by SemVer descending.
 */
export function findRulePacks(
  packs: Iterable<RulePack>,
  criteria: RulePackSelectionCriteria,
): RulePack[] {
  const asOfStr = normalizeAsOfDate(criteria.asOf);
  const targetStatus = criteria.status ?? 'published';

  const matches: RulePack[] = [];

  for (const pack of packs) {
    if (pack.marketplace !== criteria.marketplace) continue;
    if (pack.format !== criteria.format) continue;
    if (pack.status !== targetStatus) continue;

    // Date boundary checks (inclusive)
    if (pack.effectiveFrom > asOfStr) continue;
    if (pack.effectiveTo !== null && pack.effectiveTo < asOfStr) continue;

    matches.push(pack);
  }

  // Sort descending: highest SemVer first; deterministic tie-break by packKey
  matches.sort((a, b) => {
    const semverComp = compareSemver(b.version, a.version);
    if (semverComp !== 0) return semverComp;
    return a.packKey.localeCompare(b.packKey);
  });

  return matches;
}

/**
 * Selects the single applicable Rule Pack for the given marketplace, format, and date.
 * When multiple versions overlap, selects the highest SemVer version.
 * Throws RulePackNotFoundError if no matching rule pack exists.
 */
export function selectRulePack(
  packs: Iterable<RulePack>,
  criteria: RulePackSelectionCriteria,
): RulePack {
  const asOfStr = normalizeAsOfDate(criteria.asOf);
  const matches = findRulePacks(packs, criteria);

  const selected = matches[0];
  if (!selected) {
    throw new RulePackNotFoundError(
      `No rule pack found for marketplace "${criteria.marketplace}", format "${criteria.format}", as of "${asOfStr}" (status: ${criteria.status ?? 'published'})`,
      {
        marketplace: criteria.marketplace,
        format: criteria.format,
        asOf: asOfStr,
        status: criteria.status ?? 'published',
      },
    );
  }

  return selected;
}
