# Implementation Record — STEP-007: Break-Even Economics Engine

- **Step Identifier:** STEP-007
- **Step Name:** Engine: Break-Even
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `50c09e3e9f9c125875b71dd7461a78b133ae932f`
- **Status:** Complete & Fully Verified; Awaiting Formal Owner Acceptance (100% Branch Coverage on `packages/calc-engine`)

---

## A. Objective & Executive Summary

The objective of STEP-007 was to implement a production-quality, mathematically correct, deterministic break-even calculation capability within `packages/calc-engine` (Module M-02) per `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, FR-007, accepted ADR-005, and canonical architectural principles (docs 02, 03, 04, 05, 06, 07, 12, 17, 18, 22).

Following the mandatory financial-contract review required before coding, this implementation delivers:

1. **Pure Deterministic Calculation (P-01, P-02):** Computes break-even units and revenue with zero I/O, zero network calls, zero filesystem access, zero system clock dependencies, zero randomness, zero AI imports, and zero floating-point financial arithmetic.
2. **Exact Mathematical Ceiling Semantics (No Floating-Point Math):** Evaluates:
   $Q_{\text{be}} = \left\lceil \frac{\text{FixedCost}}{\text{ExactUnitContribution}} \right\rceil$
   using native `BigInt` integer division and modulo:
   $\text{quotient} = \lfloor \text{Numerator} / \text{Denominator} \rfloor, \quad \text{remainder} = \text{Numerator} \pmod{\text{Denominator}}$
   - Exact division ($\text{remainder} = 0$): $Q_{\text{be}} = \text{quotient}$.
   - Non-zero remainder ($\text{remainder} > 0$): $Q_{\text{be}} = \text{quotient} + 1$.
     Never uses `Math.ceil()` or floating-point ratios on monetary values.
3. **Approved Break-Even Revenue Definition (Decision 2):** Evaluates gross retail sales revenue at the whole-unit, formula-defined break-even threshold:
   $\text{Revenue}_{\text{be}} = \text{listPriceMinor} \times Q_{\text{be}}$
   represented as an immutable `Money` instance in integer minor units. Precise semantic meaning: **Gross retail sales revenue at the whole-unit, formula-defined break-even threshold** (not author royalty income, publisher proceeds, or net profit). Consistent with the existing scenario aggregation engine's revenue calculation (`units * listPriceMinor`).
4. **Explicit Unreachable Contracts (FR-007):** When unit contribution is zero or negative, the result explicitly returns `reachable: false` with a typed discriminator (`ZERO_CONTRIBUTION` or `NEGATIVE_CONTRIBUTION`). Omits `units` and `revenue` to prevent misleading zero-unit or negative outputs.
5. **Zero Fixed Cost Boundary Semantics:** When fixed cost is zero:
   - If unit contribution $> 0$: returns $Q_{\text{be}} = 0$ units, $\text{Revenue}_{\text{be}} = \$0.00$, `reachable: true`.
   - If unit contribution $\le 0$: returns `reachable: false`. Zero or negative unit contribution is never labelled reachable merely because fixed cost is zero.
6. **Accepted ADR-005 Rounding Point Integration & Investigation Findings (Decision 1):**
   - The documentation explicitly distinguishes:
     - The **formula-defined break-even quantity** required by the roadmap ($Q_{\text{be}} = \lceil \text{FixedCost} / \text{ExactUnitContribution} \rceil$).
     - The **minimum quantity that happens to cover fixed cost** under independently rounded aggregate ledger components.
   - We do not claim that the formula-defined quantity is always the minimum rounded-ledger threshold.
   - Under `per_unit`: evaluates unit contribution using already-rounded unit royalty and rounded varied unit cost: $U_{\text{unit}} = R_{\text{unit}} - C_{\text{unit}}$. The ceiling formula guarantees $Q_{\text{be}} \times U_{\text{unit}} \ge F$ and $(Q_{\text{be}} - 1) \times U_{\text{unit}} < F$.
   - Under `per_total`: evaluates unrounded exact rational difference $U_{\text{exact}} = R_{\text{exact}} - C_{\text{varied}}$. For non-negative aggregate amounts and integer fixed costs, `round_half_up`, `round_down`, and `round_up` preserve the integer-shift property needed for coverage arguments. `round_half_even` is the demonstrated exception because tie-breaking depends on the parity of the integer part (e.g. exact royalty 2.5, cost 1.5, contribution 1.0, fixed cost 1, $Q_{\text{be}} = 1$, but rounded ledger contribution is 0). `round_down` is not classified as unsafe based on this counterexample, and universal ledger coverage across all theoretical configurations is not claimed unless formally established.
7. **Safe Integer & Overflow Protection:** Validates that $Q_{\text{be}}$ and $\text{Revenue}_{\text{be}}$ do not exceed `Number.MAX_SAFE_INTEGER`, raising typed `CalcOverflowError` if exceeded.
8. **Deterministic Structured Trace & Immutability (P-03, P-04):** Records engine version, rule pack reference, input parameters, unit contribution components, division quotient/remainder, ceiling decision, and results without timestamps or random IDs. Applies recursive `deepFreeze` to all returned structures.
9. **Exhaustive Testing & 100% Branch Coverage (Decision 3 Reconciliation):**
   - Precise breakdown of tests added in STEP-007:
     - 26 break-even calculation tests (`break-even-calc.test.ts`: validation, ceiling semantics, unreachable boundaries, overflow guards, and immutability).
     - 22 golden break-even tests (`golden-break-even.test.ts`: 1 inventory check + 21 golden fixture parity cases from `fixtures/calc-engine/golden-break-even-cases.json`).
     - 5 break-even property tests (`properties.test.ts`: Mulberry32 PRNG suites for monotonicity, threshold coverage, optimality, determinism, and revenue consistency).
     - 1 newly added README barrel-verification test (`index.test.ts`: static typechecking and runtime assertion of README break-even example).
   - That is 53 break-even-specific tests plus one new barrel-verification test. The reported overall totals remain 256 calc-engine tests and 589 monorepo tests.
   - Exact per-file test reconciliation: **256 tests across 14 test files in `packages/calc-engine`**; **589 tests across 39 test files monorepo-wide** (all passing).
   - Achieves 100% statement (1,496/1,496), 100% instrumented branch (394/394), 100% function (40/40), and 100% line (1,496/1,496) coverage across `packages/calc-engine`.

---

## B. Mandatory Financial-Contract Review & Resolution

In accordance with Section 4 of the assignment prompt, the following five architectural questions were analyzed and resolved:

### 1. Fixed-Cost Input Contract (Question A)

- **Constraint:** Fixed cost must not be silently added to `ScenarioParameters`, `ScenarioTotals`, Rule Pack schemas, database DDL, or persisted business case models.
- **Resolution:** `calculateBreakEven` receives an explicit, standalone `BreakEvenInput` interface containing `fixedCost: Money`.
- **Validation:**
  - `fixedCost` must be an instance of `Money`.
  - `fixedCost.amountMinor >= 0` (negative fixed costs are rejected with `CalcInputValidationError`).
  - Currency consistency: `fixedCost.currency === input.currency === rulePack.currency` (mismatches throw `CalcCurrencyMismatchError`).

### 2. Unit-Contribution Semantics (Question B)

- **Constraint:** Unit contribution must not be derived by dividing scenario totals by quantity (which breaks at $Q = 0$ and loses precision under `per_total`).
- **Resolution:** Derived directly from baseline per-unit economics under the Rule Pack (`calculatePerUnitEconomics`) scaled by cost variance $M = 1 + \text{costVariancePercent} / 100$:
  - `per_unit`: $U_{\text{unit}} = R_{\text{unit}} - C_{\text{unit}}$ (in integer minor units).
  - `per_total`: $U_{\text{exact}} = R_{\text{exact}} - C_{\text{varied}}$ (exact `Rational`).

### 3. `per_unit` versus `per_total` Interaction & Rounding-Mode Investigation (Question C & Decision 1)

- **Owner Decision 1 Directive:** Retain the roadmap break-even formula:
  $Q_{\text{be}} = \left\lceil \frac{\text{FixedCost}}{\text{ExactUnitContribution}} \right\rceil$
  Do not replace with a ledger search. Do not implement the proposed `Q_be - 1` adjustment (aggregate rounded contribution can be non-monotonic, and checking only the immediately preceding quantity can miss earlier qualifying quantities).
- **Mandatory Rounding-Mode Investigation Findings:**
  1. **Schema & Parser Rules:** Inspected `packages/rules/src/schema/types.ts` and `packages/rules/src/schema/validator.ts`. The Rule Pack schema validates `rounding.mode` and `rounding.point` independently. It permits all four rounding modes (`round_half_up`, `round_half_even`, `round_down`, `round_up`) with `per_total`.
  2. **Integer-Shift Property Analysis:** For non-negative aggregate amounts ($R, C \ge 0$) and an integer fixed cost $F \in \mathbb{Z}_{\ge 0}$, exact rational coverage is $R - C \ge F \iff R \ge C + F$. The rounding modes `round_half_up`, `round_down`, and `round_up` preserve the integer-shift property ($\text{round}(x + F) = \text{round}(x) + F$), which guarantees that $\text{round}(R) - \text{round}(C) \ge F$. In particular:
     - For `round_down` ($\lfloor x \rfloor$ on non-negative amounts): $\lfloor x + F \rfloor = \lfloor x \rfloor + F$, so $R \ge C + F \implies \lfloor R \rfloor \ge \lfloor C + F \rfloor = \lfloor C \rfloor + F \implies \lfloor R \rfloor - \lfloor C \rfloor \ge F$.
     - `round_down` is therefore not classified as an unsafe mode based on the `round_half_even` counterexample, nor is disallowing it recommended without a valid independent counterexample.
  3. **Demonstrated Counterexample with `round_half_even`:** `round_half_even` (Banker's rounding) is the demonstrated exception because tie-breaking depends on the parity of the integer part. An odd integer shift $F$ flips the parity, breaking translation invariance:
     - Exact royalty: 2.5 minor units
     - Exact cost: 1.5 minor units
     - Exact contribution: 1.0 minor unit
     - Fixed cost: $F = 1$ minor unit (odd integer)
     - Formula-defined quantity: $Q_{\text{be}} = \lceil 1 / 1.0 \rceil = 1$ unit.
     - Scenario ledger evaluation at $Q = 1$:
       - Aggregate rounded royalty: `round_half_even(2.5)` = 2 minor units (rounds down).
       - Aggregate rounded cost: `round_half_even(1.5)` = 2 minor units (rounds up).
       - Rounded aggregate contribution: $2 - 2 = 0$ minor units.
       - Coverage comparison: $\text{NetContribution}(1) = 0 < F = 1$. Under-covers fixed cost!
     - Scenario ledger evaluation at $Q = 2$:
       - Aggregate rounded royalty: 5 minor units.
       - Aggregate rounded cost: 3 minor units.
       - Rounded aggregate contribution: $5 - 3 = 2 \ge 1$.
  4. **Architectural Distinction & Integrity:**
     - The documentation explicitly distinguishes the formula-defined quantity required by the roadmap from the minimum quantity that happens to cover fixed cost under independently rounded aggregate ledger components.
     - We do not claim universal ledger coverage under all permitted Rule Pack configurations unless formally established.
     - Neither ADR-005, the rounding policy, the Rule Pack schema/validator, nor the roadmap formula was silently changed.

### 4. Approved Break-Even Revenue Definition (Question D & Decision 2)

- **Approved Definition:**
  $\text{Revenue}_{\text{be}} = \text{listPriceMinor} \times Q_{\text{be}}$
- **Precise Semantic Meaning:**
  **Gross retail sales revenue at the whole-unit, formula-defined break-even threshold.**
  - This is gross retail sales revenue, NOT author royalty income, publisher proceeds, or net profit.
  - Consistent with the existing scenario engine's revenue calculation (`units * listPriceMinor`).
  - For unreachable results, both `units` and `revenue` are omitted. Unreachable is never represented as zero units. Reconciled `docs/architecture/07-api-architecture.md` line 101 to include `revenue` with explicit footnote.

### 5. Unreachable Result Contract (Question E)

- **Resolution:** Structured as a TypeScript discriminated union on `reachable: boolean`:
  - When `reachable: true`: provides `units: number` and `revenue: Money`.
  - When `reachable: false`: provides `unreachableReason: 'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION'` and omits `units` and `revenue`.
  - Eliminates fake/fabricated monetary values.

---

### 6. Preserved Benchmark Examples & Calculations (Decision 3)

The following corrected benchmark calculations are preserved as authoritative reference:

- **Example 1 (Paperback US $14.99):**
  - List price: $14.99 (1499 cents), pages: 200.
  - Royalty: 60% of $14.99 = 899.4 -> 899 cents ($8.99). Print cost: 100 + (200 - 24) \* 2 = 452 cents ($4.52).
  - Unit contribution: $8.99 - $4.52 = $4.47 (447 cents). Fixed cost: $1,500.00 (150,000 cents).
  - Division: 150,000 / 447 = 335 remainder 255 ($150,000 - 335 \times 447 = 255$).
  - Quotient: 335, Remainder: 255.
  - Formula-defined threshold: $\lceil 150,000 / 447 \rceil = 336$ units.
  - Gross retail sales revenue: $336 \times \$14.99 = \$5,036.64$ (503,664 cents).
- **Example 2 (Paperback US $20.00):**
  - List price: 2,000 cents ($20.00), pages: 100.
  - Royalty: 60% of 2,000 = 1,200 cents ($12.00). Print cost: 100 + (100 - 24) \* 2 = 252 cents ($2.52).
  - Unit contribution: 1,200 - 252 = 948 cents ($9.48). Fixed cost: $9,480.00 (948,000 cents).
  - Division: 948,000 / 948 = 1,000 with remainder 0.
  - Quotient: 1,000, Remainder: 0.
  - Formula-defined threshold: 1,000 units.
  - Gross retail sales revenue: $1,000 \times \$20.00 = \$20,000.00$ (2,000,000 cents).
- **Example 4 (Paperback US $5.00, 300 pages — Unreachable):**
  - List price: $5.00 (500 cents), pages: 300.
  - Royalty: 60% of $5.00 = 300 cents ($3.00). Print cost: 100 + (300 - 24) \* 2 = 652 cents ($6.52).
  - Unit contribution: $300 - 652 = -352$ cents (-$3.52 per unit).
  - Result: Mathematically unreachable (`unreachableReason: 'NEGATIVE_CONTRIBUTION'`).
  - Units and revenue are strictly omitted.

---

## C. File Inventory & Modifications

| File Path                                                       | Nature       | Purpose                                                                                                                                 |
| --------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/calc-engine/src/break-even/types.ts`                  | **New**      | Pure TypeScript type definitions for `BreakEvenInput`, `BreakEvenResult`, `BreakEvenTraceStep`, and `BreakEvenCalculationTrace`.        |
| `packages/calc-engine/src/break-even/break-even-calc.ts`        | **New**      | Pure, deterministic implementation of `calculateBreakEven` with exact BigInt ceiling arithmetic, unreachable handling, and audit trace. |
| `packages/calc-engine/src/break-even/index.ts`                  | **New**      | Submodule barrel export.                                                                                                                |
| `packages/calc-engine/src/break-even/break-even-calc.test.ts`   | **New**      | 26 unit and boundary tests covering validation, ceiling semantics, unreachable boundaries, overflow guards, and immutability.           |
| `packages/calc-engine/src/break-even/golden-break-even.test.ts` | **New**      | 22 tests verifying parity against 21 independently hand-derived golden fixture cases.                                                   |
| `packages/calc-engine/src/break-even/properties.test.ts`        | **New**      | 5 property-based test suites using Mulberry32 PRNG (monotonicity, coverage, optimality, determinism, revenue).                          |
| `fixtures/calc-engine/golden-break-even-cases.json`             | **New**      | 21 hand-derived golden fixture cases across all 4 synthetic Rule Packs.                                                                 |
| `packages/calc-engine/src/scenarios/scenario-calc.ts`           | **Modified** | Exported `parseCostVariance` helper to share exact decimal string validation with `break-even-calc.ts`.                                 |
| `packages/calc-engine/src/index.ts`                             | **Modified** | Re-exported `calculateBreakEven` and public break-even types.                                                                           |
| `packages/calc-engine/src/index.test.ts`                        | **Modified** | Added barrel assertions for `calculateBreakEven` and 1 newly added README barrel-verification test.                                     |
| `packages/calc-engine/README.md`                                | **Modified** | Added comprehensive documentation for Break-Even Economics Engine (STEP-007), formulas, and usage examples.                             |
| `vitest.config.ts`                                              | **Modified** | Added `'packages/calc-engine/src/break-even/types.ts'` to coverage exclusions (pure types only).                                        |
| `docs/architecture/07-api-architecture.md`                      | **Modified** | Reconciled EP-009 calculation response example to include `revenue` in `breakEven`.                                                     |
| `prompts/step-07.md`                                            | **New**      | Canonical STEP-007 implementation prompt archive.                                                                                       |
| `learning/implementation/step-07-break-even.md`                 | **New**      | This implementation record.                                                                                                             |
| `learning/interviews/step-07-break-even.md`                     | **New**      | Technical interview preparation document covering 12 senior engineering topics.                                                         |
| `learning/notes/step-07-break-even.md`                          | **New**      | Engineering reference notes covering derivations, edge cases, and failure modes.                                                        |
| `docs/DESIGN.md`                                                | **Modified** | Single living design record updated for STEP-007.                                                                                       |

---

## D. Verification Summary

All verification suites executed directly and passed with zero errors and zero warnings:

- `pnpm test`: 39 test files passed, **589/589 tests passed** (0 failures; 256 tests across 14 test files in `@nimphy/calc-engine`).
- `pnpm test:coverage`:
  - `packages/calc-engine`: **100% Statements (1,496/1,496), 100% Branches (394/394), 100% Functions (40/40), 100% Lines (1,496/1,496)**.
  - Entire repository: **99.94% Statements (3,778/3,780), 99.40% Branches (1,154/1,161), 100% Functions (168/168), 99.94% Lines (3,778/3,780)** (threshold: 95%).
- `pnpm typecheck`: Succeeded across all 8 workspace packages with 0 errors.
- `pnpm lint`: Succeeded with 0 errors and **0 warnings**.
- `pnpm format:check`: Succeeded.
- `pnpm arch:check`: Succeeded (documentation check + architectural boundaries check).
- `pnpm build`: Next.js Turbopack production build succeeded with 0 errors.
