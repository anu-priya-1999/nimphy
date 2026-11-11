# Engineering Reference Notes — STEP-004: Rule Pack Schema and Loader

- **Module:** `@nimphy/rules` (M-03)
- **Status:** Complete (Frozen v1 Schema)
- **Primary Dependencies:** `@nimphy/domain` (Zero external npm dependencies)

---

## 1. Module Anatomy & Source Hierarchy

```
packages/rules/
├── package.json                   # Manifest declaring dependency on @nimphy/domain only
├── tsconfig.json                  # Extends tsconfig.base.json, path aliases to @nimphy/domain
├── README.md                      # Comprehensive package documentation and public API usage
└── src/
    ├── index.ts                   # Public barrel entrypoint
    ├── index.test.ts              # Export integration test suite
    ├── errors/
    │   ├── rule-pack-error.ts     # RulePackError base, RulePackInvalidError, RulePackNotFoundError
    │   ├── rule-pack-error.test.ts# Error inheritance and code tests
    │   └── index.ts
    ├── hashing/
    │   ├── content-hash.ts        # Canonical JSON content and envelope hashing (SHA-256)
    │   ├── content-hash.test.ts   # Deterministic hashing and tamper-detection tests
    │   └── index.ts
    ├── loader/
    │   ├── selector.ts            # Date-based SemVer selector (selectRulePack, findRulePacks)
    │   ├── selector.test.ts       # Date boundary, transition, and SemVer precedence tests
    │   ├── rule-pack-loader.ts    # In-memory registry with UUID and key@version indexing
    │   ├── loader.test.ts         # Registry and loader tests
    │   ├── fs-loader.ts           # Filesystem loading (loadRulePackFromFile, loadRulePacksFromDirectory)
    │   ├── fs-loader.test.ts      # Filesystem error and scanning tests
    │   ├── fixtures.test.ts       # Fixtures directory integrity and parity tests
    │   └── index.ts
    ├── schema/
    │   ├── types.ts               # Core entity types, enums, policies, and validation interfaces
    │   ├── semver.ts              # SemVer 2.0.0 parsing, validation, and comparison utilities
    │   ├── semver.test.ts         # SemVer spec compliance tests
    │   ├── validator.ts           # Pure TypeScript schema validator, parsers, and guards
    │   ├── validator.test.ts      # Exhaustive schema validation test suite
    │   └── index.ts
    └── synthetic/
        ├── test-packs.ts          # Built-in synthetic test packs (4 canonical fixtures)
        ├── test-packs.test.ts     # Built-in pack verification tests
        └── index.ts
```

---

## 2. Core Entities & Data Contracts

### RulePack Entity

```typescript
export interface RulePack {
  readonly id: RulePackId;
  readonly packKey: string;
  readonly version: string;
  readonly status: RulePackStatus;
  readonly marketplace: MarketplaceKey;
  readonly format: BookFormat;
  readonly currency: CurrencyCode;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sourceRef: string;
  readonly sourceRetrievedAt: string;
  readonly content: RulePackContent;
  readonly contentHash: string;
  readonly createdAt?: string;
}
```

### Parameter Policies (RulePackContent)

- **Rounding Policy:** `{ mode: RoundingMode, point: RoundingPoint }`
  - Modes: `round_half_up`, `round_half_even`, `round_down`, `round_up`
  - Points: `per_unit`, `per_total`
- **Royalty Policy:** `{ tiers: readonly RoyaltyTier[] }`
  - Tier: `{ name: string, minPriceMinor: number, maxPriceMinor: number | null, royaltyRateDecimal: string }`
- **Print Cost Policy (Print only):** `{ baseCostMinor: number, costPerPageMinor: number, pageThreshold?: number }`
- **Delivery Cost Policy (Ebook only):** `{ costPerMbMinor: number }`
- **Book Limits Policy:** `{ minListPriceMinor: number, maxListPriceMinor: number, minPages: number | null, maxPages: number | null }`

---

## 3. Fixtures Directory Organization (`fixtures/rules/`)

Each fixture represents an immutable Rule Pack version with independent test cases:

1. **`TEST_EBOOK_STANDARD/1.0.0/`**
   - Ebook format, USD currency, 3-tier royalty (35% / 70% / 35%), 15 cents/MB delivery fee.
   - `cases.json` includes 8 threshold test cases from \$0.99 to \$200.00 with rounding at .5 boundaries.
2. **`TEST_PAPERBACK_US/1.0.0/`**
   - Paperback format, USD currency, historical window (2025-01-01 to 2025-12-31).
   - Fixed 60% royalty, base print cost \$1.00 + \$0.02/page above 24 pages.
3. **`TEST_PAPERBACK_US/2.0.0/`**
   - Paperback format, USD currency, successor window (2026-01-01 to open-ended).
   - Fixed 60% royalty, base print cost \$1.20 + \$0.02/page above 24 pages.
4. **`TEST_HARDCOVER_GLOBAL/1.0.0/`**
   - Hardcover format, EUR currency, open-ended window.
   - Fixed 50% royalty, base print cost €6.00 + €0.03/page above 75 pages, `round_down`, `per_total`.

---

## 4. Key Learnings & Engineering Guardrails

1. **Exact Calendar Validation:** Simply checking `new Date(str)` is insufficient in JavaScript because `new Date('2026-02-29')` silently overflows to `2026-03-01`. Exact date validation decomposes `YYYY-MM-DD` and verifies that `date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d`.
2. **Strict Index Access under TypeScript 5.8:** With `noUncheckedIndexedAccess: true`, array accesses like `matches[0]` or `parts[i]` return `T | undefined`. Non-null assertions or fallback defaults (`parts[i] ?? ''`) are required to prevent compile errors without resorting to `any`.
3. **Immutability Protection:** The loader actively prevents accidental or malicious overwriting of a published Rule Pack. Attempting to register a different pack with an existing `(packKey, version)` throws `RulePackInvalidError` (`IMMUTABLE_OVERWRITE_FORBIDDEN`).

---

## 5. Corrective Hardening & Invariant Defenses

1. **Safe Integer Validation (`Number.isSafeInteger`):**
   - Financial fields representing minor units (`minPriceMinor`, `maxPriceMinor`, `baseCostMinor`, `costPerPageMinor`, `costPerMbMinor`, `minListPriceMinor`, `maxListPriceMinor`) and book specifications (`pageThreshold`, `minPages`, `maxPages`) must be safe integers within $[-2^{53} + 1, 2^{53} - 1]$.
   - `Number.isInteger()` allows unsafe integers beyond `Number.MAX_SAFE_INTEGER` where IEEE-754 precision is lost.
   - Enforcing `Number.isSafeInteger()` guarantees mathematical precision and prevents corrupted values from reaching downstream domain calculations.
2. **Exact SemVer Precedence without Floating-Point Conversion:**
   - SemVer numeric components (major, minor, patch, numeric prereleases) can legally exceed $2^{53} - 1$.
   - Parsing them as exact decimal strings and comparing lengths first, followed by lexicographical sorting, preserves exact SemVer 2.0.0 ordering without numeric conversion errors.
3. **CI Hook Setup Parity:**
   - Fresh continuous integration environments must run `pnpm setup:hooks` (`git config --local core.hooksPath .githooks`) to initialize local hook configuration before executing integration tests.
