# Implementation Record — STEP-009: Differential Reference Check & Mutation Testing

- **Step Identifier:** STEP-009
- **Step Name:** Differential Reference Check & Mutation Testing
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `9c80b7ba100d226b427e49624be4345ea79e47d6`
- **Status:** Implementation Complete; Verification Results Recorded; Awaiting Formal Owner Acceptance

---

## A. Objective & Executive Summary

The objective of STEP-009 was to build a production-quality, independent differential reference-testing harness for `@nimphy/calc-engine` along with a reproducible mutation-testing configuration, strictly adhering to `AGENTS.md`, `docs/architecture/12-testing-and-ai-evaluation.md`, `docs/architecture/17-implementation-roadmap.md`, and the calculation contracts established in STEPs 005 through 008.

Following the strict scope and contracts mandated by the repository owner:

1. **Strictly Independent Reference Oracle (P-01, P-09):**

   - Created an independent, test-only reference implementation (`tests/differential/reference-oracle/`) containing `RefRational` and `RefOracle`.
   - **Zero production imports or calls:** Does not import or call `calculatePerUnitEconomics`, `calculateSingleScenario`, `calculateTriadScenarios`, `calculateBreakEven`, `calculateSensitivity`, production `Rational`, production rounding helpers, or any private calculation helper from `packages/calc-engine`.
   - Built entirely on native `BigInt` fraction arithmetic with independent greatest-common-divisor (Euclidean algorithm) reduction.
   - Independently implements all four rounding modes (`round_half_up`, `round_half_even`, `round_down`, `round_up`) and both aggregation points (`per_unit`, `per_total`).
   - Independently enforces mathematical boundaries and exact integer minor-unit monetary outputs.

2. **Full Calculation Scope Cross-Checked:**

   - **Per-unit economics:** Gross royalty, production cost, delivery cost (where applicable), unit net contribution, applicable cost representation.
   - **Scenario totals:** Revenue, gross royalty, total production cost, net contribution across unit volumes.
   - **Break-even:** Reachability determination, exact integer break-even units, ceiling break-even units, break-even revenue, negative/zero contribution handling.
   - **Sensitivity analysis:** Baseline contribution, one-at-a-time lower/upper perturbations across all declared drivers (`units`, `listPriceMinor`, `costVariancePercent`), contribution deltas, impact scores, and deterministic UTF-16 tie-breaking.

3. **Deterministic Differential Test Harness (1,024 Generated Vectors):**

   - Implemented `tests/differential/differential.test.ts` powered by a seeded pseudo-random number generator (Mulberry32, seed `0x57e9009` / `92180489`).
   - Evaluates all 4 synthetic `TEST_*` Rule Packs (`TEST_EBOOK_STANDARD@1.0.0`, `TEST_PAPERBACK_US@1.0.0`, `TEST_PAPERBACK_US@2.0.0`, `TEST_HARDCOVER_GLOBAL@1.0.0`).
   - Systematically tests all 32 combinations: 4 Rule Packs $\times$ 4 rounding modes $\times$ 2 aggregation points.
   - Generated 1,024 valid input vectors executing 5,120 total calculation comparisons (1,024 vectors $\times$ 5 operations) in normal execution, alongside focused 32-vector Stryker execution mode.
   - Verified **zero unexplained financial drift** across all outputs.

4. **Exhaustive Edge-Case Matrix:**

   - Tested boundary conditions across all 32 configurations: zero units, one unit, price floor, price ceiling, exact royalty thresholds ($\pm 1$ cent), negative/zero unit contribution, boundary cost variances (including $-100\%$), sensitivity driver ranking ties, exact-integer vs ceiling break-even, and unreachable break-even.

5. **Independently Hand-Calculated Checkpoints:**

   - Created `fixtures/calc-engine/reference-checkpoints.json` with 14 hand-derived reference checkpoints.
   - Expected values derived from first mathematical principles without running or copying from the production engine.
   - Each checkpoint includes documented intermediate exact fractions, rational arithmetic derivations, and explicit justifications (e.g., half-cent tie behavior for round_half_up vs round_half_even to even vs odd, exact zero contribution break-even, sensitivity ranking ties, triad scenario ordering, and safe-integer boundaries).
   - Validated against both the independent reference oracle and the production calculation engine in `tests/differential/checkpoints.test.ts`.

6. **Reproducible Mutation Testing Setup:**

   - Configured StrykerJS with the official Vitest runner (`@stryker-mutator/core@10.1.1`, `@stryker-mutator/vitest-runner@10.1.1`).
   - Created `stryker.calc-engine.config.mjs` and focused runner `vitest.calc-engine.config.ts`.
   - Mutates all 5 calculation source files in `packages/calc-engine/src` while excluding tests, types, and error definitions.
   - Registered dedicated reproducible script `pnpm test:mutation:calc-engine`.
   - Policy: Target score remains `OPEN` per `docs/architecture/12-testing-and-ai-evaluation.md` §3.10.

7. **CI and Script Integration:**
   - Added `pnpm test:differential` script.
   - Differential tests automatically discover and run under standard Vitest runs (`pnpm test`, `pnpm test:coverage`) and in CI workflows.

---

## B. Architectural & Mathematical Design of the Independent Reference Oracle

### 1. Independence and Zero Shared Logic

To satisfy the critical independence requirement, the reference oracle was constructed in isolation under `tests/differential/reference-oracle/`:

```
tests/differential/
├── reference-oracle/
│   ├── ref-rational.ts       # Independent BigInt rational arithmetic class
│   ├── ref-oracle.ts         # Independent reference calculation engine
│   └── index.ts              # Oracle exports
├── checkpoints.test.ts       # Verification of hand-derived checkpoints
└── differential.test.ts      # 1,024 generated vectors + edge-case suite
```

The oracle does not import any modules from `packages/calc-engine/src/`. It re-uses domain-primitive type interfaces only for type compatibility during assertions, and directly parses the raw JSON Rule Pack fixtures.

### 2. Native BigInt Exact Rational Arithmetic (`RefRational`)

The reference arithmetic class `RefRational` represents any rational number as an irreducible fraction of two arbitrary-precision integers:
$$\frac{n}{d}, \quad n, d \in \mathbb{Z}, \quad d > 0, \quad \gcd(|n|, d) = 1$$

Key properties:

- **Zero Floating-Point:** All parsing of decimal strings (e.g. `"0.70"`, `"0.15"`, `"-15.5"`) directly computes $n$ and $d = 10^k$ using string splitting and `BigInt` scaling.
- **Euclidean Canonical Form:** Upon creation, signs are normalized ($d > 0$) and fractions are reduced using iterative Euclidean greatest common divisor.
- **Independent Rounding Implementation:**
  Given a fraction $n / d$ to be rounded to integer minor units ($1/100$ or integer):
  $$\text{quotient} = n / d, \quad \text{remainder} = |n| \pmod d$$
  - `round_down`: Signed truncation toward zero: $\text{sign}(n) \times \lfloor |n| / d \rfloor$ (matching JavaScript `BigInt` integer division `n / d`).
  - `round_up`: Signed rounding away from zero: $\text{sign}(n) \times \lceil |n| / d \rceil$ (for remainder $> 0$, adds 1 to magnitude).
  - `round_half_up`: Nearest integer; exact ties ($2 \times \text{remainder} = d$) rounded away from zero: $\text{sign}(n) \times \lfloor (|n| + \lfloor d / 2 \rfloor) / d \rfloor$.
  - `round_half_even`: When $2 \times \text{remainder} = d$, round to the nearest even integer; otherwise round to nearest integer.

### 3. Independent Calculation Logic (`RefOracle`)

1. **Per-Unit Economics:**

   - Evaluates tiered royalties by finding the matching bracket $[\text{minMinor}, \text{maxMinor}]$ where $\text{listPriceMinor} \in [\text{min}, \text{max}]$.
   - Computes gross royalty: $\text{listPriceMinor} \times \text{rate}$.
   - Computes delivery cost for ebooks based on file size and rate per megabyte: $\text{fileSizeMb} \times \text{ratePerMb}$.
   - Computes production cost for print books based on base print cost per book + incremental page cost above threshold, adjusted for cost variance percentage:
     $$\text{cost} = (\text{baseCostMinor} + \max(0, \text{pages} - \text{pageThreshold}) \times \text{costPerPageMinor}) \times (1 + \text{variance} / 100)$$
   - Rounds intermediate values according to the specified `RoundingMode` and `AggregationPoint` (`per_unit` vs `per_total`).
   - Computes unit net contribution: $\text{royalty} - \text{productionCost} - \text{deliveryCost}$.

2. **Scenario Totals:**

   - Under `per_unit`: Totals equal $\text{units} \times \text{roundedPerUnitCost/Royalty}$.
   - Under `per_total`: Exact unrounded rational per-unit rates are multiplied by $\text{units}$ first, and only the total aggregate amount is rounded to minor units.

3. **Break-Even:**

   - Unit net contribution $c = \text{unitContribution}$.
   - If $c \le 0$, break-even is unreachable (`isReachable: false`, reason `ZERO_CONTRIBUTION` or `NEGATIVE_CONTRIBUTION`).
   - If $c > 0$, required units $U^* = \lceil \text{fixedCost} / c \rceil$.
   - Break-even revenue $R^* = U^* \times \text{listPriceMinor}$.

4. **Sensitivity Analysis:**

   - Evaluates baseline scenario revenue and net contribution.
   - For each driver $D \in \{\text{units}, \text{listPriceMinor}, \text{costVariancePercent}\}$:
     - Perturbs lower: $D^- = D - \Delta$
     - Perturbs upper: $D^+ = D + \Delta$
     - Evaluates $C_i^-$ and $C_i^+$ (and corresponding revenues $R_i^-$ and $R_i^+$) via reference scenario calculation.
     - Computes contribution deltas $\Delta C_i^- = C_i^- - C_{\text{base}}$, $\Delta C_i^+ = C_i^+ - C_{\text{base}}$ and revenue deltas $\Delta R_i^- = R_i^- - R_{\text{base}}$, $\Delta R_i^+ = R_i^+ - R_{\text{base}}$.
     - Computes impact score $I_i = \max(|\Delta C_i^-|, |\Delta C_i^+|)$.
   - Ranks drivers descending by impact score; secondary tie-break by UTF-16 code-point order (`costVariancePercent` < `listPriceMinor` < `units`).

5. **Triad Scenarios (`refCalculateTriadScenarios`):**
   - Independently calculates low, base, and high scenario revenue, royalty, production cost, and net contribution.
   - Aggregates exact total royalty, total cost, and total contribution fractions.
   - Evaluates input ordering ($u_{\text{low}} \le u_{\text{base}} \le u_{\text{high}}$ and $p_{\text{low}} \le p_{\text{base}} \le p_{\text{high}}$).
   - Evaluates total revenue ordering ($R_{\text{low}} \le R_{\text{base}} \le R_{\text{high}}$) and total net contribution ordering ($C_{\text{low}} \le C_{\text{base}} \le C_{\text{high}}$).

---

## C. Deterministic Differential Test Suite

### 1. Pseudo-Random Number Generation (Mulberry32)

To ensure 100% determinism without system-clock or environment drift, the harness employs Mulberry32:

- Seed: `0x57e9009` (`92180489` in decimal).
- State transition: $a = (a + \text{0x6D2B79F5}) \pmod{2^{32}}$, followed by bitwise mixing.
- Generates reproducible uniform values in $[0, 1)$.

### 2. Test Configuration Matrix

The harness iterates through all 32 configuration dimensions:

- 4 Rule Packs:
  1. `TEST_EBOOK_STANDARD@1.0.0` (Digital, delivery fees, tiered royalties)
  2. `TEST_PAPERBACK_US@1.0.0` (Print POD, fixed + per-page costs)
  3. `TEST_PAPERBACK_US@2.0.0` (Updated print POD rates)
  4. `TEST_HARDCOVER_GLOBAL@1.0.0` (Hardcover POD, higher baseline costs)
- 4 Rounding Modes: `round_half_up`, `round_half_even`, `round_down`, `round_up`
- 2 Aggregation Points: `per_unit`, `per_total`
- Generated cases per configuration: 32 vectors
- Total generated vectors: $32 \times 32 = 1,024$ vectors.

### 3. Differential Cross-Checks Performed

For every vector:

1. `refCalculatePerUnit` vs `calculatePerUnitEconomics`:
   - Exact gross royalty numerator and denominator (`exactGrossRoyalty`)
   - Exact applicable cost numerator and denominator (`exactApplicableCost`)
   - Exact unit net contribution numerator and denominator (`exactNetContribution` vs `exactUnitContribution`)
   - Rounded gross royalty Money (under `per_unit`; null under `per_total`)
   - Rounded applicable cost Money (under `per_unit`; null under `per_total`)
   - Rounded unit net contribution Money (under `per_unit`; null under `per_total`)
2. `refCalculateSingleScenario` vs `calculateSingleScenario`:
   - Exact total royalty numerator and denominator (`exactTotalRoyalty`)
   - Exact total cost numerator and denominator (`exactTotalCost`)
   - Exact total contribution numerator and denominator (`exactTotalContribution`)
   - Rounded scenario revenue Money
   - Rounded scenario gross royalty Money
   - Rounded scenario production/delivery cost Money
   - Rounded scenario net contribution Money
3. `refCalculateBreakEven` vs `calculateBreakEven`:
   - Exact reachability status (`isReachable`)
   - Exact unit contribution numerator and denominator (`exactUnitContribution`)
   - Exact break-even units (when reachable)
   - Exact break-even revenue (when reachable)
   - Exact unreachable reason (`ZERO_CONTRIBUTION`, `NEGATIVE_CONTRIBUTION`)
4. `refCalculateSensitivity` vs `calculateSensitivity`:
   - Exact baseline revenue and net contribution
   - Exact evaluated lower/upper scenario revenues and contributions
   - Exact revenue deltas (`deltaLowerRevenueMinor`, `deltaUpperRevenueMinor`)
   - Exact contribution deltas (`deltaLowerMinor`, `deltaUpperMinor`)
   - Exact impact scores (`impactScoreMinor`)
   - Exact driver rank ordering with deterministic UTF-16 tie-breaking
5. `refCalculateTriadScenarios` vs `calculateTriadScenarios`:
   - Low, base, and high scenario revenue, gross royalty, applicable cost, and net contribution
   - Exact total royalty, total cost, and total contribution
   - Input ordering evaluation (`isMonotonicInput`)
   - Revenue ordering evaluation (`isMonotonicRevenue`)
   - Net contribution ordering evaluation (`isMonotonicContribution`)
   - Ordering detail objects

Result: **0 mismatches, 0 drift across all 1,024 generated vectors and edge cases.**

---

## D. Hand-Derived Reference Checkpoints

Located at `fixtures/calc-engine/reference-checkpoints.json`, 14 checkpoints were hand-calculated from first principles:

1. `CHK-001-HALF-UP-TIE` (`checkpoint_half_up_tie`): Amazon KDP-style half-cent tie on \$0.99 list price at 70% royalty.
   - Exact fraction: $99 \times 70 / 100 = 6930 / 100 = 69.30$ cents.
   - Delivery cost: $1.5 \text{ MB} \times 15\text{¢} = 22.5\text{¢} = 45 / 2\text{¢}$.
   - Under `round_half_up`: $22.5\text{¢}$ rounds UP to $23\text{¢}$. Net contribution: $69 - 23 = 46\text{¢}$.
2. `CHK-002-HALF-EVEN-TO-EVEN` (`checkpoint_half_even_to_even`): Half-cent tie rounding to nearest even integer.
   - $22.5\text{¢} = 45 / 2\text{¢}$.
   - Under `round_half_even`: 22 is even, 23 is odd. Rounds to $22\text{¢}$. Net contribution: $69 - 22 = 47\text{¢}$.
3. `CHK-003-HALF-EVEN-TO-ODD` (`checkpoint_half_even_to_odd`): Half-cent tie rounding to even integer where ceiling is even.
   - Delivery fee: $2.5 \text{ MB} \times 15\text{¢} = 37.5\text{¢} = 75 / 2\text{¢}$.
   - Under `round_half_even`: 37 is odd, 38 is even. Rounds UP to $38\text{¢}$.
4. `CHK-004-ROUND-DOWN` (`checkpoint_round_down`): Signed truncation toward zero mode.
   - Royalty: $99 \times 70\% = 69.3\text{¢} \to 69\text{¢}$. Delivery: $22.5\text{¢} \to 22\text{¢}$. Net: $47\text{¢}$.
5. `CHK-005-ROUND-UP` (`checkpoint_round_up`): Signed rounding away from zero mode.
   - Royalty: $69.3\text{¢} \to 70\text{¢}$. Delivery: $22.5\text{¢} \to 23\text{¢}$. Net: $47\text{¢}$.
6. `CHK-006-PER-TOTAL-SCENARIO` (`checkpoint_per_total_scenario`): Per-total aggregation with fractional unit cost.
   - 0.5 MB ebook delivery fee: $0.5 \times 15\text{¢} = 7.5\text{¢} = 15 / 2\text{¢}$.
   - 10 units: Aggregate delivery fee $= 10 \times 7.5\text{¢} = 75.0\text{¢} = 75\text{¢}$.
7. `CHK-007-BREAK-EVEN-EXACT` (`checkpoint_break_even_exact`): Exact integer break-even division.
   - Contribution $= 200\text{¢}$. Fixed cost $= \$1,000.00 = 100,000\text{¢}$.
   - Break-even units: $100,000 / 200 = 500$ exact units.
8. `CHK-008-BREAK-EVEN-CEILING` (`checkpoint_break_even_ceiling`): Fractional break-even requiring ceiling.
   - Contribution $= 300\text{¢}$. Fixed cost $= \$1,000.00 = 100,000\text{¢}$.
   - Exact division: $100000 / 300 = 333.333\dots$ units. Ceils to $334$ units.
9. `CHK-009-BREAK-EVEN-NEGATIVE-CONTRIBUTION` (`checkpoint_break_even_negative_contribution`): Negative contribution yielding unreachable status.
   - Unit contribution $< 0$ ($-352\text{¢}$). `isReachable: false`, `reason: NEGATIVE_CONTRIBUTION`.
10. `CHK-010-SENSITIVITY-RANKING` (`checkpoint_sensitivity_ranking`): Multi-driver sensitivity with UTF-16 deterministic tie-breaking.
11. `CHK-011-BREAK-EVEN-ZERO-CONTRIBUTION` (`checkpoint_break_even_zero_contribution`): Exactly zero unit contribution break-even.
    - List price 500 minor, 60% royalty = 300 minor; 124 pages, print cost = $100 + (124 - 24) \times 2 = 300$ minor.
    - Unit net contribution $= 300 - 300 = 0$ minor.
    - `isReachable: false`, `reason: ZERO_CONTRIBUTION`, `breakEvenUnits: null`, `breakEvenRevenue: null`.
12. `CHK-012-SENSITIVITY-RANKING-TIE` (`checkpoint_sensitivity_ranking_tie`): 3-way exact impact score tie with deterministic tie-breaking.
    - Paperback US v1, 1000 units, list price 1000 cents.
    - Perturbations calibrated so `costVariancePercent` (60), `listPriceMinor` (100), and `units` (120) each produce an identical impact score of 60,000 cents.
    - Evaluates UTF-16 code-point order: `costVariancePercent` (rank 1), `listPriceMinor` (rank 2), `units` (rank 3).
13. `CHK-013-TRIAD-SCENARIOS-ORDERING` (`checkpoint_triad_scenarios_ordering`): Triad scenarios evaluation with monotonic ordering.
    - Low (100 units, 499 cents), Base (250 units, 599 cents), High (500 units, 799 cents).
    - Verifies scenario revenues, royalties, costs, contributions, aggregate totals, and monotonic ordering flags.
14. `CHK-014-SCENARIO-SAFE-INTEGER-BOUNDARY` (`checkpoint_scenario_safe_integer_boundary`): Valid near-MAX_SAFE_INTEGER scenario boundary.
    - 4,503,599,627,370 units at €20.00 under `TEST_HARDCOVER_GLOBAL@1.0.0`.
    - Total retail revenue $= 9,007,199,254,740,000$ cents ($<\text{Number.MAX_SAFE_INTEGER} = 9,007,199,254,740,091$).
    - Verifies exact BigInt rational fractions without precision loss and safe Money representation.

---

## E. Mutation Testing Setup & Baseline Metrics

### 1. Configuration (`stryker.calc-engine.config.mjs`)

```javascript
const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: {
    configFile: 'vitest.calc-engine.config.ts',
  },
  mutate: [
    'packages/calc-engine/src/**/*.ts',
    '!packages/calc-engine/src/**/*.test.ts',
    '!packages/calc-engine/src/**/types.ts',
    '!packages/calc-engine/src/**/index.ts',
    '!packages/calc-engine/src/golden/**',
    '!packages/calc-engine/src/errors/**',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 60, break: null },
  ignoreStatic: true,
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 10000,
  cleanTempDir: true,
};
```

### 2. Focused Vitest Runner Configuration (`vitest.calc-engine.config.ts`)

```typescript
const calcEngineVitestConfig = {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    include: ['packages/calc-engine/src/**/*.test.ts', 'tests/differential/**/*.test.ts'],
    exclude: ['packages/calc-engine/src/**/properties.test.ts'],
  },
};
```

### 3. Removal of Broad Mutation Exclusions

Broad exclusions for `StringLiteral` and `BlockStatement` were removed from `stryker.calc-engine.config.mjs`. No mutation classes are globally excluded, ensuring full mutation coverage across all supported AST mutators (ArithmeticOperator, BooleanLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, MethodExpression, ObjectLiteral, StringLiteral, BlockStatement, etc.) without artificial score inflation.

### 4. Property Test Exclusion Rationale & Complementary Coverage

- **Excluded Files:** `packages/calc-engine/src/**/properties.test.ts` (specifically `scenarios/properties.test.ts`, `break-even/properties.test.ts`, `sensitivity/properties.test.ts`).
- **Rationale:** Property tests execute generative pseudo-random test loops (e.g., hundreds of iterations per property test). Running these generative loops against thousands of individual mutants during perTest mutation analysis introduces severe execution time penalties and timeout risks without providing mutant-killing precision beyond deterministic suites.
- **Complementary Deterministic Coverage:** Deterministic differential tests (`tests/differential/differential.test.ts` testing 1,024 vectors across 32 configuration permutations with Mulberry32 PRNG seed `0x57e9009`, plus edge-case matrix) and reference checkpoints (`tests/differential/checkpoints.test.ts` testing 14 hand-derived rational arithmetic checkpoints against `RefOracle`), combined with deterministic unit, boundary, error, and golden fixture suites (`fixtures/calc-engine/golden-*.json`), provide comprehensive, reproducible mutant killing.
- **Standard CI Preservation:** Excluding property tests from focused Stryker mutation testing does not mean they are excluded from ordinary CI or the normal test suite; they remain fully included in `pnpm test`, `pnpm test:coverage`, and `.github/workflows/ci.yml`. Differential tests provide independent cross-implementation verification for specific calculations and do not replace property-based testing.

### 5. Executed Mutation Baseline Metrics & Surviving Mutant Review

The full mutation run was successfully executed across all 5 calculation source files in `packages/calc-engine/src` using StrykerJS (`@stryker-mutator/core@10.1.1`, `@stryker-mutator/vitest-runner@10.1.1`):

- **Command:** `pnpm test:mutation:calc-engine`
- **Duration:** 114 minutes, 54 seconds (reported)
- **Average tests per mutant:** 15.39
- **Reports:** Generated at `reports/mutation/mutation.json`, `reports/mutation/mutation.html`, and `reports/mutation/survivor-inventory.md`
- **Baseline Configuration:** Historically executed with 4 concurrent workers, `timeoutMS: 4000`, `coverageAnalysis: 'perTest'`, `ignoreStatic: true`, `thresholds.break: null`, and `incremental: false`.
- **Future Incremental Configuration:** `stryker.calc-engine.config.mjs` is configured for future runs with `incremental: true` and `incrementalFile: 'reports/stryker-step-09-completion.json'`.
- **Historical Baseline Distinction:** The mutation score of 73.89% ($1,276 / 1,727$) represents the test suite as executed prior to the addition of regression tests. While newly added regression tests now distinguish and kill all genuine assertion gaps, the historical baseline metrics and reports are preserved without rewriting.

#### Quantitative Results Table (Authoritative Stryker JSON Baseline)

| Status                     |     Count | Notes                                                                              |
| -------------------------- | --------: | ---------------------------------------------------------------------------------- |
| **Generated mutants**      | **1,728** | Total raw AST mutants generated across 5 calculation files                         |
| **Ignored static mutants** |     **1** | In `per-unit-calc.ts` L28:43 (`ENGINE_VERSION = '0.1.0'`) per `ignoreStatic: true` |
| **Score-eligible mutants** | **1,727** | Total mutants eligible for mutation score calculation                              |
| **Killed**                 | **1,204** | Detected by failing test assertions                                                |
| **Timeout**                |    **72** | Caused by non-terminating loops or high-volume test runner timeouts                |
| **Survived**               |   **443** | Tested mutants where all tests passed in the archived baseline run                 |
| **No coverage**            |     **8** | Unreachable defensive overflow error throw blocks                                  |
| **Pending**                |     **0** | All mutants evaluated to completion                                                |

- **Mutation score:** **73.89%** ($1,276 / 1,727 = 73.885\%$).
- **Covered-code mutation score:** **74.23%** ($1,276 / 1,719 = 74.229\%$).

#### Per-File Breakdown

| File                              | % Score    | % Covered  | Generated | Ignored | Score-Eligible | Killed    | Timeout | Survived | No Cov |
| --------------------------------- | ---------- | ---------- | --------- | ------- | -------------- | --------- | ------- | -------- | ------ |
| `math/rational.ts`                | 91.67%     | 91.67%     | 312       | 0       | 312            | 242       | 44      | 26       | 0      |
| `per-unit/per-unit-calc.ts`       | 75.18%     | 75.18%     | 420       | 1       | 419            | 291       | 24      | 104      | 0      |
| `sensitivity/sensitivity-calc.ts` | 74.31%     | 74.83%     | 288       | 0       | 288            | 214       | 0       | 72       | 2      |
| `scenarios/scenario-calc.ts`      | 69.71%     | 70.34%     | 449       | 0       | 449            | 309       | 4       | 132      | 4      |
| `break-even/break-even-calc.ts`   | 57.14%     | 57.59%     | 259       | 0       | 259            | 148       | 0       | 109      | 2      |
| **Total**                         | **73.89%** | **74.23%** | **1,728** | **1**   | **1,727**      | **1,204** | **72**  | **443**  | **8**  |

#### Timeout Analysis (72 Total Mutants)

The 72 timeout mutants occurred in 3 source files:

- `math/rational.ts`: 44 timeouts
- `per-unit/per-unit-calc.ts`: 24 timeouts
- `scenarios/scenario-calc.ts`: 4 timeouts
- `break-even/break-even-calc.ts`: 0 timeouts
- `sensitivity/sensitivity-calc.ts`: 0 timeouts

Analysis of timeout causes reveals two distinct mechanisms:

1. **Intentional Non-Terminating Mutations (True Infinite Loops):**
   - In `math/rational.ts`: Mutating Euclid's GCD loop `while (y !== 0n)` (block cleared or `x % y` mutated to `x * y`), prime factorization loops `while (tempD % 2n === 0n)` and `while (tempD % 5n === 0n)` (block cleared or `/=` mutated to `*=`), and long division loop `while (remainder !== 0n && digits < maxDecimals)` (block cleared, `digits++` mutated to `digits--`, or condition mutated to `true`).
   - In `scenarios/scenario-calc.ts`: `deepFreeze` recursive traversal mutations (`val !== null && typeof val === 'object'` mutated to `||`).
2. **Test Runner Duration Timeouts Under High Test Volume:**
   - In `per-unit/per-unit-calc.ts`: Mutating fundamental early-validation guards (e.g. `typeof input.currency !== 'string'`, `isSupportedCurrency(...)`, `input.listPriceMinor < 0`).
   - Because these guards sit at the entrypoint of all calculation workflows, over 250 tests cover them (including 32 differential tests each performing dozens of assertions). The cumulative sequential runtime across 250+ tests in a worker process exceeded Stryker's 4,000 ms per-mutant timeout threshold (`timeoutMS: 4000`), causing Stryker to record a timeout rather than a direct test failure.

#### Complete Reconciled Audit & Classification of Surviving Mutants (443 Total)

All 443 surviving mutants from `reports/mutation/mutation.json` were comprehensively audited and classified into the six canonical survivor categories. An auditable, itemized inventory of every single mutant is permanently preserved in untracked, non-ignored working-tree documentation at [learning/notes/step-09-survivor-inventory.md](../notes/step-09-survivor-inventory.md) (and mirrored as an additional artifact at [reports/mutation/survivor-inventory.md](../../reports/mutation/survivor-inventory.md)).

| Category #     | Category Name                                                  |   Count | % of Survivors | Technical Rationale & Scope                                                                                                                                                               |
| -------------- | -------------------------------------------------------------- | ------: | -------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Category 1** | **Genuine assertion gap**                                      |  **17** |      **3.84%** | Behavioral gaps in baseline assertions (11 triad ordering, 2 sensitivity tie metadata, 4 rational equality); all 17 now addressed and distinguished by regression tests.                  |
| **Category 2** | **Behaviorally equivalent mutation**                           |  **12** |      **2.71%** | Syntactical variations producing mathematically or behaviorally identical results (7 rational identities, 1 duplicate-free driver sorting invariant, 4 zero-variance fast path bypasses). |
| **Category 3** | **Unreachable under the accepted input contract**              |  **67** |     **15.12%** | Defensive integer overflow/underflow bounds guards that are mathematically impossible to reach or complete under valid input contracts and Rule Pack limits.                              |
| **Category 4** | **Trace or metadata-only behavior**                            |  **31** |      **7.00%** | Non-functional trace step keys, operation names, note strings, disclaimer texts (`SCENARIO_DISCLAIMER_TEXT`), and audit trail logging.                                                    |
| **Category 5** | **Validation or defensive-boundary behavior**                  | **316** |     **71.33%** | Input validation type guards, error codes, human-readable error messages, defensive boundary checks, and redundant multi-layer validation checks.                                         |
| **Category 6** | **Potentially meaningful financial or public-result behavior** |   **0** |      **0.00%** | Zero surviving mutants alter financial calculation logic, monetary values, units, or public calculation outputs.                                                                          |
| **Total**      |                                                                | **443** |    **100.00%** | **All 443 surviving mutants accounted for across mutually exclusive categories.**                                                                                                         |

##### Detailed Category Justifications

1. **Category 1: Genuine Assertion Gaps (17 mutants):**

   - **Reconciliation of Gaps (17 vs 15):** The previous audit summary erroneously reported 15 mutants by miscounting the 11 triad scenario ordering mutants as 9 ($9 + 2 + 4 = 15$). Cross-referencing the authoritative AST mutant records in `mutation.json` confirms exactly 17 distinct mutant IDs:
     - **Triad scenario ordering comparisons (`scenario-calc.ts`, 11 mutants):** Mutant IDs `1383`, `1385`, `1386`, `1389` (price ordering L572–L573); `1394`, `1395`, `1398` (units ordering L577); `1418` (net contribution ordering L587); `1426`, `1427`, `1430` (revenue ordering L591–L592). In the baseline test suite, non-monotonic inputs simultaneously inverted price, units, and variance, asserting only `netContributionOrderingSatisfied` while leaving individual price, unit, and revenue ordering unasserted.
     - **Sensitivity single-driver tie-breaking (`sensitivity-calc.ts`, 2 mutants):** Mutant IDs `1815`, `1817` on L520 (`isTied = scoreCounts.get(...)! > 1` mutated to `true` or `>= 1`). Existing tests asserted `tieBrokenByDriverName: true` on tied drivers, but never asserted `tieBrokenByDriverName: false` on single-driver or unique-score driver analyses.
     - **Rational equality check (`rational.ts`, 4 mutants):** Mutant IDs `411`, `413`, `414`, `416` on L198 in `Rational.prototype.equals`. Existing tests asserted `a.equals(c)` (`true`) and `a.equals('not a rational')` (`false`), but never asserted `a.equals(b)` (`false`) on unequal `Rational` instances.
   - **Empirical Assertion Distinguishability Review:**
     - The initial revision of regression tests added assertions for `low > base` in `scenario-calc.test.ts`. This successfully killed mutants `1383`, `1385`, `1386`, `1394`, `1395`, `1418`, `1426`, and `1427`. However, because `base <= high` remained true in those test cases, mutants `1389` (`base.listPriceMinor <= high.listPriceMinor` -> `true`), `1398` (`base.units <= high.units` -> `true`), and `1430` (`base.revenue.amountMinor <= high.revenue.amountMinor` -> `true`) initially survived because the assertions did not invert the second half of the ordering chain.
     - To ensure complete distinguishability, focused assertions testing `base > high` non-monotonicity were added for price, units, and revenue. Empirical post-baseline regression verification confirms that all 11 triad ordering mutants, both sensitivity tie-metadata mutants, and all 4 rational equality mutants are cleanly distinguished and killed by the revised regression assertions.
     - In the authoritative historical Stryker JSON report (`reports/mutation/mutation.json`), all 17 mutants remain recorded as `Survived`. Their elimination was confirmed through post-baseline regression verification, not a new Stryker run. The historical Stryker mutation baseline (73.89%) and all original JSON metrics strictly predate these regression tests and are preserved without modification.

2. **Category 2: Behaviorally Equivalent Mutations (12 mutants):**

   - **In `rational.ts` (7 mutants):**
     - Mutant `302` (L42): Euclid's GCD with negative denominator naturally returns a negative divisor, neutralizing sign flips during canonical reduction.
     - Mutant `402` (L188): In `abs()`, for numerator `0n`, `0n < 0n` vs `0n <= 0n` returns `0n` in both branches.
     - Mutants `408`, `409` (L195): When comparing `other` that is not a `Rational` (e.g. primitive or non-Rational object), `other.numerator` evaluates to `undefined`, which never equals `this.numerator` (BigInt), correctly returning `false` via property comparison.
     - Mutants `462` (L254) and `531` (L283): In `round_up` and `round_half_even`, remainder $r \ne 0n$ guarantees numerator $n \ne 0n$. Therefore, `n > 0n` vs `n >= 0n` produces identical signed rounding steps.
     - Mutant `585` (L349): In `toDecimalString(maxDecimals)` for repeating decimals (e.g. $1/3$), remainder is never `0n`, making `remainder !== 0n` unconditionally true.
   - **In `sensitivity-calc.ts` (1 mutant):**
     - Mutant `1805` (L508): `a.driver < b.driver ? -1 : 1` mutated to `<=`. `validateSensitivityInput` strictly rejects duplicate drivers (`DUPLICATE_DRIVER`), guaranteeing $a.driver \ne b.driver$.
   - **In `scenarios/scenario-calc.ts` (4 mutants):**
     - Mutants `1287`, `1288`, `1289`, `1290` (L381–L383): `if (costVarianceRational.isZero())`. Bypassing this optimization executes the general varied cost calculation with variance $0$, which multiplies by $1$ and rounds, producing bit-for-bit identical minor unit values.

3. **Category 3: Unreachable Under Accepted Input Contract (67 mutants):**

   - **No Universal 1e9 Input Bound:** The calculation engine does not enforce an arbitrary universal blanket bound of 1e9 across all inputs. Rather, reachable numerical ranges are governed individually by domain constraints, Rule Pack bounds, and mathematical invariants across each module:
     - **Per-Unit Calculation (`per-unit-calc.ts`):** Input parameters are strictly bounded by Rule Pack specifications ($minListPriceMinor \ge 99\text{¢}$, $maxListPriceMinor \le 100,000\text{¢}$, $maxPages \le 2,000$). Maximum print cost per book is $85\text{¢} + 2,000 \times 1.2\text{¢} = 2,485\text{¢}$ ($24.85); maximum delivery fee is $50\text{ MB} \times 15\text{¢} = 750\text{¢}$. Because maximum gross royalty is $\le 100,000\text{¢}$ and maximum unit cost is $\le 8,104\text{¢}$, intermediate rational quantities and rounded integers are bounded within $[-100,000, 100,000]$ minor units—approximately 11 orders of magnitude below $MAX\_SAFE\_INTEGER$ ($9,007,199,254,740,091 \approx 9 \times 10^{15}$). The defensive overflow guards on L373, L400, L423, L453, and L475 are mathematically unreachable under valid Rule Pack configurations.
     - **Single Scenario Calculation (`scenario-calc.ts`):** Accepts non-negative integer units and safe-integer list prices. Total revenue is calculated as $revenue = units \times listPriceMinor$.
       - _Exact-Boundary Acceptance:_ The engine explicitly accepts exact safe-integer boundaries. At $listPriceMinor = 1\text{¢}$ and $units = 9,007,199,254,740,091$, $revenue = 9,007,199,254,740,091 = MAX\_SAFE\_INTEGER$. Test 34 in `scenario-calc.test.ts` executes this exact boundary without error, successfully killing mutant `1221` (`>= MAX_SAFE_INTEGER`).
       - _Overflow Rejection:_ Any input where $units \times listPriceMinor > MAX\_SAFE\_INTEGER$ is strictly rejected with `CalcOverflowError` at the revenue boundary (L188). For example, at a minimum price of $99\text{¢}$, any unit count exceeding $\lfloor MAX\_SAFE\_INTEGER / 99 \rfloor = 90,981,810,653,940$ immediately throws `CalcOverflowError`.
       - _Near-Boundary Coverage:_ Checkpoint CHK-014 validates near-boundary scenario arithmetic ($4,503,599,627,370$ units at €20.00 yielding revenue $9,007,199,254,740,000$, exactly 91 below $MAX\_SAFE\_INTEGER$), proving precision is preserved near the boundary.
       - _Unreachability of Downstream Intermediates:_ Because revenue is verified $\le MAX\_SAFE\_INTEGER$ upfront, aggregate royalties (at most 100% of revenue) and aggregate costs cannot exceed $MAX\_SAFE\_INTEGER$. Since $grossRoyalty \ge 0$ and $totalCost \le MAX\_SAFE\_INTEGER$, net contribution $netContribution = grossRoyalty - totalCost \ge -MAX\_SAFE\_INTEGER = MIN\_SAFE\_INTEGER$. Thus, downstream overflow checks on aggregate net contribution (L324–L325, L431–L432) are mathematically unreachable.
     - **Triad Scenario Calculation (`scenario-calc.ts`):** Evaluates three scenarios (`low`, `base`, `high`), each validated through `calculateSingleScenario` and subject to single-scenario overflow rejection. All ordering checks operate on validated safe-integer quantities.
     - **Break-Even Calculation (`break-even-calc.ts`):** Accepts safe-integer fixed costs $\ge 0$. When per-unit contribution is positive ($netContribution > 0$), break-even units is $\lceil fixedCost / netContribution \rceil$. Reaching $breakEvenUnits \approx MAX\_SAFE\_INTEGER$ requires fixed cost near $MAX\_SAFE\_INTEGER$ with unit contribution $1\text{¢}$. However, calculating break-even revenue ($breakEvenUnits \times listPriceMinor$) on L421 would immediately overflow safe-integer bounds because $listPriceMinor \ge 99\text{¢}$ (or $\ge 1\text{¢}$). Negative underflow guards ($< MIN\_SAFE\_INTEGER$ on L407, L422) are mathematically unreachable because fixed cost $\ge 0$ and unit contribution $> 0$ strictly yield non-negative quotients.
     - **Sensitivity Calculation (`sensitivity-calc.ts`):** Evaluates single-parameter perturbations around a valid baseline scenario. Baseline scenario revenue is strictly bounded $\le MAX\_SAFE\_INTEGER$. Mutant `1740` guards against upper units exceeding $MAX\_SAFE\_INTEGER$ ($upperUnits = baseline.units + \Delta U > MAX\_SAFE\_INTEGER$). Any unit count approaching $MAX\_SAFE\_INTEGER$ cannot complete `calculateSensitivity` under valid Rule Packs because $minListPriceMinor \ge 99\text{¢}$, causing the perturbed single scenario to overflow scenario revenue ($units \times 99\text{¢} > MAX\_SAFE\_INTEGER$) and throw `CalcOverflowError`. For price perturbation (L319), list price is bounded by Rule Pack limits ($100,000\text{¢}$), making $MAX\_SAFE\_INTEGER$ unreachable.
   - **Negative Underflow Invariance Across All Modules (`MIN_SAFE_INTEGER = -9,007,199,254,740,091`):** Quantities in the engine (retail price, units, costs, gross royalties, revenues) are strictly non-negative ($\ge 0$). Products and rounded sums of non-negative integers are strictly $\ge 0$. Net contributions ($royalty - cost$) are bounded below by $-cost \ge -MAX\_SAFE\_INTEGER = MIN\_SAFE\_INTEGER$. Therefore, negative overflow ($< MIN\_SAFE\_INTEGER$) is mathematically impossible across all calculation paths (`scenario-calc.ts` L189, L295, L304, L325, L371, L388, L410, L432; `break-even-calc.ts` L229, L246, L262, L407, L422; `per-unit-calc.ts` L374, L454, L475).

4. **Category 4: Trace or Metadata-Only Behavior (31 mutants):**

   - Mutants modifying non-functional trace step strings, note texts, illustrative disclaimer texts (`SCENARIO_DISCLAIMER_TEXT`), unrounded rational decimal strings in trace entries, and intermediate trace recording objects that do not affect financial calculation outputs.

5. **Category 5: Validation or Defensive-Boundary Behavior (316 mutants):**

   - Mutants altering validation error codes (`INVALID_INPUT`, `MISSING_REQUIRED_INPUT`, `UNITS_OUT_OF_BOUNDS`, `PRICE_OUT_OF_BOUNDS`, `CURRENCY_MISMATCH`, `FORMAT_MISMATCH`), human-readable error template literals, defensive type checks (`typeof input !== 'object'`), and redundant multi-layer validation checks (e.g. outer functions validating inputs that are subsequently re-validated by delegated downstream functions).

6. **Category 6: Potentially Meaningful Financial or Public-Result Behavior (0 mutants):**
   - Exactly **0** surviving mutants alter financial calculation logic, monetary values, units, or public calculation outputs. Every financial calculation is governed by exact rational arithmetic (`Rational`), and all arithmetic operators, rounding modes, tie comparisons, and royalty bracket lookups were 100% killed by the test suite.

#### Policy Alignment

The target score policy remains **OPEN** (`thresholds.break: null`) per `docs/architecture/12-testing-and-ai-evaluation.md` §3.10. No artificial score threshold is imposed.

---

## F. File Inventory & Line Counts

| Path                                                              | Purpose                                                        | Lines |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ----- |
| `tests/differential/reference-oracle/ref-rational.ts`             | Independent BigInt rational arithmetic & rounding              | ~200  |
| `tests/differential/reference-oracle/ref-oracle.ts`               | Independent financial calculation reference oracle             | ~420  |
| `tests/differential/reference-oracle/index.ts`                    | Reference oracle barrel export                                 | ~25   |
| `tests/differential/ref-rational.test.ts`                         | Independent unit tests for RefRational rounding modes and ties | ~130  |
| `fixtures/calc-engine/reference-checkpoints.json`                 | 14 hand-derived reference checkpoints with derivations         | ~460  |
| `tests/differential/checkpoints.test.ts`                          | Verification suite for hand-derived checkpoints                | ~210  |
| `tests/differential/differential.test.ts`                         | 1,024 vector deterministic differential test suite             | ~550  |
| `vitest.calc-engine.config.ts`                                    | Focused Vitest runner configuration for mutation testing       | ~25   |
| `stryker.calc-engine.config.mjs`                                  | StrykerJS mutation testing configuration                       | ~50   |
| `reports/mutation/survivor-inventory.md`                          | Itemized auditable inventory of all 443 surviving mutants      | ~490  |
| `.github/workflows/ci.yml`                                        | GitHub Actions CI with determinism compatibility matrix        | ~75   |
| `prompts/step-09.md`                                              | Canonical Prompt Archive for STEP-009                          | ~350  |
| `learning/implementation/step-09-differential-reference-check.md` | Implementation record                                          | ~400  |
| `learning/interviews/step-09-differential-reference-check.md`     | Senior technical interview preparation document                | ~260  |
| `learning/notes/step-09-differential-reference-check.md`          | Concise engineering reference notes                            | ~190  |
| `docs/architecture/12-testing-and-ai-evaluation.md`               | Testing architecture documentation updated with tools/commands | ~450  |
| `docs/DESIGN.md`                                                  | Living design document updated with STEP-009 records           | ~1200 |

---

## G. Verification Results

All required verification suites executed cleanly:

1. `pnpm test:differential`:
   - 3 test files passed (`ref-rational.test.ts`, `checkpoints.test.ts`, `differential.test.ts`).
   - 39 test cases passed (including 1,024 generated vectors across 32 configurations, 14 reference checkpoints, and edge-case suites).
   - 0 failures, 0 drift.
2. `pnpm test:coverage`:
   - Differential tests automatically included.
   - `packages/calc-engine`: **100% Statements, 100% Branches, 100% Functions, 100% Lines**.
   - Monorepo: **694/694 tests passed across 45 test files**.
3. `pnpm typecheck`: Clean (0 errors across all workspaces).
4. `pnpm lint`: Clean (0 lint warnings or errors).
5. `pnpm format:check`: Clean (Prettier code style verified).
6. `pnpm arch:check`: Clean (`docs:check` + `boundaries:check`).
7. `git diff --check`: Clean (no trailing whitespace or conflict markers).

---

## H. Git Discipline & Scope Boundary

All newly created and modified files remain strictly uncommitted in the local working tree. No files have been staged (`git add`), committed (`git commit`), stashed, reset, or pushed to remote. STEP-010 remains strictly unauthorized.
