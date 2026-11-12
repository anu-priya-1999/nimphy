# Canonical Prompt Archive — STEP-005: Per-Unit Economics

This document archives the official prompt instructions provided by the repository owner for the authorization and implementation of STEP-005.

---

## 1. Initial Authorization Directive

The initial directive authorized the implementation of STEP-005 (Per-Unit Economics) under Phase 1, establishing `@nimphy/calc-engine`, exact rational arithmetic, rounding engine, and calculation trace.

---

## 2. Engineering Review & Corrective Financial Audit Directive

```markdown
# NIMPHY — STEP-005 CORRECTIVE FINANCIAL AUDIT

## ENGINEERING REVIEW: REQUEST CHANGES

The STEP-005 completion report has undergone an independent review against the accepted STEP-004 baseline.
The implementation is NOT accepted.
There are material discrepancies between the reported golden fixture calculations and the actual synthetic Rule Packs.
Your immediate task is to audit and correct STEP-005.

Do not start STEP-006.
Do not commit or push.
Do not modify accepted STEP-004 fixtures.
Do not discard existing STEP-005 work.

Key Corrective Directives:

1. Preserve and inspect current work (report actual git status/diff, confirm HEAD e54073006136b0701bc89826d7143dea205ba164 and branch main).
2. Correct Paperback v1 golden values: baseCostMinor = 100, costPerPageMinor = 2, pageThreshold = 24, royaltyRateDecimal = "0.60". Expected print costs: 108 pages -> 268 minor units; 200 pages -> 452 minor units; 500 pages -> 1052 minor units.
3. Correct Paperback v2 golden values: baseCostMinor = 120, costPerPageMinor = 2, pageThreshold = 24, royaltyRateDecimal = "0.60". Expected print costs: 100 pages -> 272 minor units; 150 pages -> 372 minor units.
4. Correct Hardcover golden values: baseCostMinor = 600, costPerPageMinor = 3, pageThreshold = 75, royaltyRateDecimal = "0.50", currency = EUR. Expected print costs: 100 pages -> 675 minor units; 300 pages -> 1275 minor units; 500 pages -> 1875 minor units. Royalty: EUR 15.00 _ 50% = EUR 7.50; EUR 35.00 _ 50% = EUR 17.50 (NOT EUR 21.00).
5. Audit all golden cases against authoritative JSON parameters with independent manual derivation.
6. Acknowledge and document the Ebook fractional MB specification gap; do not treat ceiling as approved without owner confirmation.
7. Audit rounding specification: note ADR-005 is Proposed and establish decision table for positive/negative ties and fractions.
8. Fix rounding test quality: replace false tie ($5.50 _ 70% = 385) with actual mathematical half-cent tie ($3.05 _ 70% = 213.5).
9. Audit calc-engine implementation: pure domain import, BigInt rational arithmetic, overflow guards, immutable traces.
10. Git/config audit: explain working tree status and justify rootDir removal in calc-engine/tsconfig.json.
11. Run full verification suite with 100% branch coverage for calc-engine.
12. Reconcile documentation: prompts/step-05.md, learning/ files, and docs/DESIGN.md.
```

---

## 3. Final Corrective Implementation & Owner-Approved Financial Policy (2026-11-12)

`````markdown
# NIMPHY — STEP-005 FINAL CORRECTIVE IMPLEMENTATION

## OWNER-APPROVED FINANCIAL POLICY & ADR-005 ACCEPTANCE

Repository:
C:\Users\HP\Desktop\Projects\nimphy

Accepted implementation baseline:
e54073006136b0701bc89826d7143dea205ba164

Package:
@nimphy/calc-engine

Current milestone:
STEP-005 — Per-Unit Economics

# ================================================== 0. FORMAL OWNER AUTHORIZATION

The repository owner has made the following explicit
financial-policy decisions on 2026-11-12.

These decisions are approved and must be implemented.

DECISION A — ROUNDING SEMANTICS: APPROVED

1. round_half_up: Nearest integer minor unit; exact ties away from zero (+2.5 -> +3, -2.5 -> -3).
2. round_half_even: Nearest integer minor unit; exact ties to nearest even integer (+2.5 -> +2, +3.5 -> +4, -2.5 -> -2, -3.5 -> -4).
3. round_down: Toward zero (truncation) (+2.7 -> +2, -2.7 -> -2).
4. round_up: Away from zero (+2.1 -> +3, -2.1 -> -3).

DECISION B — FRACTIONAL EBOOK FILE SIZE: APPROVED
Ebook delivery costs are proportional to the exact supplied file size in MB.
Do not round file size up to whole megabytes.
Use exact rational arithmetic.

DECISION C — ROUNDING SEQUENCE: APPROVED
PER_UNIT:

- Calculate exact gross royalty.
- Round gross royalty using the Rule Pack's rounding mode.
- Calculate exact production/distribution cost.
- Round any fractional monetary cost using the same Rule Pack rounding mode.
- Subtract rounded cost from rounded royalty.
- Return Money values in integer minor units.

PER_TOTAL:

- Preserve exact per-unit royalty.
- Preserve exact per-unit production/distribution cost.
- Do not prematurely round either component.
- STEP-006 will aggregate both exact components by quantity.
- STEP-006 will round aggregate royalty and aggregate production/distribution cost separately, exactly once.
- Aggregate contribution = rounded aggregate royalty minus rounded aggregate cost.

DECISION D — NEGATIVE PAPERBACK FIXTURE: APPROVED
Replace the invalid successful $4.00 paperback calculation with a valid $5.00 paperback calculation at 300 pages.
Also retain $4.00 as an invalid-input rejection test.

These four decisions are repository-owner approvals.
Do not ask the owner to reconfirm them.

````markdown
# NIMPHY — STEP-005: PER-UNIT ECONOMICS

## OFFICIAL ENGINEERING IMPLEMENTATION ASSIGNMENT

Repository:
C:\Users\HP\Desktop\Projects\nimphy

Current accepted baseline:
e54073006136b0701bc89826d7143dea205ba164

You are working on Nimphy as a senior engineer on the engineering team.

The repository owner has authorized STEP-005 after accepting STEP-004.

Your responsibility is to implement STEP-005 to production-quality engineering standards.

Do not treat this as a prototype or a demonstration.

The objective is a mathematically correct, deterministic, independently testable financial calculation engine.

==================================================

1. # ENGINEERING GOVERNANCE

Before making changes:

1. Inspect git status.
2. Confirm the current branch and HEAD.
3. Confirm the accepted baseline.
4. Preserve uncommitted user changes.
5. Read AGENTS.md and all relevant architecture documentation.
6. Inspect existing packages/domain, packages/rules and packages/calc-engine.
7. Inspect existing tests, fixtures, scripts and CI configuration.

Do not commit or push.

Do not overwrite existing user work.

Do not modify previously accepted steps 001–004 unless a defect is discovered that blocks STEP-005. If that happens, report the defect and request approval before changing accepted code.

Work only on STEP-005.

# ================================================== 2. YOUR ENGINEERING RESPONSIBILITY

Implement the following in packages/calc-engine:

- Royalty calculation.
- Per-unit production/distribution cost calculation.
- Net per-unit contribution calculation.
- Rule Pack rounding policy.
- Deterministic calculation trace.
- Typed errors.
- Independent golden fixtures.
- Comprehensive unit and boundary tests.

The calculation engine must be the financial source of truth.

No AI-generated financial calculations.

No floating-point financial arithmetic.

No silent rounding.

No undocumented financial assumptions.

# ================================================== 3. READ THE SPECIFICATION BEFORE CODING

Read and understand:

- AGENTS.md
- docs/DESIGN.md
- README.md
- docs/architecture/02-product-scope-and-requirements.md
- docs/architecture/03-architecture-principles.md
- docs/architecture/05-component-responsibilities.md
- docs/architecture/12-testing-and-ai-evaluation.md
- docs/architecture/17-implementation-roadmap.md
- docs/architecture/18-architecture-decision-records.md
- docs/architecture/22-definition-of-done.md

Inspect ADR-005 and ADR-006 carefully.

Inspect:

- packages/domain/src/money/money.ts
- Existing Money tests.
- Existing Rule Pack schema.
- Existing synthetic Rule Pack fixtures.
- Existing SemVer and content-hash contracts.
- Existing Vitest configuration.
- Existing coverage thresholds.

Do not begin financial implementation until you understand the authoritative formulas and input semantics.

If a material ambiguity exists, document it and ask for clarification rather than inventing a financial policy.

# ================================================== 4. FINANCIAL INPUT CONTRACT

Use the existing validated Rule Pack as input.

Do not change the frozen STEP-004 schema.

Existing Rule Pack parameters include:

- currency
- format
- rounding.mode
- rounding.point
- royalty.tiers
- printCost
- deliveryCost

Royalty tier:

- name
- minPriceMinor
- maxPriceMinor
- royaltyRateDecimal

Print cost:

- baseCostMinor
- costPerPageMinor
- pageThreshold

Delivery cost:

- costPerMbMinor

Use exact decimal strings for royalty rates.

Inspect existing fixture conventions to determine the established input contract for:

- listPriceMinor
- pages
- fileSizeMb

Build small, strict TypeScript input types.

Validate:

- Missing required values.
- Invalid integer values.
- Unsafe integers.
- Currency mismatch.
- Unsupported format-specific inputs.
- Missing royalty tier.
- Invalid price boundaries.
- Invalid page counts.
- Invalid delivery size.

Do not use `any`.

Do not silently default missing financial values.

# ================================================== 5. EXACT FINANCIAL CALCULATIONS

Implement the formulas established by the authoritative specification and existing synthetic fixtures.

A. GROSS ROYALTY

Gross royalty:

List price × applicable royalty rate.

Select the applicable tier using its declared price boundaries.

Use exact rational arithmetic.

B. PHYSICAL PRINT COST

Use the declared synthetic Rule Pack parameters:

- Base print cost.
- Per-page cost.
- Page threshold.

Preserve the existing fixture's interpretation of page threshold.

C. EBOOK DELIVERY COST

Use the Rule Pack's delivery-cost parameter and the supplied ebook file-size input.

Preserve the existing fixture's interpretation of file size.

D. PER-UNIT CONTRIBUTION

Per-unit contribution:

Gross royalty − applicable production/distribution cost.

Do not add taxes, marketing, overhead, acquisition costs, or expenses outside STEP-005.

Clearly distinguish contribution from total publisher profit.

If existing specification and fixture formulas disagree, stop and report the exact conflict.

# ================================================== 6. EXACT ARITHMETIC AND ROUNDING

This is a financial system.

Never use JavaScript Number arithmetic for fractional financial calculations.

Use BigInt, exact integer arithmetic and rational fractions.

Inspect and reuse the existing domain Money implementation:

- Money.of()
- Money.zero()
- Money.add()
- Money.subtract()
- Money.multiply()
- Money.multiplyDecimal()
- Money.multiplyRatio()

Do not bypass the Money invariant that fractional minor-unit values cannot be silently accepted.

Represent intermediate exact values as numerator and denominator.

Serialize rational values as decimal strings.

Never serialize native BigInt directly.

Never convert a royalty decimal string into Number.

Support the existing modes:

- round_half_up
- round_half_even
- round_down
- round_up

Support the existing rounding points:

- per_unit
- per_total

Read ADR-005 for the authoritative definitions.

Test positive and negative values, exact ties, and values immediately around rounding boundaries.

Important distinction:

round_down means toward zero if that is the ADR definition; do not accidentally implement mathematical floor for negative values.

PER_UNIT:
Apply the declared rounding policy at the per-unit calculation boundary.

PER_TOTAL:
Preserve exact unrounded rational amounts for later aggregation. STEP-005 must expose sufficient exact information for STEP-006 to aggregate before rounding.

Do not implement STEP-006 aggregation here.

Do not treat per_total as per_unit.

If the ADR does not specify how rounding applies to multiple intermediate components before contribution subtraction, report the ambiguity. Do not invent the sequence.

# ================================================== 7. CALCULATION TRACE

Every calculation must return a deterministic trace.

Include enough structured information to independently reproduce the result:

- Engine version.
- Input price.
- Currency.
- Rule Pack ID.
- Rule Pack key.
- Rule Pack version.
- Rule Pack content hash.
- Selected royalty tier.
- Exact royalty rate.
- Royalty numerator and denominator.
- Print cost or delivery cost inputs.
- Exact intermediate calculations.
- Rounding mode.
- Rounding point.
- Rounding operations.
- Final gross royalty.
- Final applicable cost.
- Final contribution.

Use typed discriminated trace entries.

Avoid opaque unstructured trace strings.

The trace must not contain:

- Timestamps.
- Random identifiers.
- Nondeterministic ordering.
- LLM-generated content.
- Filesystem metadata.

The same input must produce exactly the same serialized output.

# ================================================== 8. PACKAGE ARCHITECTURE

The calculation engine must be:

- Pure TypeScript.
- Deterministic.
- I/O-free.
- Side-effect-free.

It may depend only on packages/domain.

It must not import:

- packages/rules
- packages/persistence
- packages/ai
- packages/payments
- apps/web

The validated Rule Pack is provided by the caller.

Do not introduce database, filesystem, network, AI, clock or random dependencies.

Keep the public API small.

Export approved public types and functions through:

packages/calc-engine/src/index.ts

Follow existing naming, package and error conventions.

# ================================================== 9. GOLDEN FIXTURES

Use only the four existing synthetic packs:

- TEST_EBOOK_STANDARD/1.0.0
- TEST_PAPERBACK_US/1.0.0
- TEST_PAPERBACK_US/2.0.0
- TEST_HARDCOVER_GLOBAL/1.0.0

Do not invent commercial KDP or marketplace values.

Create independent golden calculation fixtures.

Each fixture must contain:

- Unique case ID.
- Input.
- Rule Pack reference.
- Expected exact royalty.
- Expected production/distribution cost.
- Expected contribution.
- Rounding configuration.
- Independent mathematical derivation.

Never derive expected values by calling the implementation under test.

Cover:

- Ebook.
- Paperback.
- Hardcover.
- Every royalty tier boundary.
- Just-below, exact and just-above tier boundaries.
- Page thresholds.
- Zero and one excess page.
- Delivery-size boundaries.
- Fractional minor-unit calculations.
- All rounding modes.
- Both rounding points.
- Negative and positive rounding.
- Maximum supported safe values.
- Overflow.
- Invalid and missing inputs.
- Currency mismatch.

Keep existing STEP-004 fixtures unchanged.

# ================================================== 10. TESTING AND QUALITY

Required coverage:

100% branch coverage for packages/calc-engine.

Do not weaken existing coverage thresholds.

Ensure calc-engine source is actually included in coverage measurement.

Add tests for:

1. Royalty tier selection.
2. Exact rational calculation.
3. Rounding behavior for each mode.
4. Per-unit versus per-total rounding point semantics.
5. Deterministic trace output.
6. Error handling for all invalid inputs.
7. Verification of every golden fixture case.
8. Monotonicity where required by the economic model.
9. Immutability of returned results.

Do not use real clocks or random values.

# ================================================== 11. MANDATORY VERIFICATION BEFORE REPORTING

Run:

1. pnpm setup:hooks
2. pnpm typecheck
3. pnpm lint
4. pnpm format:check
5. pnpm docs:check
6. pnpm boundaries:check
7. pnpm test
8. pnpm test:coverage
9. pnpm build
10. git diff --check

If any step fails, fix it.

Do not report completion if any check fails.

# ================================================== 12. DOCUMENTATION AND FINAL REPORT

At the end of STEP-005, produce:

1. prompts/step-05.md
2. learning/implementation/step-05-per-unit-economics.md
3. learning/interviews/step-05-per-unit-economics.md
4. learning/notes/step-05-per-unit-economics.md
5. Update the ONE living docs/DESIGN.md.

Never create additional DESIGN files.

Your final report must state:

- Status of the accepted baseline.
- Exact files created or modified.
- Mathematical formulas implemented.
- Exact rounding rules implemented.
- Golden fixtures implemented and verified.
- Branch coverage achieved.
- All verification command results.
- Any ambiguities resolved.
- Explicit statement that:
  - STEP-005 is ready for review.
  - No commits have been made.
  - No code has been pushed.
  - Next step (STEP-006) remains strictly unauthorized.

## 1. Initial Authorization Directive

The initial directive authorized the implementation of STEP-005 (Per-Unit Economics) under Phase 1, establishing `@nimphy/calc-engine`, exact rational arithmetic, rounding engine, and calculation trace.

---

## 2. Engineering Review & Corrective Financial Audit Directive

```markdown
# NIMPHY — STEP-005 CORRECTIVE FINANCIAL AUDIT

## ENGINEERING REVIEW: REQUEST CHANGES

The STEP-005 completion report has undergone an independent review against the accepted STEP-004 baseline.
The implementation is NOT accepted.
There are material discrepancies between the reported golden fixture calculations and the actual synthetic Rule Packs.
Your immediate task is to audit and correct STEP-005.

Do not start STEP-006.
Do not commit or push.
Do not modify accepted STEP-004 fixtures.
Do not discard existing STEP-005 work.

Key Corrective Directives:

1. Preserve and inspect current work (report actual git status/diff, confirm HEAD e54073006136b0701bc89826d7143dea205ba164 and branch main).
2. Correct Paperback v1 golden values: baseCostMinor = 100, costPerPageMinor = 2, pageThreshold = 24, royaltyRateDecimal = "0.60". Expected print costs: 108 pages -> 268 minor units; 200 pages -> 452 minor units; 500 pages -> 1052 minor units.
3. Correct Paperback v2 golden values: baseCostMinor = 120, costPerPageMinor = 2, pageThreshold = 24, royaltyRateDecimal = "0.60". Expected print costs: 100 pages -> 272 minor units; 150 pages -> 372 minor units.
4. Correct Hardcover golden values: baseCostMinor = 600, costPerPageMinor = 3, pageThreshold = 75, royaltyRateDecimal = "0.50", currency = EUR. Expected print costs: 100 pages -> 675 minor units; 300 pages -> 1275 minor units; 500 pages -> 1875 minor units. Royalty: EUR 15.00 _ 50% = EUR 7.50; EUR 35.00 _ 50% = EUR 17.50 (NOT EUR 21.00).
5. Audit all golden cases against authoritative JSON parameters with independent manual derivation.
6. Acknowledge and document the Ebook fractional MB specification gap; do not treat ceiling as approved without owner confirmation.
7. Audit rounding specification: note ADR-005 is Proposed and establish decision table for positive/negative ties and fractions.
8. Fix rounding test quality: replace false tie ($5.50 _ 70% = 385) with actual mathematical half-cent tie ($3.05 _ 70% = 213.5).
9. Audit calc-engine implementation: pure domain import, BigInt rational arithmetic, overflow guards, immutable traces.
10. Git/config audit: explain working tree status and justify rootDir removal in calc-engine/tsconfig.json.
11. Run full verification suite with 100% branch coverage for calc-engine.
12. Reconcile documentation: prompts/step-05.md, learning/ files, and docs/DESIGN.md.
```
````
`````

````

---

## 3. Final Corrective Implementation & Owner-Approved Financial Policy (2026-11-12)

```markdown
# NIMPHY — STEP-005 FINAL CORRECTIVE IMPLEMENTATION

## OWNER-APPROVED FINANCIAL POLICY & ADR-005 ACCEPTANCE

Repository:
C:\Users\HP\Desktop\Projects\nimphy

Accepted implementation baseline:
e54073006136b0701bc89826d7143dea205ba164

Package:
@nimphy/calc-engine

Current milestone:
STEP-005 — Per-Unit Economics

================================================== 0. FORMAL OWNER AUTHORIZATION
==================================================

The repository owner has made the following explicit
financial-policy decisions on 2026-11-12.

These decisions are approved and must be implemented.

DECISION A — ROUNDING SEMANTICS: APPROVED

1. round_half_up: Nearest integer minor unit; exact ties away from zero (+2.5 -> +3, -2.5 -> -3).
2. round_half_even: Nearest integer minor unit; exact ties to nearest even integer (+2.5 -> +2, +3.5 -> +4, -2.5 -> -2, -3.5 -> -4).
3. round_down: Toward zero (truncation) (+2.7 -> +2, -2.7 -> -2).
4. round_up: Away from zero (+2.1 -> +3, -2.1 -> -3).

DECISION B — FRACTIONAL EBOOK FILE SIZE: APPROVED
Ebook delivery costs are proportional to the exact supplied file size in MB.
Do not round file size up to whole megabytes.
Use exact rational arithmetic.

DECISION C — ROUNDING SEQUENCE: APPROVED
PER_UNIT:

- Calculate exact gross royalty.
- Round gross royalty using the Rule Pack's rounding mode.
- Calculate exact production/distribution cost.
- Round any fractional monetary cost using the same Rule Pack rounding mode.
- Subtract rounded cost from rounded royalty.
- Return Money values in integer minor units.

PER_TOTAL:

- Preserve exact per-unit royalty.
- Preserve exact per-unit production/distribution cost.
- Do not prematurely round either component.
- STEP-006 will aggregate both exact components by quantity.
- STEP-006 will round aggregate royalty and aggregate production/distribution cost separately, exactly once.
- Aggregate contribution = rounded aggregate royalty minus rounded aggregate cost.

DECISION D — NEGATIVE PAPERBACK FIXTURE: APPROVED
Replace the invalid successful $4.00 paperback calculation with a valid $5.00 paperback calculation at 300 pages.
Also retain $4.00 as an invalid-input rejection test.

These four decisions are repository-owner approvals.
Do not ask the owner to reconfirm them.
```
````
