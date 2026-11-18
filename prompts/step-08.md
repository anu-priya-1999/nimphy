# Canonical Prompt Archive — STEP-008: Deterministic Sensitivity Analysis Engine

This document archives the official prompt instructions provided by the repository owner for the authorization and implementation of STEP-008.

---

## 1. Official Step Authorization & Scope Directive

```markdown
# Nimphy Global STEP-008 — Deterministic Sensitivity Analysis Engine

## Role

Act as a senior TypeScript financial-engineering developer implementing STEP-008 in Nimphy.

Build a production-quality, deterministic **Sensitivity Analysis Engine** inside the existing `@nimphy/calc-engine` package.

Follow `AGENTS.md`, the authoritative architecture documents, the existing STEP-005/006 calculation contracts, and the STEP-008 implementation roadmap.

Work only on STEP-008. Preserve all previously accepted functionality.

---

## 0. Mandatory Preflight — Git and STEP-007 Integrity

Before inspecting implementation details or changing files:

1. Run:
   - `git branch --show-current`
   - `git status --short`
   - `git log -5 --oneline`
2. Verify that STEP-007 has been committed and that its complete implementation is present in the current branch.
3. Verify that the working tree is clean.

**STOP without modifying anything if:**

- STEP-007 is still staged or uncommitted.
- STEP-007 files are missing.
- The branch contains unexpected changes.
- Existing work would have to be discarded, overwritten, stashed, or reset.

Do not attempt to clean up or commit STEP-007 yourself.

If preflight succeeds, continue.

Record the verified baseline commit hash in the implementation report.

---

## 1. Authoritative Scope

Read these documents completely before implementation:

- `AGENTS.md`
- `docs/architecture/00-README.md`
- `docs/architecture/02-product-scope-and-requirements.md`
- `docs/architecture/03-architecture-principles.md`
- `docs/architecture/04-system-architecture.md`
- `docs/architecture/05-component-responsibilities.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- `docs/architecture/22-definition-of-done.md`
- `docs/DESIGN.md`
- `packages/calc-engine/README.md`

Inspect the actual STEP-005/006 implementation, types, exports, rational arithmetic, trace structures, error classes, fixtures, and tests.

### STEP-008 roadmap contract

Implement exactly:

- Declared sensitivity drivers.
- One-at-a-time perturbations.
- Explicit perturbation sizes recorded in results and trace.
- Ranked sensitivity results.
- Deterministic tie-breaking.
- Reproducible calculations.

Roadmap verification requirements:

- Analytic sign checks.
- Ranking tie cases.
- Determinism.
- 100% calc-engine branch coverage.

FR-008 requires reproducible one-at-a-time perturbations of declared drivers, with recorded perturbation sizes and ranked results.

Do not expand the roadmap scope.

---

## 2. Sensitivity Driver Contract

Inspect FR-006 and the existing `ScenarioParametersInput` and `SingleScenarioInput` contracts.

The existing FR-006 scenario parameters are:

1. `units`
2. `listPriceMinor`
3. `costVariancePercent`

Treat these as the declared sensitivity-driver allow-list unless an existing accepted repository contract explicitly defines a different restriction.

Do not silently introduce additional sensitivity dimensions such as currency, book format, marketplace, page count, file size, or Rule Pack selection.

The baseline for analysis must be a valid base scenario.

Each requested driver must carry an explicit perturbation size.

Use domain-appropriate representations:

| Driver                | Perturbation representation   | Meaning              |
| --------------------- | ----------------------------- | -------------------- |
| `units`               | Positive safe integer         | Number of units      |
| `listPriceMinor`      | Positive safe integer         | Minor currency units |
| `costVariancePercent` | Positive exact decimal string | Percentage points    |

Examples:

- Units: `100`
- List price: `100` minor units
- Cost variance: `"5"` percentage points

The cost variance step must use the repository's exact decimal/Rational parsing conventions. Do not convert decimal strings through JavaScript floating-point arithmetic.

Validate:

- At least one driver is supplied.
- Drivers are supported.
- No duplicate driver is supplied.
- Perturbation sizes are strictly positive and valid.
- Numeric values are safe integers where required.
- Decimal strings follow the existing exact-decimal validation contract.

Do not invent an arbitrary driver or silently ignore an unsupported driver.

---

## 3. One-at-a-Time Perturbation Model

For each declared driver:

1. Calculate the baseline using the existing `calculateSingleScenario` implementation.
2. Create one lower perturbation.
3. Create one upper perturbation.
4. Change only the selected driver.
5. Preserve all other baseline scenario inputs.
6. Evaluate both perturbed scenarios through the existing calculation engine.
7. Record the actual input values and perturbation size.

Conceptually:

For driver \(D_i\) and perturbation \(\Delta_i\):

\[
D_i^- = D_i - \Delta_i
\]

\[
D_i^+ = D_i + \Delta_i
\]

Every other input remains unchanged.

Do not calculate multiple simultaneous perturbations. Do not apply artificial low/base/high multipliers.

### Boundary behavior

Never silently clamp a perturbed input to a Rule Pack boundary or replace it with a different value.

For example:

- Negative units are invalid.
- A list price outside Rule Pack bounds is invalid.
- Cost variance below -100% is invalid.
- An unsafe integer is invalid.

Use existing calculation validation and typed error conventions.

If a requested perturbation cannot be evaluated, fail explicitly using the appropriate existing error contract. Do not silently omit the affected driver or return misleading partial rankings.

---

## 4. Sensitivity Metric and Ranking Contract

Use **total scenario net contribution** as the primary sensitivity metric.

For every driver, record:

- Baseline net contribution.
- Lower-perturbation net contribution.
- Upper-perturbation net contribution.
- Lower delta relative to baseline.
- Upper delta relative to baseline.
- Absolute impact score.
- Ranking position.

All monetary differences must use integer minor units with the correct currency.

Define the score deterministically:

\[
I*i =
\max\left(
|\text{Contribution}\_i^- - \text{Contribution}*{base}|,
|\text{Contribution}_i^+ - \text{Contribution}_{base}|
\right)
\]

The score is measured in the currency's minor units.

Rank drivers by:

1. Impact score, descending.
2. Stable driver identifier, ascending, when impact scores are equal.

Use a deterministic code-point comparison for tie-breaking. Do not depend on locale-specific sorting.

Do not use unstable sorting or input order as an implicit tie-break.

Record the ranking metric and configured perturbation sizes so that the meaning of the ranking remains transparent.

The ranking represents impact at the explicitly configured perturbation sizes. Do not present it as a normalized elasticity or universal measure independent of the chosen perturbations.

If revenue is included as a secondary output, keep its meaning distinct from net contribution. Do not rank by revenue while documenting the ranking as net-contribution sensitivity.

---

## 5. Calculation Engine Architecture

Implement the sensitivity engine as a pure module under:

`packages/calc-engine/src/sensitivity/`

Follow the existing package conventions for:

- `types.ts`
- calculation implementation
- public barrel `index.ts`
- unit tests
- property tests
- golden fixture tests

Inspect the existing folder structure and avoid introducing redundant files or abstractions.

### Mandatory architecture constraints

- Pure deterministic functions.
- Zero I/O.
- Zero filesystem access.
- Zero network access.
- Zero clock access.
- Zero random-number generation.
- Zero AI imports.
- No database or framework imports.
- `calc-engine` may depend only on `domain`.
- Reuse `calculateSingleScenario` as the source of financial results.
- Do not duplicate royalty, cost, aggregation, or rounding formulas.
- Preserve `Rational` for exact decimal arithmetic.
- Use BigInt for exact arithmetic where required.
- Preserve safe integer overflow guards.
- Deep-freeze public result objects and nested collections using existing conventions.
- Preserve deterministic canonical trace output.

Do not add a new dependency unless a necessary architectural gap is demonstrated and explicitly documented.

### Existing calculation contracts that must remain intact

Preserve:

- STEP-005 per-unit economics.
- STEP-006 scenario totals.
- ADR-005 `per_unit` behavior.
- ADR-005 `per_total` behavior.
- All four rounding modes.
- Existing Rule Pack validation.
- Existing error types and codes.
- Existing scenario trace contracts.
- STEP-007 break-even implementation and limitations.

In particular, under `per_total`, continue to preserve exact component fractions until the existing aggregation function performs the prescribed rounding.

Do not implement separate financial arithmetic inside sensitivity analysis.

Do not change the STEP-007 formula-defined break-even contract.

---

## 6. Result and Trace Design

Design a strongly typed public result contract.

The result should provide:

- Baseline scenario result or equivalent auditable baseline summary.
- Currency and baseline reference.
- Declared drivers.
- Original perturbation sizes.
- Lower and upper perturbation values.
- Lower and upper scenario results or auditable summaries.
- Contribution deltas relative to baseline.
- Absolute impact scores.
- Deterministic rank.
- Complete calculation trace.

Trace information must make it possible to reconstruct:

- Baseline inputs.
- Rule Pack reference and content hash.
- Engine version.
- Each declared driver.
- Each perturbation size.
- Lower and upper effective inputs.
- The unchanged inputs shared by the perturbations.
- Each lower and upper scenario calculation.
- Baseline and perturbed net contributions.
- Impact-score derivation.
- Final ranking and tie-break decisions.

Reuse existing scenario calculation traces rather than recreating their financial details.

Do not include timestamps, random identifiers, machine paths, or environment-dependent values.

All outputs must be reproducible for identical inputs.

---

## 7. Testing Requirements

STEP-008 is an engine change. The existing Definition of Done applies, including 100% branch coverage for `packages/calc-engine`.

Use existing repository testing conventions and fixtures:

- Vitest.
- Synthetic Rule Packs:
  - `TEST_EBOOK_STANDARD`
  - `TEST_PAPERBACK_US`
  - `TEST_HARDCOVER_GLOBAL`
- Multi-pack coverage across all 4 synthetic Rule Packs.
- Exact golden fixture parity.
- Explicit golden fixture inventory test.
- Deterministic property tests.
- Zero-warning standard.

### Mandatory test groups

1. **Input validation:**
   - Empty driver list.
   - Unsupported driver.
   - Duplicate driver.
   - Zero or negative perturbation size.
   - Non-safe-integer numeric values.
   - Invalid decimal strings.
   - Invalid baseline scenario.
2. **Boundary and error cases:**
   - Perturbed units `< 0`.
   - Perturbed list price below Rule Pack minimum.
   - Perturbed list price above Rule Pack maximum.
   - Perturbed cost variance $< -100\%$.
   - Addition or subtraction overflow.
   - Verified that invalid perturbations fail explicitly rather than silently clamping.
3. **Analytic sign checks:**
   - Units up, net contribution up or flat (non-negative contribution per unit).
   - Units down, net contribution down or flat.
   - Price up, net contribution up.
   - Price down, net contribution down.
   - Cost variance up, net contribution down or flat.
   - Cost variance down, net contribution up or flat.
4. **Ranking and tie-breaking:**
   - Distinct impact scores ranked strictly descending.
   - Identical impact scores broken deterministically by driver identifier ascending.
   - Arbitrary driver input order produces identical ranking and identical tie-break order.
5. **Exact arithmetic and financial parity:**
   - `calculateSensitivity` perturbed net contribution equals `calculateSingleScenario` evaluated on identical perturbed inputs.
   - All deltas equal `perturbed - baseline`.
   - Exact decimal arithmetic for cost variance perturbations.
6. **Golden fixtures:**
   - Create golden fixtures for sensitivity analysis covering all 4 synthetic Rule Packs.
   - Verify every fixture case in a dedicated test suite.
7. **Trace and immutability:**
   - Trace matches expected canonical structure.
   - Freezing prevents mutation of public results, nested scenario summaries, rankings, and trace structures.

Do not report tests as passing until they have been executed directly.

---

## 8. Definition of Done and Verification

Follow `docs/architecture/22-definition-of-done.md`.

All checks must pass with zero errors and zero warnings:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm arch:check`
- `pnpm test:coverage`
- `git diff --check`

Coverage requirements for `packages/calc-engine`:

- 100% statement coverage.
- 100% branch coverage.
- 100% function coverage.
- 100% line coverage.

Do not lower thresholds or bypass checks.

---

## 9. Deliverables

Create:

- `packages/calc-engine/src/sensitivity/types.ts`
- `packages/calc-engine/src/sensitivity/sensitivity-calc.ts`
- `packages/calc-engine/src/sensitivity/index.ts`
- `packages/calc-engine/src/sensitivity/sensitivity-calc.test.ts`
- `packages/calc-engine/src/sensitivity/golden-sensitivity.test.ts`
- `packages/calc-engine/src/sensitivity/properties.test.ts`
- `fixtures/calc-engine/golden-sensitivity-cases.json`
- `prompts/step-08.md`
- `learning/implementation/step-08-sensitivity.md`
- `learning/interviews/step-08-sensitivity.md`
- `learning/notes/step-08-sensitivity.md`

Update:

- `packages/calc-engine/src/index.ts`
- `packages/calc-engine/src/index.test.ts`
- `packages/calc-engine/README.md`
- `docs/DESIGN.md`

Do not create `DESIGN-step-08.md` or any separate design document. Update the single existing living design record.

---

## 10. Git Discipline

Leave all changes in the working tree for repository-owner review.

- Do not run `git add`.
- Do not run `git commit`.
- Do not run `git push`.
- Do not run `git reset`.
- Do not run `git checkout -- .`.
- Do not run `git clean`.
- Do not stash changes.

Report the modified files and verification results.

---

## 11. Final Report Requirements

In your final response, provide:

1. Preflight status and verified baseline commit hash.
2. Sensitivity driver allow-list and validation rules.
3. Perturbation model and boundary-handling decisions.
4. Primary sensitivity metric, impact-score formula, and tie-breaking rule.
5. Exact arithmetic and rational precision implementation details.
6. Public API signatures and trace structure summary.
7. Complete file inventory with paths and line counts.
8. Exact verification command outputs:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm arch:check`
   - `pnpm test:coverage`
   - `git diff --check`
9. Test count reconciliation and coverage report for `packages/calc-engine`.
10. Explicit statement that working tree changes are uncommitted and ready for review.
```
