# Engineering Notes — STEP-009: Differential Reference Check & Mutation Testing

- **Author:** Nimphy Engineering Agent
- **Date:** 2026-11-19
- **Milestone:** STEP-009 (Independent Differential Reference Check & Mutation Testing)
- **Status:** Implementation complete; verification results recorded; awaiting formal repository-owner acceptance

---

## 1. Architectural Scope & Core Invariants

STEP-009 delivers the independent differential reference-testing harness and reproducible mutation-testing configuration for `@nimphy/calc-engine` (Module M-02) per `docs/architecture/17-implementation-roadmap.md`, `docs/architecture/12-testing-and-ai-evaluation.md`, and `AGENTS.md`.

### Delivered Capabilities

1. **Independent Reference Implementation:**

   - Test-only location: `tests/differential/reference-oracle/`.
   - Native `BigInt` exact rational arithmetic class `RefRational` with irreducible Euclidean canonical reduction ($\gcd$).
   - Completely independent calculation engine `RefOracle` with zero imports or calls to `@nimphy/calc-engine`.
   - Independent implementation of all 4 rounding modes: `round_half_up` (nearest integer, exact ties away from zero), `round_half_even` (Banker's rounding to nearest even integer), `round_down` (truncation toward zero), `round_up` (away from zero).
   - Independent implementation of both aggregation points: `per_unit`, `per_total`.
   - Full calculation parity across per-unit economics, scenario totals, triad scenarios, break-even, and sensitivity analysis.

2. **Deterministic Differential Test Suite:**

   - File: `tests/differential/differential.test.ts`.
   - Seeded Mulberry32 PRNG (seed `0x57e9009` / `92180489`).
   - Evaluates all 4 synthetic `TEST_*` Rule Packs (`TEST_EBOOK_STANDARD@1.0.0`, `TEST_PAPERBACK_US@1.0.0`, `TEST_PAPERBACK_US@2.0.0`, `TEST_HARDCOVER_GLOBAL@1.0.0`).
   - Covers all 32 configuration permutations ($4 \text{ Rule Packs} \times 4 \text{ Rounding Modes} \times 2 \text{ Aggregation Points}$).
   - Generates 1,024 reproducible input vectors (32 per configuration).
   - Validates explicit edge-case matrix (zero/one units, boundaries, exact zero, positive and negative contribution, safe-integer boundaries near `Number.MAX_SAFE_INTEGER`, sensitivity ranking ties, perturbation boundaries reaching limits, non-monotonic triad inputs).
   - Verifies **zero financial drift** against `@nimphy/calc-engine` across all overlapping financial outputs.

3. **Independently Hand-Calculated Checkpoints:**

   - File: `fixtures/calc-engine/reference-checkpoints.json`.
   - 14 comprehensive hand-derived reference checkpoints with complete documented intermediate fractions and derivations.
   - Tested against both oracle and production engine in `tests/differential/checkpoints.test.ts`.

4. **Reproducible Mutation Testing Setup:**
   - Packages: `@stryker-mutator/core@10.1.1`, `@stryker-mutator/vitest-runner@10.1.1`.
   - Config: `stryker.calc-engine.config.mjs`, runner `vitest.calc-engine.config.ts`.
   - Targets all 5 calculation source files in `packages/calc-engine/src`.
   - Dedicated script: `pnpm test:mutation:calc-engine`.
   - Target score policy: Preserved as **OPEN** (`thresholds.break: null`) per `docs/architecture/12-testing-and-ai-evaluation.md` §3.10.

### Excluded Capabilities (Strict Boundaries)

- Modifying production calculation formulas or relaxing contracts.
- Exporting reference oracle classes from production package barrels.
- Persisting test runs to database or creating tables (deferred to STEP-010/011).
- Frontend visualizers or AI prompt integration (deferred to STEP-014/015).

---

## 2. Configuration & Vector Generation Matrix

### Configuration Dimensions ($4 \times 4 \times 2 = 32$)

| Dimension              | Values                                                                                                           | Count |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----- |
| **Rule Packs**         | `TEST_EBOOK_STANDARD@1.0.0`, `TEST_PAPERBACK_US@1.0.0`, `TEST_PAPERBACK_US@2.0.0`, `TEST_HARDCOVER_GLOBAL@1.0.0` | 4     |
| **Rounding Modes**     | `round_half_up`, `round_half_even`, `round_down`, `round_up`                                                     | 4     |
| **Aggregation Points** | `per_unit`, `per_total`                                                                                          | 2     |

### Generated Input Vector Distribution

- 32 randomly generated vectors per configuration $\times$ 32 configurations = **1,024 vectors**.
- Every vector evaluates:
  1. `calculatePerUnitEconomics` vs `refCalculatePerUnit` (exact & rounded gross royalty, cost, net contribution)
  2. `calculateSingleScenario` vs `refCalculateSingleScenario` (revenue, royalty, cost, contribution, exact totals)
  3. `calculateBreakEven` vs `refCalculateBreakEven` (reachability, exact & rounded unit contribution, units, revenue, reason)
  4. `calculateSensitivity` vs `refCalculateSensitivity` (baseline revenue/contrib, lower/upper revenue/contrib, deltas, impact scores, rank)
  5. `calculateTriadScenarios` vs `refCalculateTriadScenarios` (low/base/high revenue, royalty, cost, contribution, exact totals, monotonic ordering flags & details)
- Total differential operations executed: 1,024 vectors $\times$ 5 operations = **5,120 operations**.
- Financial discrepancy count: **0 (Zero drift)**.

---

## 3. Reference Checkpoint Catalog (`reference-checkpoints.json`)

| Checkpoint ID                                | Category    | Key Verification Scenario                                                                                                                                        |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkpoint_tie_round_half_up`               | Per-Unit    | Exact half-cent tie ($3.05 @ 70% = 213.5¢) rounding away from zero to 214¢ under `round_half_up`                                                                 |
| `checkpoint_tie_round_half_even_to_even`     | Per-Unit    | Exact half-cent tie ($3.15 @ 70% = 220.5¢) rounding to nearest even integer (220¢) under `round_half_even`                                                       |
| `checkpoint_tie_round_half_even_to_odd_up`   | Per-Unit    | Exact half-cent tie ($3.05 @ 70% = 213.5¢) rounding up to adjacent even integer (214¢) under `round_half_even`                                                   |
| `checkpoint_tie_round_down`                  | Per-Unit    | Truncation toward zero under `round_down` (220.5¢ -> 220¢ royalty, 7.5¢ -> 7¢ delivery)                                                                          |
| `checkpoint_tie_round_up`                    | Per-Unit    | Rounding away from zero under `round_up` (220.5¢ -> 221¢ royalty, 7.5¢ -> 8¢ delivery)                                                                           |
| `checkpoint_scenario_per_total`              | Scenario    | Multi-unit aggregation under `per_total` with cost variance (7 units hardcover €20.00, +10% cost variance, exact fractions preserved)                            |
| `checkpoint_break_even_exact_integer`        | Break-Even  | Reachable break-even with exact integer division (fixed cost $648.00 / unit contrib 648¢ = 100 units exact, remainder 0)                                         |
| `checkpoint_break_even_ceiling_remainder`    | Break-Even  | Reachable break-even requiring integer ceiling (fixed cost $650.00 / unit contrib 648¢ = 100 units with remainder 200¢ -> 101 units)                             |
| `checkpoint_break_even_unreachable_negative` | Break-Even  | Unreachable break-even due to negative unit contribution ($5.00 paperback, 300 pages -> royalty 300¢ - print cost 652¢ = -352¢; `NEGATIVE_CONTRIBUTION`)         |
| `checkpoint_sensitivity_multidriver_ranking` | Sensitivity | Multi-driver sensitivity with distinct impact scores and revenue/contribution tracking ($9.99 baseline; listPrice 314k, units 68.4k, costVariance 8k)            |
| `checkpoint_break_even_zero_contribution`    | Break-Even  | Unreachable break-even due to exactly zero unit contribution ($5.00 paperback, 124 pages -> royalty 300¢ - print cost 300¢ = 0¢; `ZERO_CONTRIBUTION`)            |
| `checkpoint_sensitivity_ranking_tie`         | Sensitivity | 3-way exact impact tie (60,000¢) with deterministic UTF-16 code-point tie-breaking (`costVariancePercent` < `listPriceMinor` < `units`)                          |
| `checkpoint_triad_scenarios_ordering`        | Triad       | Triad scenario calculation (low 100u, base 200u, high 500u) with exact totals and monotonic input/totals ordering validation                                     |
| `checkpoint_scenario_safe_integer_boundary`  | Scenario    | High-volume scenario (4,503,599,627,370 units @ €20.00 -> revenue 9,007,199,254,740,000 cents near `Number.MAX_SAFE_INTEGER`) without precision loss or overflow |

---

## 4. Mutation Testing Details

- **Tool:** StrykerJS 10.1.1 with `@stryker-mutator/vitest-runner`.
- **Target Files (5 Core Calculation Sources):**
  - `packages/calc-engine/src/math/rational.ts`
  - `packages/calc-engine/src/per-unit/per-unit-calc.ts`
  - `packages/calc-engine/src/scenarios/scenario-calc.ts`
  - `packages/calc-engine/src/break-even/break-even-calc.ts`
  - `packages/calc-engine/src/sensitivity/sensitivity-calc.ts`
- **Included Test Suites:**
  - `packages/calc-engine/src/**/*.test.ts` (unit, boundary, error, golden)
  - `tests/differential/**/*.test.ts` (14 reference checkpoints + differential vectors: 1,024 vectors in normal runs, 32 vectors in focused Stryker runs)
- **Excluded Test Suites:**
  - `packages/calc-engine/src/**/properties.test.ts` (excluded from mutation runner to prevent multi-iteration generative loop timeouts; retained in standard CI / `pnpm test`).
- **Mutation Inclusions:**
  - Broad `StringLiteral` and `BlockStatement` exclusions removed; all standard AST mutation classes enabled.
- **Executed Mutation Baseline Metrics (Authoritative Stryker JSON):**
  - 1,728 raw generated mutants evaluated in 114m 54s (reported) with zero compilation or runtime errors.
  - 1 ignored static mutant in `per-unit-calc.ts` L28:43 (`ENGINE_VERSION = '0.1.0'`) per `ignoreStatic: true`.
  - 1,727 score-eligible mutants: 1,204 killed, 72 timed out, 443 survived, 8 no coverage.
  - Overall mutation score: **73.89%** ($1,276 / 1,727$). Covered score: **74.23%** ($1,276 / 1,719$).
  - Historical baseline distinction: 73.89% reflects the test suite prior to regression tests; archived baseline is preserved without rewriting.
  - Per-file breakdown:
    - `math/rational.ts`: 91.67% score (312 generated, 242 killed, 44 timeout, 26 survived)
    - `per-unit/per-unit-calc.ts`: 75.18% score (420 generated, 1 ignored static, 419 score-eligible, 291 killed, 24 timeout, 104 survived)
    - `sensitivity/sensitivity-calc.ts`: 74.31% score (288 generated, 214 killed, 0 timeout, 72 survived, 2 no coverage)
    - `scenarios/scenario-calc.ts`: 69.71% score (449 generated, 309 killed, 4 timeout, 132 survived, 4 no coverage)
    - `break-even/break-even-calc.ts`: 57.14% score (259 generated, 148 killed, 0 timeout, 109 survived, 2 no coverage)
- **Timeout Analysis (72 Mutants):**
  - 44 in `rational.ts`: intentional infinite loops in GCD, factorization, and long division.
  - 24 in `per-unit-calc.ts`: test runner duration timeouts under heavy test volume (>250 tests covering core input validation).
  - 4 in `scenario-calc.ts`: intentional recursion mutations in `deepFreeze`.
- **Surviving Mutant Classifications (443 Total Reconciled in Untracked, Non-Ignored Working-Tree Inventory `learning/notes/step-09-survivor-inventory.md` and mirrored in `reports/mutation/survivor-inventory.md`):**
  - Category 1 (Genuine assertion gaps): 17 mutants (11 triad scenario ordering [1383, 1385, 1386, 1389, 1394, 1395, 1398, 1418, 1426, 1427, 1430], 2 sensitivity single-driver tie-breaking [1815, 1817], 4 rational equality [411, 413, 414, 416]). All 17 remain recorded as `Survived` in historical `mutation.json` baseline and were confirmed eliminated via post-baseline regression verification (not a new Stryker run); archived baseline metrics (73.89%) strictly predate additions and are preserved without modification.
  - Category 2 (Behaviorally equivalent mutations): 12 mutants (7 rational identities, 1 duplicate-free driver sorting invariant, 4 zero-variance fast path bypasses producing identical results).
  - Category 3 (Unreachable under accepted input contract): 67 mutants (defensive MAX_SAFE_INTEGER and MIN_SAFE_INTEGER guards mathematically unreachable under input contracts and Rule Pack limits; no universal 1e9 bound; module reachable ranges derived individually for per-unit, single scenario, triad scenarios, break-even, and sensitivity; exact boundary accepted at `listPriceMinor = 1` and `units = MAX_SAFE_INTEGER` in test 34; overflow rejected via `CalcOverflowError`; near-boundary covered in CHK-014 / CP-013; negative underflow impossible on non-negative amounts).
  - Category 4 (Trace/metadata behavior): 31 mutants (trace step keys, notes, disclaimer strings, trace details objects).
  - Category 5 (Validation/defensive boundaries): 316 mutants (error codes, messages, defensive typeof guards, redundant delegated validation).
  - Category 6 (Potentially meaningful financial or public-result behavior): 0 mutants (zero surviving mutants alter financial calculation logic or public outputs).
  - Category Sum: $17 + 12 + 67 + 31 + 316 + 0 = 443$.
- **Configuration & Incremental Setup:**
  - Completed baseline historically executed with `incremental: false`.
  - For future runs, `stryker.calc-engine.config.mjs` has been updated with `incremental: true` and `incrementalFile: 'reports/stryker-step-09-completion.json'`.
- **Target Score Policy:** Preserved as **OPEN** (`thresholds.break: null`) per `docs/architecture/12-testing-and-ai-evaluation.md` §3.10.

---

## 5. Execution Commands

```bash
# Run differential test suite
pnpm test:differential

# Run full monorepo test suite with coverage
pnpm test:coverage

# Run mutation testing on calc-engine
pnpm test:mutation:calc-engine
```
