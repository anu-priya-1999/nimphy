# Canonical Prompt Archive — STEP-003: Domain Primitives

This document archives the prompt instructions provided by the user for the implementation of STEP-003.

---

````markdown
# NIMPHY — STEP-003: DOMAIN PRIMITIVES

Act as a Principal Domain Architect and Senior TypeScript Engineer.

STEP-001 and STEP-002 are complete.

Your task is to implement STEP-003 exclusively, following the exact requirements and acceptance criteria in:

`docs/architecture/17-implementation-roadmap.md`

The canonical architecture, particularly documents 03, 05, 06, 12, 18 and 22, is authoritative.

This is the first implementation of Nimphy's domain foundation.

Do not start STEP-004.

# 1. PRE-FLIGHT INSPECTION

Read:

- `AGENTS.md`
- `docs/DESIGN.md`
- `docs/architecture/03-architecture-principles.md`
- `docs/architecture/05-component-responsibilities.md`
- `docs/architecture/06-database-architecture-and-schema.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- `docs/architecture/22-definition-of-done.md`

Also inspect:

- `packages/domain/`
- Root TypeScript configuration.
- Workspace configuration.
- Existing ESLint boundary rules.
- Existing tests and package scripts.
- STEP-001 and STEP-002 implementation records.

Extract the exact STEP-003 scope, expected exports, dependencies and acceptance criteria.

If this prompt conflicts with the canonical roadmap, the roadmap takes precedence.

# 2. DOMAIN PACKAGE DESIGN

Implement the domain foundation in:

`packages/domain/src/`

Use small, cohesive modules with explicit exports.

A reasonable initial structure, subject to the roadmap, is:

```text
packages/domain/src/
├── money/
│   ├── money.ts
│   ├── currency.ts
│   └── index.ts
├── provenance/
│   ├── provenance.ts
│   └── index.ts
├── identifiers/
│   ├── branded-ids.ts
│   └── index.ts
├── errors/
│   ├── domain-error.ts
│   └── index.ts
└── index.ts
```
````

Do not create unnecessary abstractions.

The domain package must remain independent of:

- Next.js
- React
- Database clients
- External APIs
- AI providers
- Payment SDKs
- Node-specific infrastructure
- Filesystem and network I/O

It must not import another Nimphy workspace package.

# 3. MONEY VALUE OBJECT

Implement an immutable `Money` value object.

Mandatory financial representation:

- Integer minor units.
- ISO currency code.
- No floating-point financial storage.

Requirements:

1. Prevent invalid monetary construction.
2. Reject non-finite values.
3. Reject fractional minor-unit values.
4. Validate currency codes according to the approved architecture.
5. Prevent unsafe integer and overflow conditions.
6. Preserve immutability.
7. Provide safe construction APIs.
8. Provide well-defined equality behavior.
9. Define currency mismatch behavior for operations.
10. Provide deterministic serialization if included in the roadmap.

Do not silently mix currencies.

Do not silently round financial amounts.

Do not assume every currency has exactly two fractional digits.

Do not invent an unsupported currency registry. Inspect the architecture and define only the approved scope.

If decimal parsing or arithmetic is required, implement it without introducing floating-point financial errors.

Do not prematurely implement the complete publishing calculation engine.

# 4. CURRENCY CODES

Create a strongly typed currency-code representation.

Requirements:

- Explicit supported currency codes.
- Validation at the construction boundary.
- No arbitrary strings accepted as valid codes.
- Clear handling of unsupported currency codes.
- Currency metadata only where authorized by the architecture.

Do not claim to support every ISO currency if the implementation only contains a subset.

Keep unsupported currencies explicit rather than guessing their properties.

# 5. PROVENANCE

Implement the provenance classifications defined by the architecture.

At minimum, preserve the established terminology:

- `user_input`
- `official_fact`
- `estimate`
- `assumption`

Requirements:

- Strong TypeScript types.
- Explicit allowed values.
- Runtime validation where data crosses a boundary.
- No silent conversion between provenance classifications.
- Tests for valid and invalid values.

Provenance must remain usable by financial calculations, AI explanations and future dossier generation.

# 6. BRANDED IDENTIFIERS

Implement type-safe branded identifiers according to the roadmap.

Potential identifiers include:

- UserId
- CaseId
- RevisionId
- RunId
- RulePackId
- OrderId
- PaymentId
- EntitlementId

Use only identifiers authorized by the actual architecture and STEP-003 scope.

Requirements:

1. Avoid accidental interchange between different ID types.
2. Provide safe parsing or construction functions.
3. Reject invalid empty identifiers.
4. Follow established identifier format rules.
5. Keep identifier types structurally safe.
6. Export types and constructors explicitly.

Do not introduce random ID generation or persistence behavior unless STEP-003 explicitly requires it.

ID creation belongs to the appropriate infrastructure layer when applicable.

# 7. DOMAIN ERRORS

Implement a small typed domain error hierarchy.

Follow the architecture's established conventions.

Errors should:

- Have stable error codes.
- Be distinguishable by type.
- Carry useful safe messages.
- Avoid exposing secrets or internal infrastructure details.
- Be independently testable.

Do not build an oversized error framework.

# 8. PUBLIC EXPORTS AND DEPENDENCY RULES

Every module must expose an intentional public API.

Update:

`packages/domain/src/index.ts`

Only export approved public domain types and constructors.

Ensure:

- No internal deep imports from consumers.
- No circular imports.
- No infrastructure dependencies.
- No UI dependencies.
- No external runtime dependencies unless explicitly authorized.

Preserve the existing architecture-boundary tooling.

# 9. TESTING

Create dedicated Vitest test files under:

`packages/domain/`

Cover all relevant behaviors.

Money tests must include:

- Valid construction.
- Negative and positive values if authorized.
- Zero.
- Invalid numeric values.
- Fractional minor units.
- Unsafe integer boundaries.
- Currency mismatches.
- Equality.
- Immutability.
- Serialization and parsing if implemented.
- Currency-specific minor-unit behavior where applicable.

Provenance tests must cover allowed values and rejected values.

Branded identifier tests must cover construction, invalid input and type separation.

Domain error tests must verify error codes and inheritance.

Tests must be deterministic.

No real network, database, clock or random generation.

Do not claim 100% branch coverage unless it is actually measured.

# 10. UPDATE PACKAGE DOCUMENTATION

Create:

`packages/domain/README.md`

Explain:

- Package purpose.
- Public API.
- Money representation.
- Currency restrictions.
- Provenance classification.
- Branded identifiers.
- Domain errors.
- Dependency constraints.
- How to test the package.

Keep the documentation aligned with actual behavior.

# 11. STEP-SPECIFIC DOCUMENTATION

Create:

1. `prompts/step-03.md`
2. `learning/implementation/step-03-domain-primitives.md`
3. `learning/interviews/step-03-domain-primitives.md`
4. `learning/notes/step-03-domain-primitives.md`

The implementation record must explain the actual design, types, invariants, implementation choices and test results.

The interview document must include detailed senior-engineering questions on:

- Value objects.
- Money representation.
- Floating-point precision.
- Currency handling.
- Branded types.
- TypeScript structural typing.
- Domain errors.
- Immutability.
- Domain boundaries.
- Pure functions.
- Test strategy.

The notes document must include debugging history, technical discoveries, trade-offs and learning material.

The prompt archive must preserve this implementation prompt. Do not describe reconstructed content as an exact historical transcript.

# 12. UPDATE DESIGN.md

Update the ONE existing file:

`docs/DESIGN.md`

Record:

- STEP-003 status.
- Domain modules created.
- Public APIs.
- Financial representation decisions.
- Currency support limitations.
- Provenance types.
- Branded identifiers.
- Domain error structure.
- Tests and actual results.
- Files changed.
- Open questions.
- Next authorized step.

Do not create another DESIGN document.

# 13. STRICT SCOPE RESTRICTIONS

Do not implement:

- Royalty calculation engine.
- KDP royalty rules.
- Scenario calculations.
- Break-even calculations.
- Sensitivity analysis.
- Database schema.
- Database migrations.
- Case CRUD.
- Authentication.
- AI provider integration.
- Memo generation.
- PDF generation.
- PayPal.
- Payment capture.
- Entitlements.

These belong to subsequent steps.

# 14. VERIFICATION

Run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm boundaries:check
pnpm docs:check
pnpm test
pnpm build
git diff --check
```

All relevant checks must pass.

Fix failures within STEP-003.

Do not weaken tests or architectural restrictions to obtain a green result.

# 15. COMPLETION REPORT

Report:

- Files created and modified.
- Money implementation and invariants.
- Currency support.
- Provenance implementation.
- Branded IDs.
- Domain error design.
- Public exports.
- Dependency-boundary results.
- Test count and actual results.
- All verification command results.
- Open decisions.
- Deviations from architecture.
- STEP-003 completion status.

Do not begin STEP-004.

STOP for owner review.

```

```
