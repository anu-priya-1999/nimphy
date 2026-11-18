# Canonical Prompt Archive — STEP-007: Engine: Break-Even

This document archives the official prompt instructions provided by the repository owner for the authorization and implementation of STEP-007.

---

## 1. Official Step Authorization & Scope Directive

```markdown
# NIMPHY — STEP-007: ENGINE: BREAK-EVEN

## OFFICIAL ENGINEERING IMPLEMENTATION ASSIGNMENT

Repository: `C:\Users\HP\Desktop\Projects\nimphy`

GitHub: https://github.com/anu-priya-1999/nimphy

**Accepted prerequisite commit:** `50c09e3e9f9c125875b71dd7461a78b133ae932f`

**Current milestone:** STEP-007 — Engine: Break-even

**Architecture package version:** 0.4.0

**Phase:** Phase 1 — Deterministic Core

This prompt constitutes the repository owner's written authorization to begin STEP-007, subject to the mandatory financial-contract review below.

The responsibility is to implement a production-quality, mathematically correct, deterministic break-even calculation capability in `@nimphy/calc-engine`.

Do not treat this as a prototype.

---

# 1. ENGINEERING GOVERNANCE

Before making any changes:

1. Inspect `git status --short`.
2. Confirm branch, HEAD and latest commit.
3. Confirm STEP-006 commit `50c09e3` is present.
4. Preserve all existing user changes.
5. Read `AGENTS.md`.
6. Read the current `docs/DESIGN.md`.
7. Inspect the authoritative architecture documentation.
8. Inspect all relevant STEP-005 and STEP-006 implementation files, fixtures and tests.

Do not reset, clean, stash, overwrite or discard existing work.

If the repository is not in the expected state, report the difference before proceeding.

Implement only STEP-007.

Do not anticipate or partially implement STEP-008 or STEP-009.

# 2. AUTHORITATIVE DOCUMENTATION

Read the following documents before implementation.

## Mandatory architecture documents

- `AGENTS.md`
- `README.md`
- `docs/DESIGN.md`
- `docs/architecture/02-product-scope-and-requirements.md`
- `docs/architecture/03-architecture-principles.md`
- `docs/architecture/04-system-architecture.md`
- `docs/architecture/05-component-responsibilities.md`
- `docs/architecture/06-database-architecture-and-schema.md`
- `docs/architecture/07-api-architecture.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- `docs/architecture/22-definition-of-done.md`

Read the relevant portions of the remaining architecture documents where required.

## Existing implementation references

Inspect:

- `packages/domain/src/money/money.ts`
- `packages/domain/src/money/currency.ts`
- `packages/domain/src/errors/domain-error.ts`
- `packages/domain/src/types.ts`
- `packages/calc-engine/src/math/rational.ts`
- `packages/calc-engine/src/per-unit/per-unit-calc.ts`
- `packages/calc-engine/src/per-unit/types.ts`
- `packages/calc-engine/src/scenarios/scenario-calc.ts`
- `packages/calc-engine/src/scenarios/types.ts`
- `packages/calc-engine/src/scenarios/index.ts`
- `packages/calc-engine/src/errors/calc-error.ts`
- `packages/calc-engine/src/index.ts`
- `packages/calc-engine/README.md`

Inspect existing golden fixtures and test conventions:

- `fixtures/rules/`
- `fixtures/calc-engine/golden-per-unit-cases.json`
- `fixtures/calc-engine/golden-scenario-cases.json`
- `packages/calc-engine/src/per-unit/`
- `packages/calc-engine/src/scenarios/`

STEP-005 and STEP-006 are accepted implementation baselines. Preserve their existing financial behaviour.

# 3. STEP-007 AUTHORITATIVE SCOPE

The roadmap specifies:

### A. Break-even units

Calculate the number of whole units required to cover the specified fixed cost using the applicable unit contribution.

### B. Break-even revenue

Calculate and return the revenue associated with the break-even threshold.

### C. Unreachable cases

Return an explicit unreachable result when unit contribution is:

- Zero.
- Negative.

Do not return a misleading zero-unit break-even result for these cases.

### D. Exact integer and ceiling semantics

Implement the mathematical ceiling operation without floating-point arithmetic.

Required formula:

\[
Q\_{\text{be}} =
\left\lceil
\frac{\text{FixedCost}}{\text{UnitContribution}}
\right\rceil
\]

The output must represent the minimum whole-unit threshold under the approved financial contract.

### E. Golden verification

Create independently hand-derived golden fixtures.

### F. Coverage

Maintain 100% branch coverage for `packages/calc-engine`.

---

# 4. MANDATORY FINANCIAL-CONTRACT REVIEW — BEFORE CODING

This section is a mandatory implementation gate.

The existing documentation establishes FR-007 and the ceiling formula, but inspect the actual contracts before deciding the public API.

Explicitly investigate these questions.

## A. Fixed-cost input contract

The STEP-006 `ScenarioParameters` contract currently defines:

- `units`
- `listPriceMinor`
- `costVariancePercent`

It does not establish a fixed-cost field.

Determine how STEP-007 should receive fixed cost.

Inspect whether the appropriate contract is an explicit standalone function argument using `Money` or another existing domain-compatible representation.

Do not silently add fixed costs to:

- `ScenarioParameters`
- `ScenarioTotals`
- The Rule Pack schema
- Database schemas
- Persisted business cases

STEP-007 is a calculation-engine milestone, not a database or UI milestone.

## B. Unit-contribution semantics

Determine the precise unit-contribution value used by the break-even formula.

It must account for:

- Existing royalty calculations.
- Applicable production/distribution costs.
- Scenario cost variance.
- Accepted ADR-005 rounding semantics.
- Currency consistency.

Do not derive unit contribution by dividing aggregated contribution by scenario quantity. This is invalid for zero-unit scenarios and can lose precision under `per_total`.

Use the existing STEP-005 and STEP-006 calculations as the source of truth.

## C. `per_unit` versus `per_total`

Preserve the accepted ADR-005 contract.

`per_unit`:

- Uses the already-rounded unit royalty and unit cost.
- Does not introduce a second rounding operation.

`per_total`:

- Preserves exact rational amounts until aggregate rounding.
- Rounds aggregate royalty and aggregate cost separately.
- Derives contribution by subtraction.

Investigate whether the proposed break-even ceiling calculation is consistent with these semantics.

Specifically, verify whether the minimum whole-unit threshold derived from the formula also satisfies the corresponding aggregate financial contract.

Do not silently substitute rounded per-unit contribution for exact per-total contribution.

Do not alter ADR-005.

If the existing specification does not determine a mathematically consistent break-even interpretation, STOP before implementation and return a concise owner decision proposal with the competing interpretations and independently calculated examples.

## D. Break-even revenue definition

FR-007 requires both units and revenue.

Inspect `docs/architecture/07-api-architecture.md`, particularly the existing calculation-result example:

`breakEven: { reachable: true, units: 0 }`

The existing example does not fully specify the revenue field.

Determine the exact definition of break-even revenue.

Distinguish between:

1. Revenue at the minimum whole-unit break-even threshold.
2. The theoretical break-even sales revenue derived from the contribution-margin ratio.

Do not silently choose between these interpretations.

Return the proposed result contract and supporting mathematical examples before implementation if the authoritative documentation does not resolve this distinction.

## E. Unreachable result contract

Establish an explicit, type-safe representation for unreachable results.

The API must distinguish:

- Reachable break-even.
- Zero unit contribution.
- Negative unit contribution.

Do not encode unreachable results as fabricated monetary values.

## Gate acceptance

If the existing architecture and approved financial decisions fully resolve these questions, document the interpretation and proceed.

If a material financial-policy decision remains unresolved, do not invent it. Stop and request owner approval before modifying implementation files.

---

# 5. IMPLEMENTATION — PURE CALCULATION ENGINE

Once the contract is resolved, implement the functionality inside:

`packages/calc-engine/`

Use small, focused modules consistent with the existing STEP-005 and STEP-006 architecture.

Expected responsibilities:

- Break-even input types.
- Break-even result types.
- Input validation.
- Exact ceiling arithmetic.
- Unreachable-case handling.
- Break-even revenue calculation.
- Deterministic audit trace.
- Public exports.

Use appropriate existing errors and introduce a new typed error only when justified.

## Mathematical requirements

Use native `BigInt` for exact integer arithmetic.

For positive fixed cost and positive unit contribution, calculate the quotient using integer division and remainder.

The ceiling operation must follow the explicit mathematical rule:

- Exact division: use the quotient.
- Non-zero remainder: add exactly one.

Never use:

- Floating-point division for financial quantities.
- `Math.ceil()` on monetary ratios.
- `parseFloat()` for money.
- Implicit rounding.
- Unsafe Number conversion.
- Intermediate monetary values outside safe-integer boundaries.

Validate final integer values before conversion to JavaScript `number`.

Use `CalcOverflowError` for supported monetary or quantity overflow conditions.

Validate currency consistency.

Reject malformed or unsupported inputs using typed validation errors.

Do not silently clamp invalid values.

## Zero and negative boundaries

Cover:

- Positive fixed cost, positive contribution.
- Zero fixed cost, positive contribution.
- Zero unit contribution.
- Negative unit contribution.
- Exact ceiling division.
- Non-exact ceiling division.
- Contributions of one minor unit.
- Fixed costs of one minor unit.
- Very large safe-integer boundaries.
- Overflow during break-even calculation.
- Overflow during break-even revenue calculation.
- Currency mismatch.

Zero fixed cost and positive contribution should be handled according to the approved contract.

A zero or negative unit contribution must not be labelled reachable merely because fixed cost is zero.

# 6. DETERMINISM, TRACEABILITY AND IMMUTABILITY

Follow P-01, P-03, P-04 and P-09.

The break-even engine must have:

- Zero I/O.
- Zero network calls.
- Zero filesystem access.
- Zero AI imports.
- Zero system-clock dependencies.
- Zero randomness.
- Zero floating-point financial arithmetic.

Create a deterministic trace containing sufficient information to reproduce the result:

- Explicit fixed-cost input.
- Currency.
- Applicable unit-contribution representation.
- Relevant Rule Pack and engine version references where available.
- Exact arithmetic numerator and denominator.
- Quotient.
- Remainder.
- Ceiling decision.
- Break-even units.
- Break-even revenue.
- Reachability status.

Represent arbitrary-precision values as strings in serialized traces.

Use the existing immutable-result conventions and `deepFreeze` implementation where appropriate.

Never mutate inputs, scenario results or Rule Packs.

# 7. TESTING REQUIREMENTS

Create focused tests consistent with existing Vitest conventions.

## A. Unit tests

Cover:

- Valid reachable calculations.
- Exact integer quotient.
- Non-integer quotient requiring ceiling.
- Revenue output.
- Zero fixed cost.
- Zero contribution.
- Negative contribution.
- Input validation.
- Currency consistency.
- Safe integer boundaries.
- Typed overflow errors.

## B. Boundary tests

Specifically verify:

- Contribution exactly divides fixed cost.
- Contribution leaves a remainder.
- One minor unit below and above exact divisibility.
- Minimum valid positive contribution.
- Maximum supported integer boundaries.
- Negative contribution boundary.
- Zero contribution boundary.
- Zero fixed-cost boundary.

## C. Golden fixtures

Create:

`fixtures/calc-engine/golden-break-even-cases.json`

Use independently hand-derived expected values.

Do not calculate expected values by calling the implementation under test.

Cover all four existing synthetic Rule Packs wherever applicable.

Every expected monetary value must include its currency and integer minor-unit representation.

Clearly record the assumptions behind each fixture.

## D. Property tests

Add deterministic property-based tests where mathematically applicable.

Examples:

- Increasing fixed cost cannot decrease break-even units when unit contribution remains positive.
- Increasing positive unit contribution cannot increase break-even units when fixed cost remains positive.
- The computed unit threshold covers the fixed cost under the approved contract.
- One fewer unit does not cover the fixed cost when a positive whole-unit threshold exists.
- All computed results remain deterministic.
- Unreachable cases remain unreachable.

Use deterministic seeded generation following STEP-006 conventions.

Do not use unseeded `Math.random()`.

## E. Coverage

Maintain 100% branch coverage for all executable production code in `packages/calc-engine`.

Inspect the existing V8 coverage instrumentation.

Do not hide new branches through coverage exclusions or ignore annotations merely to achieve 100%.

If a mathematically unreachable defensive branch is genuinely necessary, document its reasoning and handle it consistently with existing STEP-006 policy.

---

# 8. PUBLIC API AND ARCHITECTURE BOUNDARIES

Export the approved break-even function and types from:

`packages/calc-engine/src/index.ts`

Update:

`packages/calc-engine/README.md`

Document:

- Mathematical formula.
- Input contract.
- Reachable and unreachable cases.
- Rounding interpretation.
- Exact arithmetic.
- Errors.
- Trace contract.
- Example usage.

Do not implement:

- API routes.
- Database migrations.
- Persistence.
- Authentication.
- UI.
- Break-even charts or cards.
- AI explanations.
- Sensitivity analysis.

Do not modify `packages/domain` unless the resolved contract establishes a genuine domain-level requirement. If that is necessary, explain the reason before changing it.

Do not introduce external dependencies.

Do not refactor unrelated STEP-005 or STEP-006 implementation.

If the approved output contract requires a documentation correction in `docs/architecture/07-api-architecture.md`, make only the relevant documentation reconciliation; do not implement the API layer.

---

# 9. MANDATORY STEP DOCUMENTATION

Follow `AGENTS.md` §3.

Create these four documents:

1. `prompts/step-07.md`
2. `learning/implementation/step-07-break-even.md`
3. `learning/interviews/step-07-break-even.md`
4. `learning/notes/step-07-break-even.md`

Update the ONE existing:

`docs/DESIGN.md`

Do not create additional DESIGN documents.

## Implementation report

Document:

- Objective and scope.
- Final approved mathematical contract.
- Financial assumptions and their approval source.
- Public TypeScript API.
- Exact integer arithmetic.
- Zero and negative contribution behaviour.
- Rounding-policy interaction.
- Overflow protection.
- Deterministic trace.
- Files created and modified.
- Test inventory and actual execution results.
- Coverage report.
- Final Git state.
- Remaining limitations.
- Next proposed step: STEP-008.

## Interview preparation

Include senior-level explanations of:

- Break-even mathematics.
- Exact integer ceiling division.
- Why floating-point `Math.ceil()` is inappropriate.
- Contribution versus revenue.
- Break-even units versus break-even revenue.
- Zero and negative contribution.
- Fixed-cost modelling.
- Overflow safety.
- Currency handling.
- `per_unit` versus `per_total`.
- Deterministic financial calculation traces.
- Property-based testing.

## Engineering notes

Include implementation details, edge cases, mathematical derivations, API contracts, failure modes and troubleshooting guidance.

---

# 10. VALIDATION AND ACCEPTANCE

First inspect `package.json`, `docs/architecture/14-local-development.md`, existing scripts and CI configuration.

Use the actual repository commands.

At minimum, verify the relevant:

- Calc-engine tests.
- Calc-engine coverage.
- Monorepo tests.
- Typecheck.
- Lint.
- Format check.
- Import-boundary checks.
- Documentation checks.
- Git whitespace checks.

Run the full applicable suite, not only the newly added test file.

Record actual output, exit codes and coverage.

Never report an unexecuted command as passing.

## STEP-007 exit criteria

STEP-007 is complete only when:

1. The approved financial contract is implemented.
2. Units and revenue are correct.
3. Unreachable cases are explicit.
4. Exact ceiling semantics are proven by tests.
5. Both rounding policies remain consistent with ADR-005.
6. Independent golden fixtures pass.
7. Boundary and property tests pass.
8. `packages/calc-engine` has 100% branch coverage.
9. Typecheck, lint, format and documentation checks pass.
10. All four STEP-007 documents exist.
11. `docs/DESIGN.md` is reconciled.
12. The implementation is independently reviewable.

# 11. GIT AND OPERATIONAL RESTRICTIONS

- Preserve the existing STEP-006 commit.
- Do not amend or rewrite commit `50c09e3`.
- Do not reset or discard existing work.
- Do not stage changes automatically.
- Do not commit.
- Do not push.
- Do not modify the implementation roadmap.
- Do not begin STEP-008.
- Do not implement sensitivity analysis.
- Do not introduce unrelated cleanup or refactoring.

Return a clear implementation report and final Git status.

The repository owner will review the changes before the next commit.

---

# 12. FINAL DELIVERABLE

Return:

1. STEP-007 implementation summary.
2. The resolved financial-contract decision and its evidence.
3. Complete file inventory.
4. Mathematical derivation and worked examples.
5. Test results and coverage.
6. Typecheck/lint/format/docs verification.
7. Architecture and security considerations.
8. Known limitations.
9. Final Git status.
10. Next proposed step: STEP-008 — Engine: Sensitivity.

**The single most important constraint: preserve the mathematical integrity of STEP-005 and STEP-006. Never introduce an undocumented financial assumption to make break-even calculations appear complete.**
```

---

## 2. Official Follow-up Directive — Repository Owner Decisions

```markdown
# STEP-007 — Repository Owner Decisions and Required Follow-up

The repository owner has reviewed the independent financial correctness report and has made the following decisions.

## Decision 1 — Retain the roadmap break-even formula

Retain the explicitly specified roadmap formula:

\[
Q\_{be}=\left\lceil\frac{FixedCost}{ExactUnitContribution}\right\rceil
\]

Use exact rational arithmetic and BigInt ceiling division.

Do not replace this formula with a ledger-minimum search as part of STEP-007. Do not implement the proposed \`Q_be - 1\` adjustment.

The proposed adjustment does not establish true minimum-unit optimality. Aggregate rounded contribution can be non-monotonic, and checking only the immediately preceding quantity can miss earlier qualifying quantities.

Update the documentation to distinguish:

- The formula-defined break-even quantity required by the roadmap.
- The minimum quantity that happens to cover fixed cost under independently rounded aggregate ledger components.

Do not claim that the formula-defined quantity is always the minimum rounded-ledger threshold.

### Mandatory rounding-mode investigation

Before claiming that the formula guarantees ledger coverage under \`per_total\`, inspect the actual Rule Pack schema, parser, and validation rules.

Establish exactly which rounding modes are permitted with \`per_total\`.

The following counterexample must be considered if \`round_half_even\` is permitted:

- Exact royalty: 2.5
- Exact cost: 1.5
- Exact contribution: 1
- Fixed cost: 1
- Formula-defined quantity: 1
- Independently rounded aggregate royalty: 2
- Independently rounded aggregate cost: 2
- Rounded aggregate contribution: 0

Do not claim universal coverage if an allowed configuration can under-cover.

If the current architecture permits this combination, document the conflict between the formula-defined threshold and rounded-ledger coverage. Do not silently change ADR-005, the rounding policy, or the roadmap formula. Report the evidence and request a separate architectural decision if a contract change is required.

If \`per_total\` is restricted to compatible rounding modes, provide source-level evidence and tests demonstrating that restriction.

## Decision 2 — Approve the break-even revenue definition

Approve:

\`revenue = listPriceMinor \* breakEvenUnits\`

Its precise semantic meaning is:

**Gross retail sales revenue at the whole-unit, formula-defined break-even threshold.**

This is not the author's royalty income, publisher proceeds, or net profit.

Keep the contract consistent with the existing scenario engine's revenue calculation. Update the API architecture, DESIGN.md, calc-engine README, and STEP-007 learning documentation wherever needed.

For unreachable results, omit both units and revenue. Do not represent an unreachable calculation as zero units.

## Decision 3 — Preserve the corrected examples and reconciliation

Retain the corrected paperback calculations:

- Example 1: 336 units; $5,036.64 gross retail sales revenue.
- Example 2: 1,000 units; $20,000.00 gross retail sales revenue.
- Example 4: -$3.52 contribution per unit; unreachable.

Retain the corrected inventory of 11 new files and 7 modified files.

The reported test reconciliation is 255 calc-engine tests and 588 monorepo tests. Preserve the exact per-file breakdown and actual test output as evidence. Do not report a test count based only on source-level declarations.
```

---

## 3. Official Follow-up Directive — Final Mathematical and Documentation Corrections

```markdown
# STEP-007 — Final Mathematical and Documentation Corrections

Perform a narrowly scoped correction pass. The repository owner has reviewed the latest follow-up report and identified the following remaining issues.

## 1. Correct the `per_total` rounding-mode conclusion

The report currently proposes disallowing both `round_half_even` and `round_down` because of the ledger-coverage issue.

This conclusion is too broad.

For non-negative aggregate amounts and integer fixed costs, `round_half_up`, `round_down`, and `round_up` preserve the integer-shift property needed for the coverage argument.

`round_half_even` is the demonstrated exception because tie-breaking can depend on the parity of the integer part.

Correct the documentation and learning material accordingly:

- Retain the demonstrated `round_half_even` counterexample.
- Do not classify `round_down` as an unsafe mode based on this counterexample.
- Do not recommend disallowing `round_down` without a valid independent counterexample.
- Preserve the finding that the current schema permits all four rounding modes with `per_total`.
- Do not change the Rule Pack schema, validator, ADR-005, or financial implementation.
- Do not claim that every possible financial behavior has been formally proven unless the proof is actually established.

## 2. Correct the paperback Example 1 arithmetic

The correct remainder is:

150,000 - (335 × 447) = 255 minor units.

One section currently states 235. Correct it everywhere in STEP-007 documentation.

The correct values are:

- Unit contribution: 447 cents.
- Fixed cost: 150,000 cents.
- Quotient: 335.
- Remainder: 255.
- Formula-defined threshold: 336 units.
- Revenue: 503,664 cents ($5,036.64).

## 3. Correct paperback Example 2 consistency

Use the actual authoritative fixture-derived values consistently.

- List price: 2,000 cents.
- Royalty: 1,200 cents.
- Print cost: 252 cents.
- Unit contribution: 948 cents.
- Fixed cost: 948,000 cents.
- Formula-defined threshold: 1,000 units.
- Revenue: 2,000,000 cents ($20,000.00).

Remove the inconsistent alternative values of 200 cents contribution and 200,000 cents fixed cost from this worked example.

## 4. Preserve all accepted work

- Inspect the working tree first.
- Preserve all existing STEP-007 implementation and test changes.
- Do not reset, revert, delete, or recreate files.
- Do not alter the approved financial formula.
- Do not change the approved gross retail revenue definition.
- Do not begin STEP-008.
- Update only the existing `docs/DESIGN.md` for the living design record.
- Keep all four canonical STEP-007 documentation artifacts consistent.
- Do not commit or push.

## 5. Validation and report

Run the relevant documentation, formatting, typecheck, and test checks after corrections.

Report:

1. Every file changed and why.
2. The exact corrected rounding-mode conclusion.
3. Confirmation that both worked examples are now internally consistent.
4. Actual validation results and exit codes.
5. Final `git status --short`.
6. Any remaining financial-contract limitations.

Do not claim STEP-007 is accepted merely because the checks pass. Report the final state for repository-owner review.
```
