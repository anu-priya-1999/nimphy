# Canonical Implementation Prompt — STEP-001: Project Scaffolding

> **Historical Context Note:** This document preserves the approved operational specification and prompt instructions reconstructed for STEP-001 (Project Scaffolding). It accurately captures the original scaffolding requirements and architectural parameters executed for this step; it is not an exact historical chat transcript.

---

## Task Objective

Implement **STEP-001 — Project Scaffolding** for the Nimphy repository, establishing the monorepo foundation, development toolchain, workspace package stubs, Next.js application shell, testing framework, code quality rules, and CI automation according to the Nimphy Architecture Specification (Version 0.3.0).

---

## 1. Project Inspection & Context

Before creating or editing any files:

1. Review `docs/architecture/00-README.md` through `docs/architecture/22-definition-of-done.md`.
2. Review ADR-001 (Modular Monolith) and ADR-002 (TypeScript Stack) in `docs/architecture/18-architecture-decision-records.md`.
3. Review the roadmap bounds for STEP-001 in `docs/architecture/17-implementation-roadmap.md`.
4. Review Definition of Done requirements in `docs/architecture/22-definition-of-done.md`.
5. Review local development conventions in `docs/architecture/14-local-development.md`.

---

## 2. Approved Architecture & Boundaries

- **Modular Monolith (ADR-001):** Single deployable unit with strictly isolated workspace packages.
- **Dependency Flow:** Dependency arrows point strictly inward toward `packages/domain`.
  - `apps/web` depends on workspace packages (`@nimphy/*`).
  - `packages/calc-engine`, `packages/rules`, `packages/ai`, `packages/documents`, `packages/payments`, `packages/persistence` depend ONLY on `packages/domain`.
  - `packages/domain` has ZERO dependencies on any workspace package, external framework, or database library.
- **Deterministic Core (P-01):** Financial calculation logic resides in `packages/calc-engine` and must be pure functions with zero I/O, zero network, zero clock/randomness, and no AI imports.

---

## 3. Toolchain & Pinned Versions

- **Node.js:** `24.18.0` (Active LTS), pinned in `.nvmrc` and root `package.json` engines (`>=24.18.0 <25`).
- **pnpm:** `10.34.5`, pinned in root `package.json` (`packageManager: "pnpm@10.34.5"`).
- **TypeScript:** `5.8.3`, strict mode with comprehensive compiler flags.
- **Next.js:** `16.4.5` (App Router) in `apps/web`.
- **React & React DOM:** `19.3.1`.
- **Tailwind CSS:** `3.4.17` with PostCSS `8.5.3` and Autoprefixer `10.4.20`.
- **ESLint:** `10.14.0` with `eslint.config.mjs` flat configuration.
- **Prettier:** `3.5.3` with LF line endings.
- **Vitest:** `3.0.8` with `jsdom` `26.0.0` and `@testing-library/react` `16.2.0`.

---

## 4. Repository Structure & Workspace Packages

Establish the following repository layout:

```
nimphy/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .editorconfig
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── README.md
├── apps/
│   └── web/
│       ├── app/
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── page.test.tsx
│       ├── next.config.mjs
│       ├── package.json
│       ├── postcss.config.mjs
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── docs/
│   ├── architecture/ (23 pre-existing canonical specifications)
│   └── DESIGN.md
├── eslint.config.mjs
├── package.json
├── packages/
│   ├── ai/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── calc-engine/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── documents/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── domain/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── payments/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── persistence/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── rules/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── vitest.config.ts
```

### Workspace Packages

Initialize the following packages with minimal stubs (name, version, module constants) and strictly defined dependencies:

1. `@nimphy/domain`: Core domain models and branded primitives stub. No internal or external runtime dependencies.
2. `@nimphy/calc-engine`: Pure financial calculation engine stub. Depends only on `@nimphy/domain`.
3. `@nimphy/rules`: Rule pack loader and validation stub. Depends only on `@nimphy/domain`.
4. `@nimphy/ai`: Narrative synthesis and provider adapter stub. Depends only on `@nimphy/domain`.
5. `@nimphy/documents`: Dossier assembly and document rendering stub. Depends only on `@nimphy/domain`.
6. `@nimphy/payments`: PayPal integration and payment state machine stub. Depends only on `@nimphy/domain`.
7. `@nimphy/persistence`: Database client and repository stub. Depends only on `@nimphy/domain`.

---

## 5. Next.js Web Application Shell (`apps/web`)

1. Configure Next.js 16 with Turbopack and App Router.
2. Implement root layout (`app/layout.tsx`) with font configuration and viewport metadata.
3. Implement minimal home page (`app/page.tsx`):
   - Header with product name ("Nimphy") and version/status badge.
   - Prominent **Illustrative Scenario Disclaimer** banner complying with Core Principle P-07 (`docs/architecture/03-architecture-principles.md`).
   - Clean typographic presentation explaining the product purpose (Author Royalty Estimation & Business Case Analysis).
   - Three feature overview cards: Deterministic Core, Evidence & Provenance, Grounded Synthesis.
   - Minimal semantic footer.
4. Add component smoke test (`app/page.test.tsx`):
   - Asserts heading and brand name render correctly.
   - Asserts disclaimer banner renders with expected role and copy.

---

## 6. Engineering Tooling & Quality Rules

1. **Root `package.json`:**
   - Define orchestration scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`.
2. **TypeScript Configuration:**
   - `tsconfig.base.json`: Base configuration with `"strict": true`, `"noImplicitAny": true`, `"noUncheckedIndexedAccess": true`, and strict compiler checks.
   - `tsconfig.json`: Root project configuration mapping path aliases for all workspace packages.
   - `apps/web/tsconfig.json` & `packages/*/tsconfig.json`: Package-level tsconfig files extending base.
3. **ESLint:**
   - `eslint.config.mjs`: Direct flat configuration importing Next.js 16 core web vitals and typescript configs, targeting root and packages, with proper global ignores.
4. **Prettier:**
   - `.prettierrc`: Single quotes, semicolons, trailing commas, print width 100, LF line endings.
   - `.prettierignore`: Ignore build outputs, node_modules, `docs/architecture/**`, and generated `.d.ts` files.
5. **Vitest:**
   - `vitest.config.ts`: Workspace test runner using jsdom environment, React plugin, and path aliases.
6. **Environment Template:**
   - `.env.example`: Comprehensive template listing environment variable placeholders per `docs/architecture/14-local-development.md`.
7. **Git & Line Endings:**
   - `.gitattributes`: Force LF line endings across text files (`* text=auto eol=lf`).
   - `.gitignore`: Ignore `.next`, `node_modules`, `coverage`, environment secrets, and IDE caches.

---

## 7. Governance & Living Documentation

1. Create `AGENTS.md` specifying:
   - Core Architecture Principles (P-01 through P-10).
   - Inward-pointing dependency boundaries.
   - Implementation roadmap governance and single `docs/DESIGN.md` maintenance rule.
   - Code quality, type safety, and zero-warning standards.
   - Verification and git discipline.
2. Initialize `docs/DESIGN.md`:
   - System status (Architecture Version 0.3.0, Phase P0, STEP-001).
   - Pinned tooling and dependency versions.
   - Complete repository structure.
   - Files created in STEP-001.
   - Verification results placeholder.
   - Next authorized step: STEP-002 (Docs and boundary tooling).

---

## 8. Continuous Integration (`.github/workflows/ci.yml`)

Create a GitHub Actions CI workflow triggered on push/pull_request to `main` with:

1. Checkout repository.
2. Install pnpm (pinned version 10.34.5).
3. Setup Node.js (pinned version 24.18.0) with pnpm caching.
4. Install dependencies via `pnpm install --frozen-lockfile`.
5. Check code formatting via `pnpm format:check`.
6. Run TypeScript check across all packages via `pnpm typecheck`.
7. Run linter via `pnpm lint`.
8. Run test suite via `pnpm test`.
9. Build Next.js application via `pnpm build`.

---

## 9. Scope Restrictions (Do NOT Implement)

Per `docs/architecture/02-product-scope-and-requirements.md` §6 and `docs/architecture/17-implementation-roadmap.md`:

- Do NOT implement domain models, money arithmetic, or branded types (reserved for STEP-003).
- Do NOT implement calculation engine math, formulas, or rounding (reserved for STEP-005 through STEP-008).
- Do NOT implement Rule Pack schemas or JSON loaders (reserved for STEP-004).
- Do NOT implement database migrations, ORM schemas, or persistence logic (reserved for STEP-010).
- Do NOT implement authentication, sessions, or user management (reserved for STEP-011).
- Do NOT implement PayPal API integration, webhooks, or payment flows (reserved for STEP-024 through STEP-027).
- Do NOT implement LLM prompts, AI adapters, or OpenAI/Anthropic SDKs (reserved for STEP-019 through STEP-021).
- Do NOT implement PDF generation, document export, or markdown assembly (reserved for STEP-022 and STEP-023).

---

## 10. Completion & Acceptance Criteria

STEP-001 is accepted when:

1. A fresh install completes successfully using `pnpm install --frozen-lockfile`.
2. `pnpm typecheck` passes across all 8 workspace projects with zero errors.
3. `pnpm lint` passes with zero errors.
4. `pnpm format:check` passes with zero formatting violations.
5. `pnpm test` runs and passes all component tests (2/2 tests passed).
6. `pnpm build` creates an optimized production build of `apps/web` with prerendered static pages (`/` and `/_not-found`).
7. All 23 architecture specification documents in `docs/architecture/` remain intact and untouched.
8. The home page displays the required illustrative scenario disclaimer.
9. `docs/DESIGN.md` is updated with exact verified versions, repository structure, and execution records.
