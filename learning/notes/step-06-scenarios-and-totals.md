# Engineering Reference Notes — STEP-006: Scenarios and Totals

- **Module:** `@nimphy/calc-engine` (M-02), `@nimphy/domain` (M-01)
- **Status:** Complete & Fully Verified; Awaiting Formal Owner Acceptance (100% Instrumented Branch Coverage on `calc-engine`)
- **Primary Dependencies:** `@nimphy/domain` (Zero external npm dependencies)

---

## 1. Module Anatomy & Source Hierarchy

```
packages/domain/
└── src/
    ├── types.ts                   # Added ScenarioParameters, ScenarioTotals, SCENARIO_DISCLAIMER_TEXT, type guards
    └── index.ts                   # Re-exports scenario contracts

packages/calc-engine/
├── README.md                      # Comprehensive package documentation and public API reference
└── src/
    ├── index.ts                   # Public entrypoint exporting scenario APIs
    ├── index.test.ts              # Public API export validation test suite
    ├── scenarios/
    │   ├── types.ts               # ScenarioParametersInput, SingleScenarioInput, CaseScenariosInput, traces
    │   ├── scenario-calc.ts       # calculateSingleScenario, calculateTriadScenarios, evaluateScenarioOrdering
    │   ├── scenario-calc.test.ts  # Input validation, zero units, triad calculation, overflow, trace tests
    │   ├── per-total-regression.test.ts # ADR-005 divergence tests between per_unit and per_total
    │   ├── properties.test.ts     # Property-based testing with Mulberry32 PRNG
    │   ├── golden-scenarios.test.ts # Fixture runner for 25 hand-derived golden scenario cases
    │   ├── determinism.test.ts    # Canonical JSON equality and scenario independence tests
    │   └── index.ts               # Barrel export for scenarios
    ├── per-unit/                  # STEP-005 per-unit economics engine (packages/calc-engine/src/per-unit/per-unit-calc.ts)
    ├── math/                      # Exact Rational BigInt arithmetic
    └── errors/                    # CalcEngineError, CalcOverflowError, etc.

fixtures/calc-engine/
└── golden-scenario-cases.json     # 25 hand-derived golden scenario cases across 4 synthetic Rule Packs
```

---

## 2. Key Mathematical Formulations & Derivations

### 2.1 Multi-Unit Scenario Aggregation Contracts (ADR-005)

Let $Q \in \mathbb{N}_0$ be the units sold, $P \in \mathbb{N}$ the list price in minor units, and $M \in \mathbb{Q}^+$ the cost variance multiplier.

#### Policy A: `rounding.point === 'per_total'`

1. Calculate exact per-unit rational values from STEP-005:
   $$\text{exactGrossRoyalty} \in \mathbb{Q}, \quad \text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M \in \mathbb{Q}$$
2. Multiply by quantity $Q$:
   $$\text{exactTotalRoyalty} = \text{exactGrossRoyalty} \times Q$$
   $$\text{exactTotalCost} = \text{exactApplicableCostVaried} \times Q$$
3. Round independently using Rule Pack's declared rounding mode:
   $$\text{totalRoyaltyMinor} = \text{round}(\text{exactTotalRoyalty}, \text{mode}) \in \mathbb{Z}$$
   $$\text{totalCostMinor} = \text{round}(\text{exactTotalCost}, \text{mode}) \in \mathbb{Z}$$
4. Derive total contribution by subtraction:
   $$\text{totalContributionMinor} = \text{totalRoyaltyMinor} - \text{totalCostMinor}$$

#### Policy B: `rounding.point === 'per_unit'`

1. Use STEP-005 rounded per-unit values:
   $$R_{\text{unit}} = \text{round}(\text{exactGrossRoyalty}, \text{mode}) \in \mathbb{Z}$$
   $$C_{\text{unit}} = \begin{cases} \text{perUnit.applicableCost.amountMinor} & \text{if } M = 1 \\ \text{round}(\text{exactApplicableCostVaried}, \text{mode}) & \text{if } M \ne 1 \end{cases} \in \mathbb{Z}$$
2. Multiply integer minor units by quantity $Q$:
   $$\text{totalRoyaltyMinor} = R_{\text{unit}} \times Q \in \mathbb{Z}$$
   $$\text{totalCostMinor} = C_{\text{unit}} \times Q \in \mathbb{Z}$$
3. Derive total contribution by subtraction:
   $$\text{totalContributionMinor} = \text{totalRoyaltyMinor} - \text{totalCostMinor}$$

### 2.2 Proof of Mathematical Divergence Between `per_total` and `per_unit`

Let an ebook have list price $P = 99$ cents ($0.99) with royalty rate $35\%$ ($R = 7/20$) and delivery fee $7.5$ cents ($15/2$ cents).

- $\text{exactGrossRoyalty} = 99 \times \frac{7}{20} = \frac{693}{20} = 34.65$ cents.
- $\text{exactApplicableCost} = 7.5 = \frac{15}{2}$ cents.

Under `round_half_up` at quantity $Q = 10$:

**Under `per_unit`:**

- $R_{\text{unit}} = \text{round}(34.65) = 35$ cents.
- $C_{\text{unit}} = \text{round}(7.5) = 8$ cents.
- $\text{totalRoyalty} = 35 \times 10 = 350$ cents.
- $\text{totalCost} = 8 \times 10 = 80$ cents.
- $\text{totalContribution} = 350 - 80 = 270$ cents.

**Under `per_total`:**

- $\text{exactTotalRoyalty} = 34.65 \times 10 = 346.5$ cents.
- $\text{exactTotalCost} = 7.5 \times 10 = 75.0$ cents.
- $\text{roundedTotalRoyalty} = \text{round}(346.5) = 347$ cents.
- $\text{roundedTotalCost} = \text{round}(75.0) = 75$ cents.
- $\text{totalContribution} = 347 - 75 = 272$ cents.

**Divergence:**
$$\Delta = \text{totalContribution}_{\text{per\_total}} - \text{totalContribution}_{\text{per\_unit}} = 272 - 270 = +2 \text{ cents}$$
This confirms that the two policies cannot be conflated and must be computed independently as specified in ADR-005.

### 2.3 Cost Variance Multiplier (FR-006)

Given a cost variance percentage $v \in [-100, \infty)$:
$$M = \frac{100 + v}{100} = 1 + \frac{v}{100}$$
$$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$

For example:

- $v = +10 \implies M = \frac{110}{100} = \frac{11}{10} = 1.10$.
- $v = -15 \implies M = \frac{85}{100} = \frac{17}{20} = 0.85$.
- $v = -100 \implies M = 0$ (cost eliminated).
- $v < -100$ is rejected at the boundary as negative production costs are unphysical.

---

## 3. Boundary & Edge Case Handling

1. **Zero Units ($Q = 0$):**
   - Financial totals: Revenue = 0, Gross Royalty = 0, Cost = 0, Net Contribution = 0.
   - Per-unit economics and list price are preserved.
   - Trace accurately documents zero-unit aggregation without division-by-zero errors.
2. **Safe Integer Overflow Guard (ADR-005 & Final Monetary Integrity Audit Compliant):**
   - **Aggregate Revenue:** $\text{listPriceMinor} \times Q \le \text{MAX\_SAFE\_INTEGER}$ verified via BigInt integer arithmetic; converts to Number and `Money.of` only after boundary verification.
   - **For `per_total`:** Preserves exact adjusted per-unit cost as an unaggregated Rational without premature rejection. Scales royalty and cost by $Q$ using Rational arithmetic, rounds each aggregate component exactly once under declared mode, and validates both `roundedRoyaltyBig` and `roundedCostBig` against `[MIN_SAFE_INTEGER, MAX_SAFE_INTEGER]` before materializing Money. Net contribution is derived via BigInt subtraction after component rounding (`roundedRoyaltyBig - roundedCostBig`) and independently verified before `Money.of`. When $Q = 0$, all aggregate totals are zero and succeed without error. Raises typed `CalcOverflowError` whenever any materialized monetary aggregate exceeds the supported range.
   - **For `per_unit`:** Uses exact BigInt integer multiplication for aggregate royalty ($R_{\text{unit}} \times Q$) and aggregate cost ($C_{\text{unit}} \times Q$), validating both against `[MIN_SAFE_INTEGER, MAX_SAFE_INTEGER]` before materializing Money. Net contribution is derived via BigInt subtraction ($R_{\text{agg}} - C_{\text{agg}}$) and independently verified before `Money.of`. Varied unit cost is rounded per unit and range-checked.
   - **Mathematical Invariant for Net Contribution:** Under non-negative list prices, royalty rates, and production/delivery costs, both $R, C \in [0, \text{MAX\_SAFE\_INTEGER}]$. Their difference $R - C$ mathematically satisfies $\min(R - C) = 0 - \text{MAX\_SAFE\_INTEGER} = \text{MIN\_SAFE\_INTEGER}$ and $\max(R - C) = \text{MAX\_SAFE\_INTEGER} - 0 = \text{MAX\_SAFE\_INTEGER}$. Thus, contribution is mathematically guaranteed to remain within safe integer bounds when components are safe, but is independently guarded and verified before `Money.of`.
   - Any violation raises typed `CalcOverflowError` (code `CALC_OVERFLOW`).
3. **Monotonic Ordering Property:**
   - Evaluates whether $\text{low} \le \text{base} \le \text{high}$ across contributions and revenues.
   - When inputs are unordered, the engine preserves user inputs faithfully and marks `areTotalsMonotonicallyOrdered: false` in the evaluation report without throwing or silently reordering.

---

## 4. Test Suite Architecture

| Suite              | File                           | Tests | Key Focus                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit & Validation  | `scenario-calc.test.ts`        | 39    | Input validation, safe integer overflows, zero units, deep freezing, rational overflow precision regression, 4-mode rounding verification (8 executed tests across per_unit and per_total), per_total zero-unit regression with exact per-unit > MAX_SAFE_INTEGER, and final monetary integrity audit boundary suites (33 source declarations) |
| ADR-005 Regression | `per-total-regression.test.ts` | 7     | per_unit vs per_total divergence, separate component rounding, 4-mode rounding under per_total, ADR-005 overflow contract enforcement (7 source declarations)                                                                                                                                                                                  |
| Golden Scenarios   | `golden-scenarios.test.ts`     | 26    | Parity against 25 hand-derived cases across 4 synthetic packs (2 source declarations: 1 suite size check + 25 fixture runner cases)                                                                                                                                                                                                            |
| Property-Based     | `properties.test.ts`           | 6     | Monotonicity, linear scaling, zero units, cost variance scaling (6 source declarations)                                                                                                                                                                                                                                                        |
| Determinism        | `determinism.test.ts`          | 4     | Bit-for-bit canonical JSON equality, scenario independence (4 source declarations)                                                                                                                                                                                                                                                             |

- **Total Scenario Tests:** 82 executed test cases across 5 test files (52 source-level test declarations).
- **Total `@nimphy/calc-engine` Suite:** 202 tests across 11 test files (all 202 passing).

### 4.1 Code Coverage & Audit Reconciliation

- **Measured STEP-006 Coverage:**
  - Statements: 1,369/1,369 (100%)
  - Branches: 354/354 (100% instrumented branch coverage)
  - Functions: 39/39 (100%)
  - Lines: 1,369/1,369 (100%)
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
- **Historical STEP-005 Metrics:**
  - 342/342 statements, 99/99 branches, 25/25 functions, 342/342 lines was the verified coverage achieved at the conclusion of STEP-005. That metric measured the per-unit economics engine alone prior to the creation of the multi-unit scenario calculation engine.
  - Kept strictly separate and clearly labelled as historical.
- **Interim Estimate Reconciliation:**
  - 536/536 was an unverified interim estimate, not a measured coverage result.
  - Neither 342/342 nor 536/536 represents verified STEP-006 current coverage.
- **Exclusion Verification & Terminology:**
  - No production source module is excluded through `vitest.config.ts`. Exclusions in `vitest.config.ts` are strictly limited to test suites (`**/*.test.ts`) and pure type definition files (`packages/calc-engine/src/per-unit/types.ts` and `packages/calc-engine/src/scenarios/types.ts`) with zero runtime code, zero functions, and zero executable statements.
  - In production code, two defensive production-code overflow-guard blocks in `packages/calc-engine/src/scenarios/scenario-calc.ts` (guarding aggregate net contribution calculations against safe-integer overflow for both `per_total` and `per_unit`) are explicitly excluded through V8 annotations (`/* v8 ignore start */ ... /* v8 ignore stop */`).
  - Both guards are mathematically unreachable because prior checks bound the respective non-negative royalty and cost aggregates ($0 \le R, C \le \text{MAX\_SAFE\_INTEGER}$), ensuring $R - C \in [-\text{MAX\_SAFE\_INTEGER}, \text{MAX\_SAFE\_INTEGER}]$, which strictly lies within safe-integer bounds.
  - Reported 100% coverage refers to instrumented executable code and does not include those ignored branches.
  - 100% instrumented branch coverage is verified across all instrumented production code.
  - Do not claim that no production-code branches are ignored.

---

## 5. Input Validation Precedence & Revenue Overflow Invariant

1. **Input Validation Precedence:**
   - In `validateSingleScenarioInput` (`packages/calc-engine/src/scenarios/scenario-calc.ts`), `units` is validated to be a safe integer $\ge 0$ (throwing `UNITS_OUT_OF_BOUNDS` if negative).
   - `listPriceMinor` is validated to be a safe integer $\ge 0$ (throwing `PRICE_OUT_OF_BOUNDS` if negative).
   - Tested explicitly in `scenario-calc.test.ts`:
     - Negative units rejected: lines 68-70 (`expect(() => calculateSingleScenario({ ...validEbookSingle, units: -10 }, ebookPack)).toThrow(CalcInputValidationError)`).
     - Negative price rejected: lines 101-102 (`expect(() => calculateSingleScenario({ ...validEbookSingle, listPriceMinor: -1 }, ebookPack)).toThrow(CalcInputValidationError)`).
2. **Revenue Safe-Integer Invariant:**
   - Since both multiplicands are guaranteed non-negative ($P \ge 0, Q \ge 0$), their product $\text{revenueBig} = \text{BigInt}(P) \times \text{BigInt}(Q) \ge 0$.
   - Lower bound $\text{revenueBig} < \text{MIN_SAFE_INTEGER}$ cannot occur because $\text{MIN_SAFE_INTEGER} = -9,007,199,254,740,991 < 0$.
   - Upper bound verification $\text{revenueBig} \le \text{MAX_SAFE_INTEGER}$ is tested in `scenario-calc.test.ts`:
     - Lines 238-251 (`it('detects integer overflow for astronomical unit sales')`).
     - Lines 724-773 (`it('1. rejects aggregate revenue overflow and accepts exact MAX_SAFE_INTEGER revenue boundary')`).

---

## 6. Roadmap Sequence & Next Step Status

Per the authoritative roadmap in `docs/architecture/17-implementation-roadmap.md`, the canonical step sequence is:

- **STEP-006 — Engine: Scenarios and Totals** (Current — Complete & Fully Verified; Awaiting Formal Owner Acceptance)
- **STEP-007 — Engine: Break-even** (Next — Strictly Unauthorized)
- **STEP-008 — Engine: Sensitivity**
- **STEP-009 — Differential Reference Check**

STEP-007 is strictly unauthorized until explicit, written authorization from the repository owner. Owner acceptance is not claimed.
