# AGENTS.md — Permanent Coding-Agent Instructions

This document governs the operational rules, architectural constraints, and engineering standards for all AI coding agents working on the Nimphy repository.

---

## 1. Core Architecture Principles (Doc 03)

Every agent modifying this repository must uphold these 10 principles:

1. **P-01: Deterministic core, probabilistic edge.**
   Financial calculations in `packages/calc-engine` are pure functions with zero I/O, zero network, zero clock/randomness, and no AI imports. AI is restricted to `packages/ai` for synthesizing structured narrative memos and must never compute, alter, or reconcile numbers.
2. **P-02: Simplicity first.**
   Nimphy is a modular monolith (ADR-001). Do not introduce microservices, distributed queues, message brokers, caching layers, or standalone background workers unless triggered by explicit criteria in `docs/architecture/15-scaling-and-reliability.md`.
3. **P-03: Traceability.**
   Every financial result must trace back to its exact inputs, rule pack semver, engine version, and calculation run timestamp.
4. **P-04: Immutability for evidence.**
   Case revisions, calculation runs, published rule packs, and audit logs are append-only and strictly immutable. Payment events are append-only except for their processing lifecycle and redaction fields.
5. **P-05: Verify at the boundary.**
   Validate all external inputs with strict schemas (e.g., Zod) at the API and UI boundaries. Verify all payment claims server-side. Browser redirects or client payloads are never accepted as proof of payment.
6. **P-06: Least privilege and default deny.**
   Every route handler and use-case must enforce authentication and ownership. Every database query must scope to the authenticated user ID.
7. **P-07: Honest uncertainty.**
   All user inputs carry explicit provenance labels (`user_input`, `official_fact`, `estimate`, `assumption`). All UI views, memos, and dossiers must prominently present illustrative scenario disclaimers.
8. **P-08: Cost-aware.**
   AI invocations must operate under hard token and dollar budgets per dossier with fail-closed limits.
9. **P-09: Testability.**
   Pure functions, deterministic tests, golden fixtures, and fake adapters for all third-party ports (PayPal, LLM, email, storage). 100% branch coverage required for `packages/calc-engine`.
10. **P-10: Reversibility.**
    Third-party integrations must sit behind explicit ports and interfaces.

---

## 2. Modularity & Dependency Boundaries

Dependency arrows point strictly inward toward `domain`:

```
apps/web ───────► use-cases / packages
packages/calc-engine ──► packages/domain
packages/rules ────────► packages/domain
packages/ai ───────────► packages/domain
packages/documents ────► packages/domain
packages/payments ─────► packages/domain
packages/persistence ──► packages/domain
packages/domain ───────► (NONE — depends on nothing)
```

- `packages/domain` must not import from any other workspace package, framework, or database library.
- `packages/calc-engine` may import only from `packages/domain`. No I/O, no database, no React, no AI.
- `apps/web` route handlers must remain thin: parse input, check authorization, call a use-case, and map responses/errors. Route handlers must not implement business logic directly.

---

## 3. Implementation Roadmap Governance (Doc 17)

1. **Step-by-Step Discipline:**
   Implement only the step explicitly authorized by the user. Do not anticipate or partially implement future steps.
2. **Scope Restrictions:**
   Respect the exclusion list in `docs/architecture/02-product-scope-and-requirements.md` §6 and the scope bounds in `docs/architecture/17-implementation-roadmap.md`.
3. **Living Design Document:**
   Update `docs/DESIGN.md` at the conclusion of **every single step**, recording the current step, exact pinned versions, files created, verification results, and next authorized step. There is only ONE `docs/DESIGN.md`. Never create additional DESIGN files (such as `DESIGN-step-01.md`).
4. **Definition of Done (Doc 22):**
   A step is complete only when all applicable criteria in `docs/architecture/22-definition-of-done.md` are satisfied.
5. **Mandatory Step Documentation Convention:**
   For each roadmap step, create four individual documents:
   - `prompts/step-XX.md`
   - `learning/implementation/step-XX-[name].md`
   - `learning/interviews/step-XX-[name].md`
   - `learning/notes/step-XX-[name].md`
     After every step, update the ONE existing `docs/DESIGN.md`. Never create additional DESIGN files.

---

## 4. Code Quality & Type Safety

- **TypeScript Strict Mode:** `"strict": true` with zero tolerance for `any` without written justification.
- **Money Representation:** Money must always be represented as an integer of minor units (e.g., cents) paired with an ISO currency code. Never use floating-point numbers for money calculations or storage.
- **Branded Types:** Use branded types for domain IDs (`UserId`, `CaseId`, `RunId`, etc.) and `Money`.
- **Zero Warnings Policy:** All code must pass typechecking, linting, formatting, and tests with zero errors and zero unacknowledged warnings.
- **Deterministic Tests:** Never use `Date.now()`, `Math.random()`, or real network in unit/engine tests without seeded mocks.

---

## 5. Verification & Git Discipline

- Always execute verification commands directly before reporting completion.
- Never report unexecuted tests as passing.
- Do not commit secrets, API keys, or personal credentials.
- Do not push or publish code to remote repositories without explicit user authorization.
