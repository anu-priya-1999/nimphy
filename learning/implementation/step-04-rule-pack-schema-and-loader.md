# Implementation Record — STEP-004: Rule Pack Schema and Loader

- **Step Identifier:** STEP-004
- **Step Name:** Rule Pack Schema and Loader (Synthetic)
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.3.0
- **Status:** Complete (Implemented, Tested & Verified)

---

## A. Objective

The objective of STEP-004 was to implement the v1 Rule Pack schema, deterministic loader, date-based SemVer selector, and cryptographic content hashing within `packages/rules` (Module M-03) and create the initial repository fixtures under `fixtures/rules/` per `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, and canonical architecture documents (doc 03, 05, 06, 12, 18).

This implementation provides:

1. **Frozen v1 Rule Pack Schema:** Declarative representation of publishing rules with strict schema validation, SemVer 2.0.0 parsing and comparison, calendar date validity (including leap years), and format-specific structural rules.
2. **Deterministic Content Hashing:** Cryptographic `sha256:<64-hex>` hashing over the canonical JSON representation of rule content, ensuring tamper detection and bit-for-bit reproducibility (Principle P-01, P-03, P-04).
3. **Date-Based SemVer Selector:** Exact date window matching (`effectiveFrom <= asOf <= (effectiveTo ?? infinity)`) with SemVer descending resolution and deterministic tie-breaking.
4. **Deterministic Rule Pack Loader:** In-memory registry with nominal UUID and `(packKey, version)` indexing, file loading from disk, recursive directory scanning, and immutability violation protection (ADR-006).
5. **Synthetic `TEST_*` Separation:** Built-in test packs and repository test fixtures strictly quarantined with `TEST_*` prefixes and synthetic disclaimers; no real Amazon KDP or commercial printing formulas are asserted or fabricated (OQ-006).
6. **Zero External Dependencies:** Built with pure TypeScript, zero runtime dependencies, and strict inward dependency on `@nimphy/domain`.

---

## B. Architectural Invariants & Design Choices

### 1. Schema Design (`packages/rules/src/schema/types.ts`)

- **Alignment with Database Schema (doc 06 §3):** Maps 1-to-1 to the `rule_packs` table:
  - `id`: nominal `RulePackId` (canonical UUID).
  - `packKey`: string identifier (e.g. `'TEST_EBOOK_STANDARD'`).
  - `version`: valid SemVer 2.0.0 string (e.g. `'1.0.0'`).
  - `status`: `'draft' | 'published' | 'retired'`.
  - `marketplace`: `MarketplaceKey`.
  - `format`: `BookFormat` (`'ebook' | 'paperback' | 'hardcover'`).
  - `currency`: `CurrencyCode` (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`).
  - `effectiveFrom`: ISO calendar date (`YYYY-MM-DD`).
  - `effectiveTo`: `null` (open-ended) or ISO calendar date strictly later than `effectiveFrom` (`check (effective_to is null or effective_to > effective_from)`).
  - `sourceRef`: document reference citing official origin.
  - `sourceRetrievedAt`: ISO calendar date of retrieval.
  - `content`: parameter payload.
  - `contentHash`: `sha256:<64-hex>` hash.
- **Declarative Parameter Hierarchy (`RulePackContent`):**
  - `rounding`: Explicit `mode` (`round_half_up`, `round_half_even`, `round_down`, `round_up`) and `point` (`per_unit`, `per_total`). Silent default rounding is strictly forbidden per ADR-005.
  - `royalty`: Tiered pricing with exact decimal string rates (e.g. `"0.70"`, `"0.35"`), preventing floating-point rounding errors.
  - `printCost`: Base cost and per-page cost in integer minor units; required for physical formats (`paperback`, `hardcover`), forbidden for `ebook`.
  - `deliveryCost`: File distribution cost per megabyte in integer minor units.
  - `limits`: Minimum and maximum list prices (minor units) and page counts (required for physical, null for ebook).
  - `customParameters`: Optional extensibility record for synthetic test parameters.

### 2. Pure Schema Validation (`packages/rules/src/schema/validator.ts`)

- **Strict Type Validation:** All inputs are validated against strict structural rules without third-party libraries (Zod-free pure TypeScript implementation).
- **Format Consistency:** Enforces that physical formats have non-null print costs and positive page boundaries, while ebooks strictly reject print costs and page counts.
- **Date Verification:** `isValidCalendarDate` checks calendar day counts per month, rejecting invalid dates such as `2026-02-29` (non-leap year) and `2026-04-31`.
- **Automatic Content Hash Attachment:** When `contentHash` is omitted from raw JSON, the validator computes it deterministically and attaches it. If provided, it validates bit-for-bit equality, throwing `CONTENT_HASH_MISMATCH` on tampering.
- **Deep Immutability:** Evaluates `deepFreeze` on the resulting entity, ensuring all levels of the object hierarchy are immutable (`Object.isFrozen`).

### 3. Content Hashing & Cryptography (`packages/rules/src/hashing/content-hash.ts`)

- **Canonical JSON Serialization:** Uses `@nimphy/domain`'s `toCanonicalJson` to sort object keys lexicographically by UTF-16 code units with cycle protection.
- **FIPS 180-4 SHA-256:** Uses `@nimphy/domain`'s pure SHA-256 implementation, returning standard `sha256:<64-hex>` strings.
- **Envelope Hashing:** Exposes `computeRulePackEnvelopeHash` to hash the canonical metadata envelope for tamper-evident packaging.

### 4. Date-Based SemVer Selector (`packages/rules/src/loader/selector.ts`)

- **Selection Interface:** `selectRulePack(packs, criteria)` accepts `marketplace`, `format`, `asOf` (string or Date), and optional `status` (defaults to `'published'`).
- **Inclusive Range Matching:** Matches packs where `pack.effectiveFrom <= asOf && (pack.effectiveTo === null || pack.effectiveTo >= asOf)`.
- **SemVer Precedence:** When multiple versions overlap on a date, sorts by SemVer descending (`compareSemver(b.version, a.version)`) and selects the highest version. Deterministic tie-breaking by `packKey`.
- **Error Handling:** Throws `RulePackNotFoundError` (stable code `RULE_PACK_NOT_FOUND`) with full criteria when no pack matches.

### 5. Loader & Registry (`packages/rules/src/loader/rule-pack-loader.ts`, `fs-loader.ts`)

- **In-Memory Registry:** Indexes packs by nominal UUID and `(packKey, version)`.
- **Immutability Enforcement:** Overwriting an existing `(packKey, version)` with differing content hash is blocked with `IMMUTABLE_OVERWRITE_FORBIDDEN` per ADR-006. Identical re-registration is idempotent.
- **Filesystem Loading:** `loadRulePackFromFile` reads JSON synchronously, and `loadRulePacksFromDirectory` recursively scans for `pack.json` files.

### 6. Synthetic Test Fixtures (`fixtures/rules/`)

- Established 4 complete fixture directories:
  - `fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/` (USD ebook, 3 royalty tiers, delivery fee)
  - `fixtures/rules/TEST_PAPERBACK_US/1.0.0/` (USD paperback, 2025-01-01 to 2025-12-31, 100 base print cost)
  - `fixtures/rules/TEST_PAPERBACK_US/2.0.0/` (USD paperback, 2026-01-01 to open-ended, 120 base print cost)
  - `fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/` (EUR hardcover, round_down, per_total)
- Each fixture directory contains:
  - `pack.json`: Complete valid Rule Pack JSON with exact `contentHash`.
  - `cases.json`: Test cases table at threshold and rounding edges per doc 12 §4.
  - `README.md`: Explaining synthetic source reference and purpose.

---

## C. Verification Summary

| Suite / Check                  | Command                                  | Result     | Details                                                                                     |
| ------------------------------ | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| **TypeScript Compilation**     | `pnpm typecheck`                         | **Passed** | 8 workspace projects checked; 0 errors                                                      |
| **Linting**                    | `pnpm lint`                              | **Passed** | ESLint 10 with local architecture plugin; 0 errors, 0 warnings                              |
| **Prettier Formatting**        | `pnpm format:check`                      | **Passed** | All repository files adhere to Prettier style                                               |
| **Documentation Check**        | `pnpm docs:check`                        | **Passed** | 23 architecture documents, 93 links, 22 ADRs verified                                       |
| **Architectural Boundaries**   | `pnpm boundaries:check`                  | **Passed** | 58 files checked; `@nimphy/rules` imports only `@nimphy/domain`                             |
| **Unit & Integration Tests**   | `pnpm test`                              | **Passed** | 312/312 tests passed across 25 test files (0 failed, 0 skipped) (initial baseline)          |
| **Code Coverage**              | `pnpm test:coverage`                     | **Passed** | 99.90% Stmts, 98.52% Branches, 100% Funcs, 99.90% Lines (threshold: 95%) (initial baseline) |
| **Fixtures Verification**      | `pnpm vitest run fixtures.test.ts`       | **Passed** | All 4 fixture packs match built-in synthetic packs bit-for-bit                              |
| **RFC 8785 (JCS) Conformance** | `pnpm vitest run canonical-json.test.ts` | **Passed** | Appendix E, structures, french, unicode vectors & lone surrogate checks                     |

---

## D. Corrective Hardening and CI Repair (Post-Review Pass)

Following an independent post-implementation review of STEP-004, three targeted hardening corrections were executed:

### 1. Safe Integer Validation & Financial Invariant Enforcement

- **Problem:** `packages/rules/src/schema/validator.ts` previously checked integer-valued fields using `Number.isInteger()`. In JavaScript, `Number.isInteger(9007199254740992) === true` even though `9007199254740992` exceeds `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$). The domain `Money` primitive strictly enforces safety within `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`; allowing unsafe integers in the Rule Pack schema breached domain financial invariants.
- **Solution:** Replaced all integer validation across all 10 schema integer fields with `Number.isSafeInteger()`.
  - Fields hardened: `minPriceMinor`, `maxPriceMinor`, `baseCostMinor`, `costPerPageMinor`, `pageThreshold`, `costPerMbMinor`, `minListPriceMinor`, `maxListPriceMinor`, `minPages`, `maxPages`.
  - Guaranteed rejection of fractional inputs, `NaN`, `Infinity`, `-Infinity`, and unsafe integers $> 2^{53} - 1$ or $< -(2^{53} - 1)$.
  - Preserved typed error structures, validation codes, and field definitions without silent clamping or floating-point arithmetic.
  - Added 10 focused regression tests covering boundary safe integers, unsafe integers (`Number.MAX_SAFE_INTEGER + 1`), negative unsafe integers, fractional values, and non-finite numbers.

### 2. Exact SemVer Identifier Comparison

- **Problem:** `packages/rules/src/schema/semver.ts` previously parsed SemVer major, minor, patch and compared numeric prerelease identifiers by converting them to JavaScript `Number`. For versions with components $> 2^{53} - 1$ (e.g. `9007199254740992.0.0` vs `9007199254740993.0.0`), IEEE-754 double precision collapses distinct integers into identical floats, violating exact SemVer 2.0.0 precedence ordering.
- **Solution:**
  - Preserved `major`, `minor`, and `patch` in `ParsedSemver` as exact decimal strings (`readonly major: string; readonly minor: string; readonly patch: string`).
  - Implemented exact numerical string comparison (`compareNumericIdentifiers`): compares non-negative integer decimal strings by length first, then lexicographically.
  - Applied exact numeric comparison to numeric prerelease tags without converting to `Number`.
  - Preserved SemVer 2.0.0 precedence rules: normal release > prerelease, numeric prerelease < non-numeric prerelease, longer matching prerelease sequences > shorter, build metadata ignored (§10).
  - Added 8 focused regression tests covering adjacent large identifiers, length differences, identical large identifiers, and precedence edge cases.

### 3. CI Workflow Git Hook Configuration Repair

- **Problem:** GitHub Actions CI failed on `tests/setup-hooks.test.ts` (Run 42972958895) because the integration test asserts that the local repository has `core.hooksPath = .githooks`. On fresh CI clones, repository Git hooks were unconfigured prior to running tests.
- **Solution:** Added a dedicated step `Configure repository Git hooks` executing `pnpm setup:hooks` immediately following dependency installation in `.github/workflows/ci.yml`.

### 4. Updated Post-Hardening Verification Results (Local)

| Suite / Check                | Command                 | Result     | Details                                                                                                                                   |
| ---------------------------- | ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript Compilation**   | `pnpm typecheck`        | **Passed** | 8 workspace projects checked; 0 errors                                                                                                    |
| **Linting**                  | `pnpm lint`             | **Passed** | ESLint 10 with local architecture plugin; 0 errors, 0 warnings                                                                            |
| **Prettier Formatting**      | `pnpm format:check`     | **Passed** | All repository files adhere to Prettier style                                                                                             |
| **Documentation Check**      | `pnpm docs:check`       | **Passed** | 23 architecture documents, 94 links, 22 ADRs verified                                                                                     |
| **Architectural Boundaries** | `pnpm boundaries:check` | **Passed** | 58 files checked; `@nimphy/rules` imports only `@nimphy/domain`                                                                           |
| **Unit & Integration Tests** | `pnpm test`             | **Passed** | 330/330 tests passed across 25 test files (+18 new tests; 0 failed)                                                                       |
| **Code Coverage**            | `pnpm test:coverage`    | **Passed** | 99.90% Stmts (2100/2102), 98.99% Branches (689/696), 100% Funcs (126/126), 99.90% Lines (2100/2102)                                       |
| **Next.js Web Build**        | `pnpm build`            | **Passed** | App Router static prerender complete                                                                                                      |
| **Remote CI Status**         | GitHub Actions          | **Passed** | Run [43009231357](https://github.com/anu-priya-1999/nimphy/actions/runs/43009231357) on commit `04e7de2331af4abec21e78ac90f95e413bd82101` |

### 5. Remote CI Execution & Verification

Following the local corrective hardening pass, commit `04e7de2331af4abec21e78ac90f95e413bd82101` (`fix(rules): harden safe integers, exact semver comparison, and CI hook setup`) was pushed to `origin/main`.

- **Workflow Run:** GitHub Actions [Run 43009231357](https://github.com/anu-priya-1999/nimphy/actions/runs/43009231357)
- **Commit SHA:** `04e7de2331af4abec21e78ac90f95e413bd82101`
- **Result:** Succeeded (exit code 0) across all workflow jobs and steps.
- **Remote Verified Facts:**
  - 25 test files passed
  - 330 tests passed (0 failed, 0 skipped)
  - Git hook configuration step passed (`pnpm setup:hooks`)
  - Typecheck passed (`pnpm typecheck` — 8 workspace packages checked)
  - Lint passed (`pnpm lint` — ESLint flat config with 0 errors, 0 warnings)
  - Formatting passed (`pnpm format:check`)
  - Documentation check passed (`pnpm docs:check` — 23 architecture documents, all links verified)
  - Architecture boundary check passed (`pnpm boundaries:check` — clean DAG, zero unauthorized imports)
  - Conventional commit validation passed (`pnpm commit:check --ci`)
  - Production Next.js build passed (`pnpm build`)

**Distinction Between Local Verification and Remote CI:**
Remote CI executes the automated verification pipeline defined in `.github/workflows/ci.yml`, running `pnpm test`. It does not execute `pnpm test:coverage`. Code coverage instrumentation (`pnpm test:coverage`), patch hygiene (`git diff --check`), and working tree status (`git status --short`) are executed locally as part of Definition of Done compliance.

**Reconciled V8 Code Coverage (Local Run):**

- **Combined Scope (Active Packages: `@nimphy/domain` + `@nimphy/rules`):**
  - Statements: 99.90% (2100/2102)
  - Branches: 98.99% (689/696)
  - Functions: 100.00% (126/126)
  - Lines: 99.90% (2100/2102)
- **`@nimphy/domain` Breakdown:**
  - Statements: 100.00% (861/861)
  - Branches: 100.00% (315/315)
  - Functions: 100.00% (84/84)
  - Lines: 100.00% (861/861)
- **`@nimphy/rules` Breakdown:**
  - Statements: 99.84% (1239/1241)
  - Branches: 98.16% (374/381)
  - Functions: 100.00% (42/42)
  - Lines: 99.84% (1239/1241)
- **Arithmetic Reconciliation:**
  - Statements: 861 + 1239 = 2100 covered / 861 + 1241 = 2102 total
  - Branches: 315 + 374 = 689 covered / 315 + 381 = 696 total
  - Functions: 84 + 42 = 126 covered / 84 + 42 = 126 total
  - Lines: 861 + 1239 = 2100 covered / 861 + 1241 = 2102 total
