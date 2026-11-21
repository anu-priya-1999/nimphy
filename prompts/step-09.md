# Canonical Prompt Archive — STEP-009: Differential Reference Check & Mutation Testing

This document archives the official prompt instructions provided by the repository owner for the authorization and implementation of STEP-009.

---

## 1. Official Step Authorization & Scope Directive

```markdown
# Nimphy Global STEP-009 — Differential Reference Check & Mutation Testing

## Role

Act as a senior TypeScript financial-engineering and test-infrastructure engineer implementing STEP-009 in Nimphy.

Build a production-quality **independent differential reference-testing harness** for `@nimphy/calc-engine`, together with a reproducible mutation-testing setup.

Follow `AGENTS.md`, the authoritative architecture documents, and the existing STEP-005 through STEP-008 calculation contracts.

The repository owner has authorized STEP-009. Implement STEP-009 only.

---

## 0. Mandatory Preflight — Git and Previous Steps

Before modifying anything, inspect:

git branch --show-current
git status --short
git log -5 --oneline

Verify:

1. STEP-005 through STEP-008 implementations are present.
2. STEP-008 commit `454173e8555d195facebff3f70f1d54332c93bc3` exists in the current history.
3. STEP-008 corrective commit `9c80b7b` exists in the current history.
4. The working tree is clean.
5. The current branch and repository state are consistent with the intended implementation baseline.

Do not require the commits to have been pushed to `origin`.

**STOP without modifying files if:**

- The working tree contains uncommitted changes.
- Either STEP-008 commit is missing.
- Previous step implementations are incomplete.
- The repository state is inconsistent or unexpected.

Never stash, reset, discard, overwrite, commit, or push user changes.

Record the verified HEAD SHA in the final report.

---

## 1. Authoritative Documents

Read these documents before implementation:

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

Inspect the actual implementations, types, Rule Pack fixtures, error contracts, golden fixtures, property tests, scenario traces, and existing CI configuration for STEPs 005–008.

Do not assume documentation is more authoritative than the actual accepted implementation when they disagree. Identify and resolve discrepancies explicitly.

---

## 2. Authoritative STEP-009 Scope

The roadmap defines STEP-009 as:

- Independent reference implementation or spreadsheet cross-check.
- Mutation-testing setup.
- Dependency on STEPs 005–008.
- Differential test running in CI.
- Update architecture testing documentation with actual tool names.

The testing strategy in `docs/architecture/12-testing-and-ai-evaluation.md` additionally requires:

- Independent reference calculations for random inputs.
- Differential comparison against the production calculation engine.
- Mutation testing on `calc-engine`.
- Exact, deterministic financial results.

Implement these requirements without expanding into STEP-010 or later.

---

## 3. Independent Reference Implementation

Create a test-only independent reference implementation for validating the financial calculations in `@nimphy/calc-engine`.

### Critical independence requirement

The reference implementation must not reuse production calculation logic.

It must NOT import or call:

- `calculatePerUnitEconomics`
- `calculateSingleScenario`
- `calculateTriadScenarios` or other production scenario calculations
- `calculateBreakEven`
- `calculateSensitivity`
- Production `Rational` arithmetic helpers
- Production rounding helpers
- Any private calculation helper from `packages/calc-engine`

Do not build a thin wrapper around production functions and call it an oracle.

The reference implementation must derive results independently from the authoritative financial formulas, Rule Pack contracts, and accepted rounding semantics.

### Arithmetic requirements

Use an independent exact-arithmetic implementation suitable for financial verification.

- Use `BigInt` and an independently implemented rational representation where required.
- Do not convert decimal strings into JavaScript floating-point values for financial calculations.
- Independently implement all four supported rounding modes:
  - `round_half_up`
  - `round_half_even`
  - `round_down`
  - `round_up`
- Independently implement both aggregation points:
  - `per_unit`
  - `per_total`
- Preserve integer minor-unit monetary comparisons.
- Independently enforce the mathematical boundaries required for valid reference inputs.

The oracle should use its own minimal input and Rule Pack representations. It may read existing JSON Rule Pack fixtures, but must not depend on production calculation functions or helpers.

Keep the oracle entirely test-only. Do not export it from the production package barrel or introduce production dependencies.

### Financial calculations to cross-check

Inspect the public calculation APIs and cover the actual financial functionality implemented in STEPs 005–008:

1. Per-unit economics:

   - Gross royalty.
   - Production cost.
   - Delivery cost where applicable.
   - Unit contribution.
   - Applicable cost and rounding outputs.

2. Scenario calculations:

   - Baseline scenario totals.
   - Low/base/high scenario calculations where supported.
   - Revenue.
   - Gross royalty.
   - Production cost.
   - Net contribution.

3. Break-even:

   - Reachability.
   - Break-even units.
   - Break-even revenue.
   - Ceiling semantics.
   - Boundary behavior.

4. Sensitivity:
   - Baseline contribution.
   - Lower and upper scenarios for every declared driver.
   - Contribution deltas.
   - Impact scores.
   - Deterministic ranking and tie-breaking.

Compare the financial outputs that both implementations define. Do not require the reference implementation to reproduce production-only metadata or trace structures that are not part of the independent financial calculation.

---

## 4. Deterministic Differential Test Harness

Build a repeatable differential test suite that compares production results directly against the independent oracle.

### Rule Pack coverage

Discover and enumerate every currently supported synthetic `TEST_*` Rule Pack under `fixtures/rules/`.

Do not invent or hardcode additional production Rule Packs.

Verify all supported Rule Packs across:

- All four rounding modes.
- Both `per_unit` and `per_total` aggregation points.

Where rounding variants are constructed from a Rule Pack, ensure the test setup respects existing Rule Pack contracts and does not modify committed fixtures.

### Generated test inputs

Use a deterministic, fixed-seed pseudo-random generator.

The harness must:

- Generate at least 1,024 reproducible differential input vectors in total.
- Distribute cases across every supported Rule Pack and rounding configuration.
- Use valid baseline inputs within Rule Pack constraints.
- Exercise all supported calculation operations where applicable.
- Record the PRNG algorithm, seed, and exact generated case count.
- Produce identical inputs and results across repeated runs.

Do not use unseeded `Math.random()`, `Date.now()`, network requests, or external services.

Prefer a test-local seeded generator. Reuse an existing test PRNG only for input generation if appropriate; do not reuse production financial calculations.

### Edge-case matrix

In addition to generated cases, explicitly cover:

- Zero units and one unit.
- Minimum and maximum valid list prices.
- Values immediately below, at, and above royalty thresholds.
- Positive, zero, and negative net contribution.
- Exact decimal file sizes.
- Cost variance at important valid boundaries, including -100% where permitted.
- Rounding ties and values immediately around rounding boundaries.
- Exact-integer break-even.
- Break-even requiring ceiling.
- Unreachable break-even.
- Values close to safe integer limits where valid.
- Sensitivity ranking ties.
- Sensitivity perturbations at valid boundaries.

### Differential assertion contract

For every generated or edge-case vector:

1. Calculate the result using the independent oracle.
2. Calculate the result using the production engine.
3. Normalize only representation differences that are explicitly documented.
4. Compare financial outputs exactly.
5. Fail immediately with a useful diagnostic when a mismatch occurs.

A mismatch must report enough information to reproduce it:

- PRNG seed.
- Case index.
- Rule Pack identifier and version.
- Rounding mode and aggregation point.
- Complete input vector.
- Production output.
- Reference output.
- Specific financial field that differs.

**Zero unexplained financial drift is required.**

Never modify reference expectations simply to make the production engine pass.

If a mismatch reveals a genuine production calculation defect, investigate its root cause, add a minimal regression test, and make only the necessary correction within STEP-009 scope. Preserve all accepted formulas and contracts.

Keep the existing golden fixtures unchanged unless an independently demonstrated error requires a correction. Any such correction must include its independent derivation and explanation.

---

## 5. Independent Hand-Calculated Checkpoints

Random differential tests are not sufficient by themselves.

Add a small set of independently hand-derived reference checkpoints covering representative calculations and rounding edge cases.

Requirements:

- Expected values must be derived independently, never copied from production execution.
- Record the derivation or intermediate exact rational values.
- Cover representative Rule Packs and rounding configurations.
- Include at least one rounding-tie example per rounding mode.
- Include representative break-even and sensitivity calculations.
- Store the checkpoints in the repository using the existing fixture conventions.

These cases serve as a second verification layer for the generated differential tests.

---

## 6. Mutation Testing Setup

Establish mutation testing for `packages/calc-engine`.

### Tool selection

Inspect the current package setup and use **StrykerJS with its official Vitest runner** if the current versions are compatible.

Official package names:

- `@stryker-mutator/core`
- `@stryker-mutator/vitest-runner`

Verify compatibility with:

- Node.js `24.18.0`
- Vitest `3.0.8`
- TypeScript `5.8.3`
- pnpm `10.34.5`

Use compatible, stable, exact pinned dependency versions.

Do not upgrade existing framework or toolchain versions just to accommodate mutation testing.

If the official runner is incompatible, stop and explain the issue rather than silently introducing a different test architecture.

Official runner documentation: https://stryker-mutator.io/docs/stryker-js/vitest-runner/

### Configuration and scripts

Create a focused mutation-testing configuration for `calc-engine`.

Requirements:

- Mutate production calculation source files only.
- Exclude test files, fixtures, declarations, type-only files, and barrel-only files where appropriate.
- Run the relevant `calc-engine` tests.
- Reuse the existing Vitest configuration.
- Avoid accidentally running unrelated workspace suites for every mutant.
- Produce readable mutation reports.
- Ensure surviving mutants can be traced to their source location and affected tests.

Add a documented root command such as:

pnpm test:mutation:calc-engine

Also provide a focused differential-test command, for example:

pnpm test:differential

Use the existing repository script conventions.

### Mutation-testing execution

Run the configured mutation-testing command against the intended `calc-engine` scope.

Report:

- Total mutants.
- Killed mutants.
- Survived mutants.
- No-coverage mutants.
- Timed-out mutants.
- Runtime-error or compile-error mutants.
- Observed mutation score.
- Any excluded or intentionally ignored mutations, with reasons.

Review surviving mutants and strengthen tests where they expose genuine assertion gaps.

Do not modify correct production behavior merely to kill a mutant.

Do not blanket-ignore survivors or disable mutation operators to inflate the score.

### Mutation score policy

`docs/architecture/12-testing-and-ai-evaluation.md` currently identifies the mutation score target as **OPEN**.

Preserve that policy.

- Measure and report the actual score.
- Do not invent a new mandatory percentage.
- Do not claim 100% mutation coverage.
- Do not introduce a mutation-score CI gate before the target is formally decided.
- Document the baseline and unresolved survivors so a future decision can be made.

Mutation testing should be reproducible and available through its dedicated script. Do not add the full mutation run to every normal CI build unless a clear, measured justification exists.

---

## 7. CI Integration

STEP-009 requires the differential test to run in CI.

The repository's existing CI workflow already runs:

pnpm test:coverage

Ensure the new differential test files are included in the normal Vitest test discovery and are actually executed by this command.

Requirements:

- Differential tests execute in GitHub Actions.
- Coverage thresholds continue to be enforced.
- Existing format, typecheck, lint, architecture, commit, and build checks remain intact.
- Do not introduce duplicate full test-suite execution unnecessarily.
- Do not add an expensive mutation-testing job to normal CI.
- Do not weaken or bypass any existing CI gates.

Modify `.github/workflows/ci.yml` only if required to satisfy the differential CI acceptance criterion.

---

## 8. Documentation Requirements

Follow `AGENTS.md` exactly.

Create or update the required documents:

1. `prompts/step-09.md`
2. `learning/implementation/step-09-differential-reference-check.md`
3. `learning/interviews/step-09-differential-reference-check.md`
4. `learning/notes/step-09-differential-reference-check.md`

Update the one canonical living document:

- `docs/DESIGN.md`

Also update:

- `docs/architecture/12-testing-and-ai-evaluation.md`

The testing architecture documentation must identify the real tools, exact versions, commands, reference implementation approach, differential test strategy, and mutation-testing status.

### DESIGN.md reconciliation

Record:

- STEP-009 as the current implementation step.
- Verified STEP-008 baseline and corrective commit.
- Reference oracle architecture.
- Supported Rule Pack and rounding coverage.
- PRNG algorithm and seed.
- Exact generated case count.
- Hand-derived checkpoint coverage.
- Differential test command and CI integration.
- Mutation-testing tool, pinned version, command, observed score, and surviving-mutant summary.
- Actual verification command results.
- Exact next proposed roadmap step, without implementing it.

Do not leave stale STEP-008 test counts or verification claims in the current status section.

Do not claim a mutation score target has been accepted.

Never create a second DESIGN document.

---

## 9. Strict Constraints and Non-Goals

- Implement STEP-009 only.
- Do not begin STEP-010 or any later roadmap step.
- Do not add database, API, UI, payment, or AI functionality.
- Do not modify financial formulas without an independently demonstrated defect.
- Do not change STEP-005 through STEP-008 public API contracts.
- Do not replace existing golden fixtures with engine-generated values.
- Do not add production dependencies for test-only reference calculations.
- Do not introduce a spreadsheet application as a runtime or CI dependency.
- Do not add unnecessary abstraction layers.
- Do not alter unrelated code or documentation.
- Do not add arbitrary mutation score thresholds.
- Do not commit or push.

Preserve the current modular monolith and all architecture boundaries.
```

---

## 2. Corrective Addendum — STEP-009 Remaining Work Completion & Final Correction

```markdown
# Nimphy STEP-009 — Remaining Work Completion & Final Correction

## Authorization & Scope Directive

The repository owner has authorized correction and completion of STEP-009 only.

Objectives:

1. Finish every outstanding STEP-009 requirement identified by the original implementation prompt, the architecture testing strategy, and the subsequent repository review.
2. Complete the missing differential coverage:
   - Add independent triad-scenario verification (`refCalculateTriadScenarios`).
   - Compare all overlapping exact financial fields (per-unit exactNetContribution, single scenario exact totals, break-even exact unit contribution and reachable/unreachable outputs, sensitivity revenue and contribution deltas and impact scores).
   - Improve failure diagnostics with complete reproducible input context and BigInt serialization.
3. Complete the missing edge-case matrix:
   - Positive, zero, and negative unit contribution (including deterministic zero-contribution break-even).
   - Safe-integer boundaries (values near Number.MAX_SAFE_INTEGER and Number.MAX_SAFE_INTEGER - 1).
   - Sensitivity ranking ties with deterministic tie-breaking.
   - Sensitivity perturbation boundaries (zero units, min/max price, -100% cost variance) with an active driver coverage assertion.
   - Independent signed rounding tests for RefRational across all 4 modes on positive and negative values.
4. Complete and review independent checkpoints:
   - Zero-contribution break-even, sensitivity ranking tie, triad scenario totals and ordering, safe-integer boundary.
5. Complete the full Stryker mutation baseline:
   - Run `pnpm test:mutation:calc-engine` to completion.
   - Review mutants, survivors, and mutation score.
   - Preserve target score as OPEN per doc 12 §3.10.
6. CI & Node compatibility:
   - Verify differential execution in CI.
   - Add minimal cross-Node determinism compatibility job for Node 24.18.0 and 24.x.
7. Reconcile all inaccurate documentation:
   - Signed rounding semantics (truncation toward zero, away from zero, ties away from zero, ties to even).
   - Print cost formula using page threshold.
   - Checkpoint catalog accuracy against JSON fixture.
   - Honest status: "Implementation complete; verification results recorded; awaiting formal repository-owner acceptance."
   - DESIGN.md roadmap reconciliation (STEP-011 title "Identity and Sessions", STEP-010 unauthorized).
```

---

## 3. Final Audit Reconciliation Addendum — STEP-009 Final Audit Reconciliation

````markdown
# Nimphy STEP-009 — Final Audit Reconciliation

## Objective

Resolve the remaining inconsistencies in the STEP-009 survivor-audit report and prepare it for repository-owner acceptance.

Do not restart the full mutation analysis.

## 1. Mandatory preflight

Inspect:

- `reports/mutation/mutation.json`
- `learning/implementation/step-09-differential-reference-check.md`
- `learning/interviews/step-09-differential-reference-check.md`
- `learning/notes/step-09-differential-reference-check.md`
- `docs/DESIGN.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `stryker.calc-engine.config.mjs`

Preserve all user changes. No commit, push, reset, stash, or rebase.

## 2. Reconcile genuine assertion-gap counts

The current report identifies:

- 11 triad scenario ordering mutant IDs.
- 2 sensitivity tie-metadata mutant IDs.
- 4 rational equality mutant IDs.

These are 17 distinct IDs, while the category summary reports 15.

Inspect the actual JSON and establish:

1. Which IDs were genuinely assertion gaps before test changes.
2. Which IDs were addressed by each added assertion.
3. Whether any IDs were duplicates, misclassified, or incorrectly counted.
4. Whether any newly added assertion fails to distinguish its intended mutant.

Correct the summary and detailed explanation using actual evidence.

Do not force the count to remain 15.

## 3. Restore the correct six survivor categories

Use exactly these categories:

1. Genuine assertion gap.
2. Behaviorally equivalent mutation.
3. Unreachable under the accepted input contract.
4. Trace or metadata-only behavior.
5. Validation or defensive-boundary behavior.
6. Potentially meaningful financial or public-result behavior.

Reclassify all 443 survivors.

Do not substitute redundant validation as category 6. Redundant validation should be classified under the appropriate existing category.

Produce an auditable inventory containing, for each survivor:

- Mutant ID.
- Source file and location.
- Mutation operator.
- Original and mutated expressions.
- Classification.
- Specific test coverage.
- Technical justification.

A claim that no surviving mutant affects financial results must be supported by this inventory.

## 4. Revisit safe-integer classifications

Inspect every surviving mutation involving `Number.MAX_SAFE_INTEGER` and `Number.MIN_SAFE_INTEGER`.

For each affected calculation path:

- Identify the actual accepted input limits.
- Derive the maximum reachable intermediate value.
- Explain whether the exact boundary can be reached.
- Distinguish exact-boundary behavior from near-boundary behavior.

Do not treat the CP-013 checkpoint, which is 991 below the maximum safe integer, as proof of exact-boundary behavior.

If a path can reach the exact boundary, determine whether an additional focused assertion is warranted.

Do not modify production calculation behavior.

## 5. Validate the new regression tests

Run:

```bash
pnpm exec vitest run packages/calc-engine/src/math/rational.test.ts packages/calc-engine/src/sensitivity/sensitivity-calc.test.ts packages/calc-engine/src/scenarios/scenario-calc.test.ts
pnpm test:differential
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm format:check
pnpm docs:check
pnpm boundaries:check
git diff --check
```
````

Report actual results.

Do not claim that 73.89% represents the revised test suite.

Do not run a full Stryker mutation analysis without separate repository-owner approval.

## 6. Preserve historical mutation evidence

The archived run remains:

- 1,728 generated mutants.
- 1 ignored static mutant.
- 1,727 score-eligible mutants.
- 1,204 killed.
- 72 timed out.
- 443 survived.
- 8 no coverage.
- 0 pending.
- 73.89% mutation score.

The completed historical baseline used `incremental: false`. The current configuration may use `incremental: true` for future runs.

Do not rewrite historical metrics or claim the historical run used the future configuration.

The reported duration of 114m54s must be labeled as reported if no execution log independently verifies it.

## 7. Final documentation

Update the existing four STEP-009 documents and `docs/DESIGN.md` as necessary.

Ensure:

- Survivor category counts add to 443.
- Every genuine assertion gap has a corresponding mutant ID and regression assertion.
- Potential financial/public-result survivors are explicitly addressed.
- Safe-integer reasoning is mathematically supported.
- The historical mutation score is clearly distinguished from the revised test suite.
- STEP-010 remains unauthorized.
- No STEP-011 implementation is introduced.
- The final status remains awaiting owner acceptance.

## 8. Final report

Provide:

1. Reconciled survivor category counts.
2. Full mutant-ID inventory location.
3. Genuine assertion-gap count and test mapping.
4. Safe-integer boundary conclusions.
5. Validation command results.
6. Documentation changes.
7. Final `git status --short`.
8. Confirmation that no Stryker/Vitest processes remain.
9. Confirmation of no commit or push.

Do not claim formal repository-owner acceptance.

```

```
