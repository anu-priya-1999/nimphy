# Implementation Record — STEP-001: Project Scaffolding

- **Step Identifier:** STEP-001
- **Step Name:** Project Scaffolding
- **Phase:** Phase 0 (Foundations)
- **Architecture Package Version:** 0.3.0
- **Status:** Scaffold Implemented & Locally Verified (Documentation Finalized)

---

## A. Objective

The objective of STEP-001 was to establish the foundational monorepo structure, toolchain, dependency graph, application shell, and engineering standards for the Nimphy platform. This encompasses initializing a pnpm workspace, configuring strict TypeScript compilation across all projects, standing up a minimal Next.js 16 application with Tailwind CSS, establishing a headless Vitest test suite with React Testing Library, configuring flat ESLint and Prettier code formatting, writing workspace package stubs that enforce inward-pointing architectural boundaries, creating the GitHub Actions continuous integration workflow, and setting up repository governance (`AGENTS.md` and `docs/DESIGN.md`).

---

## B. Final Repository Structure

The actual file tree on disk resulting from the completion of STEP-001 is structured as follows:

```
nimphy/
├── .editorconfig                          # Editor formatting rules (indent, charset, LF)
├── .env.example                           # Verified template of environment variables
├── .gitattributes                         # Git text handling and LF line ending enforcement
├── .github/
│   └── workflows/
│       └── ci.yml                         # GitHub Actions CI workflow definition
├── .gitignore                             # Ignore rules for build artifacts, env, and dependencies
├── .nvmrc                                 # Pinned Node.js version (24.18.0)
├── .prettierignore                        # Prettier ignore paths (including architecture docs)
├── .prettierrc                            # Prettier configuration
├── AGENTS.md                              # Permanent coding-agent operational instructions
├── README.md                              # Project overview and quickstart guide
├── apps/
│   └── web/                               # Next.js App Router frontend application
│       ├── app/
│       │   ├── globals.css                # Tailwind directives and core styles
│       │   ├── layout.tsx                 # Root HTML layout with viewport metadata
│       │   ├── page.tsx                   # Minimal Nimphy home page with disclaimer banner
│       │   └── page.test.tsx              # Component smoke tests (2 tests)
│       ├── next.config.mjs                # Next.js configuration (reactStrictMode, transpilePackages)
│       ├── package.json                   # Web application manifest (@nimphy/web)
│       ├── postcss.config.mjs             # PostCSS configuration for Tailwind CSS & Autoprefixer
│       ├── tailwind.config.ts             # Tailwind design tokens and content globs
│       └── tsconfig.json                  # TypeScript configuration for web workspace
├── docs/
│   ├── architecture/                      # 23 canonical architecture documents (00 through 22)
│   │   ├── 00-README.md
│   │   ├── 01-executive-summary.md
│   │   ├── 02-product-scope-and-requirements.md
│   │   ├── 03-architecture-principles.md
│   │   ├── 04-system-architecture.md
│   │   ├── 05-component-responsibilities.md
│   │   ├── 06-database-architecture-and-schema.md
│   │   ├── 07-api-architecture.md
│   │   ├── 08-event-schema-and-payment-lifecycle.md
│   │   ├── 09-ai-architecture.md
│   │   ├── 10-frontend-architecture.md
│   │   ├── 11-security-and-privacy-architecture.md
│   │   ├── 12-testing-and-ai-evaluation.md
│   │   ├── 13-deployment-and-infrastructure.md
│   │   ├── 14-local-development.md
│   │   ├── 15-scaling-and-reliability.md
│   │   ├── 16-cost-model.md
│   │   ├── 17-implementation-roadmap.md
│   │   ├── 18-architecture-decision-records.md
│   │   ├── 19-risks-and-mitigations.md
│   │   ├── 20-senior-engineering-interview-preparation.md
│   │   ├── 21-hackathon-and-product-demo.md
│   │   └── 22-definition-of-done.md
│   └── DESIGN.md                          # Single living system design document
├── eslint.config.mjs                      # ESLint flat configuration importing Next.js 16 configs
├── learning/
│   ├── implementation/
│   │   └── step-01-project-scaffolding.md # This implementation record
│   ├── interviews/
│   │   └── step-01-project-scaffolding.md # Step-001 technical interview prep
│   └── notes/
│       └── step-01-project-scaffolding.md # Step-001 engineering reference notes
├── package.json                           # Root monorepo manifest and task orchestration
├── packages/
│   ├── ai/                                # AI prompt building & synthesis stub (@nimphy/ai)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── calc-engine/                       # Pure financial calculation engine stub (@nimphy/calc-engine)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── documents/                         # Dossier assembly & document generator stub (@nimphy/documents)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── domain/                            # Core domain types & branded primitives stub (@nimphy/domain)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── payments/                          # PayPal integration & state machine stub (@nimphy/payments)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── persistence/                       # Database client & repositories stub (@nimphy/persistence)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── rules/                             # Rule pack schema, loader & validation stub (@nimphy/rules)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
├── pnpm-lock.yaml                         # Fully locked, reproducible dependency tree
├── pnpm-workspace.yaml                    # Workspace layout definition (apps/*, packages/*)
├── prompts/
│   └── step-01.md                         # Canonical implementation prompt archive
├── tsconfig.base.json                     # Shared base TypeScript strict compiler settings
├── tsconfig.json                          # Root TypeScript project reference and path aliases
└── vitest.config.ts                       # Monorepo test configuration with jsdom & alias mapping
```

---

## C. Technology Stack

All software tooling and runtime versions were inspected and confirmed against `package.json`, package manifests, and `pnpm-lock.yaml`:

| Technology / Tool         | Verified Version | Installation Level                  | Purpose / Notes                                                     |
| ------------------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------------- |
| **Node.js**               | `24.18.0`        | Environment / `.nvmrc`              | Active LTS; pinned in `.nvmrc` and root `engines` (`>=24.18.0 <25`) |
| **pnpm**                  | `10.34.5`        | Package Manager                     | Monorepo workspace package manager; pinned in `packageManager`      |
| **Next.js**               | `16.4.5`         | `apps/web`                          | Web application framework (App Router with Turbopack)               |
| **React**                 | `19.3.1`         | `apps/web`, Root dev                | Core UI component library                                           |
| **React DOM**             | `19.3.1`         | `apps/web`, Root dev                | DOM rendering bindings for React                                    |
| **TypeScript**            | `5.8.3`          | Root dev, Packages dev              | Static typechecking in strict mode across 8 projects                |
| **ESLint**                | `10.14.0`        | Root dev                            | Code linter using direct flat configuration                         |
| **eslint-config-next**    | `16.4.5`         | Root dev                            | Official Next.js 16 linting configurations                          |
| **Tailwind CSS**          | `3.4.17`         | `apps/web` dev                      | Utility-first styling framework                                     |
| **PostCSS**               | `8.5.3`          | `apps/web` dev                      | CSS processor for Tailwind integration                              |
| **Autoprefixer**          | `10.4.20`        | `apps/web` dev                      | Vendor prefixing for compiled CSS                                   |
| **Vitest**                | `3.0.8`          | Root dev                            | Unit and component test runner                                      |
| **@vitejs/plugin-react**  | `4.3.4`          | Root dev                            | Vite plugin for React JSX support in Vitest                         |
| **Prettier**              | `3.5.3`          | Root dev                            | Opinionated code formatter enforcing LF line endings                |
| **@types/node**           | `24.19.2`        | Root dev                            | TypeScript definitions for Node.js runtime                          |
| **@types/react**          | `19.3.0`         | Root dev                            | TypeScript definitions for React 19                                 |
| **@types/react-dom**      | `19.3.0`         | Root dev                            | TypeScript definitions for React DOM 19                             |
| **React Testing Library** | `16.2.0`         | Root dev (`@testing-library/react`) | Component rendering and DOM assertion utilities                     |
| **DOM Testing Library**   | `10.4.0`         | Root dev (`@testing-library/dom`)   | Core DOM querying engine for testing                                |
| **jsdom**                 | `26.0.0`         | Root dev                            | Headless browser environment simulating DOM for Vitest              |

---

## D. Workspace Package Responsibilities

The system architecture partitions business logic across seven isolated packages under `packages/` and one web application under `apps/web`. Dependency arrows point strictly inward toward `packages/domain` (`apps/web` → packages; packages → `domain`; `domain` → nothing).

In STEP-001, each workspace package was established as a **package stub** (exporting module name and version constants), establishing package identity, TypeScript compilation settings, and package boundaries. **No domain entities, calculation formulas, database queries, payment transactions, or AI integrations were implemented.**

1. **`@nimphy/domain` (`packages/domain`)**
   - _Intended Scope:_ Pure domain types, value objects, domain error definitions, branded primitive types (`UserId`, `CaseId`, `RunId`, `Money`), provenance tagging types, and canonical JSON serialization utilities (to be implemented in STEP-003).
   - _STEP-001 State:_ Minimal package stub exporting `DOMAIN_MODULE_NAME` and `DOMAIN_MODULE_VERSION`. Holds zero internal or external runtime dependencies.
2. **`@nimphy/calc-engine` (`packages/calc-engine`)**
   - _Intended Scope:_ Pure, I/O-free financial calculation functions for unit economics, royalties, low/base/high scenario modeling, break-even targets, and sensitivity perturbations (to be implemented in STEP-005 through STEP-008). Must adhere to Principle P-01 (zero network, zero disk, zero clock, zero AI imports).
   - _STEP-001 State:_ Minimal package stub exporting module metadata. Depends only on `@nimphy/domain`.
3. **`@nimphy/rules` (`packages/rules`)**
   - _Intended Scope:_ Rule Pack schema definitions, synthetic test pack loaders, validation schemas, content hashing, and historical version selection by effective date (to be implemented in STEP-004).
   - _STEP-001 State:_ Minimal package stub. Depends only on `@nimphy/domain`.
4. **`@nimphy/ai` (`packages/ai`)**
   - _Intended Scope:_ AI prompt builders, LLM provider port interfaces, fake adapters, and strict structured output schema validators for executive narrative memos (to be implemented in STEP-019 through STEP-021). Restricted from computing or modifying financial figures.
   - _STEP-001 State:_ Minimal package stub. Depends only on `@nimphy/domain`.
5. **`@nimphy/documents` (`packages/documents`)**
   - _Intended Scope:_ Dossier assembly, Markdown generation, and PDF document rendering (to be implemented in STEP-022 and STEP-023).
   - _STEP-001 State:_ Minimal package stub. Depends only on `@nimphy/domain`.
6. **`@nimphy/payments` (`packages/payments`)**
   - _Intended Scope:_ PayPal client adapter, payment state machine, capture settlement use-case, and idempotent webhook inbox processing (to be implemented in STEP-024 through STEP-027).
   - _STEP-001 State:_ Minimal package stub. Depends only on `@nimphy/domain`.
7. **`@nimphy/persistence` (`packages/persistence`)**
   - _Intended Scope:_ PostgreSQL connection management, schema migration files, data repositories, immutable audit log writer, and query helpers (to be implemented in STEP-010).
   - _STEP-001 State:_ Minimal package stub. Depends only on `@nimphy/domain`.
8. **`@nimphy/web` (`apps/web`)**
   - _Intended Scope:_ User-facing web application built with Next.js App Router, presenting calculation input forms, scenario comparisons, checkout experiences, and dossier downloads.
   - _STEP-001 State:_ Application shell with layout, styling, and a clean home page featuring the mandatory **Illustrative Scenario Disclaimer** banner complying with Core Principle P-07.

---

## E. Important Engineering Decisions

### 1. Modular Monolith Architecture (ADR-001)

- _Decision:_ Deploy Nimphy as a single deployable application (`apps/web`) backed by modular packages within a pnpm monorepo rather than independent microservices.
- _Reasoning:_ Eliminates distributed systems operational complexity (service meshes, inter-service network latency, distributed transactions, partial failures). Simplifies continuous delivery and guarantees strong atomic consistency across domain code.
- _Trade-off:_ Package boundaries must be mechanically enforced through linting and compiler rules since physical network boundaries do not exist.

### 2. pnpm Workspaces

- _Decision:_ Use pnpm (version 10.34.5) with workspace protocol references (`workspace:*`).
- _Reasoning:_ Fast, deterministic, disk-efficient dependency resolution with strict symlinking that prevents phantom dependencies (packages importing undeclared transitive dependencies).
- _Trade-off:_ Requires understanding symlink resolution and explicit dependency declarations in individual package manifests.

### 3. Strict TypeScript Configuration

- _Decision:_ Enable full TypeScript strict mode across all projects with `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`, and `"noUncheckedIndexedAccess": true`.
- _Reasoning:_ Prevents runtime `TypeError` issues, guarantees null/undefined safety, and enforces explicit checks when accessing array elements or dictionary keys. Essential for a financial calculation engine where unexpected undefined values could corrupt financial calculations.
- _Trade-off:_ Requires explicit type guards, array boundary checks, and branded types throughout the codebase.

### 4. Next.js 16 App Router

- _Decision:_ Adopt Next.js 16.4.5 using the App Router and Turbopack compiler.
- _Reasoning:_ Provides React Server Components (RSC) by default, streaming SSR, native route handlers for API endpoints, optimized build caching, and static generation.
- _Trade-off:_ Requires strict mental separation of server-only vs. client components (`'use client'`) and proper workspace package transpilation (`transpilePackages`).

### 5. React 19 and Tailwind CSS 3

- _Decision:_ Pair React 19.3.1 with Tailwind CSS 3.4.17.
- _Reasoning:_ React 19 provides the modern standard for Server Components and actions. Tailwind CSS provides zero-runtime utility-first styling with consistent design tokens, eliminating CSS specificity conflicts.
- _Trade-off:_ Initial setup requires PostCSS and Autoprefixer configuration; class names in JSX can become verbose without helper abstractions.

### 6. ESLint 10 Flat Configuration

- _Decision:_ Configure ESLint using the modern flat configuration standard (`eslint.config.mjs`) importing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- _Reasoning:_ ESLint 9/10 deprecated legacy `.eslintrc.*` files. Direct flat configuration provides clear, programmatic scoping, composable array configs, and native ES module support.
- _Trade-off:_ Initial integration required replacing `FlatCompat` wrappers with direct modular imports to avoid deprecation warnings.

### 7. Vitest and React Testing Library

- _Decision:_ Use Vitest 3.0.8 paired with `jsdom` and `@testing-library/react` rather than Jest.
- _Reasoning:_ Native ESM and TypeScript support with near-instant startup time via Vite's transform pipeline. Shares configuration patterns and path aliases seamlessly across monorepo workspaces.
- _Trade-off:_ Vitest executes in Node.js with a simulated DOM (`jsdom`), which requires proper resolution of React JSX runtimes when executing tests from the monorepo root.

### 8. Shared Package Structure with Inward-Only Dependencies

- _Decision:_ Every package follows an identical folder layout (`package.json`, `tsconfig.json`, `src/index.ts`) and references only `@nimphy/domain`.
- _Reasoning:_ Predictable developer ergonomics across the codebase and strict enforcement of the inward dependency graph specified in `docs/architecture/03-architecture-principles.md`.
- _Trade-off:_ Requires boilerplate configuration files for each package stub.

### 9. Committed Dependency Lockfile (`pnpm-lock.yaml`)

- _Decision:_ Maintain and commit `pnpm-lock.yaml` and verify installations with `--frozen-lockfile`.
- _Reasoning:_ Guarantees bit-for-bit reproducible installs across local developer environments and CI runners, eliminating "works on my machine" version drift.
- _Trade-off:_ Lockfile updates must be deliberately reviewed and committed whenever dependencies change.

### 10. Environment Variable Template (`.env.example`)

- _Decision:_ Provide a comprehensive `.env.example` capturing all database, session, PayPal, and LLM configuration keys with placeholder values while strictly ignoring `.env*` files in `.gitignore`.
- _Reasoning:_ Prevents secret leaks into version control while documenting the complete configuration contract required for local development per `docs/architecture/14-local-development.md`.
- _Trade-off:_ Developers must manually create their `.env.local` files upon initial clone.

### 11. GitHub Actions CI Pipeline (`.github/workflows/ci.yml`)

- _Decision:_ Automate verification on push and PR to `main` covering format checking, TypeScript typechecking, ESLint linting, Vitest tests, and Next.js production builds.
- _Reasoning:_ Ensures that no broken code, formatting errors, or regression bugs can be merged into the primary branch.
- _Trade-off:_ Requires maintainers to keep CI action versions and runtime environments aligned with local specifications.

---

## F. Troubleshooting History

During the execution of STEP-001, three distinct engineering issues were encountered and resolved.

### Issue 1: ESLint Flat Configuration & Legacy Compatibility

- **Symptom:** Initial linting setup attempted to use legacy `.eslintrc` structures wrapped in `@eslint/eslintrc` `FlatCompat` with `next lint`. This produced compatibility friction, deprecation notices, and config loading discrepancies under ESLint 10.
- **Root Cause:** Next.js 16 provides modern native flat config packages (`eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`), rendering `FlatCompat` unnecessary and prone to failure when running from the monorepo root.
- **Resolution:** Replaced the configuration with a clean `eslint.config.mjs` exporting a native flat array via `defineConfig` from `eslint/config`. The configuration directly spreads `nextVitals` and `nextTs`, configures the `apps/web/` root directory in settings, and declares global ignore patterns for build outputs and lockfiles.

### Issue 2: Vitest React JSX Runtime Resolution

- **Symptom:** Running root `pnpm test` failed on `apps/web/app/page.test.tsx` with:
  ```
  Failed to resolve import "react/jsx-dev-runtime"
  ```
- **Root Cause:** React 19 and React DOM were installed inside `apps/web/package.json`. However, Vitest was executed from the monorepo root (`vitest run`). Because pnpm strictly isolates node_modules and does not hoist undeclared packages to the monorepo root, Vitest could not resolve the implicit JSX runtime (`react/jsx-dev-runtime`) generated by `@vitejs/plugin-react` during test file transformation.
- **Resolution:** Added `react: "19.3.1"` and `react-dom: "19.3.1"` as explicit root `devDependencies` in the root `package.json`. Without modifying the homepage test or component code, Vitest was re-executed and both smoke tests passed immediately.

### Issue 3: Prettier Code Formatting Scope

- **Symptom:** Running `pnpm format:check` reported formatting failures across existing markdown files in `docs/architecture/**` and generated TypeScript definitions in `apps/web/next-env.d.ts`.
- **Root Cause:** The 23 canonical architecture specification documents in `docs/architecture/` represent immutable project specifications that must be preserved without formatting drift. Additionally, Next.js automatically generates `next-env.d.ts` with CRLF or unformatted spacing during builds.
- **Resolution:** Updated `.prettierignore` to explicitly exclude:
  - `docs/architecture/**`
  - `**/next-env.d.ts`
    Ran `pnpm format` across the newly created scaffold files. Subsequent runs of `pnpm format:check` passed cleanly with "All matched files use Prettier code style!".

---

## G. Verification Evidence

All local verification checks were directly executed and recorded:

| Verification Suite          | Exact Command Executed                           | Result     | Empirical Output / Details                                                                     |
| --------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| **Dependency Installation** | `pnpm install`                                   | **Passed** | All 9 workspace projects linked and node_modules populated                                     |
| **Frozen Lockfile Check**   | `pnpm install --frozen-lockfile`                 | **Passed** | "Lockfile is up to date, resolution step is skipped" (7.1s)                                    |
| **TypeScript Compilation**  | `pnpm typecheck` (`pnpm -r run typecheck`)       | **Passed** | 8 workspace projects checked (`tsc --noEmit`); 0 errors                                        |
| **Code Linting**            | `pnpm lint` (`eslint .`)                         | **Passed** | 0 errors, 0 warnings across all files                                                          |
| **Prettier Formatting**     | `pnpm format:check` (`prettier --check .`)       | **Passed** | "All matched files use Prettier code style!"                                                   |
| **Unit & Smoke Tests**      | `pnpm test` (`vitest run`)                       | **Passed** | 1 test file (`page.test.tsx`), **2/2 tests passed** (heading & disclaimer banner)              |
| **Production Build**        | `pnpm build` (`pnpm --filter @nimphy/web build`) | **Passed** | Next.js 16.4.5 compiled successfully with Turbopack in 7.4s; TypeScript check finished in 7.8s |
| **Prerendered Routes**      | Inspected build output                           | **Passed** | Statically prerendered: `○ /` and `○ /_not-found`                                              |
| **Architecture Docs Count** | `Get-ChildItem -Path docs/architecture`          | **Passed** | Exactly 23 specification files present (`00`–`22`)                                             |
| **Git Whitespace Check**    | `git diff --check`                               | **Passed** | 0 trailing whitespace or line ending errors reported                                           |

### Local Dev Server & Homepage Verification

- The local development server was run via `pnpm dev` on port 3000.
- The user confirmed that the homepage loaded successfully and displayed the expected UI, including the header, title, cards, and the mandatory **Illustrative Scenario Disclaimer** banner.
- Note: No HTTP status code was recorded because the final `Invoke-WebRequest` response was not captured in the terminal history.

### Remote Continuous Integration Status

- `.github/workflows/ci.yml` is defined and committed locally to run format, typecheck, lint, test, and build steps.
- Remote CI execution on GitHub has **not** been demonstrated or verified, as the repository has not yet been pushed to a remote GitHub host.

### Non-Fatal Dependency Warnings Documented

During installation and build, three non-fatal notices were observed and verified to have zero negative impact on test, lint, or build outcomes:

1. **ESLint Plugin Peer Dependency Declarations:** Certain transitive plugins declared peer dependency ranges ending at ESLint 9 (`^8.0.0 || ^9.0.0`), while the project has ESLint `10.14.0` installed. pnpm issued peer dependency warnings during install, but all lint checks executed without error.
2. **Deprecated Transitive Dependency:** `whatwg-encoding` was reported as deprecated by its maintainers within transitive jsdom sub-dependencies.
3. **Build Script Notification:** pnpm reported an ignored build script for `esbuild` during install, which was resolved by adding `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`.

---

## H. Acceptance Status Against Criteria

### Evaluation Against Roadmap Acceptance Criteria (Doc 17 §33)

- [x] **Repo skeleton builds, lints, tests (one trivial test), and runs:** Succeeded (`build`, `lint`, `test` with 2 tests, and `dev` all succeed).
- [x] **pnpm workspace established:** Succeeded (`apps/*`, `packages/*` defined and functioning).
- [x] **TypeScript strict enabled:** Succeeded (`tsconfig.base.json` with strict options across 8 projects).
- [x] **Next.js app shell with disclaimer:** Succeeded (empty home page with prominent disclaimer banner).
- [x] **Test runner configured:** Succeeded (Vitest + jsdom + React Testing Library).
- [x] **Core governance files:** Succeeded (`AGENTS.md`, `docs/DESIGN.md`, `.env.example`, `.gitattributes`, `.nvmrc`).
- [x] **CI workflow configured:** Succeeded (`.github/workflows/ci.yml` running typecheck, lint, test, format, build).
- [x] **Architecture documents preserved:** Succeeded (all 23 files intact).

### Evaluation Against Definition of Done (Doc 22)

- [x] **Feature completion:** Meets STEP-001 scope. No excluded features implemented.
- [x] **Code quality:** Typecheck, lint, format pass with zero warnings.
- [x] **Type safety:** Strict mode enabled. No `any` used.
- [x] **Testing:** Tests pass deterministically.
- [x] **Documentation:** `docs/DESIGN.md` updated with exact verified versions.

### Outstanding Items

The following items remain pending before the full Phase 0 exit criteria are satisfied:

1. **Remote CI Execution:** Remote GitHub Actions workflow execution must be verified once the repository is pushed to a remote origin.
2. **Doc 14 Status Reconciliation:** `docs/architecture/14-local-development.md` contains historical `[UNVERIFIED]` labels that will be formally updated in subsequent documentation updates.
3. **Mechanical Boundary & Docs Tooling:** Automated boundary linting rules (`eslint-plugin-import` / boundary checks) and the mechanical docs check script (`pnpm docs:check`) are explicitly scheduled for **STEP-002**.

---

## Summary

STEP-001 successfully established a robust, deterministic, and strictly typed monorepo foundation. All local verification gates passed with zero errors. The project is fully prepared for STEP-002 (Docs and boundary tooling).
