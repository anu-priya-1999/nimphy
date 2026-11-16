# Implementation Record — STEP-006: Scenarios and Totals

- **Step Identifier:** STEP-006
- **Step Name:** Engine: Scenarios and Totals
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `8b998ce40779f144dc1dd57ec8e48cc4f456095d`
- **Status:** Complete & Fully Verified; Awaiting Formal Owner Acceptance (100% Instrumented Branch Coverage on `calc-engine`)

---

## A. Objective & Executive Summary

The objective of STEP-006 was to implement the multi-unit scenario calculation engine and totals aggregation within `packages/calc-engine` (Module M-02) and core domain types within `@nimphy/domain` (Module M-01) per `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, FR-006, accepted ADR-005, and canonical architectural requirements (docs 02, 03, 05, 06, 12, 17, 18, 22).

Following the formal owner authorization and Stage 2 architectural clarifications, this implementation delivers:

1. **Deterministic Core Calculation (P-01, P-02):** Computes gross retail revenue, gross royalty, applicable production/distribution costs, and net contribution across multi-unit volumes with zero I/O, zero AI, zero network, zero filesystem access, zero system clock dependencies, zero randomness, and zero floating-point financial arithmetic.
2. **Accepted ADR-005 Aggregation Implementation:**
   - **`per_total` Accumulation:** Multiplies exact rational per-unit royalty and varied applicable cost by integer quantity $Q$, rounds aggregate royalty and aggregate cost independently once using the declared `rounding.mode`, and derives total contribution by subtraction after rounding. Never rounds each unit first; never substitutes null or partial per-unit values.
   - **`per_unit` Accumulation:** Multiplies already-rounded integer minor-unit per-unit royalty and applicable cost by integer quantity $Q$, deriving aggregate contribution by subtraction without secondary rounding.
3. **Exact Mathematical Divergence:** Proven and tested mathematical divergence between `per_total` and `per_unit` aggregation policies for fractional minor-unit royalties and delivery costs.
4. **Scenario Modeling & Cost Variance (FR-006):** Independent parameterization of `low`, `base`, and `high` scenarios by units sold, retail list price, and cost variance percentage. Cost variance scales exact per-unit production/distribution cost via exact rational arithmetic:
   $$M = \frac{100 + \text{costVariancePercent}}{100}, \quad \text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$
5. **Scenario Ordering & Monotonicity Verification:** Implements `evaluateScenarioOrdering` to evaluate monotonic ordering:
   $$\text{low.netContribution} \le \text{base.netContribution} \le \text{high.netContribution}$$
   Preserves scenario identities faithfully and never silently reorders user inputs.
6. **Zero Units Sold Boundary Handling:** Correctly handles $Q = 0$ producing exact zero financial totals while retaining list price, per-unit economics, and audit traces.
7. **Safe Integer & Arithmetic Overflow Guards (ADR-005 Compliant):** Enforces JavaScript safe integer limits (`Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991`) across revenue, varied costs, and totals. For `per_total`, unaggregated per-unit rational is preserved as an exact Rational without premature rejection; aggregate cost is multiplied by quantity using Rational arithmetic, rounded once, and validated against safe-integer bounds; `CalcOverflowError` is raised only when the materialized monetary aggregate exceeds the supported range. When $Q = 0$, aggregate cost is exactly zero and succeeds without overflow. For `per_unit`, retains separate checks for rounded per-unit Money and aggregate Money.
8. **Illustrative Disclaimers & Provenance (P-07, FR-006):** Every scenario result enforces `isIllustrative: true` and includes `SCENARIO_DISCLAIMER_TEXT`.
9. **Full Deterministic Audit Trace (P-03, P-04):** Records engine version, rule pack reference, input parameters, per-unit summary, aggregation parameters, intermediate rational steps, and rounding operations without timestamps or random identifiers.
10. **Exhaustive Test Suite & 100% Instrumented Branch Coverage:**
    - 82 executed tests across 5 test files in `packages/calc-engine/src/scenarios/` (52 source-level test declarations):
      - 25 hand-derived golden scenario cases across all 4 synthetic Rule Packs in `fixtures/calc-engine/golden-scenario-cases.json` evaluated via 26 executed tests in `golden-scenarios.test.ts`.
      - 7 ADR-005 regression tests in `per-total-regression.test.ts` proving `per_total` vs `per_unit` divergence, 4-mode rounding, and overflow contract enforcement.
      - 6 property-based suites in `properties.test.ts` with Mulberry32 PRNG.
      - 4 determinism and canonical JSON replay tests in `determinism.test.ts`.
      - 39 executed unit and validation tests in `scenario-calc.test.ts` (across 33 source declarations, including 8 parameterized rounding tests across 4 rounding modes for both `per_unit` and `per_total`, plus 5 monetary integrity boundary tests).
    - 38 unit and boundary tests in `per-unit-calc.test.ts` (including 7 focused overflow-safety tests).
    - Total `packages/calc-engine`: 202 tests across 11 test files.
    - Achieves 100% statement (1,369/1,369), 100% instrumented branch (354/354), 100% function (39/39), and 100% line (1,369/1,369) coverage across `packages/calc-engine`.

---

## B. Formal Owner Decisions Reconciled

Prior to code implementation, the following architectural clarifications were formally approved by the repository owner:

### 1. `costVariance` Semantics (FR-006)

- **Mathematical Definition:** Cost variance is defined as a percentage variance applied to the Rule Pack's per-unit production/distribution cost:
  $$M = 1 + \frac{\text{costVariancePercent}}{100}$$
  $$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$
- **Direction:** A positive variance increases production/distribution cost (reducing contribution); a negative variance decreases cost (increasing contribution). Base scenario default is `0`.
- **Validation Bounds:** Bounded $\ge -100\%$. Values $< -100\%$ are rejected with `CalcInputValidationError` because production costs cannot be negative.
- **Contract Type:** `costVariancePercent?: string` (strictly mandates exact decimal string representation parsed via `Rational.fromDecimal`; rejects JSON numeric values, explicit null, empty/malformed/scientific notation strings; omitted values default to `"0"`).
- **Corrected Rational Overflow Guard (ADR-005 Placement):** Unaggregated per-unit varied cost is preserved as an exact Rational. For `per_total`, the unaggregated per-unit rational is not rejected solely because its magnitude exceeds `Number.MAX_SAFE_INTEGER`; aggregate cost is rounded once and validated against safe-integer bounds, raising `CalcOverflowError` only when the monetary result being materialized exceeds the supported range (succeeding with aggregate cost zero when $Q = 0$). For `per_unit`, separate checks are retained for rounded per-unit Money and aggregate Money.

### 2. Scenario Parameter Structure

- Explicit, absolute parameters per scenario (`units`, `listPriceMinor`, `costVariancePercent`).
- Scenarios are independent; low and high are never manufactured by arbitrary percentage modifiers of the base scenario.

### 3. Domain Contracts Location

- Established `ScenarioParameters`, `ScenarioTotals`, `SCENARIO_DISCLAIMER_TEXT`, and type guards `isScenarioParameters`, `isScenarioTotals` in `@nimphy/domain` and re-exported from its root.

---

## C. Files Created & Modified

### 1. `@nimphy/domain`

- `packages/domain/src/types.ts`: Added `ScenarioParameters`, `ScenarioTotals`, `SCENARIO_DISCLAIMER_TEXT`, `isScenarioParameters`, `isScenarioTotals`.
- `packages/domain/src/index.ts`: Re-exported scenario types and type guards.
- `packages/domain/src/types.test.ts`: Added 4 tests validating scenario contracts, validation guards, and disclaimer text immutability.
- `packages/domain/src/index.test.ts`: Added test verifying public domain exports.

### 2. `@nimphy/calc-engine`

- `packages/calc-engine/src/per-unit/per-unit-calc.ts`: Functional calculation refinements supporting STEP-006 scenario aggregation and end-to-end safe integer protection:
  - **Check A (Rounded Production Cost Overflow):** Explicitly validates `roundedCostBig` against `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]` before casting to `Number` and constructing `Money.of`, raising typed `CalcOverflowError` if exceeded.
  - **Check B (Integer Production Cost Overflow):** Explicitly validates `exactCostBig` against safe-integer bounds for exact integer per-unit costs, raising typed `CalcOverflowError` if exceeded.
  - **Check C (BigInt Net Contribution Calculation):** Replaced `grossRoyaltyMoney.subtract(applicableCostMoney)` with exact BigInt subtraction `roundedGrossBig - BigInt(finalCostMinor)` followed by safe-integer range validation and `Money.of(netContributionMinor, currency)`. Guarantees typed `CalcOverflowError` rather than domain `MoneyOverflowError` on overflow, and preserves exact arithmetic for all valid inputs.
  - **Removal of Premature Delivery Cost Check:** Removed the legacy pre-rounding check on `exactApplicableCost.numerator > MAX_SAFE_INTEGER` in delivery cost, aligning delivery cost with gross royalty and print cost. This allows exact rational costs to be preserved under `per_total` without premature rejection.
  - **Deferred Money Construction under `per_total`:** When `roundingPolicy.point === 'per_total'`, if exact integer per-unit cost exceeds `Number.MAX_SAFE_INTEGER`, `applicableCostMoney` and `costBreakdown.totalCostMinor` are set to `null` rather than attempting unsafe `Money.of` materialization, while preserving the exact rational cost in `exactApplicableCost`. This enables scenario aggregation to scale the exact rational by quantity $Q$ (succeeding with zero aggregate cost when $Q = 0$, and throwing `CalcOverflowError` when aggregate cost overflows).
  - _Contract & Compatibility Rationale:_ These changes are functional enhancements required to uphold the STEP-006 scenario aggregation contract under accepted ADR-005. They guarantee that intermediate per-unit rationals are preserved without premature safe-integer failure under `per_total`, while strictly preserving all STEP-005 arithmetic and rounding semantics for all valid inputs.
- `packages/calc-engine/src/per-unit/per-unit-calc.test.ts`: Expanded test suite from 31 to 38 tests, adding 7 focused tests covering Check A, Check B, safe boundary at `MAX_SAFE_INTEGER`, negative contribution, net contribution BigInt subtraction equivalence and overflow/underflow bounds, per_total deferred Money construction, and scenario aggregation handoff.
- `packages/calc-engine/src/scenarios/types.ts`: Created typed contracts for inputs, traces, single and triad scenario results, and ordering evaluations.
- `packages/calc-engine/src/scenarios/scenario-calc.ts`: Pure functions `calculateSingleScenario`, `calculateTriadScenarios`, `evaluateScenarioOrdering` adhering strictly to ADR-005 aggregation and FR-006 parameter validation.
- `packages/calc-engine/src/scenarios/index.ts`: Barrel export for scenarios module.
- `packages/calc-engine/src/index.ts`: Re-exported scenario calculation APIs.
- `packages/calc-engine/src/index.test.ts`: Added test verifying public scenario export availability.
- `packages/calc-engine/README.md`: Created comprehensive architectural guide and API reference.

### 3. Fixtures & Test Suites

- `fixtures/calc-engine/golden-scenario-cases.json`: 25 hand-derived golden scenario test cases with exact rational fractions and integer minor units.
- `packages/calc-engine/src/scenarios/scenario-calc.test.ts`: 33 unit and boundary regression tests covering input validation, zero units, triad calculation, ordering detection, deep immutability, safe integer overflow guards, per_total zero-unit regression with exact per-unit cost > MAX_SAFE_INTEGER, and the final monetary integrity audit suite verifying revenue, royalty, cost, and contribution bounds under both per_unit and per_total.
- `packages/calc-engine/src/scenarios/golden-scenarios.test.ts`: 26 tests verifying golden fixtures across all 4 synthetic Rule Packs.
- `packages/calc-engine/src/scenarios/per-total-regression.test.ts`: 7 regression tests demonstrating ADR-005 divergence between `per_unit` and `per_total`, separate component rounding, 4-mode rounding under per_total, and ADR-005 overflow contract enforcement.
- `packages/calc-engine/src/scenarios/properties.test.ts`: 6 property-based test suites using Mulberry32 PRNG covering monotonicity, linear scaling, zero units, and cost variance impact.
- `packages/calc-engine/src/scenarios/determinism.test.ts`: 4 determinism tests verifying bit-for-bit canonical JSON equality across runs, scenario independence, and trace purity.
- `vitest.config.ts`: Added `packages/calc-engine/src/scenarios/types.ts` to coverage exclusion list alongside `per-unit/types.ts`.

---

## D. Verification Results

All verification commands executed directly and passed with zero errors:

| Check                   | Tool / Command                                | Result                                                                                                                    |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Monorepo Boundaries     | `pnpm boundaries:check`                       | PASSED (79 source files, 248 import declarations, 0 violations)                                                           |
| Architecture Docs       | `pnpm docs:check`                             | PASSED (All 23 required architecture documents present)                                                                   |
| Typecheck (calc-engine) | `pnpm --filter @nimphy/calc-engine typecheck` | PASSED (0 errors)                                                                                                         |
| Typecheck (monorepo)    | `pnpm typecheck`                              | PASSED (0 errors across all workspaces)                                                                                   |
| Test Suite              | `pnpm test`                                   | PASSED (36 test files, 535 tests passed; 202 in calc-engine across 11 test files)                                         |
| Coverage Suite          | `pnpm test:coverage`                          | PASSED (99.94% stmts [3,511/3,513], 99.36% branch [1,094/1,101], 100% funcs [167/167], 99.94% lines [3,511/3,513])        |
| Calc-Engine Coverage    | V8 Coverage Report                            | **100% Statements (1,369/1,369), 100% Instrumented Branches (354/354), 100% Functions (39/39), 100% Lines (1,369/1,369)** |

### D.1 Coverage Reconciliation & Measured Inventory

- **Current STEP-006 Verified Coverage:** 100% statements (1,369/1,369), 100% instrumented branches (354/354), 100% functions (39/39), 100% lines (1,369/1,369) across all 9 production modules in `packages/calc-engine`.
- **Historical STEP-005 Figures:** In historical STEP-005, calc-engine coverage was 342/342 statements, 99/99 branches, 25/25 functions, 342/342 lines. Those figures reflected only the per-unit economics engine prior to the addition of the multi-unit scenario calculation engine (`scenario-calc.ts` and related modules). They are historical metrics only and are kept strictly separate and clearly labelled as historical.
- **Interim Estimate Reconciliation:** The figure 536/536 was an unverified interim estimate, not a measured coverage result. Neither 342/342 nor 536/536 represents verified STEP-006 current coverage.
- **Production Source Inventory (9 Modules):**
  1. `packages/calc-engine/src/index.ts`: 6/6 stmts, 0/0 br, 0/0 funcs, 6/6 lines (100%)
  2. `packages/calc-engine/src/errors/calc-error.ts`: 50/50 stmts, 8/8 br, 8/8 funcs, 50/50 lines (100%)
  3. `packages/calc-engine/src/errors/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines (100%)
  4. `packages/calc-engine/src/math/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines (100%)
  5. `packages/calc-engine/src/math/rational.ts`: 243/243 stmts, 116/116 br, 23/23 funcs, 243/243 lines (100%)
  6. `packages/calc-engine/src/per-unit/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines (100%)
  7. `packages/calc-engine/src/per-unit/per-unit-calc.ts`: 494/494 stmts, 110/110 br, 2/2 funcs, 494/494 lines (100%)
  8. `packages/calc-engine/src/scenarios/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines (100%)
  9. `packages/calc-engine/src/scenarios/scenario-calc.ts`: 572/572 stmts, 120/120 br, 6/6 funcs, 572/572 lines (100%)
  - **Total Calc-Engine Production Code:** 100% statements (1,369/1,369), 100% instrumented branches (354/354), 100% functions (39/39), 100% lines (1,369/1,369).
- **Exclusion Verification & Terminology:**
  - No production source module is excluded through `vitest.config.ts`. Exclusions in `vitest.config.ts` are strictly limited to test suites (`**/*.test.ts`) and pure type definition files (`packages/calc-engine/src/per-unit/types.ts` and `packages/calc-engine/src/scenarios/types.ts`) with zero runtime code, zero functions, and zero executable statements.
  - In production code, two defensive production-code overflow-guard blocks in `packages/calc-engine/src/scenarios/scenario-calc.ts` (guarding aggregate net contribution calculations against safe-integer overflow for both `per_total` and `per_unit`) are explicitly excluded through V8 annotations (`/* v8 ignore start */ ... /* v8 ignore stop */`).
  - Both guards are mathematically unreachable because prior checks bound the respective non-negative royalty and cost aggregates ($0 \le R, C \le \text{MAX\_SAFE\_INTEGER}$), ensuring $R - C \in [-\text{MAX\_SAFE\_INTEGER}, \text{MAX\_SAFE\_INTEGER}]$, which strictly lies within safe-integer bounds.
  - Reported 100% coverage refers to instrumented executable code and does not include those ignored branches.
  - 100% instrumented branch coverage is verified across all instrumented production code.
  - Do not claim that no production-code branches are ignored.

---

## E. Key Invariants & Guarantees

1. **Zero Floats in Money:** Money is strictly integer minor units (`amountMinor: number`) paired with ISO currency codes.
2. **ADR-005 Separation:** `per_total` aggregates exact rational fractions before rounding; `per_unit` aggregates already-rounded integer minor units. The two policies remain mathematically distinct.
3. **Canonical Reduction:** `Rational` always reduces fractions to lowest terms via GCD.
4. **Deep Immutability:** All results and traces are deep-frozen (`Object.freeze`).
5. **No Mutation:** Input objects, rule packs, and per-unit results are never modified.
6. **Input Validation Precedence:** Input validation in `validateSingleScenarioInput` strictly validates that `units >= 0` and `listPriceMinor >= 0` (raising `UNITS_OUT_OF_BOUNDS` or `PRICE_OUT_OF_BOUNDS`) before the gross retail revenue overflow check. Under non-negative multiplicands, `revenueBig = BigInt(listPriceMinor) * BigInt(units) >= 0`, ensuring mathematical non-negativity before evaluating the upper bound `revenueBig <= Number.MAX_SAFE_INTEGER`.
7. **Per-Unit Engine Reference:** Per-unit economics calculation is implemented at `packages/calc-engine/src/per-unit/per-unit-calc.ts` (function `calculatePerUnitEconomics`).

---

## F. Roadmap Sequence & Next Step Status

Per the authoritative roadmap in `docs/architecture/17-implementation-roadmap.md`, the canonical step sequence is:

- **STEP-006 — Engine: Scenarios and Totals** (Current — Complete & Fully Verified; Awaiting Formal Owner Acceptance)
- **STEP-007 — Engine: Break-even** (Next — Strictly Unauthorized)
- **STEP-008 — Engine: Sensitivity**
- **STEP-009 — Differential Reference Check**

STEP-007 is strictly unauthorized until explicit, written authorization from the repository owner. Owner acceptance is not claimed.
