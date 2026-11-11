import {
  isBookFormat,
  isSupportedCurrency,
  isUuidString,
  parseRulePackId,
  type BookFormat,
  type CurrencyCode,
  type MarketplaceKey,
  type RulePackId,
} from '@nimphy/domain';
import { RulePackInvalidError, type RulePackValidationIssue } from '../errors/rule-pack-error';
import { computeRulePackContentHash } from '../hashing/content-hash';
import { isValidSemver } from './semver';
import {
  isRoundingMode,
  isRoundingPoint,
  isRulePackStatus,
  type BookLimitsPolicy,
  type DeliveryCostPolicy,
  type PrintCostPolicy,
  type RoundingPolicy,
  type RoyaltyPolicy,
  type RoyaltyTier,
  type RulePack,
  type RulePackContent,
  type RulePackStatus,
  type RulePackValidationResult,
} from './types';

/**
 * Checks if a pack key adheres to synthetic test pack conventions.
 * Synthetic test packs must begin with "TEST_" per ADR-006 and doc 12 §4.
 */
export function isSyntheticPackKey(packKey: string): boolean {
  return typeof packKey === 'string' && packKey.startsWith('TEST_');
}

/**
 * Asserts that a pack key is a synthetic test pack.
 * Throws RulePackInvalidError if not.
 */
export function assertSyntheticPackKey(packKey: string): void {
  if (!isSyntheticPackKey(packKey)) {
    throw new RulePackInvalidError(
      `Expected synthetic test pack key starting with "TEST_", received: "${packKey}"`,
      [
        {
          path: 'packKey',
          code: 'SYNTHETIC_PREFIX_REQUIRED',
          message: `Synthetic rule pack key must begin with "TEST_". Received: "${packKey}"`,
        },
      ],
    );
  }
}

/**
 * Recursively deep freezes an object and all its nested properties.
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Validates whether a string is a strict ISO calendar date (YYYY-MM-DD).
 * Verifies month bounds and days in month (including leap year validation).
 */
export function isValidCalendarDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const parts = dateStr.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);

  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Validates a decimal rate string (e.g. "0.70", "0.35") within [0, 1].
 */
function isValidDecimalRate(rateStr: unknown): boolean {
  if (typeof rateStr !== 'string') return false;
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(rateStr.trim())) return false;
  const num = Number(rateStr);
  return !Number.isNaN(num) && num >= 0 && num <= 1;
}

/**
 * Validates the content payload of a Rule Pack.
 */
export function validateRulePackContent(
  content: unknown,
  format: BookFormat,
): { issues: RulePackValidationIssue[]; validContent?: RulePackContent } {
  const issues: RulePackValidationIssue[] = [];

  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    issues.push({
      path: 'content',
      code: 'INVALID_TYPE',
      message: 'content must be a plain object',
    });
    return { issues };
  }

  const raw = content as Record<string, unknown>;

  // 1. Rounding Policy
  let rounding: RoundingPolicy | undefined;
  if (!raw.rounding || typeof raw.rounding !== 'object') {
    issues.push({
      path: 'content.rounding',
      code: 'MISSING_FIELD',
      message: 'content.rounding is required (ADR-005: silent default modes are forbidden)',
    });
  } else {
    const rawRounding = raw.rounding as Record<string, unknown>;
    if (!isRoundingMode(rawRounding.mode)) {
      issues.push({
        path: 'content.rounding.mode',
        code: 'INVALID_ROUNDING_MODE',
        message: `Invalid rounding mode: "${String(rawRounding.mode)}". Must be one of: round_half_up, round_half_even, round_down, round_up`,
      });
    }
    if (!isRoundingPoint(rawRounding.point)) {
      issues.push({
        path: 'content.rounding.point',
        code: 'INVALID_ROUNDING_POINT',
        message: `Invalid rounding point: "${String(rawRounding.point)}". Must be one of: per_unit, per_total`,
      });
    }
    if (isRoundingMode(rawRounding.mode) && isRoundingPoint(rawRounding.point)) {
      rounding = {
        mode: rawRounding.mode,
        point: rawRounding.point,
      };
    }
  }

  // 2. Royalty Policy
  let royalty: RoyaltyPolicy | undefined;
  if (!raw.royalty || typeof raw.royalty !== 'object') {
    issues.push({
      path: 'content.royalty',
      code: 'MISSING_FIELD',
      message: 'content.royalty is required',
    });
  } else {
    const rawRoyalty = raw.royalty as Record<string, unknown>;
    if (!Array.isArray(rawRoyalty.tiers) || rawRoyalty.tiers.length === 0) {
      issues.push({
        path: 'content.royalty.tiers',
        code: 'EMPTY_TIERS',
        message: 'content.royalty.tiers must be an array with at least one tier',
      });
    } else {
      const validatedTiers: RoyaltyTier[] = [];
      let prevMax: number | null = -1;

      for (let i = 0; i < rawRoyalty.tiers.length; i++) {
        const tier = rawRoyalty.tiers[i];
        const tierPath = `content.royalty.tiers[${i}]`;

        if (tier === null || typeof tier !== 'object') {
          issues.push({
            path: tierPath,
            code: 'INVALID_TYPE',
            message: `${tierPath} must be a plain object`,
          });
          continue;
        }

        const rawTier = tier as Record<string, unknown>;

        if (typeof rawTier.name !== 'string' || rawTier.name.trim().length === 0) {
          issues.push({
            path: `${tierPath}.name`,
            code: 'INVALID_NAME',
            message: `${tierPath}.name must be a non-empty string`,
          });
        }

        if (
          typeof rawTier.minPriceMinor !== 'number' ||
          !Number.isSafeInteger(rawTier.minPriceMinor) ||
          rawTier.minPriceMinor < 0
        ) {
          issues.push({
            path: `${tierPath}.minPriceMinor`,
            code: 'INVALID_MIN_PRICE',
            message: `${tierPath}.minPriceMinor must be a safe integer >= 0`,
          });
        }

        if (
          rawTier.maxPriceMinor !== null &&
          (typeof rawTier.maxPriceMinor !== 'number' ||
            !Number.isSafeInteger(rawTier.maxPriceMinor) ||
            rawTier.maxPriceMinor <= (rawTier.minPriceMinor as number))
        ) {
          issues.push({
            path: `${tierPath}.maxPriceMinor`,
            code: 'INVALID_MAX_PRICE',
            message: `${tierPath}.maxPriceMinor must be null or a safe integer > minPriceMinor`,
          });
        }

        if (!isValidDecimalRate(rawTier.royaltyRateDecimal)) {
          issues.push({
            path: `${tierPath}.royaltyRateDecimal`,
            code: 'INVALID_RATE_DECIMAL',
            message: `${tierPath}.royaltyRateDecimal must be a decimal string between 0 and 1 (e.g. "0.70")`,
          });
        }

        // Overlap and ordering checks
        if (
          typeof rawTier.minPriceMinor === 'number' &&
          prevMax !== null &&
          prevMax !== -1 &&
          rawTier.minPriceMinor < prevMax
        ) {
          issues.push({
            path: `${tierPath}.minPriceMinor`,
            code: 'OVERLAPPING_TIER',
            message: `${tierPath}.minPriceMinor (${rawTier.minPriceMinor}) overlaps with previous tier max (${prevMax})`,
          });
        }

        prevMax = typeof rawTier.maxPriceMinor === 'number' ? rawTier.maxPriceMinor : null;

        if (
          typeof rawTier.name === 'string' &&
          typeof rawTier.minPriceMinor === 'number' &&
          Number.isSafeInteger(rawTier.minPriceMinor) &&
          (rawTier.maxPriceMinor === null ||
            (typeof rawTier.maxPriceMinor === 'number' &&
              Number.isSafeInteger(rawTier.maxPriceMinor))) &&
          isValidDecimalRate(rawTier.royaltyRateDecimal)
        ) {
          validatedTiers.push({
            name: rawTier.name.trim(),
            minPriceMinor: rawTier.minPriceMinor,
            maxPriceMinor: rawTier.maxPriceMinor,
            royaltyRateDecimal: (rawTier.royaltyRateDecimal as string).trim(),
          });
        }
      }

      if (validatedTiers.length === rawRoyalty.tiers.length) {
        royalty = { tiers: validatedTiers };
      }
    }
  }

  // 3. Print Cost Policy
  let printCost: PrintCostPolicy | null = null;
  if (format === 'ebook') {
    if (raw.printCost !== null && raw.printCost !== undefined) {
      issues.push({
        path: 'content.printCost',
        code: 'UNEXPECTED_FIELD',
        message: 'content.printCost must be null for ebook format',
      });
    }
  } else {
    // format is 'paperback' or 'hardcover'
    if (!raw.printCost || typeof raw.printCost !== 'object') {
      issues.push({
        path: 'content.printCost',
        code: 'MISSING_FIELD',
        message: `content.printCost is required for physical book format "${format}"`,
      });
    } else {
      const rawPrint = raw.printCost as Record<string, unknown>;

      if (
        typeof rawPrint.baseCostMinor !== 'number' ||
        !Number.isSafeInteger(rawPrint.baseCostMinor) ||
        rawPrint.baseCostMinor < 0
      ) {
        issues.push({
          path: 'content.printCost.baseCostMinor',
          code: 'INVALID_BASE_COST',
          message: 'content.printCost.baseCostMinor must be a safe integer >= 0',
        });
      }

      if (
        typeof rawPrint.costPerPageMinor !== 'number' ||
        !Number.isSafeInteger(rawPrint.costPerPageMinor) ||
        rawPrint.costPerPageMinor < 0
      ) {
        issues.push({
          path: 'content.printCost.costPerPageMinor',
          code: 'INVALID_COST_PER_PAGE',
          message: 'content.printCost.costPerPageMinor must be a safe integer >= 0',
        });
      }

      if (
        rawPrint.pageThreshold !== undefined &&
        (typeof rawPrint.pageThreshold !== 'number' ||
          !Number.isSafeInteger(rawPrint.pageThreshold) ||
          rawPrint.pageThreshold < 0)
      ) {
        issues.push({
          path: 'content.printCost.pageThreshold',
          code: 'INVALID_PAGE_THRESHOLD',
          message: 'content.printCost.pageThreshold must be a safe integer >= 0 when provided',
        });
      }

      if (
        typeof rawPrint.baseCostMinor === 'number' &&
        Number.isSafeInteger(rawPrint.baseCostMinor) &&
        typeof rawPrint.costPerPageMinor === 'number' &&
        Number.isSafeInteger(rawPrint.costPerPageMinor) &&
        (rawPrint.pageThreshold === undefined ||
          (typeof rawPrint.pageThreshold === 'number' &&
            Number.isSafeInteger(rawPrint.pageThreshold))) &&
        rawPrint.baseCostMinor >= 0 &&
        rawPrint.costPerPageMinor >= 0
      ) {
        printCost = {
          baseCostMinor: rawPrint.baseCostMinor,
          costPerPageMinor: rawPrint.costPerPageMinor,
          pageThreshold: typeof rawPrint.pageThreshold === 'number' ? rawPrint.pageThreshold : 0,
        };
      }
    }
  }

  // 4. Delivery Cost Policy
  let deliveryCost: DeliveryCostPolicy | null = null;
  if (raw.deliveryCost !== null && raw.deliveryCost !== undefined) {
    if (typeof raw.deliveryCost !== 'object') {
      issues.push({
        path: 'content.deliveryCost',
        code: 'INVALID_TYPE',
        message: 'content.deliveryCost must be an object or null',
      });
    } else {
      const rawDeliv = raw.deliveryCost as Record<string, unknown>;
      const cost = rawDeliv.costPerMbMinor ?? rawDeliv.cost_per_mb_minor;
      if (typeof cost !== 'number' || !Number.isSafeInteger(cost) || cost < 0) {
        issues.push({
          path: 'content.deliveryCost.costPerMbMinor',
          code: 'INVALID_COST_PER_MB',
          message: 'content.deliveryCost.costPerMbMinor must be a safe integer >= 0',
        });
      } else {
        deliveryCost = { costPerMbMinor: cost };
      }
    }
  }

  // 5. Book Limits Policy
  let limits: BookLimitsPolicy | undefined;
  if (!raw.limits || typeof raw.limits !== 'object') {
    issues.push({
      path: 'content.limits',
      code: 'MISSING_FIELD',
      message: 'content.limits is required',
    });
  } else {
    const rawLimits = raw.limits as Record<string, unknown>;
    const minPrice = rawLimits.minListPriceMinor ?? rawLimits.min_list_price_minor;
    const maxPrice = rawLimits.maxListPriceMinor ?? rawLimits.max_list_price_minor;
    const minPages = rawLimits.minPages ?? rawLimits.min_pages;
    const maxPages = rawLimits.maxPages ?? rawLimits.max_pages;

    if (typeof minPrice !== 'number' || !Number.isSafeInteger(minPrice) || minPrice <= 0) {
      issues.push({
        path: 'content.limits.minListPriceMinor',
        code: 'INVALID_MIN_PRICE',
        message: 'content.limits.minListPriceMinor must be a safe integer > 0',
      });
    }

    if (
      typeof maxPrice !== 'number' ||
      !Number.isSafeInteger(maxPrice) ||
      (typeof minPrice === 'number' && Number.isSafeInteger(minPrice) && maxPrice <= minPrice)
    ) {
      issues.push({
        path: 'content.limits.maxListPriceMinor',
        code: 'INVALID_MAX_PRICE',
        message: 'content.limits.maxListPriceMinor must be a safe integer > minListPriceMinor',
      });
    }

    if (format === 'ebook') {
      if (minPages !== null && minPages !== undefined) {
        issues.push({
          path: 'content.limits.minPages',
          code: 'UNEXPECTED_FIELD',
          message: 'content.limits.minPages must be null for ebook format',
        });
      }
      if (maxPages !== null && maxPages !== undefined) {
        issues.push({
          path: 'content.limits.maxPages',
          code: 'UNEXPECTED_FIELD',
          message: 'content.limits.maxPages must be null for ebook format',
        });
      }
    } else {
      // Physical books require page limits
      if (typeof minPages !== 'number' || !Number.isSafeInteger(minPages) || minPages <= 0) {
        issues.push({
          path: 'content.limits.minPages',
          code: 'INVALID_MIN_PAGES',
          message: `content.limits.minPages must be a safe integer > 0 for physical format "${format}"`,
        });
      }

      if (
        typeof maxPages !== 'number' ||
        !Number.isSafeInteger(maxPages) ||
        (typeof minPages === 'number' && Number.isSafeInteger(minPages) && maxPages < minPages)
      ) {
        issues.push({
          path: 'content.limits.maxPages',
          code: 'INVALID_MAX_PAGES',
          message: `content.limits.maxPages must be a safe integer >= minPages for physical format "${format}"`,
        });
      }
    }

    if (
      typeof minPrice === 'number' &&
      Number.isSafeInteger(minPrice) &&
      typeof maxPrice === 'number' &&
      Number.isSafeInteger(maxPrice) &&
      minPrice > 0 &&
      maxPrice > minPrice
    ) {
      limits = {
        minListPriceMinor: minPrice,
        maxListPriceMinor: maxPrice,
        minPages: format === 'ebook' ? null : (minPages as number),
        maxPages: format === 'ebook' ? null : (maxPages as number),
      };
    }
  }

  // Optional custom parameters
  let customParameters: Record<string, unknown> | undefined;
  const rawCustom = raw.customParameters ?? raw.custom_parameters;
  if (rawCustom !== undefined) {
    if (rawCustom === null || typeof rawCustom !== 'object' || Array.isArray(rawCustom)) {
      issues.push({
        path: 'content.customParameters',
        code: 'INVALID_TYPE',
        message: 'content.customParameters must be a plain object when provided',
      });
    } else {
      customParameters = { ...(rawCustom as Record<string, unknown>) };
    }
  }

  if (rounding && royalty && limits && issues.length === 0) {
    const validContent: RulePackContent = {
      rounding,
      royalty,
      printCost,
      deliveryCost,
      limits,
      ...(customParameters ? { customParameters } : {}),
    };
    return { issues, validContent };
  }

  return { issues };
}

/**
 * Validates an arbitrary input against the v1 Rule Pack schema.
 * Returns a RulePackValidationResult containing all detected issues.
 */
export function validateRulePack(raw: unknown): RulePackValidationResult {
  const issues: RulePackValidationIssue[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      issues: [
        {
          path: '',
          code: 'INVALID_ROOT',
          message: 'Rule Pack input must be a plain JSON object',
        },
      ],
    };
  }

  const input = raw as Record<string, unknown>;

  // Normalize snake_case and camelCase field aliases
  const rawId = input.id;
  const rawPackKey = input.packKey ?? input.pack_key;
  const rawVersion = input.version;
  const rawStatus = input.status;
  const rawMarketplace = input.marketplace;
  const rawFormat = input.format;
  const rawCurrency = input.currency;
  const rawEffectiveFrom = input.effectiveFrom ?? input.effective_from;
  const rawEffectiveTo = input.effectiveTo !== undefined ? input.effectiveTo : input.effective_to;
  const rawSourceRef = input.sourceRef ?? input.source_ref;
  const rawSourceRetrievedAt = input.sourceRetrievedAt ?? input.source_retrieved_at;
  const rawContent = input.content;
  const rawContentHash = input.contentHash ?? input.content_hash;
  const rawCreatedAt = input.createdAt ?? input.created_at;

  // 1. ID
  let id: RulePackId | undefined;
  if (typeof rawId !== 'string' || !isUuidString(rawId)) {
    issues.push({
      path: 'id',
      code: 'INVALID_IDENTIFIER',
      message: `id must be a canonical 128-bit UUID string. Received: ${String(rawId)}`,
    });
  } else {
    id = parseRulePackId(rawId);
  }

  // 2. Pack Key
  let packKey: string | undefined;
  if (typeof rawPackKey !== 'string' || rawPackKey.trim().length === 0) {
    issues.push({
      path: 'packKey',
      code: 'INVALID_PACK_KEY',
      message: 'packKey must be a non-empty string',
    });
  } else {
    packKey = rawPackKey.trim();
  }

  // 3. Version (SemVer)
  let version: string | undefined;
  if (!isValidSemver(rawVersion)) {
    issues.push({
      path: 'version',
      code: 'INVALID_SEMVER',
      message: `version must be a valid SemVer 2.0.0 string (e.g. "1.0.0"). Received: "${String(rawVersion)}"`,
    });
  } else {
    version = rawVersion.trim();
  }

  // 4. Status
  let status: RulePackStatus | undefined;
  if (!isRulePackStatus(rawStatus)) {
    issues.push({
      path: 'status',
      code: 'INVALID_STATUS',
      message: `status must be one of: draft, published, retired. Received: "${String(rawStatus)}"`,
    });
  } else {
    status = rawStatus;
  }

  // 5. Marketplace
  let marketplace: MarketplaceKey | undefined;
  if (typeof rawMarketplace !== 'string' || rawMarketplace.trim().length === 0) {
    issues.push({
      path: 'marketplace',
      code: 'INVALID_MARKETPLACE',
      message: 'marketplace must be a non-empty string identifier',
    });
  } else {
    marketplace = rawMarketplace.trim();
  }

  // 6. Format
  let format: BookFormat | undefined;
  if (!isBookFormat(rawFormat)) {
    issues.push({
      path: 'format',
      code: 'INVALID_FORMAT',
      message: `format must be one of: ebook, paperback, hardcover. Received: "${String(rawFormat)}"`,
    });
  } else {
    format = rawFormat;
  }

  // 7. Currency
  let currency: CurrencyCode | undefined;
  if (!isSupportedCurrency(rawCurrency)) {
    issues.push({
      path: 'currency',
      code: 'UNSUPPORTED_CURRENCY',
      message: `currency must be an approved ISO-4217 code (USD, EUR, GBP, CAD, AUD, JPY). Received: "${String(rawCurrency)}"`,
    });
  } else {
    currency = rawCurrency;
  }

  // 8. Effective Dates
  let effectiveFrom: string | undefined;
  if (!isValidCalendarDate(rawEffectiveFrom)) {
    issues.push({
      path: 'effectiveFrom',
      code: 'INVALID_DATE',
      message: `effectiveFrom must be a valid ISO calendar date (YYYY-MM-DD). Received: "${String(rawEffectiveFrom)}"`,
    });
  } else {
    effectiveFrom = rawEffectiveFrom;
  }

  let effectiveTo: string | null | undefined = null;
  if (rawEffectiveTo !== null && rawEffectiveTo !== undefined) {
    if (!isValidCalendarDate(rawEffectiveTo)) {
      issues.push({
        path: 'effectiveTo',
        code: 'INVALID_DATE',
        message: `effectiveTo must be null or a valid ISO calendar date (YYYY-MM-DD). Received: "${String(rawEffectiveTo)}"`,
      });
    } else {
      effectiveTo = rawEffectiveTo;
      if (effectiveFrom && effectiveTo <= effectiveFrom) {
        issues.push({
          path: 'effectiveTo',
          code: 'INVALID_DATE_RANGE',
          message: `effectiveTo (${effectiveTo}) must be strictly later than effectiveFrom (${effectiveFrom}) per doc 06 §3`,
        });
      }
    }
  }

  // 9. Source Reference & Retrieval Date
  let sourceRef: string | undefined;
  if (typeof rawSourceRef !== 'string' || rawSourceRef.trim().length === 0) {
    issues.push({
      path: 'sourceRef',
      code: 'INVALID_SOURCE_REF',
      message: 'sourceRef must be a non-empty string citing the source document',
    });
  } else {
    sourceRef = rawSourceRef.trim();
  }

  let sourceRetrievedAt: string | undefined;
  if (!isValidCalendarDate(rawSourceRetrievedAt)) {
    issues.push({
      path: 'sourceRetrievedAt',
      code: 'INVALID_DATE',
      message: `sourceRetrievedAt must be a valid ISO calendar date (YYYY-MM-DD). Received: "${String(rawSourceRetrievedAt)}"`,
    });
  } else {
    sourceRetrievedAt = rawSourceRetrievedAt;
  }

  // 10. Content Validation
  let content: RulePackContent | undefined;
  if (format) {
    const contentResult = validateRulePackContent(rawContent, format);
    issues.push(...contentResult.issues);
    content = contentResult.validContent;
  } else if (!rawContent || typeof rawContent !== 'object') {
    issues.push({
      path: 'content',
      code: 'MISSING_FIELD',
      message: 'content must be a plain object',
    });
  }

  // 11. Content Hash Verification
  let contentHash: string | undefined;
  if (content) {
    const computedHash = computeRulePackContentHash(content);

    if (rawContentHash !== undefined && rawContentHash !== null) {
      if (typeof rawContentHash !== 'string') {
        issues.push({
          path: 'contentHash',
          code: 'INVALID_HASH_TYPE',
          message: 'contentHash must be a string starting with "sha256:"',
        });
      } else if (rawContentHash !== computedHash) {
        issues.push({
          path: 'contentHash',
          code: 'CONTENT_HASH_MISMATCH',
          message: `contentHash mismatch: declared "${rawContentHash}", computed "${computedHash}"`,
        });
      } else {
        contentHash = rawContentHash;
      }
    } else {
      // Auto-compute if omitted from raw input
      contentHash = computedHash;
    }
  }

  // 12. Created At (optional audit timestamp)
  let createdAt: string | undefined;
  if (rawCreatedAt !== undefined && rawCreatedAt !== null) {
    if (typeof rawCreatedAt !== 'string') {
      issues.push({
        path: 'createdAt',
        code: 'INVALID_TIMESTAMP',
        message: 'createdAt must be an ISO timestamp string',
      });
    } else {
      createdAt = rawCreatedAt;
    }
  }

  if (
    issues.length === 0 &&
    id &&
    packKey &&
    version &&
    status &&
    marketplace &&
    format &&
    currency &&
    effectiveFrom &&
    sourceRef &&
    sourceRetrievedAt &&
    content &&
    contentHash
  ) {
    const pack: RulePack = deepFreeze({
      id,
      packKey,
      version,
      status,
      marketplace,
      format,
      currency,
      effectiveFrom,
      effectiveTo,
      sourceRef,
      sourceRetrievedAt,
      content,
      contentHash,
      ...(createdAt ? { createdAt } : {}),
    });

    return {
      valid: true,
      issues: [],
      pack,
    };
  }

  return {
    valid: false,
    issues: Object.freeze(issues),
  };
}

/**
 * Strict parser for Rule Packs.
 * Validates the raw input and returns an immutable RulePack entity.
 * Throws RulePackInvalidError with all issues if validation fails.
 */
export function parseRulePack(raw: unknown): RulePack {
  const result = validateRulePack(raw);
  if (!result.valid || !result.pack) {
    const summary = result.issues.map((i) => `[${i.path || 'root'}]: ${i.message}`).join('; ');
    throw new RulePackInvalidError(
      `Rule Pack schema validation failed with ${result.issues.length} issue(s): ${summary}`,
      result.issues,
    );
  }
  return result.pack;
}

/**
 * Safe parser returning a success/error discriminated union without throwing.
 */
export function safeParseRulePack(
  raw: unknown,
): { success: true; data: RulePack } | { success: false; error: RulePackInvalidError } {
  try {
    const pack = parseRulePack(raw);
    return { success: true, data: pack };
  } catch (err) {
    if (err instanceof RulePackInvalidError) {
      return { success: false, error: err };
    }
    throw err;
  }
}
