# Nimphy Living Design Document

This document is the living record of the system state, architecture decisions, and implementation progression. It is updated at the conclusion of **every step** per `docs/architecture/22-definition-of-done.md`. There is only ONE `docs/DESIGN.md` in the repository.

---

## 1. System Status & Roadmap Position

- **Architecture Package Version:** 0.4.0
- **Current Phase:** Phase 1 (Deterministic Core)
- **Current Step:** STEP-008 (Engine: Sensitivity Analysis)
- **Actual Implementation Status:** Implementation Complete & Fully Verified; Awaiting Formal Owner Acceptance (Pure financial calculation engine in `packages/calc-engine`; deterministic sensitivity analysis under FR-008; declared sensitivity drivers strictly allow-listed to FR-006 scenario parameters `units`, `listPriceMinor`, and `costVariancePercent`; one-at-a-time lower ($D_i^-$) and upper ($D_i^+$) perturbations preserving all other baseline parameters; strict fail-closed boundary handling with typed `CalcInputValidationError` and `CalcOverflowError` rather than silent clamping; primary sensitivity metric total scenario net contribution in integer minor units; absolute impact score $I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$; deterministic ranking descending by impact score with secondary tie-breaking by UTF-16 code-point order (`costVariancePercent` < `listPriceMinor` < `units`); exact decimal arithmetic for cost variance perturbations via `Rational`; deterministic canonical audit trace with bit-for-bit reproducibility; deep immutability via `deepFreeze`; 21 independently hand-derived golden fixture cases across all 4 synthetic Rule Packs in `fixtures/calc-engine/golden-sensitivity-cases.json`; 653/653 Tests Passed across 42 test files, 320 tests in `packages/calc-engine` across 17 test files, 100% Statements / 100% Branches / 100% Functions / 100% Lines coverage achieved in `packages/calc-engine` (1,675/1,675 stmts, 464/464 branches, 43/43 functions, 1,675/1,675 lines); next step STEP-009 strictly unauthorized until explicit repository-owner instruction)
- **Strategic Alignment:** Long-term product vision, competitive differentiation, customer segmentation, 6-pillar capability framework, and repository alignment documented in [product-strategy.md](product-strategy.md) (Canonical Master Product Vision & Strategy).
- **Next Proposed Step:** STEP-009 (Differential Reference Check) — strictly unauthorized until explicit repository-owner review and written authorization.

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

| Package Name              | Location               | Responsibility & Scope                                                               | Current Package Status                                                                                                                                                                                                                  |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@nimphy/domain`**      | `packages/domain`      | Pure domain types, value objects, branded primitives, scenario contracts, errors     | **Complete & hardened; 0 workspace dependencies; 0 external dependencies; 167 tests across 10 test files; 100% Stmt / 100% Br / 100% Func / 100% Line Cov (903/903 stmts, 366/366 br)**                                                 |
| **`@nimphy/calc-engine`** | `packages/calc-engine` | Pure financial calculation engine (P-01: zero I/O, zero AI, exact rational math)     | **Complete & hardened; depends only on `@nimphy/domain`; zero I/O, zero AI; 320 tests across 17 test files; 100% Stmt / 100% Br / 100% Func / 100% Line Cov (1,675/1,675 stmts, 464/464 branches, 43/43 functions, 1,675/1,675 lines)** |
| **`@nimphy/rules`**       | `packages/rules`       | Rule Pack schema, synthetic loader, date-based selection, cryptographic content hash | **Complete & frozen v1 schema (hardened); depends only on `@nimphy/domain`; zero external deps; 106 tests across 10 test files; 99.84% Stmt / 98.16% Br / 100% Func / 99.84% Line Cov (1,239/1,241 stmts, 374/381 br)**                 |
| **`@nimphy/ai`**          | `packages/ai`          | Narrative memo synthesis, provider ports, schema validation                          | Package stub; depends only on `@nimphy/domain`                                                                                                                                                                                          |
| **`@nimphy/documents`**   | `packages/documents`   | Dossier assembly and Markdown/PDF document generation                                | Package stub; depends only on `@nimphy/domain`                                                                                                                                                                                          |
| **`@nimphy/payments`**    | `packages/payments`    | PayPal port, payment state machine, webhook processing                               | Package stub; depends only on `@nimphy/domain`                                                                                                                                                                                          |
| **`@nimphy/persistence`** | `packages/persistence` | PostgreSQL client, schema migrations, repositories                                   | Package stub; depends only on `@nimphy/domain`                                                                                                                                                                                          |
| **`@nimphy/web`**         | `apps/web`             | Next.js App Router application shell and UI                                          | App shell with layout, styling, disclaimer banner, smoke tests (2 tests passed)                                                                                                                                                         |

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
│   │   ├── golden-break-even-cases.json   # 21 hand-derived golden fixture cases for break-even economics
│   │   ├── golden-per-unit-cases.json     # 32 hand-derived golden fixture cases for per-unit economics
│   │   ├── golden-scenario-cases.json     # 25 hand-derived golden fixture cases for scenario totals
│   │   └── golden-sensitivity-cases.json  # 21 hand-derived golden fixture cases for sensitivity analysis
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
│   │   ├── step-05-per-unit-economics.md  # Detailed STEP-005 implementation record
│   │   ├── step-06-scenarios-and-totals.md# Detailed STEP-006 implementation record
│   │   ├── step-07-break-even.md          # Detailed STEP-007 implementation record
│   │   └── step-08-sensitivity.md         # Detailed STEP-008 implementation record
│   ├── interviews/
│   │   ├── step-01-project-scaffolding.md # STEP-001 technical interview preparation
│   │   ├── step-02-docs-and-boundaries.md # STEP-002 technical interview preparation
│   │   ├── step-03-domain-primitives.md   # STEP-003 technical interview preparation (18 senior topics)
│   │   ├── step-04-rule-pack-schema-and-loader.md # STEP-004 technical interview preparation (8 senior topics)
│   │   ├── step-05-per-unit-economics.md  # STEP-005 technical interview preparation (10 senior topics)
│   │   ├── step-06-scenarios-and-totals.md# STEP-006 technical interview preparation (7 senior topics)
│   │   ├── step-07-break-even.md          # STEP-007 technical interview preparation (11 senior topics)
│   │   └── step-08-sensitivity.md         # STEP-008 technical interview preparation (7 senior topics)
│   └── notes/
│       ├── step-01-project-scaffolding.md # STEP-001 engineering reference notes
│       ├── step-02-docs-and-boundaries.md # STEP-002 engineering reference notes
│       ├── step-03-domain-primitives.md   # STEP-003 engineering reference notes (Hardened)
│       ├── step-04-rule-pack-schema-and-loader.md # STEP-004 engineering reference notes
│       ├── step-05-per-unit-economics.md  # STEP-005 engineering reference notes
│       ├── step-06-scenarios-and-totals.md# STEP-006 engineering reference notes
│       ├── step-07-break-even.md          # STEP-007 engineering reference notes
│       └── step-08-sensitivity.md         # STEP-008 engineering reference notes
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
│   │       │   └── golden.test.ts         # Parity tests against 32 per-unit golden cases (33 registered Vitest tests)
│   │       ├── math/
│   │       │   ├── rational.ts            # BigInt rational arithmetic & ADR-005 rounding
│   │       │   ├── rational.test.ts       # Rational unit tests (31 tests)
│   │       │   └── index.ts
│   │       ├── per-unit/
│   │       │   ├── per-unit-calc.ts       # calculatePerUnitEconomics pure function
│   │       │   ├── per-unit-calc.test.ts  # Per-unit economics unit & boundary tests (38 tests)
│   │       │   ├── trace.test.ts          # Deterministic trace tests (4 tests)
│   │       │   ├── types.ts               # Structural CalcRulePack and trace interfaces
│   │       │   └── index.ts
│   │       ├── scenarios/
│   │       │   ├── determinism.test.ts    # Canonical JSON equality and scenario independence tests (4 tests)
│   │       │   ├── golden-scenarios.test.ts # Fixture runner for 25 hand-derived golden scenario cases (26 executed tests across 25 cases)
│   │       │   ├── per-total-regression.test.ts # ADR-005 per_unit vs per_total divergence tests (7 tests)
│   │       │   ├── properties.test.ts     # Property-based testing with Mulberry32 PRNG (6 tests)
│   │       │   ├── scenario-calc.ts       # calculateSingleScenario, calculateTriadScenarios, evaluateScenarioOrdering
│   │       │   ├── scenario-calc.test.ts  # Unit, boundary, overflow, trace, and rounding tests (39 executed tests across 33 source declarations)
│   │       │   ├── types.ts               # Input, trace, result, and ordering contracts
│   │       │   └── index.ts
│   │       ├── break-even/
│   │       │   ├── break-even-calc.ts     # calculateBreakEven pure function
│   │       │   ├── break-even-calc.test.ts # Unit, boundary, overflow, and trace tests (26 tests)
│   │       │   ├── golden-break-even.test.ts # Parity runner for 21 golden break-even cases (22 tests)
│   │       │   ├── properties.test.ts     # Property-based testing with Mulberry32 PRNG (5 tests)
│   │       │   ├── types.ts               # Input, result, unreachable reason, and trace types
│   │       │   └── index.ts
│   │       ├── sensitivity/
│   │       │   ├── sensitivity-calc.ts    # calculateSensitivity pure function
│   │       │   ├── sensitivity-calc.test.ts # Unit, boundary, overflow, sign, tie, and trace tests (37 tests)
│   │       │   ├── golden-sensitivity.test.ts # Parity runner for 21 golden sensitivity cases (22 tests)
│   │       │   ├── properties.test.ts     # Property-based testing with Mulberry32 PRNG (4 tests)
│   │       │   ├── types.ts               # Input, driver configs, results, and trace types
│   │       │   └── index.ts
│   │       ├── index.ts                   # Public barrel entrypoint
│   │       └── index.test.ts              # Public API barrel integration tests (9 tests)
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
│   │       ├── types.ts                   # ScenarioName, BookFormat, MarketplaceKey, ScenarioParameters, ScenarioTotals
│   │       ├── types.test.ts              # Shared domain enum and scenario contract tests (7 tests)
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
│   ├── step-05.md                         # Canonical STEP-005 implementation prompt archive
│   ├── step-06.md                         # Canonical STEP-006 implementation prompt archive
│   ├── step-07.md                         # Canonical STEP-007 implementation prompt archive
│   └── step-08.md                         # Canonical STEP-008 implementation prompt archive
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
- **ADR-005 (Money as integer minor units; rounding in Rule Packs):** Status: **Accepted** — repository owner approved 2026-11-12. Implemented in `@nimphy/domain` and `@nimphy/calc-engine`. `Money` represents amounts strictly as integer minor units with ISO-4217 currency codes; zero floats; exact BigInt rational arithmetic via `Rational` class; four formal rounding modes (`round_half_up`, `round_half_even`, `round_down`, `round_up`); proportional ebook delivery cost without integer-MB ceiling via `fileSizeMb: string`; two-stage rounding sequence for `per_unit` (gross royalty rounded, fractional cost rounded with same mode, contribution by subtraction) and deferred rounding for `per_total` (unrounded `Rational`s preserved and scaled by $Q$ before separate component rounding in STEP-006 multi-unit aggregation).
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
8. **Shared Domain Enums & Scenario Types (`packages/domain/src/types.ts`):**
   - `ScenarioName`: `'low' | 'base' | 'high'` (runtime-frozen via `SCENARIO_NAMES`).
   - `BookFormat`: `'ebook' | 'paperback' | 'hardcover'` (runtime-frozen via `BOOK_FORMATS`).
   - `ScenarioParameters`: `units`, `listPriceMinor`, `costVariancePercent`.
   - `ScenarioTotals`: `units`, `revenueMinor`, `grossRoyaltyMinor`, `applicableCostMinor`, `netContributionMinor`, `currency`, `isIllustrative`.
   - Type guards: `isScenarioParameters`, `isScenarioTotals`.
   - Illustrative disclaimer constant: `SCENARIO_DISCLAIMER_TEXT`.
9. **Package Documentation & Public Exports:**
   - Authored and updated `packages/domain/README.md`.
   - Updated `packages/domain/src/index.ts` to export the approved public API including scenario contracts.
   - `packages/domain/src/index.test.ts` and `types.test.ts` verify all root and submodule barrel re-exports.

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

## 9. Completed Work in STEP-006 (Engine: Scenarios and Totals)

1. **Multi-Unit Scenario Aggregation Contracts (Accepted ADR-005):**
   - **`per_total` Aggregation:**
     - Scales exact rational per-unit royalty and varied applicable cost by integer quantity $Q$:
       $$\text{exactTotalRoyalty} = \text{exactGrossRoyalty} \times Q$$
       $$\text{exactTotalCost} = \text{exactApplicableCostVaried} \times Q$$
     - Rounds aggregate royalty and cost independently, exactly once, using the Rule Pack's declared `rounding.mode`:
       $$\text{totalRoyalty} = \text{round}(\text{exactTotalRoyalty}, \text{mode})$$
       $$\text{totalCost} = \text{round}(\text{exactTotalCost}, \text{mode})$$
     - Derives total contribution by subtraction after rounding:
       $$\text{totalContribution} = \text{totalRoyalty} - \text{totalCost}$$
     - Proves and tests that separate component rounding guarantees ledger consistency and prevents off-by-one balance sheet errors.
   - **`per_unit` Aggregation:**
     - Multiplies already-rounded integer minor-unit per-unit royalty and applicable cost by integer quantity $Q$:
       $$\text{totalRoyalty} = R_{\text{unit}} \times Q, \quad \text{totalCost} = C_{\text{unit}} \times Q$$
     - Derives total contribution by subtraction without secondary rounding.
   - **Mathematical Divergence Verification:**
     - Tested and documented mathematical divergence on fractional minor-unit royalties and delivery costs.
2. **Scenario Parameter Modeling & Cost Variance (FR-006):**
   - Independent parameterization of `low`, `base`, and `high` scenarios by:
     - `units`: Units sold (non-negative safe integer).
     - `listPriceMinor`: Minor-unit list price within Rule Pack limits.
     - `costVariancePercent`: Exact decimal string representing percentage variance on Rule Pack per-unit production/distribution cost.
   - Cost variance multiplier formula:
     $$M = \frac{100 + \text{costVariancePercent}}{100} = 1 + \frac{\text{costVariancePercent}}{100}$$
     $$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$
   - Enforces bounds $\text{costVariancePercent} \ge -100\%$ with `CalcInputValidationError`.
   - Public contract strictly mandates exact decimal string `costVariancePercent?: string`; rejects JSON numbers, explicit null, empty, malformed, and scientific notation strings; omitted values default to `"0"`.
3. **Scenario Independence & Monotonic Ordering Evaluation:**
   - Pure function `calculateTriadScenarios(input, rulePack)` evaluates each scenario independently from its own inputs.
   - Pure function `evaluateScenarioOrdering(triad)` evaluates whether:
     $$\text{low.totalContribution} \le \text{base.totalContribution} \le \text{high.totalContribution}$$
   - Faithfully preserves user input parameters and calculated values; never silently reorders scenarios.
4. **Boundary & Overflow Protection (ADR-005 Compliant):**
   - Handled zero units sold ($Q = 0$) producing exact zero financial totals while preserving per-unit economics and audit trace.
   - Pre-computation guard on retail revenue: $\text{listPriceMinor} \times Q \le \text{MAX\_SAFE\_INTEGER}$ via BigInt bounds.
   - **For `per_total`:** Preserves exact adjusted per-unit cost as an unaggregated Rational without premature safe integer rejection. Scales by $Q$ using Rational arithmetic, rounds aggregate cost once, and validates resulting rounded aggregate Money against both safe-integer bounds. When $Q = 0$, aggregate cost is exactly zero and succeeds without error. Raises `CalcOverflowError` only when the monetary result being materialized exceeds the supported range.
   - **For `per_unit`:** Retains separate checks for rounded per-unit Money (`roundedUnitCostBig` against `MAX_SAFE_INTEGER`) and aggregate Money ($\text{unitCostMinor} \times Q$ against `MAX_SAFE_INTEGER`).
5. **Deterministic Calculation Trace, Deep Immutability & Illustrative Disclaimers (P-04, P-07):**
   - Detailed `ScenarioCalculationTrace` capturing engine version, rule pack reference, input parameters, per-unit summary, aggregation parameters, intermediate rational fractions, and rounding operations.
   - Zero timestamps, zero random identifiers; serializes to bit-for-bit identical canonical JSON across repeated runs.
   - Deep runtime immutability: all results, scenario totals, traces, trace steps, and rounding-operation entries are recursively frozen (`Object.isFrozen`). Mutation attempts fail with `TypeError` in strict mode.
   - Enforces `isIllustrative: true` and `disclaimer: SCENARIO_DISCLAIMER_TEXT` on both single-scenario and triad calculation results.
   - Domain contract reconciliation: `ScenarioParameters` represents the self-contained entity requiring `scenarioName`, while `SingleScenarioInput` extends it directly. `ScenarioParametersInput` in `CaseScenariosInput` permits optional `scenarioName` where triad record keys (`low`, `base`, `high`) govern naming responsibility.
6. **Hand-Derived Scenario Golden Fixtures (`fixtures/calc-engine/golden-scenario-cases.json`):**
   - 25 hand-derived golden scenario cases across all 4 synthetic Rule Packs:
     - 10 Ebook cases (including zero units, proportional delivery fees, and cost variance).
     - 6 Paperback US v1 cases (including negative contribution scenarios and high unit volumes).
     - 4 Paperback US v2 cases (successor pricing window with 120 base cost).
     - 5 Hardcover Global v1 cases (EUR currency, `round_down`, `per_total` aggregation).
7. **Exhaustive Testing & 100% Branch Coverage:**
   - 82 executed tests across 5 test files in `packages/calc-engine/src/scenarios/` (52 source-level test declarations):
     - `scenario-calc.test.ts`: 39 executed tests (across 33 source declarations, including 8 parameterized rounding tests across 4 rounding modes for both `per_unit` and `per_total`, plus 5 monetary integrity boundary tests) covering validation, strict whitespace rejection (`" 10 "`, `"\t10"`), safe-integer overflows, zero units, deep freezing of steps/rounding operations, rational overflow precision regression, per_total zero-unit regression, and README example parity.
     - `golden-scenarios.test.ts`: 26 executed tests (across 2 source declarations) verifying fixture parity against 25 golden cases.
     - `per-total-regression.test.ts`: 7 executed tests (7 source declarations) demonstrating ADR-005 divergence, separate component rounding, 4-mode rounding, and ADR-005 overflow contract enforcement.
     - `properties.test.ts`: 6 executed tests (6 source declarations) property-based suites with Mulberry32 PRNG.
     - `determinism.test.ts`: 4 executed tests (4 source declarations) determinism and canonical JSON equality tests.
   - Added tests in `@nimphy/domain/src/types.test.ts` and in `index.test.ts`.
   - Added 7 focused tests in `packages/calc-engine/src/per-unit/per-unit-calc.test.ts` (suite expanded from 31 to 38 tests) verifying Check A, Check B, Check C, boundary conditions, and deferred Money construction.
   - Total `@nimphy/calc-engine`: 202 tests across 11 test files (all 202 passing).
   - Coverage Exclusion Clarification: No production source module is excluded through `vitest.config.ts`. Exclusions in `vitest.config.ts` are strictly limited to test suites (`**/*.test.ts`) and pure type definition files (`packages/calc-engine/src/per-unit/types.ts` and `packages/calc-engine/src/scenarios/types.ts`) with zero runtime code, zero functions, and zero executable statements. In production code, two defensive overflow-guard blocks in `packages/calc-engine/src/scenarios/scenario-calc.ts` (guarding aggregate net contribution calculations against safe-integer overflow for both `per_total` and `per_unit`) are explicitly excluded through V8 annotations (`/* v8 ignore start */ ... /* v8 ignore stop */`). Both guards are mathematically unreachable because prior checks bound the respective non-negative royalty and cost aggregates ($0 \le R, C \le \text{MAX\_SAFE\_INTEGER}$), ensuring $R - C \in [-\text{MAX\_SAFE\_INTEGER}, \text{MAX\_SAFE\_INTEGER}]$, which strictly lies within safe-integer bounds. Reported 100% coverage refers to instrumented executable code and does not include those ignored branches. 100% instrumented branch coverage is verified across all instrumented production code.
   - Coverage Reconciliation & Verified Production Metrics:
     - `packages/calc-engine` (Current STEP-006 Measured): **100% Statements (1,369/1,369), 100% instrumented Branches (354/354), 100% Functions (39/39), 100% Lines (1,369/1,369)** across all 9 production modules.
     - Historical & Interim Metric Reconciliation:
       - `342/342` stmts was a historical STEP-005 metric measuring the per-unit economics engine alone prior to multi-unit scenario calculation and totals modeling.
       - `536/536` was an unverified interim estimate, not a measured coverage result.
       - Neither `342/342` nor `536/536` represents verified STEP-006 current coverage.
     - Entire monorepo (Current Measured): **99.94% Statements (3,511/3,513), 99.36% Branches (1,094/1,101), 100% Functions (167/167), 99.94% Lines (3,511/3,513)** (threshold: 95%).
8. **Supporting Overflow-Safety & Arithmetic Corrections in `per-unit-calc.ts`:**
   - In support of the STEP-006 scenario aggregation contract and end-to-end safe integer guarantees, `packages/calc-engine/src/per-unit/per-unit-calc.ts` was audited and updated with supporting functional calculation refinements:
     - **Check A (Rounded Production Cost Overflow):** Explicitly validates `roundedCostBig` against `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]` before casting to `Number` and constructing `Money.of`, raising typed `CalcOverflowError` if exceeded.
     - **Check B (Integer Production Cost Overflow):** Explicitly validates `exactCostBig` against safe-integer bounds for exact integer per-unit costs, raising typed `CalcOverflowError` if exceeded.
     - **Check C (BigInt Net Contribution Calculation):** Replaced `grossRoyaltyMoney.subtract(applicableCostMoney)` with exact BigInt subtraction `roundedGrossBig - BigInt(finalCostMinor)` followed by safe-integer range validation and `Money.of(netContributionMinor, currency)`. Guarantees typed `CalcOverflowError` rather than domain `MoneyOverflowError` on overflow, and preserves exact arithmetic for all valid inputs.
     - **Removal of Premature Delivery Cost Check:** Removed the legacy pre-rounding check on `exactApplicableCost.numerator > MAX_SAFE_INTEGER` in delivery cost, aligning delivery cost with gross royalty and print cost. This allows exact rational costs to be preserved under `per_total` without premature rejection.
     - **Deferred Money Construction under `per_total`:** When `roundingPolicy.point === 'per_total'`, if exact integer per-unit cost exceeds `Number.MAX_SAFE_INTEGER`, `applicableCostMoney` and `costBreakdown.totalCostMinor` are set to `null` rather than attempting unsafe `Money.of` materialization, while preserving the exact rational cost in `exactApplicableCost`. This enables scenario aggregation to scale the exact rational by quantity $Q$ (succeeding with zero aggregate cost when $Q = 0$, and throwing `CalcOverflowError` when aggregate cost overflows).
9. **Package Documentation & Public Exports:**
   - Authored `packages/calc-engine/README.md` providing architectural principles, ADR-005 aggregation contracts, mathematical formulations, and API reference.
   - Re-exported scenario calculation functions from `@nimphy/calc-engine` and scenario domain types from `@nimphy/domain`.

---

## 10. Completed Work in STEP-007 (Engine: Break-Even)

1. **Pure Financial Calculation Engine Module (`packages/calc-engine/src/break-even/`):**
   - Pure function `calculateBreakEven(input: BreakEvenInput, rulePack: CalcRulePack): BreakEvenResult`.
   - Zero I/O, zero network, zero AI imports, zero clocks/randomness (Principle P-01: Deterministic core, probabilistic edge).
   - Operates strictly in minor monetary units and exact BigInt rational numbers; zero floating-point arithmetic.
2. **Five Mandatory Financial-Contract Invariants (Resolved & Documented):**
   - **Contract A (Fixed-Cost Input Contract):** `fixedCost: Money` passed explicitly as a standalone argument within `BreakEvenInput`. Fixed cost is NOT added to `ScenarioParameters`, `ScenarioTotals`, the Rule Pack schema, or database schemas.
   - **Contract B (Unit-Contribution Semantics):** Baseline unit economics derived under the Rule Pack via `calculatePerUnitEconomics(input, rulePack)`, scaled by cost variance multiplier $M = 1 + \text{costVariancePercent} / 100$. Unit contribution is NEVER derived by dividing scenario totals by quantity, preserving precision for zero-quantity scenarios and preventing distortion under `per_total`.
   - **Contract C (`per_unit` vs `per_total` Interaction):** Under `per_unit`, unit contribution uses already-rounded integer minor units ($R_{\text{unit}} - C_{\text{unit}}$). Under `per_total`, exact rational differences ($\text{exactGrossRoyalty} - \text{exactApplicableCostVaried}$) are preserved. In both cases, exact BigInt ceiling division:
     $Q_{\text{be}} = \left\lceil \frac{\text{FixedCost}}{\text{ExactUnitContribution}} \right\rceil$
     evaluates the formula-defined quantity required by the roadmap. The documentation explicitly distinguishes this formula-defined quantity from the minimum quantity that covers fixed cost under independently rounded aggregate ledger components. For non-negative aggregate amounts and integer fixed costs, `round_half_up`, `round_down`, and `round_up` preserve the integer-shift property ($\text{round}(x + F) = \text{round}(x) + F$) needed for the coverage argument. `round_half_even` is the demonstrated exception because tie-breaking depends on the parity of the integer part, which can flip under an odd integer fixed cost (e.g., exact royalty 2.5, exact cost 1.5, contribution 1.0, fixed cost 1, $Q_{\text{be}}=1$, but rounded ledger contribution is 0). `round_down` is not classified as an unsafe mode based on this counterexample, nor is disallowing it recommended without a valid independent counterexample. The current schema permits all four rounding modes with `per_total`, and universal ledger coverage across all possible configurations is not claimed unless formally established.
   - **Contract D (Break-Even Revenue Definition):** Approved definition $\text{Revenue}_{\text{be}} = \text{listPriceMinor} \times Q_{\text{be}}$ as `Money`. Precise semantic meaning: gross retail sales revenue at the whole-unit, formula-defined break-even threshold (not author royalty income, publisher proceeds, or net profit), consistent with the existing scenario engine's revenue calculation.
   - **Contract E (Explicit Unreachable Result Contract):** Discriminated union on `reachable: boolean`. When `reachable: false`, `reason` is `'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION'` and `units` and `revenue` fields are completely omitted from the type contract (preventing misleading zero-unit break-even representations or fabricated monetary values).
3. **Zero Fixed-Cost and Boundary Semantics:**
   - When $F = 0$ and $U > 0$, break-even is reachable with $Q_{\text{be}} = 0$ units and $\text{Revenue}_{\text{be}} = \$0.00$.
   - When $F = 0$ and $U \le 0$, break-even remains explicitly unreachable (`ZERO_CONTRIBUTION` or `NEGATIVE_CONTRIBUTION`).
4. **Safe-Integer Arithmetic & Overflow Protection:**
   - All ceiling arithmetic executed using native `BigInt` integer division and remainder.
   - Exact pre-materialization guards against safe-integer overflow on units ($Q_{\text{be}} > \text{Number.MAX\_SAFE\_INTEGER}$) and revenue ($\text{listPriceMinor} \times Q_{\text{be}} > \text{Number.MAX\_SAFE\_INTEGER}$), raising typed `CalcOverflowError`.
5. **Deterministic Calculation Trace & Deep Immutability:**
   - `BreakEvenCalculationTrace` records input validation, unit economics, cost variance scaling, ceiling division, and result derivation.
   - Bit-for-bit canonical JSON reproducibility (`toCanonicalJson`).
   - Deep recursive freezing (`deepFreeze`) on all results, traces, and trace steps.
6. **Hand-Derived Golden Fixtures (`fixtures/calc-engine/golden-break-even-cases.json`):**
   - 21 independently hand-derived golden fixture cases across all 4 synthetic Rule Packs:
     - 7 Ebook cases (USD, zero fixed cost, fractional delivery fees, positive variance, negative contribution).
     - 5 Paperback US v1 cases (USD, negative contribution, high fixed cost, whole-dollar pricing).
     - 4 Paperback US v2 cases (USD, successor cost window, fractional contribution, positive cost variance).
     - 5 Hardcover Global v1 cases (EUR, `round_down`, `per_total`, exact rational contribution, zero fixed cost).
7. **Exhaustive Testing & 100% Branch Coverage:**
   - Precise breakdown of tests added in STEP-007:
     - 26 break-even calculation tests (`break-even-calc.test.ts`: comprehensive unit, boundary, zero fixed-cost, overflow, and trace tests).
     - 22 golden break-even tests (`golden-break-even.test.ts`: 1 inventory check + 21 golden case parity verifications).
     - 5 break-even property tests (`properties.test.ts`: property-based suites with Mulberry32 PRNG for monotonicity, threshold coverage, optimality, determinism, and revenue consistency).
     - 1 newly added README barrel-verification test (`index.test.ts`: static compile-time and runtime verification of README break-even example).
   - That is 53 break-even-specific tests plus one new barrel-verification test. The reported overall totals remain 256 calc-engine tests and 589 monorepo tests.
   - Package total: 256 tests across 14 test files in `@nimphy/calc-engine`.
   - Monorepo total: 589 tests across 39 test files.
   - 100% Statement, 100% instrumented Branch, 100% Function, 100% Line coverage maintained in `@nimphy/calc-engine`.

---

## 11. Completed Work in STEP-008 (Engine: Sensitivity Analysis)

1. **Pure Financial Calculation Engine Module (`packages/calc-engine/src/sensitivity/`):**
   - Pure function `calculateSensitivity(input: SensitivityAnalysisInput, rulePack: CalcRulePack): SensitivityAnalysisResult`.
   - Zero I/O, zero network, zero AI imports, zero clocks/randomness (Principle P-01: Deterministic core, probabilistic edge).
   - Reuses `calculateSingleScenario` for all financial totals; preserves exact rational arithmetic and ADR-005 aggregation semantics without formula duplication.
2. **Declared Sensitivity Driver Allow-List (FR-006 / FR-008):**
   - Strictly bounded to FR-006 scenario parameters: `'units'`, `'listPriceMinor'`, `'costVariancePercent'`.
   - Rejects unapproved structural dimensions (format, pages, currency, marketplace) with typed `CalcInputValidationError`.
   - Rejects duplicate drivers or empty driver lists.
   - Enforces domain-appropriate perturbation representations:
     - `units`: positive safe integer.
     - `listPriceMinor`: positive safe integer in minor currency units.
     - `costVariancePercent`: positive exact decimal string ($\le 50$ characters, rejecting empty or excessively long inputs before rational parsing).
3. **One-at-a-Time Perturbation Model:**
   - Evaluates a valid baseline scenario via `calculateSingleScenario`.
   - For each driver $D_i$ with perturbation $\Delta_i$, computes lower ($D_i - \Delta_i$) and upper ($D_i + \Delta_i$) scenarios.
   - Unchanged scenario parameters are strictly preserved across evaluations.
   - Exact decimal string arithmetic for cost variance perturbations via `Rational.fromDecimalString()`, guaranteeing zero IEEE 754 floating-point drift.
4. **Strict Boundary Handling & Fail-Closed Validation:**
   - Perturbed inputs are never silently clamped to boundaries or replaced.
   - Out-of-bounds perturbations (negative units $< 0$, list price outside Rule Pack floor/ceiling, cost variance $< -100\%$, arithmetic overflow $> \text{MAX\_SAFE\_INTEGER}$) fail explicitly with `CalcInputValidationError` or `CalcOverflowError`.
5. **Primary Metric, Impact Score, and Deterministic Ranking:**
   - Primary sensitivity metric is **total scenario net contribution** in integer minor currency units.
   - For each driver $D_i$:
     $$\Delta_i^- = \text{Contribution}_i^- - \text{Contribution}_{\text{base}}$$
     $$\Delta_i^+ = \text{Contribution}_i^+ - \text{Contribution}_{\text{base}}$$
     $$I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$$
   - Deterministic ranking:
     1. Primary: Impact score $I_i$ descending.
     2. Secondary (Deterministic Tie-Break): Driver identifier ascending via UTF-16 code-point order (`costVariancePercent` < `listPriceMinor` < `units`).
   - Ranking is completely invariant to driver input order.
6. **Deterministic Canonical Audit Trace & Deep Immutability:**
   - `SensitivityCalculationTrace` records engine version, rule pack reference and hash, baseline summary, driver configurations, lower/upper scenario runs with deltas, impact scores, and tie-breaking decisions.
   - Bit-for-bit canonical JSON reproducibility (`toCanonicalJson`); zero timestamps, zero random UUIDs.
   - Deep recursive freezing (`deepFreeze`) on all returned result objects, driver result arrays, scenario summaries, and trace trees.
   - Driver objects are cloned before inclusion in `declaredDrivers` (`input.drivers.map((driver) => ({ ...driver }))`) to preserve caller object ownership and prevent freezing caller-owned inputs.
7. **Hand-Derived Golden Fixtures (`fixtures/calc-engine/golden-sensitivity-cases.json`):**
   - 21 independently hand-derived golden fixture cases across all 4 synthetic Rule Packs:
     - 7 Ebook cases (USD, delivery fee variations, price sensitivity, volume sensitivity).
     - 5 Paperback US v1 cases (USD, wholesale print cost sensitivity, tie-breaking, asymmetric impacts).
     - 4 Paperback US v2 cases (USD, successor cost window, fractional contribution sensitivities).
     - 5 Hardcover Global v1 cases (EUR, `round_down`, `per_total` exact rational contribution sensitivities).
8. **Exhaustive Testing & 100% Branch Coverage:**
   - 65 sensitivity-specific tests plus 1 updated barrel integration test:
     - 39 sensitivity calculation unit tests (`sensitivity-calc.test.ts`: validation, decimal length boundaries, caller object immutability, boundaries, overflow, analytic sign checks, tie-break invariants, immutability).
     - 22 golden sensitivity tests (`golden-sensitivity.test.ts`: 1 inventory check + 21 golden case parity verifications).
     - 4 sensitivity property tests (`properties.test.ts`: Mulberry32 PRNG suites for determinism, parameter preservation, monotonic ranking, and scenario parity).
     - 1 updated README barrel integration test in `index.test.ts`.
   - Package total: 322 tests across 17 test files in `@nimphy/calc-engine`.
   - Monorepo total: 655 tests across 42 test files.
   - 100% Statement, 100% Branch, 100% Function, and 100% Line coverage maintained across `packages/calc-engine`.
   - Automated CI workflow `.github/workflows/ci.yml` upgraded to execute `pnpm test:coverage` to enforce coverage thresholds in remote verification.

---

## 12. Verification Results

### A. Local Checks Executed & Passed Directly

| Verification Suite            | Exact Command                                 | Result       | Details                                                                                                                                               |
| ----------------------------- | --------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependency Installation**   | `pnpm install --frozen-lockfile`              | **Passed**   | 9 workspace projects linked; store clean and reproducible                                                                                             |
| **Git Hook Setup**            | `pnpm setup:hooks`                            | **Passed**   | `core.hooksPath` configured to `.githooks` locally                                                                                                    |
| **Calc-Engine Typecheck**     | `pnpm --filter @nimphy/calc-engine typecheck` | **Passed**   | `@nimphy/calc-engine` typecheck succeeded (`tsc --noEmit`); 0 errors                                                                                  |
| **Workspace TypeScript**      | `pnpm typecheck`                              | **Passed**   | 8 workspace projects checked (`pnpm -r run typecheck`); 0 errors                                                                                      |
| **Code Linting**              | `pnpm lint`                                   | **Passed**   | ESLint 10 with local `@nimphy` plugin; 0 errors, **0 warnings**                                                                                       |
| **Prettier Formatting Check** | `pnpm format:check`                           | **Passed**   | All matched files use Prettier code style                                                                                                             |
| **Documentation Validation**  | `pnpm docs:check`                             | **Passed**   | 23 docs present, 94 links verified, 22 ADR statuses confirmed                                                                                         |
| **Architecture Boundaries**   | `pnpm boundaries:check`                       | **Passed**   | 91 source files checked, 331 import declarations verified; `@nimphy/calc-engine` depends only on `@nimphy/domain`                                     |
| **Full Vitest Test Suite**    | `pnpm test`                                   | **Passed**   | Vitest 3.0.8, 42 test files, **655/655 tests passed** (0 failed, 0 skipped; 322 tests in calc-engine across 17 test files)                            |
| **V8 Code Coverage**          | `pnpm test:coverage`                          | **Passed**   | **packages/calc-engine: 100% Stmts / 100% Br / 100% Func / 100% Lines**; monorepo: 99.95% Stmts, 99.44% Br, 100% Funcs, 99.95% Lines (threshold: 95%) |
| **Production Web Build**      | `pnpm build`                                  | **Passed**   | `@nimphy/web` Next.js Turbopack build succeeded with 0 errors; static prerender succeeded                                                             |
| **Git Whitespace Check**      | `git diff --check`                            | **Passed**   | Whitespace and patch integrity check; 0 whitespace or line ending errors reported                                                                     |
| **Working Tree Status**       | `git status --short`                          | **Verified** | Modified and untracked STEP-008 files preserved uncommitted awaiting engineering review                                                               |

---

## 13. Open Issues & Dependency Warnings

1. **ESLint Plugin Peer Dependencies:** Transitive plugins declare peer dependency compatibility up to ESLint 9 (`^8.0.0 || ^9.0.0`), while ESLint `10.14.0` is installed. Our custom local plugin operates natively without third-party dependencies, and all linting executes with 0 runtime errors and 0 warnings.
2. **Deprecated Transitive Package:** `whatwg-encoding` was noted as deprecated in transitive `jsdom` dependencies. Managed upstream by `jsdom`.

---

## 14. Next Proposed Step & Roadmap Reconciliation (Awaiting Authorization)

**STEP-009: Differential Reference Check (Proposed — Strictly Unauthorized)**

- **Status:** Proposed next engineering step; strictly unauthorized until explicit repository-owner review and written approval per `AGENTS.md` §3 ("Step-by-Step Discipline: Implement only the step explicitly authorized by the user. Do not anticipate or partially implement future steps").
- **STEP-008 Reconciliation Status:**
  - STEP-008 implementation reported complete.
  - Deterministic sensitivity analysis engine implemented and hardened in `packages/calc-engine`.
  - Formal owner acceptance is pending; owner acceptance is NOT claimed.
- **Authoritative Roadmap Sequence (per `docs/architecture/17-implementation-roadmap.md`):**
  - **STEP-007 — Engine: Break-even** (Accepted)
  - **STEP-008 — Engine: Sensitivity** (Current — Complete & Fully Verified; Awaiting Formal Owner Acceptance)
  - **STEP-009 — Differential Reference Check** (Next — Strictly Unauthorized)
  - **STEP-010 — Database Foundation**
- **STEP-009 Scope (Authoritative Roadmap §STEP-009):**
  - Build differential testing harness comparing `@nimphy/calc-engine` calculations against an independent reference implementation.
  - Generate large-scale random and edge-case inputs.
  - Verify zero financial drift across all supported Rule Packs and rounding modes.
- **Strict Boundary Constraint:** Do not begin STEP-009 until explicitly authorized by the repository owner.
