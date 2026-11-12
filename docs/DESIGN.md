# Nimphy Living Design Document

This document is the living record of the system state, architecture decisions, and implementation progression. It is updated at the conclusion of **every step** per `docs/architecture/22-definition-of-done.md`. There is only ONE `docs/DESIGN.md` in the repository.

---

## 1. System Status & Roadmap Position

- **Architecture Package Version:** 0.4.0
- **Current Phase:** Phase 1 (Deterministic Core)
- **Current Step:** STEP-005 (Engine: per-unit economics — Final Release Reconciliation & ADR-005 Acceptance)
- **Actual Implementation Status:** Implementation Complete & Fully Verified; Awaiting Formal Owner Acceptance (ADR-005 Accepted — repository owner approved 2026-11-12. Pure financial calculation engine in `packages/calc-engine`, exact BigInt rational arithmetic via `Rational` class for fractional financial calculations, validated safe-integer JavaScript Number for integer amounts and boundary checks, financial rounding using exact integer quotient/remainder logic, zero fractional floating-point financial arithmetic, four rounding modes `round_half_up`, `round_half_even`, `round_down`, `round_up`, two rounding points `per_unit` and `per_total`, proportional fractional ebook delivery fee `costPerMbMinor * exactFileSizeMb`, fractional cost rounding under Rule Pack rounding mode, 32 independently hand-derived golden fixture cases across all 4 synthetic Rule Packs under `fixtures/calc-engine/golden-per-unit-cases.json` evaluated via 33 registered Vitest tests in `golden.test.ts`; 439/439 Tests Passed across 31 test files, 100% Statements (342/342) / 100% Branches (99/99) / 100% Functions (25/25) / 100% Lines (342/342) coverage achieved in `packages/calc-engine`, 99.93% Statements / 99.23% Branches / 100% Functions / 99.93% Lines monorepo-wide; all owner decisions A, B, C, D implemented; next step STEP-006 strictly unauthorized until explicit repository-owner instruction)
- **Strategic Alignment:** Long-term product vision, competitive differentiation, customer segmentation, 6-pillar capability framework, and repository alignment documented in [product-strategy.md](product-strategy.md) (Canonical Master Product Vision & Strategy).
- **Next Proposed Step:** STEP-006 (Engine: total economics and aggregation) — strictly unauthorized until explicit repository-owner review and written authorization.

---

## 2. Stack & Pinned Tooling Versions

All versions confirmed against repository manifests and `pnpm-lock.yaml`:

| Layer / Tool               | Technology            | Pinned Version | Installation Level & Notes                                                                                       |
| -------------------------- | --------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Runtime**                | Node.js               | `24.18.0`      | Active LTS; pinned in `.nvmrc` and root `engines` (`>=24.18.0 <25`)                                              |
| **Package Manager**        | pnpm                  | `10.34.5`      | Pinned in `packageManager` and GitHub Actions workflow                                                           |
| **Frontend Framework**     | Next.js (App Router)  | `16.4.5`       | App Router with Turbopack in `apps/web` (`transpilePackages` configured)                                         |
| **UI Library**             | React                 | `19.3.1`       | Server and client component support (`apps/web` & root `devDependencies`)                                        |
| **DOM Renderer**           | React DOM             | `19.3.1`       | React DOM bindings (`apps/web` & root `devDependencies`)                                                         |
| **Language**               | TypeScript            | `5.8.3`        | Strict mode enabled across all 8 workspace projects                                                              |
| **Linter**                 | ESLint                | `10.14.0`      | Direct flat config with local `@nimphy/architecture-boundaries` plugin rule                                      |
| **Next.js Lint Config**    | eslint-config-next    | `16.4.5`       | Core web vitals and TypeScript lint rules                                                                        |
| **Styling**                | Tailwind CSS          | `3.4.17`       | Utility-first CSS in `apps/web` with PostCSS `8.5.3` & Autoprefixer `10.4.20`                                    |
| **Test Runner**            | Vitest                | `3.0.8`        | Monorepo test harness with path aliases and jsdom environment                                                    |
| **Test Coverage**          | @vitest/coverage-v8   | `3.0.8`        | V8 code coverage provider pinned in root `devDependencies` for `pnpm test:coverage`                              |
| **Test Environment**       | jsdom                 | `26.0.0`       | Headless browser environment simulating DOM for Vitest                                                           |
| **React Testing**          | React Testing Library | `16.2.0`       | `@testing-library/react` for component and accessibility testing                                                 |
| **DOM Testing**            | DOM Testing Library   | `10.4.0`       | `@testing-library/dom` query utilities                                                                           |
| **Vite React Plugin**      | @vitejs/plugin-react  | `4.3.4`        | Vite plugin providing React JSX compilation for Vitest                                                           |
| **Code Formatter**         | Prettier              | `3.5.3`        | Code formatting with LF line endings; architecture docs ignored                                                  |
| **Git Hooks**              | Native Git Hooks      | Git core       | `.githooks/commit-msg` configured locally via `pnpm setup:hooks` (`git config --local core.hooksPath .githooks`) |
| **Type Definitions**       | @types/node           | `24.19.2`      | TypeScript definitions for Node.js runtime                                                                       |
| **Type Definitions**       | @types/react          | `19.3.0`       | TypeScript definitions for React 19                                                                              |
| **Type Definitions**       | @types/react-dom      | `19.3.0`       | TypeScript definitions for React DOM 19                                                                          |
| **Continuous Integration** | GitHub Actions        | `ci.yml`       | Full history checkout (`fetch-depth: 0`), multi-commit PR/push validation, format, typecheck, lint, tests        |

---

## 3. Workspace Packages

All packages established as valid TypeScript workspaces. Dependency arrows point strictly inward toward `@nimphy/domain`:

| Package Name              | Location               | Responsibility & Scope                                                               | Current Package Status                                                                                                                                                                           |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@nimphy/domain`**      | `packages/domain`      | Pure domain types, value objects, branded primitives, errors                         | **Complete & hardened; 0 workspace dependencies; 0 external dependencies; 164 tests; 100% Stmt / 100% Br / 100% Func / 100% Line Cov (861/861 stmts, 315/315 br)**                               |
| **`@nimphy/calc-engine`** | `packages/calc-engine` | Pure financial calculation engine (P-01: zero I/O, zero AI)                          | **Complete & hardened; depends only on `@nimphy/domain`; zero I/O, zero AI; 109 tests; 100% Stmt / 100% Br / 100% Func / 100% Line Cov (342/342 stmts, 99/99 br)**                               |
| **`@nimphy/rules`**       | `packages/rules`       | Rule Pack schema, synthetic loader, date-based selection, cryptographic content hash | **Complete & frozen v1 schema (hardened); depends only on `@nimphy/domain`; zero external deps; 106 tests; 99.84% Stmt / 98.16% Br / 100% Func / 99.84% Line Cov (1239/1241 stmts, 374/381 br)** |
| **`@nimphy/ai`**          | `packages/ai`          | Narrative memo synthesis, provider ports, schema validation                          | Package stub; depends only on `@nimphy/domain`                                                                                                                                                   |
| **`@nimphy/documents`**   | `packages/documents`   | Dossier assembly and Markdown/PDF document generation                                | Package stub; depends only on `@nimphy/domain`                                                                                                                                                   |
| **`@nimphy/payments`**    | `packages/payments`    | PayPal port, payment state machine, webhook processing                               | Package stub; depends only on `@nimphy/domain`                                                                                                                                                   |
| **`@nimphy/persistence`** | `packages/persistence` | PostgreSQL client, schema migrations, repositories                                   | Package stub; depends only on `@nimphy/domain`                                                                                                                                                   |
| **`@nimphy/web`**         | `apps/web`             | Next.js App Router application shell and UI                                          | App shell with layout, styling, disclaimer banner, smoke tests (2 tests passed)                                                                                                                  |

---

## 4. Repository Structure

```
nimphy/
├── .editorconfig                          # Editor formatting settings (indent, charset, LF)
├── .env.example                           # Verified template of environment variables
├── .gitattributes                         # LF line endings & text handling rules (* text=auto eol=lf)
├── .githooks/                             # Native Git hooks directory
│   └── commit-msg                         # Cross-platform conventional commit validation hook
├── .github/
│   └── workflows/
│       └── ci.yml                         # GitHub Actions CI pipeline (fetch-depth: 0, format, typecheck, lint, docs, boundaries, multi-commit check, tests, build)
├── .gitignore                             # Ignore rules for artifacts, env, and dependencies
├── .nvmrc                                 # Pinned Node.js version (24.18.0)
├── .prettierignore                        # Prettier ignore paths (including architecture docs)
├── .prettierrc                            # Prettier configuration (printWidth: 100, LF)
├── AGENTS.md                              # Permanent engineering instructions for coding agents
├── README.md                              # Project overview, onboarding instructions (setup:hooks), and quickstart guide
├── apps/
│   └── web/                               # Next.js App Router application
│       ├── app/
│       │   ├── globals.css                # Tailwind base and theme directives
│       │   ├── layout.tsx                 # Root HTML layout with metadata
│       │   ├── page.tsx                   # Minimal Nimphy home page with disclaimer banner
│       │   └── page.test.tsx              # Component smoke tests (2 tests passed)
│       ├── next.config.mjs                # Next.js configuration with transpilePackages
│       ├── package.json                   # Web workspace manifest (@nimphy/web)
│       ├── postcss.config.mjs             # PostCSS configuration with Tailwind & Autoprefixer
│       ├── tailwind.config.ts             # Tailwind design tokens and content globs
│       └── tsconfig.json                  # TypeScript configuration for web app
├── docs/
│   ├── architecture/                      # 23 canonical architecture specification documents (00–22)
│   ├── DESIGN.md                          # This single living design record
│   └── product-strategy.md                # Canonical master product vision, strategy, and capability framework
├── eslint.config.mjs                      # ESLint 10 direct flat configuration with local @nimphy plugin
├── fixtures/                              # Repository test fixtures
│   ├── calc-engine/                       # Calculation engine test fixtures
│   │   └── golden-per-unit-cases.json     # 32 hand-derived golden fixture cases across all 4 synthetic Rule Packs
│   └── rules/                             # Synthetic Rule Pack fixtures (doc 12 §4)
│       ├── TEST_EBOOK_STANDARD/1.0.0/     # pack.json, cases.json, README.md
│       ├── TEST_HARDCOVER_GLOBAL/1.0.0/   # pack.json, cases.json, README.md
│       ├── TEST_PAPERBACK_US/1.0.0/       # pack.json, cases.json, README.md
│       └── TEST_PAPERBACK_US/2.0.0/       # pack.json, cases.json, README.md
├── learning/
│   ├── implementation/
│   │   ├── step-01-project-scaffolding.md # Detailed STEP-001 implementation record
│   │   ├── step-02-docs-and-boundaries.md # Detailed STEP-002 implementation record
│   │   ├── step-03-correctness-review.md  # Detailed STEP-003 correctness audit & hardening record
│   │   ├── step-03-domain-primitives.md   # Detailed STEP-003 implementation record
│   │   ├── step-04-rule-pack-schema-and-loader.md # Detailed STEP-004 implementation record
│   │   └── step-05-per-unit-economics.md  # Detailed STEP-005 implementation record
│   ├── interviews/
│   │   ├── step-01-project-scaffolding.md # STEP-001 technical interview preparation
│   │   ├── step-02-docs-and-boundaries.md # STEP-002 technical interview preparation
│   │   ├── step-03-domain-primitives.md   # STEP-003 technical interview preparation (18 senior topics)
│   │   ├── step-04-rule-pack-schema-and-loader.md # STEP-004 technical interview preparation (8 senior topics)
│   │   └── step-05-per-unit-economics.md  # STEP-005 technical interview preparation (10 senior topics)
│   └── notes/
│       ├── step-01-project-scaffolding.md # STEP-001 engineering reference notes
│       ├── step-02-docs-and-boundaries.md # STEP-002 engineering reference notes
│       ├── step-03-domain-primitives.md   # STEP-003 engineering reference notes (Hardened)
│       ├── step-04-rule-pack-schema-and-loader.md # STEP-004 engineering reference notes
│       └── step-05-per-unit-economics.md  # STEP-005 engineering reference notes
├── package.json                           # Monorepo root manifest and orchestration scripts (includes test:coverage)
├── packages/
│   ├── ai/                                # AI prompt building & synthesis stub
│   ├── calc-engine/                       # Pure financial calculation engine (Module M-02)
│   │   ├── README.md                      # Comprehensive calc-engine package documentation
│   │   ├── package.json                   # Calc-engine manifest (depends only on @nimphy/domain)
│   │   ├── tsconfig.json                  # TypeScript configuration
│   │   └── src/
│   │       ├── errors/
│   │       │   ├── calc-error.ts          # Typed error hierarchy (CalcEngineError, etc.)
│   │       │   ├── calc-error.test.ts     # Calc error tests (7 tests)
│   │       │   └── index.ts
│   │       ├── golden/
│   │       │   └── golden.test.ts         # Parity tests against 32 hand-derived golden cases (33 registered Vitest tests: 1 inventory check + 32 case evaluations)
│   │       ├── math/
│   │       │   ├── rational.ts            # BigInt rational arithmetic & ADR-005 rounding
│   │       │   ├── rational.test.ts       # Rational unit tests (31 tests)
│   │       │   └── index.ts
│   │       ├── per-unit/
│   │       │   ├── per-unit-calc.ts       # calculatePerUnitEconomics pure function
│   │       │   ├── per-unit-calc.test.ts  # Per-unit economics unit & boundary tests (31 tests)
│   │       │   ├── trace.test.ts          # Deterministic trace tests (4 tests)
│   │       │   ├── types.ts               # Structural CalcRulePack and trace interfaces
│   │       │   └── index.ts
│   │       ├── index.ts                   # Public barrel entrypoint
│   │       └── index.test.ts              # Public API barrel integration tests (3 tests)
│   ├── documents/                         # Dossier assembly & document generator stub
│   ├── domain/                            # Pure domain types & value objects
│   │   ├── README.md                      # Comprehensive domain package documentation
│   │   ├── package.json                   # Domain manifest (0 external dependencies)
│   │   ├── tsconfig.json                  # TypeScript configuration
│   │   └── src/
│   │       ├── canonical/
│   │       │   ├── canonical-json.ts      # Deterministic RFC 8785-compliant JCS serializer with domain extensions
│   │       │   ├── canonical-json.test.ts # Canonical JSON & RFC 8785 vectors (Appendix E, structures, french, unicode) (31 tests)
│   │       │   ├── sha256.ts              # Pure TypeScript FIPS 180-4 SHA-256 implementation
│   │       │   ├── sha256.test.ts         # NIST vectors & differential testing vs node:crypto (14 tests)
│   │       │   └── index.ts
│   │       ├── errors/
│   │       │   ├── domain-error.ts        # Typed domain error hierarchy
│   │       │   ├── domain-error.test.ts   # Domain error tests (13 tests)
│   │       │   └── index.ts
│   │       ├── identifiers/
│   │       │   ├── branded-ids.ts         # Type-safe nominal UUID identifiers
│   │       │   ├── branded-ids.test.ts    # Branded ID tests (9 tests)
│   │       │   └── index.ts
│   │       ├── money/
│   │       │   ├── currency.ts            # Supported ISO-4217 currencies and runtime-frozen metadata
│   │       │   ├── currency.test.ts       # Currency tests (11 tests)
│   │       │   ├── money.ts               # Immutable Money value object with exact BigInt rational math
│   │       │   ├── money.test.ts          # Money value object tests (49 tests)
│   │       │   └── index.ts
│   │       ├── provenance/
│   │       │   ├── provenance.ts          # Provenance classifications and createProvenanced factory
│   │       │   ├── provenance.test.ts     # Provenance tests (15 tests)
│   │       │   └── index.ts
│   │       ├── properties.test.ts         # Property-based testing with Mulberry32 PRNG (11 tests)
│   │       ├── types.ts                   # ScenarioName, BookFormat, MarketplaceKey (runtime-frozen)
│   │       ├── types.test.ts              # Shared domain enum tests (4 tests)
│   │       ├── index.ts                   # Public domain entrypoint
│   │       └── index.test.ts              # Barrel export and public API integration tests (7 tests)
│   ├── payments/                          # PayPal port & payment state machine stub
│   ├── persistence/                       # Database client & schema migrations stub
│   └── rules/                             # Rule pack loader, schema, and validation
│       ├── README.md                      # Comprehensive rules package documentation
│       ├── package.json                   # Rules manifest (depends only on @nimphy/domain)
│       ├── tsconfig.json                  # TypeScript configuration
│       └── src/
│           ├── errors/
│           │   ├── rule-pack-error.ts     # Domain error subclasses (RULE_PACK_INVALID, RULE_PACK_NOT_FOUND)
│           │   ├── rule-pack-error.test.ts# Error inheritance tests (4 tests)
│           │   └── index.ts
│           ├── hashing/
│           │   ├── content-hash.ts        # Pure canonical SHA-256 content and envelope hashing
│           │   ├── content-hash.test.ts   # Deterministic hashing & tamper-detection tests (5 tests)
│           │   └── index.ts
│           ├── loader/
│           │   ├── fixtures.test.ts       # Fixtures directory integrity tests (6 tests)
│           │   ├── fs-loader.ts           # Filesystem loading & recursive directory scanning
│           │   ├── fs-loader.test.ts      # Filesystem loading tests (6 tests)
│           │   ├── loader.test.ts         # Registry and loader tests (11 tests)
│           │   ├── rule-pack-loader.ts    # In-memory registry with nominal UUID indexing
│           │   ├── selector.ts            # Date-based SemVer selector (selectRulePack, findRulePacks)
│           │   ├── selector.test.ts       # Date boundary, transition, and SemVer tests (13 tests)
│           │   └── index.ts
│           ├── schema/
│           │   ├── semver.ts              # SemVer 2.0.0 parsing, validation, and comparison
│           │   ├── semver.test.ts         # SemVer spec compliance tests (16 tests)
│           │   ├── types.ts               # Core RulePack, policy, and validation types
│           │   ├── validator.ts           # Pure TypeScript schema validator, parsers, and guards
│           │   ├── validator.test.ts      # Exhaustive schema validation tests (31 tests)
│           │   └── index.ts
│           ├── synthetic/
│           │   ├── test-packs.ts          # 4 built-in canonical synthetic test packs
│           │   ├── test-packs.test.ts     # Built-in synthetic test pack verification (6 tests)
│           │   └── index.ts
│           ├── index.ts                   # Public barrel entrypoint
│           └── index.test.ts              # Public API barrel integration tests (8 tests)
├── pnpm-lock.yaml                         # Frozen, reproducible dependency lockfile
├── pnpm-workspace.yaml                    # Monorepo workspace definition (apps/*, packages/*)
├── prompts/
│   ├── step-01.md                         # Canonical STEP-001 implementation prompt archive
│   ├── step-02.md                         # Canonical STEP-002 implementation prompt archive
│   ├── step-03.md                         # Canonical STEP-003 implementation prompt archive (preserved)
│   ├── step-03-correctness-review.md      # Canonical STEP-003 correctness review prompt archive
│   ├── step-04.md                         # Canonical STEP-004 implementation prompt archive
│   └── step-05.md                         # Canonical STEP-005 implementation prompt archive
├── scripts/
│   ├── check-boundaries.mjs               # Standalone architectural boundary & cycle checker
│   ├── check-commit.mjs                   # Conventional commit validator
│   ├── check-docs.mjs                     # Mechanical docs checker
│   ├── eslint-plugin-nimphy.mjs           # Local ESLint flat-config plugin
│   └── setup-hooks.mjs                    # Cross-platform Git hook setup utility
├── tests/
│   ├── boundaries.test.ts                 # Vitest suite for architectural boundaries (17 tests)
│   ├── check-commit.test.ts               # Vitest suite for conventional commits (24 tests)
│   ├── check-docs.test.ts                 # Vitest suite for docs inventory and links (13 tests)
│   └── setup-hooks.test.ts                # Vitest suite for hook setup (4 tests)
├── tsconfig.base.json                     # Shared base TypeScript strict configuration
├── tsconfig.json                          # Root TypeScript project reference and paths
└── vitest.config.ts                       # Workspace test runner configuration (includes V8 coverage)
```

---

## 5. Architecture Decisions & Open Questions

- **ADR-001 (Modular Monolith):** Adopted. Single deployable with isolated workspace packages.
- **ADR-002 (TypeScript Stack):** Adopted with verified pinned versions.
- **ADR-005 (Money as integer minor units; rounding in Rule Packs):** Status: **Accepted** — repository owner approved 2026-11-12. Implemented in `@nimphy/domain` and `@nimphy/calc-engine`. `Money` represents amounts strictly as integer minor units with ISO-4217 currency codes; zero floats; exact BigInt rational arithmetic via `Rational` class; four formal rounding modes (`round_half_up`, `round_half_even`, `round_down`, `round_up`); proportional ebook delivery cost without integer-MB ceiling via `fileSizeMb: string`; two-stage rounding sequence for `per_unit` (gross royalty rounded, fractional cost rounded with same mode, contribution by subtraction) and deferred rounding for `per_total` (unrounded `Rational`s preserved for STEP-006 multi-unit aggregation).
- **ADR-006 (Immutable, versioned Rule Packs):** Implemented and verified in `@nimphy/rules`. v1 schema frozen with strict typing, nominal UUIDs, SemVer 2.0.0, calendar date validation (`effective_to > effective_from`), declarative parameter policies (`rounding`, `royalty` with exact decimal string rates `royaltyRateDecimal`, `printCost`, `deliveryCost`, `limits`), pure SHA-256 canonical content hashing, and in-memory registry loader. Synthetic test packs (`TEST_*`) and fixtures established under `fixtures/rules/`.
- **Open Questions Status:**
  - OQ-005: MVP marketplace/format scope (Resolved for synthetic packs in STEP-004: formats ebook, paperback, hardcover; marketplaces `TEST_MARKETPLACE` and `TEST_GLOBAL`).
  - OQ-006: Sourcing of official publisher data (Deferred to future operator ingestion steps; synthetic `TEST_*` data quarantined).
  - OQ-010: Anonymous usage limits prior to checkout (Pending P6).
  - OQ-011: Legal data retention requirements for financial records.
  - OQ-013: Project license determination (Pending).
  - OQ-014: Carry-over candidates from predecessor plans recorded.

---

## 6. Completed Work in STEP-003 (Including Correctness Review & Hardening)

1. **Immutable `Money` Value Object (`packages/domain/src/money/money.ts`):**
   - Pure value object storing `amountMinor: number` and `currency: CurrencyCode`.
   - Bounds: strictly within `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`.
   - Rejects non-finite values (`NaN`, `Infinity`, `-Infinity`), non-numeric types, and fractional minor units.
   - Normalizes negative zero (`-0`) to `0`.
   - Immutability enforced via `Object.freeze(this)`.
   - Exact string parsing (`Money.fromDecimal`) converting human-readable decimal strings into minor units without floating-point math.
   - Exact integer multiplication (`multiply(factor: number)` strictly requires `Number.isInteger(factor)`).
   - Exact rational multiplication:
     - `multiplyDecimal(decimalString: string)` parses decimal without floats and performs BigInt integer rational multiplication; rejects fractional minor units with `InvalidMoneyError` (zero silent rounding).
     - `multiplyRatio(numerator, denominator)` performs exact rational scaling via BigInt arithmetic with safe-integer validation.
   - Exact arithmetic (`add`, `subtract`, `negate`, `abs`) with safe-integer overflow guards (`MoneyOverflowError`).
   - Strict currency matching across operations (`CurrencyMismatchError`).
   - Equality (`equals`), comparison (`compare`, `greaterThan`, `lessThan`, etc.), and predicates (`isZero`, `isPositive`, `isNegative`).
   - Deterministic decimal string (`toDecimalString`), symbol formatting (`toFormattedString`), and JSON serialization (`toJSON`).
2. **Approved Currency Codes & Runtime-Frozen Vocabularies (`packages/domain/src/money/currency.ts`):**
   - Explicit approved currency vocabulary: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`.
   - Runtime immutability guaranteed via `Object.freeze(SUPPORTED_CURRENCIES)` preventing array mutation in memory.
   - Complete metadata dictionary with variable minor-unit exponents (e.g. 2 for USD, 0 for JPY), symbols, and full names.
   - Unicode code point verification for `$`, `€` (`0x20AC`), `£` (`0xA3`), `CA$`, `A$`, `¥` (`0xA5`).
   - Boundary validation functions: `isSupportedCurrency`, `assertSupportedCurrency`, `parseCurrencyCode`, `getCurrencyMetadata`, `getMinorUnitExponent`.
3. **Canonical Provenance Vocabulary & Factory (`packages/domain/src/provenance/provenance.ts`):**
   - Preserves canonical terms: `user_input`, `official_fact`, `estimate`, `assumption`.
   - Runtime immutability guaranteed via `Object.freeze(PROVENANCE_VALUES)`.
   - Type guards, assertions, and parsers: `isProvenance`, `assertProvenance`, `parseProvenance`.
   - Uncertainty classification: `isUncertain(provenance)` returns true for `estimate` and `assumption` (Principle P-07).
   - `createProvenanced<T>` factory function: validates provenance enum, defensively shallow-copies and freezes `evidenceRefs` (`Object.freeze([...evidenceRefs])`), and freezes the outer envelope while preserving caller-owned generic `value: T`.
4. **Branded Nominal UUID Identifiers (`packages/domain/src/identifiers/branded-ids.ts`):**
   - Compile-time nominal branding via `Branded<string, BrandName>` with a unique symbol.
   - Covers all 12 authorized entity types: `UserId`, `CaseId`, `RevisionId`, `EvidenceId`, `RulePackId`, `RunId`, `MemoId`, `DossierId`, `PricePointId`, `OrderId`, `PaymentEventId`, `EntitlementId`.
   - Validates canonical 128-bit UUID textual layout (`8-4-4-4-12` hex layout, case-insensitive, normalized to lowercase). Direct alignment with PostgreSQL's native `uuid` column type across all versions (v4, v7, nil, synthetic test fixtures).
   - Exposes type guards (`isUserId`, etc.) and specialized parsers (`parseUserId`, etc.).
5. **Typed Domain Error Hierarchy (`packages/domain/src/errors/domain-error.ts`):**
   - Base `DomainError` inheriting from `Error`, setting prototype linkage and exposing `code` and structured `details`.
   - Distinct typed subclasses: `InvalidMoneyError`, `CurrencyMismatchError`, `MoneyOverflowError`, `UnsupportedCurrencyError`, `InvalidProvenanceError`, `InvalidIdentifierError`, `CanonicalSerializationError`.
6. **Deterministic Canonical JSON Serializer (`packages/domain/src/canonical/canonical-json.ts`):**
   - Rejects top-level `undefined`, functions, and symbols with `CanonicalSerializationError`.
   - Converts sparse array holes and `undefined` array elements to `null`, matching `JSON.stringify` and avoiding malformed JSON strings.
   - Evaluates custom `toJSON()` methods on domain entities (e.g. `Money`).
   - Enforces `isPlainObject(obj)` on objects without `toJSON()`, explicitly rejecting `Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`, and `TypedArray`.
   - Recursively sorts plain object keys lexicographically by UTF-16 code units.
   - Active call-path cycle detection via `activePath = new Set<object>()` with `finally` cleanup: reliably catches cyclic `toJSON()` calls and self-referential structures while correctly supporting Directed Acyclic Graphs (DAGs / diamond references).
7. **Pure SHA-256 Hashing & Differential Cryptography (`packages/domain/src/canonical/sha256.ts`):**
   - Pure TypeScript implementation of FIPS 180-4 SHA-256 with zero external dependencies.
   - Tested against official NIST FIPS 180-4 test vectors.
   - Verified via differential testing against Node.js native `node:crypto` (`crypto.createHash('sha256')`).
   - Hardened `utf8EncodeFallback`: encodes well-formed surrogate pairs to 4 UTF-8 bytes and safely replaces unpaired high or low surrogates with standard Unicode Replacement Character `U+FFFD` (`0xEF, 0xBF, 0xBD`) per WHATWG and RFC 3629.
   - `hashCanonicalJson`: Computes `sha256:<64-hex>` digests used for `inputs_hash`, `results_hash`, and `content_hash`.
8. **Shared Domain Enums (`packages/domain/src/types.ts`):**
   - `ScenarioName`: `'low' | 'base' | 'high'` (runtime-frozen via `SCENARIO_NAMES`).
   - `BookFormat`: `'ebook' | 'paperback' | 'hardcover'` (runtime-frozen via `BOOK_FORMATS`).
9. **Package Documentation & Public Exports:**
   - Authored and updated `packages/domain/README.md`.
   - Updated `packages/domain/src/index.ts` to export the approved public API including `createProvenanced`.
   - Added `packages/domain/src/index.test.ts` to verify all root and submodule barrel re-exports.

---

## 7. Completed Work in STEP-004 (Rule Pack Schema and Loader)

1. **Frozen v1 Rule Pack Schema (`packages/rules/src/schema/types.ts`):**
   - Direct 1-to-1 alignment with PostgreSQL `rule_packs` table in doc 06 §3.
   - Core fields: nominal UUID `id`, `packKey`, SemVer `version`, `status` (`'draft' | 'published' | 'retired'`), `marketplace`, `format` (`'ebook' | 'paperback' | 'hardcover'`), `currency` (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`), `effectiveFrom`, `effectiveTo` (with `effectiveTo > effectiveFrom` check), `sourceRef`, `sourceRetrievedAt`, declarative `content`, and SHA-256 `contentHash`.
   - Declarative parameter hierarchy (`RulePackContent`):
     - `rounding`: Explicit `mode` (`round_half_up`, `round_half_even`, `round_down`, `round_up`) and `point` (`per_unit`, `per_total`). Silent default rounding is strictly forbidden per ADR-005.
     - `royalty`: Tiered pricing with exact decimal string rates (`royaltyRateDecimal`, e.g. `"0.70"`, `"0.35"`) rather than integer basis points (`rateBps`) or floating-point percentages, preventing floating-point rounding errors and preserving exact rational rate definitions.
     - `printCost`: Base cost and per-page cost in integer minor units; required for physical formats (`paperback`, `hardcover`), forbidden for `ebook`.
     - `deliveryCost`: File distribution cost per megabyte in integer minor units.
     - `limits`: Minimum and maximum list prices (minor units) and page counts (required for physical, null for ebook).
     - `customParameters`: Optional extensibility record for synthetic test parameters.
2. **Pure Schema Validation (`packages/rules/src/schema/validator.ts`):**
   - Zero-dependency schema validation in pure TypeScript.
   - Strict format consistency enforcement: physical formats require print cost and positive page boundaries; ebooks reject print cost and page counts.
   - Exact calendar date verification: `isValidCalendarDate` checks calendar day counts per month, rejecting invalid dates (e.g. `2026-02-29` in non-leap years, `2026-04-31`).
   - Deep immutability: Evaluates `deepFreeze` on the resulting entity, guaranteeing that all levels of the object hierarchy are immutable (`Object.isFrozen`).
3. **SemVer 2.0.0 Specification Compliance (`packages/rules/src/schema/semver.ts`):**
   - Regex validation per official SemVer 2.0.0 specification.
   - Exact precedence comparator (`compareSemver`): compares major, minor, patch, and dot-separated prerelease tags per SemVer 2.0.0 §9–11; ignores build metadata per §10.
4. **Deterministic SHA-256 Content Hashing & RFC 8785 Conformance (`packages/rules/src/hashing/content-hash.ts`):**
   - Computes stable `sha256:<64-hex>` digest from the canonical JSON serialization of `content` via `@nimphy/domain`'s RFC 8785-compliant JCS serializer with domain extensions.
   - Automatic content hash calculation when omitted; validates bit-for-bit equality and rejects tampered content hashes with `CONTENT_HASH_MISMATCH`.
   - Full canonical envelope hashing via `computeRulePackEnvelopeHash`.
   - Verified against RFC 8785 (JCS) test vectors (Appendix E, structures, french, unicode) and UTF-8 surrogate replacements.
5. **Date-Based SemVer Selector (`packages/rules/src/loader/selector.ts`):**
   - `selectRulePack(packs, criteria)` accepts `marketplace`, `format`, `asOf` (string or Date), and optional `status` (defaults to `'published'`).
   - Inclusive range matching: `effectiveFrom <= asOf <= (effectiveTo ?? infinity)`.
   - SemVer descending resolution when versions overlap, with deterministic tie-breaking by `packKey`.
   - Throws `RulePackNotFoundError` (stable code `RULE_PACK_NOT_FOUND`) with full criteria when no pack matches.
6. **In-Memory Registry & Filesystem Loader (`packages/rules/src/loader/`):**
   - `RulePackLoader`: In-memory registry with nominal UUID and `(packKey, version)` indexing.
   - ADR-006 Immutability Enforcement: Overwriting an existing `(packKey, version)` with differing content hash is blocked with `IMMUTABLE_OVERWRITE_FORBIDDEN`. Identical re-registration is idempotent.
   - `loadRulePackFromFile` and `loadRulePacksFromDirectory`: Synchronous loading from disk with recursive directory scanning for `pack.json` files.
7. **Synthetic-Only Rule Pack Fixtures (`fixtures/rules/`):**
   - 4 complete fixture directories created under `fixtures/rules/`:
     - `TEST_EBOOK_STANDARD/1.0.0/` (USD ebook, 3 royalty tiers, delivery fee)
     - `TEST_PAPERBACK_US/1.0.0/` (USD paperback, historical 2025 window, 100 base cost)
     - `TEST_PAPERBACK_US/2.0.0/` (USD paperback, successor 2026 window, 120 base cost)
     - `TEST_HARDCOVER_GLOBAL/1.0.0/` (EUR hardcover, round_down, per_total)

---

## 8. Final Corrective Implementation in STEP-005 (Per-Unit Economics Engine & ADR-005 Acceptance)

1. **Financial Arithmetic Model & Pure Rational Arithmetic (`packages/calc-engine/src/math/rational.ts`):**
   - **Architectural Arithmetic Guarantees:**
     - Fractional financial arithmetic uses exact BigInt rational arithmetic (`Rational`).
     - JavaScript `Number` is permitted for validated safe-integer calculations and boundary checks (e.g. `amountMinor: number`, integer print costs, page counts, limit validation).
     - Financial rounding uses exact integer quotient/remainder logic (`BigInt` integer division and modulo).
     - No fractional floating-point financial arithmetic is used anywhere in financial calculations.
   - Implemented immutable `Rational` number class with arbitrary-precision BigInt arithmetic.
   - Euclid's GCD reduction guarantees canonical lowest terms on construction.
   - Operations: `add()`, `subtract()`, `multiply()`, `divide()`, `negate()`, `abs()`, `compare()`, `equals()`.
   - Exact decimal string parser (`Rational.fromDecimal`) avoids floating-point binary inaccuracies and parses decimal strings without fractional floats.
   - Decimal string formatter (`toDecimalString()`) identifies terminating decimals (prime factors of denominator $\subseteq \{2, 5\}$) and outputs exact strings without floats, while appending `...` to non-terminating decimals.
   - Custom `toJSON()` returning `{ numerator: string, denominator: string, decimalString: string }` ensuring safe canonical serialization without BigInt runtime errors.
2. **Owner-Approved Rounding Semantics (Decision A & ADR-005 Accepted):**
   - Implemented the 4 canonical rounding modes directly on `Rational`:
     - `round_down`: Toward zero / truncation (positive $2.7 \to 2$, negative $-2.7 \to -2$).
     - `round_up`: Away from zero (positive $2.1 \to 3$, negative $-2.1 \to -3$).
     - `round_half_up`: Nearest integer, exact half ties round away from zero ($+2.5 \to +3, -2.5 \to -3$).
     - `round_half_even`: Nearest integer, exact half ties round to nearest even integer ($+2.5 \to +2, +3.5 \to +4, -2.5 \to -2, -3.5 \to -4$).
   - Formally accepted in ADR-005 on 2026-11-12 by repository owner.
3. **Proportional Fractional Ebook Delivery Cost (Decision B):**
   - Public contract: `fileSizeMb: string` (e.g. `"0.1"`, `"0.5"`, `"1"`, `"2.1"`).
   - Validated against `/^\d+(\.\d+)?$/`, length bounded to 50 characters, rejects non-string, empty, zero, negative, NaN, infinity, and scientific notation with `DELIVERY_SIZE_INVALID`.
   - Proportional formula: $\text{deliveryCostMinorExact} = \text{costPerMbMinor} \times \text{Rational}(\text{fileSizeMb})$. No whole-MB ceiling policy.
4. **Rounding Sequence & Points (Decision C):**
   - `per_unit`:
     - Calculate exact gross royalty; round using Rule Pack's `rounding.mode`.
     - Calculate exact production/distribution cost; round fractional cost using the same `rounding.mode`.
     - Subtract rounded cost from rounded royalty to derive net contribution.
     - Return `Money` instances in integer minor units.
   - `per_total` (3-tier distinction):
     1. **Exact rational amounts (authoritative for STEP-006 aggregation):** `exactGrossRoyalty`, `exactApplicableCost`, and `exactNetContribution` remain fully available as unrounded `Rational` BigInt fractions.
     2. **Integer Money amount, when legitimately available:** `applicableCost` is populated with `Money` if the cost is already an exact integer minor unit (e.g. paperback print cost 975 minor units); if fractional, it is `null`.
     3. **Deferred amounts awaiting STEP-006 aggregation:** `grossRoyalty`, `netContribution`, and fractional costs remain `null` so no premature unit-level rounding is implied. STEP-006 aggregates exact components by quantity ($Q \times \text{exactGrossRoyalty}$, $Q \times \text{exactApplicableCost}$) and rounds aggregate royalty and cost separately, exactly once.
5. **Per-Unit Economics Engine (`packages/calc-engine/src/per-unit/per-unit-calc.ts`):**
   - Pure function `calculatePerUnitEconomics(input, rulePack)`.
   - Strict validation: safe integers, list price within Rule Pack limits, currency and format matching, required format inputs (`pages` for print, `fileSizeMb` for ebook), positive page and size bounds.
   - Royalty calculation: locates matching tier, scales list price by exact rational rate fraction.
   - Cost calculation:
     - Print: $\text{baseCostMinor} + \max(0, \text{pages} - \text{pageThreshold}) \times \text{costPerPageMinor}$.
     - Delivery: exact rational multiplication $\text{costPerMbMinor} \times \text{Rational}(\text{fileSizeMb})$.
   - Net contribution: gross royalty minus applicable production/distribution cost.
6. **Deterministic Calculation Trace (`CalculationTrace`):**
   - Discriminated typed steps capturing the entire evaluation lifecycle: input validation, tier selection, exact gross royalty calculation, production cost calculation, rounding operations (recording both royalty and cost rounding), and net contribution.
   - Contains zero timestamps, zero UUIDs, zero random numbers. Serializes deterministically to canonical JSON (`toCanonicalJson`).
7. **Typed Error Hierarchy (`packages/calc-engine/src/errors/calc-error.ts`):**
   - `CalcEngineError` base class extending `DomainError`.
   - Subclasses: `CalcInputValidationError`, `CalcCurrencyMismatchError`, `CalcFormatMismatchError`, `NoMatchingRoyaltyTierError`, `RulePackIncompatibleError`, `CalcOverflowError`.
8. **Architectural Boundary & Build Structure Adherence:**
   - `packages/calc-engine` depends strictly on `@nimphy/domain`.
   - Defines structural interfaces (`CalcRulePack`, etc.) in `packages/calc-engine/src/per-unit/types.ts` matching the frozen v1 Rule Pack contract without importing `@nimphy/rules`.
   - Internal workspace package architecture: `@nimphy/calc-engine` has `"typecheck": "tsc --noEmit"` in its `package.json` and no separate build script. Root `pnpm build` builds `@nimphy/web`. Package emission is validated via `pnpm --filter @nimphy/calc-engine typecheck` and `pnpm typecheck`. The removal of `rootDir` from `packages/calc-engine/tsconfig.json` is required because TypeScript's `rootDir` option forbids source files outside that directory when importing `@nimphy/domain/src` via tsconfig paths.
9. **Hand-Derived Golden Fixtures (`fixtures/calc-engine/golden-per-unit-cases.json`):**
   - 32 independently derived golden fixture cases across all 4 synthetic Rule Packs (evaluated via 33 registered Vitest tests in `golden.test.ts`, including 1 fixture inventory check and 32 case evaluations):
     - 15 Ebook cases (including 4 proportional fractional delivery cases: 0.1 MB, 0.5 MB, 1.25 MB, 2.1 MB).
     - 7 Paperback US v1 cases (including valid $5.00/300 pages negative contribution yielding -352 cents / USD -3.52).
     - 4 Paperback US v2 cases.
     - 6 Hardcover Global v1 cases (EUR, round_down, per_total).
   - Replaced invalid $4.00 paperback calculation with valid $5.00 calculation (Decision D); authoritatively verified actual minimum list price in `TEST_PAPERBACK_US/1.0.0` is $5.00 (`minListPriceMinor: 500`), NOT 450.
   - Verified 5 boundary conditions for paperback minimum list price:
     - $4.00 (400 minor units) = reject (`PRICE_OUT_OF_BOUNDS`)
     - $4.50 (450 minor units) = reject (`PRICE_OUT_OF_BOUNDS`)
     - $4.99 (499 minor units) = reject (`PRICE_OUT_OF_BOUNDS`)
     - $5.00 (500 minor units) = accept (yields USD -3.52 at 300 pages)
     - $5.01 (501 minor units) = accept (yields USD -3.51 at 300 pages)
10. **Exhaustive Testing & 100% Branch Coverage:**
    - 109 passing tests across 6 test files in `packages/calc-engine` (`golden.test.ts` [33: 1 inventory check + 32 case evaluations], `rational.test.ts` [31], `per-unit-calc.test.ts` [31], `calc-error.test.ts` [7], `trace.test.ts` [4], `index.test.ts` [3]).
    - Full monorepo test suite stands at **439 passing tests across 31 test files** (0 failures).
    - Coverage:
      - `packages/calc-engine`: **100% Statements (342/342), 100% Branches (99/99), 100% Functions (25/25), 100% Lines (342/342)**.
      - Entire repository: **99.93% Statements (2442/2444), 99.23% Branches (789/795), 100% Functions (151/151), 99.93% Lines (2442/2444)**.
11. **Versioning Invariants:**
    - **Calculation Engine Reproducibility Versioning:** `@nimphy/calc-engine` package version `0.1.0`, `CALC_ENGINE_MODULE_VERSION = '0.1.0'`, and `CalculationTrace.engineVersion = '0.1.0'`. These pin the deterministic financial calculation engine module and trace schema for reproducible calculation replay.
    - **Architecture Specification Versioning:** `0.4.0`. This tracks repository-wide architecture specifications and roadmap progression across milestones (Phase 1).

---

## 9. Verification Results

### A. Local Checks Executed & Passed Directly

| Verification Suite            | Exact Command                                 | Result       | Details                                                                                                                     |
| ----------------------------- | --------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Dependency Installation**   | `pnpm install --frozen-lockfile`              | **Passed**   | 9 workspace projects linked; store clean and reproducible                                                                   |
| **Git Hook Setup**            | `pnpm setup:hooks`                            | **Passed**   | `core.hooksPath` configured to `.githooks` locally                                                                          |
| **Calc-Engine Typecheck**     | `pnpm --filter @nimphy/calc-engine typecheck` | **Passed**   | `@nimphy/calc-engine` typecheck succeeded (`tsc --noEmit`); 0 errors                                                        |
| **Workspace TypeScript**      | `pnpm typecheck`                              | **Passed**   | 8 workspace projects checked (`pnpm -r run typecheck`); 0 errors                                                            |
| **Code Linting**              | `pnpm lint`                                   | **Passed**   | ESLint 10 with local `@nimphy` plugin; 0 errors, **0 warnings**                                                             |
| **Prettier Formatting Check** | `pnpm format:check`                           | **Passed**   | All matched files use Prettier code style                                                                                   |
| **Documentation Validation**  | `pnpm docs:check`                             | **Passed**   | 23 docs present, 94 links verified, 22 ADR statuses confirmed                                                               |
| **Architecture Boundaries**   | `pnpm boundaries:check`                       | **Passed**   | 71 source files checked, 187 import declarations verified; `@nimphy/calc-engine` depends only on `@nimphy/domain`           |
| **Full Vitest Test Suite**    | `pnpm test`                                   | **Passed**   | Vitest 3.0.8, 31 test files, **439/439 tests passed** (0 failed, 0 skipped; 109 tests in calc-engine across 6 test files)   |
| **V8 Code Coverage**          | `pnpm test:coverage`                          | **Passed**   | **packages/calc-engine: 100% Stmts / 100% Br / 100% Func / 100% Lines**; monorepo: 99.93% Stmts, 99.23% Br (threshold: 95%) |
| **Production Web Build**      | `pnpm build`                                  | **Passed**   | `@nimphy/web` Next.js Turbopack build succeeded with 0 errors; static prerender succeeded                                   |
| **Git Whitespace Check**      | `git diff --check`                            | **Passed**   | Whitespace and patch integrity check; 0 whitespace or line ending errors reported                                           |
| **Working Tree Status**       | `git status --short`                          | **Verified** | Modified and untracked STEP-005 files preserved uncommitted awaiting engineering review                                     |

---

## 10. Open Issues & Dependency Warnings

1. **ESLint Plugin Peer Dependencies:** Transitive plugins declare peer dependency compatibility up to ESLint 9 (`^8.0.0 || ^9.0.0`), while ESLint `10.14.0` is installed. Our custom local plugin operates natively without third-party dependencies, and all linting executes with 0 runtime errors and 0 warnings.
2. **Deprecated Transitive Package:** `whatwg-encoding` was noted as deprecated in transitive `jsdom` dependencies. Managed upstream by `jsdom`.

---

## 11. Next Proposed Step (Awaiting Authorization)

**STEP-006: Engine: total economics and aggregation (Proposed — Strictly Unauthorized)**

- **Status:** Proposed next engineering step; strictly unauthorized until explicit repository-owner review and written approval per `AGENTS.md` §3 ("Step-by-Step Discipline: Implement only the step explicitly authorized by the user. Do not anticipate or partially implement future steps").
- **Objective:** Multi-unit aggregation, batch project calculations, break-even unit calculations, sensitivity sweeps, and multi-format comparison under frozen Rule Packs.
- **Scope:**
  - Pure aggregation functions in `packages/calc-engine` (zero I/O, zero AI, zero clock/randomness).
  - Proper handoff from STEP-005 `per_total` unrounded `Rational` amounts ($Q \times \text{exactGrossRoyalty}$ before rounding).
  - Break-even integer ceiling derivation ($Q_{\text{be}} = \lceil \text{FixedCost} / \text{UnitContribution} \rceil$).
  - Golden fixtures cross-checked against independent hand derivations.
  - 100% branch coverage maintained for `packages/calc-engine`.
- **Strict Boundary Constraint:** Do not begin STEP-006 until explicitly authorized by the repository owner.
