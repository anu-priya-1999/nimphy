# Senior Engineering Interview Preparation — STEP-006: Scenarios and Totals

This document contains senior-level technical interview questions, trade-offs, and architectural defenses regarding the design, implementation, and verification of the multi-unit scenario calculation engine, ADR-005 aggregation contracts, and totals modeling in Nimphy.

---

## 1. Financial Mathematics & Aggregation Architecture

### Q1: Explain the critical difference between `per_unit` and `per_total` aggregation under ADR-005. Why can't a single formula handle both?

**Answer:**

The difference lies in the accumulation point where rounding occurs:

1. **`per_unit` Policy:**

   - Rounding occurs at the single-copy level.
   - For an item sold, gross royalty and applicable production/delivery costs are rounded to integer minor units immediately:
     $$R_{\text{unit}} = \text{round}(\text{exactGrossRoyalty}), \quad C_{\text{unit}} = \text{round}(\text{exactApplicableCost})$$
   - At volume $Q$, aggregate totals are linear sums of already-rounded integer minor units:
     $$\text{TotalRoyalty} = R_{\text{unit}} \times Q, \quad \text{TotalCost} = C_{\text{unit}} \times Q$$
   - Net contribution is derived by subtraction: $\text{TotalContribution} = \text{TotalRoyalty} - \text{TotalCost}$.

2. **`per_total` Policy:**

   - Rounding at the per-unit level is explicitly deferred. Intermediate per-unit amounts remain exact `Rational` fractions.
   - For volume $Q$, exact rational per-unit royalty and varied cost are scaled by $Q$ before any rounding occurs:
     $$\text{exactTotalRoyalty} = \text{exactGrossRoyalty} \times Q$$
     $$\text{exactTotalCost} = \text{exactApplicableCostVaried} \times Q$$
   - Aggregate royalty and aggregate cost are then rounded independently, exactly once, using the declared rounding mode:
     $$\text{roundedTotalRoyalty} = \text{round}(\text{exactTotalRoyalty}, \text{mode})$$
     $$\text{roundedTotalCost} = \text{round}(\text{exactTotalCost}, \text{mode})$$
   - Total contribution is derived by subtraction after rounding:
     $$\text{TotalContribution} = \text{roundedTotalRoyalty} - \text{roundedTotalCost}$$

3. **Why a single generic formula cannot be used:**
   - When unit amounts involve fractional minor units (e.g. delivery fee of 7.5 cents, or 35% royalty on $0.99 = 34.65 cents), premature rounding in `per_unit` accumulates an error of up to $\pm 0.5$ minor units per unit sold ($O(Q)$ error).
   - In `per_total`, fractions accumulate exactly in the rational numerator, and rounding is applied only once to the aggregate sum, bounding the total rounding error to $\le 0.5$ minor units regardless of $Q$.
   - For example, at 10 units for an ebook with $0.99 price and 7.5 cent delivery fee, `per_total` yields $2.72 whereas `per_unit` yields $2.70—a real 2-cent divergence.
   - Attempting to unify these into one formula either forces premature rounding onto `per_total` or violates the legal/commercial terms of `per_unit` publisher contracts.

---

### Q2: Under `per_total`, why must aggregate royalty and aggregate cost be rounded separately before subtraction, rather than rounding the exact net contribution fraction?

**Answer:**

1. **Principle of Component Traceability & Financial Invariant:**
   In real accounting and publisher royalty reporting, the gross royalty statement and the production/distribution invoice are two separate accounting ledgers.
   The author is credited $\text{GrossRoyalty} \in \mathbb{Z}$ minor units, and charged $\text{ProductionCost} \in \mathbb{Z}$ minor units. The author's check or payout is the net of those two ledger amounts.
2. **Preventing Off-By-One Discrepancies:**
   If the engine rounded $\text{exactNetContribution} = \text{exactRoyalty} - \text{exactCost}$ directly, the following violation of arithmetic consistency would occur:
   $$\text{roundedRoyalty} - \text{roundedCost} \ne \text{roundedContribution}$$
   For instance, if exact aggregate royalty is $100.4$ cents and exact aggregate cost is $50.9$ cents:
   - Separate rounding (`round_half_up`): $\text{royalty} = 100$, $\text{cost} = 51 \implies \text{net} = 100 - 51 = 49$ cents.
   - Direct net rounding: $\text{exactNet} = 100.4 - 50.9 = 49.5 \implies \text{net} = 50$ cents.
   - If net contribution were reported as 50 cents, but royalty is 100 and cost is 51, the financial statement would state $100 - 51 = 50$, which is mathematically invalid on a balance sheet.
3. **ADR-005 Compliance:**
   ADR-005 explicitly mandates: "Derive total contribution by subtraction after rounding. Never calculate aggregate contribution by rounding exact net contribution as a substitute for the separately rounded components."

---

## 2. Scenario Modeling & Defensive Engineering

### Q3: How did you model `costVariance` and why was a percentage variance chosen over an absolute minor-unit adjustment?

**Answer:**

1. **Requirement FR-006 & Domain Intent:**
   FR-006 specifies low, base, and high scenarios parameterized by units sold, price, and cost variance.
   In book publishing, authors and publishers face cost uncertainty primarily from paper price fluctuations, inflation, page count expansions, or distribution tariff adjustments—all of which scale proportionally to production volume and base print costs.
2. **Mathematical Formulation:**
   We modeled cost variance as a percentage multiplier $M$:
   $$M = \frac{100 + \text{costVariancePercent}}{100}$$
   $$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$
   - A base scenario has `costVariancePercent = 0` $\implies M = 1$.
   - A high-cost scenario has `costVariancePercent = 15` $\implies M = 1.15$ (+15% cost, reducing contribution).
   - A low-cost scenario has `costVariancePercent = -10` $\implies M = 0.90$ (-10% cost, increasing contribution).
3. **Boundary Validation:**
   Production and delivery costs cannot be negative. Therefore, $\text{costVariancePercent} < -100\%$ is physically meaningless and rejected at the boundary with `CalcInputValidationError`.
4. **Preserving Exact Rational Arithmetic:**
   By parsing `costVariancePercent` (e.g. `"12.5"`) directly into a `Rational` ($125/10$), the multiplication by $\text{exactApplicableCost}$ remains 100% exact with native `BigInt` arithmetic, avoiding floating-point rounding errors.

---

### Q4: Why are low, base, and high scenarios calculated independently rather than calculating base and applying relative multipliers?

**Answer:**

1. **Economic Reality:**
   Scenarios in financial modeling are not uniform scalar dilations. An author might test:
   - Low scenario: Low price ($2.99), low volume (100 units), high costs (+10% variance due to low print run economies).
   - High scenario: Premium price ($14.99), high volume (5,000 units), lower unit costs (-10% variance due to bulk printing).
   If the engine simply scaled base revenue by $0.5$ and $2.0$, it would obscure the true nonlinear dynamics of tiered royalties (e.g., crossing from 35% to 70% royalty tiers) and fixed vs. variable print costs.
2. **Replayability & Auditability:**
   Each scenario stores its own explicit, immutable input parameters (`units`, `listPriceMinor`, `costVariancePercent`).
   This allows an auditor or user to re-run any scenario in isolation and obtain the exact same result.
3. **Zero Mutation:**
   Each scenario calculation is a pure function call without shared mutable state.

---

### Q5: If user-supplied inputs for low, base, and high produce non-monotonic results (e.g., low net contribution > high net contribution), should the engine throw an error or reorder them?

**Answer:**

**Neither.** The engine must faithfully report the calculated results for each user-supplied scenario label, while providing an objective ordering evaluation report.

1. **Honest Uncertainty & User Agency (Principle P-07):**
   Silently reordering user inputs would violate the principle of least surprise and corrupt data integrity. If a user intentionally sets a high price for "low" and a low price for "high" to test an unconventional pricing hypothesis, reordering their labels would falsify their experiment.
2. **Separation of Calculation and Assertion:**
   Throwing an error would prevent the user from seeing the results of their own inputs. Instead, the engine:
   - Calculates each scenario faithfully with its requested parameters.
   - Calls `evaluateScenarioOrdering` to check whether:
     $$\text{low.totalContribution} \le \text{base.totalContribution} \le \text{high.totalContribution}$$
   - Returns `areTotalsMonotonicallyOrdered: false` in the evaluation metadata.
   - Downstream consumers (UI, dossier generator) can display an informative warning to the user without breaking execution.

---

## 3. Numeric Robustness & Safe Integer Guarantees

### Q6: If `Rational` uses BigInt internally, why are safe integer checks (`Number.MAX_SAFE_INTEGER`) still required in `@nimphy/calc-engine`, and why must they compare monetary magnitude via Rational rather than checking the BigInt numerator?

**Answer:**

1. **Domain Contract & Interoperability:**
   While `Rational` internally supports arbitrary-precision integers via `BigInt`, `@nimphy/domain`'s `Money` value object and the rest of the application ecosystem (database, JSON serialization, GraphQL/REST APIs, TypeScript number types) represent minor units as safe JavaScript `number`s (`amountMinor: number`).
2. **Rational Numerator vs Monetary Magnitude:**
   A reduced `Rational` fraction $\frac{p}{q}$ can have a numerator $p > \text{Number.MAX\_SAFE\_INTEGER}$ simply because the fraction has high precision (e.g. A tiny percentage variance like $0.0000000000000001\%$ creates an intermediate denominator of $10^{18}$ and numerator of $10^{18} + 1$). The numerator alone does NOT represent monetary magnitude; the actual monetary value is $\frac{p}{q}$, which may be only $1,000$ cents (\$10.00). Comparing the numerator alone directly against `MAX_SAFE_INTEGER` is a critical defect. The engine must compare the actual monetary magnitude using exact Rational cross-multiplication (`exactApplicableCostVaried.compare(Rational.from(Number.MAX_SAFE_INTEGER))`).
3. **Preventing Precision Corruption:**
   JavaScript `number` is a 64-bit float. Integers beyond $2^{53} - 1$ ($9,007,199,254,740,991$, or roughly \$90 trillion) lose exact integer precision. Converting a `BigInt` that exceeds `MAX_SAFE_INTEGER` into a `Number` silently corrupts the least significant digits.
4. **ADR-005 Policy-Specific Fail-Closed Boundary Defense:**
   Rather than allowing silent precision loss or prematurely rejecting valid intermediate computations, the engine enforces strict policy-appropriate boundary checks:
   - Safe integer check on gross retail revenue: $\text{listPriceMinor} \times Q \le \text{MAX\_SAFE\_INTEGER}$ via BigInt bounds.
   - **For `per_total`:** The implementation must NOT reject an unaggregated per-unit rational solely because its magnitude exceeds `MAX_SAFE_INTEGER`. Per ADR-005, it preserves the exact adjusted per-unit cost as a Rational, multiplies by quantity $Q$ using Rational arithmetic, rounds aggregate cost exactly once, and validates the resulting rounded aggregate Money amount against both safe-integer bounds. It raises `CalcOverflowError` only when the monetary result being materialized exceeds the supported range. When $Q = 0$, aggregate cost is exactly zero and succeeds without overflow.
   - **For `per_unit`:** Retains separate checks for rounded per-unit Money (validating `roundedUnitCostBig` against `MAX_SAFE_INTEGER`) and aggregate Money (validating $\text{unitCostMinor} \times Q$ against `MAX_SAFE_INTEGER`).
   - If an astronomical volume, price, or cost variance causes materialized minor units to exceed `MAX_SAFE_INTEGER`, the engine immediately throws `CalcOverflowError` (code `CALC_OVERFLOW`).

---

### Q7: How does the engine handle zero units sold ($Q = 0$) without division by zero or invalid money states?

**Answer:**

1. **Mathematical Definition:**
   At $Q = 0$, the business has sold zero books:
   - Gross Retail Revenue = \$0.00
   - Gross Royalty = \$0.00
   - Production / Delivery Cost = \$0.00
   - Net Contribution = \$0.00
2. **Explicit Boundary Branch:**
   In `scenario-calc.ts`, $Q = 0$ is treated as an explicit boundary condition:
   - `exactTotalRoyalty` and `exactTotalCost` are assigned `Rational.zero()`.
   - Money amounts are constructed as `Money.of(0, currency)`.
   - Per-unit economics and retail list price are still calculated and preserved in the trace, allowing the user to inspect what the per-copy margins would have been.
   - No division by $Q$ is ever performed, eliminating any risk of `DivideByZeroError`.

---

## 4. Input Validation & Governance Defenses

### Q8: Explain the input validation precedence for revenue calculation. Why is the revenue overflow check mathematically sound?

**Answer:**

1. **Strict Input Validation Precedence:**
   In `validateSingleScenarioInput` (`packages/calc-engine/src/scenarios/scenario-calc.ts`), both multiplicands are strictly validated prior to revenue multiplication:
   - `input.units`: Must be a safe integer and $\ge 0$ (negative values throw `CalcInputValidationError` with code `UNITS_OUT_OF_BOUNDS`).
   - `input.listPriceMinor`: Must be a safe integer and $\ge 0$ (negative values throw `CalcInputValidationError` with code `PRICE_OUT_OF_BOUNDS`).
2. **Mathematical Invariant:**
   Because $P \ge 0$ and $Q \ge 0$, their product $\text{revenueBig} = \text{BigInt}(P) \times \text{BigInt}(Q) \ge 0$. It is mathematically impossible for $\text{revenueBig}$ to be negative or breach $\text{MIN_SAFE_INTEGER}$ ($-9,007,199,254,740,991$).
3. **Upper Bound Defense:**
   The check `revenueBig > BigInt(Number.MAX_SAFE_INTEGER)` guards against astronomical sales volume or pricing that would overflow IEEE-754 safe integer limits, throwing typed `CalcOverflowError`.
4. **Verification Tests:**
   Tested in `packages/calc-engine/src/scenarios/scenario-calc.test.ts`:
   - Units non-negative test: lines 68-70 (`units: -10`).
   - List price non-negative test: lines 101-102 (`listPriceMinor: -1`).
   - Revenue overflow tests: lines 238-251 and lines 724-773.

---

### Q9: What is the authoritative roadmap sequence following STEP-006, and what governance rules apply?

**Answer:**

1. **Authoritative Roadmap (`docs/architecture/17-implementation-roadmap.md`):**
   - **STEP-006 — Engine: Scenarios and Totals** (Current — Complete & Fully Verified; Awaiting Formal Owner Acceptance)
   - **STEP-007 — Engine: Break-even** (Next — Strictly Unauthorized)
   - **STEP-008 — Engine: Sensitivity**
   - **STEP-009 — Differential Reference Check**
2. **Governance & Discipline (`AGENTS.md` §3):**
   - "Implement only the step explicitly authorized by the user. Do not anticipate or partially implement future steps."
   - Neither STEP-007 nor any future step is authorized until the repository owner completes formal review and provides explicit written authorization.
   - Owner acceptance of STEP-006 is pending and must not be claimed prematurely.

---

### Q10: How do you reconcile the actual measured test coverage for `@nimphy/calc-engine` in STEP-006 against historical metrics and interim estimates?

**Answer:**

1. **Actual Measured Coverage in STEP-006:**

   - Statements: 1,369/1,369 (100%)
   - Branches: 354/354 (100% instrumented branch coverage)
   - Functions: 39/39 (100%)
   - Lines: 1,369/1,369 (100%)
     Across all 9 production modules:
   - `src/index.ts`: 6/6 stmts, 0/0 br, 0/0 funcs, 6/6 lines
   - `src/errors/calc-error.ts`: 50/50 stmts, 8/8 br, 8/8 funcs, 50/50 lines
   - `src/errors/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines
   - `src/math/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines
   - `src/math/rational.ts`: 243/243 stmts, 116/116 br, 23/23 funcs, 243/243 lines
   - `src/per-unit/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines
   - `src/per-unit/per-unit-calc.ts`: 494/494 stmts, 110/110 br, 2/2 funcs, 494/494 lines
   - `src/scenarios/index.ts`: 1/1 stmts, 0/0 br, 0/0 funcs, 1/1 lines
   - `src/scenarios/scenario-calc.ts`: 572/572 stmts, 120/120 br, 6/6 funcs, 572/572 lines

2. **Reconciliation of Historical and Interim Figures:**

   - **Historical Metric (342/342):** 342/342 statements, 99/99 branches, 25/25 functions, 342/342 lines was the verified coverage achieved at the end of STEP-005. That metric reflected only the per-unit economics engine before the introduction of multi-unit scenarios and totals aggregation in STEP-006. It is historical and kept strictly distinct.
   - **Interim Estimate (536/536):** The figure 536/536 was an unverified interim estimate, not a measured coverage result.
   - Neither 342/342 nor 536/536 represents verified STEP-006 current coverage.

3. **Vitest Configuration and Coverage-Exclusion Terminology:**
   - No production source module is excluded through `vitest.config.ts`.
   - Vitest coverage exclusions in `vitest.config.ts` are strictly limited to test files (`**/*.test.ts`) and pure type definition files (`packages/calc-engine/src/per-unit/types.ts` and `packages/calc-engine/src/scenarios/types.ts`) consisting entirely of TypeScript interfaces and type declarations with zero runtime code, zero functions, and zero executable statements.
   - In production code, two defensive production-code overflow-guard blocks in `packages/calc-engine/src/scenarios/scenario-calc.ts` (guarding aggregate net contribution calculations against safe-integer overflow for both `per_total` and `per_unit`) are explicitly excluded through V8 annotations (`/* v8 ignore start */ ... /* v8 ignore stop */`).
   - Both guards are mathematically unreachable because prior checks bound the respective non-negative royalty and cost aggregates ($0 \le R, C \le \text{MAX\_SAFE\_INTEGER}$), ensuring $R - C \in [-\text{MAX\_SAFE\_INTEGER}, \text{MAX\_SAFE\_INTEGER}]$, which strictly lies within safe-integer bounds.
   - Reported 100% coverage refers to instrumented executable code and does not include those ignored branches.
   - 100% instrumented branch coverage is verified across all instrumented production code.
   - We do not claim that no production-code branches are ignored; rather, the ignored branches are explicitly identified, mathematically proven unreachable, and annotated with V8 directives.
   - All 9 executable production files are included in coverage with zero exclusions of production implementations in `vitest.config.ts`. Both `per-unit-calc.ts` and `scenario-calc.ts` retain full 100% statement, instrumented branch, function, and line coverage.
