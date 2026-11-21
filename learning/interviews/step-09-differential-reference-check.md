# Technical Interview Preparation — STEP-009: Differential Reference Check & Mutation Testing

This document provides senior-level engineering, mathematical, and financial explanations of the architecture, algorithmic design, and verification principles implemented in Nimphy STEP-009.

---

## 1. The Oracle Problem & Independent Differential Testing

### Q: Why is an independent differential reference oracle necessary when the production engine already achieved 100% branch and statement coverage in STEPs 005–008?

**A:** High code coverage (even 100% statement, branch, function, and line coverage) only proves that every line of code was executed and that no unhandled exceptions were thrown. It does **not** prove that the calculation logic is mathematically correct.

This is known in software engineering as **The Oracle Problem**:

1. **Shared Misconceptions:** When the same developer or agent writes both the production code and the unit tests, shared cognitive biases or misreadings of the specification are replicated in both places. If a developer incorrectly interprets a rule (e.g. assuming half-cents always round down), they will write production code that rounds down and a unit test asserting that it rounds down. The test passes with 100% coverage, yet the financial calculation is wrong.
2. **Coupled Implementation Details:** Unit tests often assert intermediate states, helper methods, or data representations that mirror internal implementation choices rather than black-box mathematical specifications.
3. **Sparse Input Sampling:** Unit and golden tests evaluate discrete, hand-selected points (e.g., 20 or 30 cases). They can easily miss subtle boundary discontinuities, rounding flips, or threshold edges that occur between the tested points.

**How Differential Testing Solves This:**

- **Strict Independence:** The reference oracle is implemented independently from first mathematical principles using `BigInt` fractions without sharing any production modules, classes, or helpers.
- **High-Density Random Sampling:** By running 1,024 deterministically generated vectors across all 32 configuration permutations, differential testing explores the multidimensional input space far more densely than humanly possible.
- **Cross-Verification:** If two independently derived implementations, using different internal representations and algorithms, agree down to the exact minor currency unit on thousands of random vectors, the probability of an undetected calculation bug approaches zero.

---

## 2. Exact BigInt Rational Arithmetic vs. IEEE 754 Floating-Point

### Q: Why is IEEE 754 floating-point arithmetic strictly forbidden in financial calculation engines, and how does `RefRational` ensure exact results?

**A:** Binary floating-point representation (IEEE 754 `number` in JavaScript/TypeScript) represents numbers as $s \times m \times 2^e$. Fractions whose denominators have prime factors other than 2 (such as tenths, hundredths, or thirds) cannot be represented finitely in binary.

**Consequences of Floating-Point in Finance:**

1. **Representation Drift:** In JavaScript:
   ```javascript
   0.1 + 0.2 === 0.30000000000000004; // true!
   ```
2. **Catastrophic Rounding Flips:** At a rounding threshold (e.g., \$0.005), floating-point imprecision can perturb a value slightly above or below the threshold:
   - If \$0.005 is represented internally as `0.004999999999999999`, a half-up rounding rule will round **down** to \$0.00 instead of up to \$0.01.
   - When multiplied by 100,000 units in publishing runs, these single-cent discrepancies scale into hundreds of dollars of variance in royalties and net payouts.
3. **Non-Associativity:** $(a + b) + c \ne a + (b + c)$ in floating point. Aggregation order changes the financial total.

**How `RefRational` Ensures Exact Results:**

- Represents every number as an exact irreducible fraction:
  $$\frac{n}{d}, \quad n, d \in \mathbb{Z}, \quad d > 0, \quad \gcd(|n|, d) = 1$$
- Uses native arbitrary-precision `BigInt` for both numerator $n$ and denominator $d$.
- String parsing: The decimal string `"19.99"` is parsed directly into:
  $$\frac{1999}{100}$$
  with zero floating-point conversions.
- Rational operations preserve exact values without any loss of precision:
  $$\frac{n_1}{d_1} + \frac{n_2}{d_2} = \frac{n_1 d_2 + n_2 d_1}{d_1 d_2}$$
  $$\frac{n_1}{d_1} \times \frac{n_2}{d_2} = \frac{n_1 n_2}{d_1 d_2}$$
- Fractions are reduced after every operation using the iterative Euclidean algorithm for greatest common divisor ($\gcd$). Rounding occurs only once at the final conversion boundary to integer minor units.

---

## 3. Mathematical Foundations of Rounding Modes

### Q: Explain the four supported rounding modes from first principles. How do `round_half_up` and `round_half_even` differ on exact half-unit ties?

**A:** Let $x = n / d$ be an exact rational number ($n \in \mathbb{Z}, d \in \mathbb{Z}_{>0}$), where $q = \text{trunc}(n / d)$ is the integer quotient obtained via integer division (truncating toward zero, matching native `BigInt` `n / d`) and $r = n \pmod d$ is the remainder (where $n = q \times d + r$ and $|r| < d$). The exact value is $q + r/d$.

1. **`round_down` (Truncation toward zero):**

   - Truncates all fractional parts toward zero for both positive and negative values.
   - $\text{round}(x) = q$.
   - Direction: Strictly toward zero.
   - Examples:
     - Positive: $+2.1 \to +2$, $+2.5 \to +2$, $+2.7 \to +2$.
     - Negative: $-2.1 \to -2$, $-2.5 \to -2$, $-2.7 \to -2$.
   - Note: Unlike mathematical floor ($\lfloor x \rfloor$) which rounds negative numbers toward $-\infty$ (e.g. $\lfloor -2.1 \rfloor = -3$), `round_down` in financial systems and Nimphy truncates toward zero ($-2.1 \to -2$), matching integer truncation.

2. **`round_up` (Away from zero):**

   - If any non-zero fractional remainder exists ($r \ne 0$), rounds away from zero.
   - $\text{round}(x) = r === 0 ? q : (n > 0 ? q + 1 : q - 1)$.
   - Direction: Strictly away from zero.
   - Examples:
     - Positive: $+2.1 \to +3$, $+2.5 \to +3$, $+2.7 \to +3$.
     - Negative: $-2.1 \to -3$, $-2.5 \to -3$, $-2.7 \to -3$.
   - Note: Unlike mathematical ceiling ($\lceil x \rceil$) which rounds negative numbers toward $+\infty$ (e.g. $\lceil -2.7 \rceil = -2$), `round_up` rounds magnitude away from zero ($-2.7 \to -3$).

3. **`round_half_up` (Commercial / Arithmetic Rounding: Nearest integer, exact ties away from zero):**

   - Rounds to the nearest integer. When the distance to adjacent integers is unequal, rounds to the closer integer ($2|r| < d \to q$, $2|r| > d \to (n > 0 ? q + 1 : q - 1)$).
   - Exact half-unit tie condition ($2|r| = d$): Always rounds away from zero.
   - Direction on tie: Away from zero ($+2.5 \to +3$, $-2.5 \to -3$).
   - Examples:
     - Positive: $+2.49 \to +2$, $+2.5 \to +3$, $+2.51 \to +3$, $+3.5 \to +4$.
     - Negative: $-2.49 \to -2$, $-2.5 \to -3$, $-2.51 \to -3$, $-3.5 \to -4$.
   - **Financial Property:** Over large populations of calculations, `round_half_up` exhibits a systematic magnitude bias on ties away from zero.

4. **`round_half_even` (Banker's Rounding / IEEE 754 Default: Nearest integer, exact ties to nearest even integer):**
   - Rounds to the nearest integer when $2|r| \ne d$.
   - Exact half-unit tie condition ($2|r| = d$):
     - If $|q|$ is **even** ($q \equiv 0 \pmod 2$), rounds to $q$.
     - If $|q|$ is **odd** ($q \equiv 1 \pmod 2$), rounds away from zero to the adjacent even integer ($n > 0 ? q + 1 : q - 1$).
   - Direction on tie: To the nearest even integer.
   - Examples:
     - Positive:
       - $+2.5 \to +2$ (2 is even).
       - $+3.5 \to +4$ (3 is odd $\to 4$ is even).
       - $+4.5 \to +4$ (4 is even).
       - $+5.5 \to +6$ (5 is odd $\to 6$ is even).
     - Negative:
       - $-2.5 \to -2$ (-2 is even).
       - $-3.5 \to -4$ (-3 is odd $\to -4$ is even).
       - $-4.5 \to -4$ (-4 is even).
       - $-5.5 \to -6$ (-5 is odd $\to -6$ is even).
   - **Financial Property:** Eliminates statistical bias across large transaction volumes, as ties round up and down with equal probability under typical uniform decimal distributions.

---

## 4. Aggregation Points: `per_unit` vs. `per_total`

### Q: What is the architectural and financial distinction between `per_unit` and `per_total` aggregation points? Why does `per_total` sometimes emit `null` for unit applicable cost?

**A:** In publishing platforms (e.g., Amazon KDP, IngramSpark), royalty and cost formulas are applied either at the single-copy level or at the aggregated batch/print-run level:

1. **`per_unit` Aggregation:**

   - Every per-unit cost component (print cost, delivery fee, gross royalty) is rounded to an integer minor currency unit (cents) **first**.
   - Total scenario amounts are the exact scalar product of volume and the rounded per-unit figure:
     $$\text{Total} = \text{units} \times \text{round}(\text{rate}_{\text{unit}})$$
   - _Advantage:_ Absolute line-item additivity on an invoice: $\text{Total} = Q \times P_{\text{unit}}$ exactly in integer cents.
   - _Disadvantage:_ Rounding error per unit is multiplied by $Q$. A half-cent rounding error on 100,000 units becomes \$500.00.

2. **`per_total` Aggregation:**
   - Unit rates are kept as exact unrounded fractions.
   - The total aggregate amount is computed across the full volume $Q$ first, and only the final aggregate total is rounded to integer minor units:
     $$\text{Total} = \text{round}(Q \times \text{rate}_{\text{unit}})$$
   - _Advantage:_ Minimal rounding distortion. Fractional cents (e.g. 7.5¢ delivery fee on 10 units = 75¢ exact) are preserved accurately.
   - _The `applicableCost: null` Contract:_
     When cost is evaluated per total, the per-unit cost may be a fractional cent (e.g. \$0.075). In Nimphy, domain `Money` is strictly an integer minor unit (cents). Emitting an integer `Money` object for a fractional unit cost would falsify the contract. Therefore:
     - If the exact per-unit cost evaluates to an exact integer number of cents (e.g., \$0.15), it is emitted as `Money.of(15, USD)`.
     - If the per-unit cost contains fractional cents (e.g., 7.5¢), the per-unit field returns `null`, while the scenario total reports the exact aggregate integer cents.

---

## 5. Mutation Testing & Test Suite Quality

### Q: What is mutation testing, and why is it superior to code coverage metrics for assessing test suite strength?

**A:** Code coverage is a measure of code execution, not assertion effectiveness. A test suite can achieve 100% branch and line coverage with zero assertions (`expect(...)`), simply by calling every function.

**Mutation Testing Mechanics (StrykerJS):**

1. Stryker parses the source code into an Abstract Syntax Tree (AST).
2. It introduces deliberate syntactical faults (mutants), such as:
   - Arithmetic operator replacement: `+` $\to$ `-`
   - Comparison operator replacement: `<` $\to$ `<=`
   - Equality replacement: `===` $\to$ `!==`
   - Boolean literal flipping: `true` $\to$ `false`
   - Conditional expression mutation: `if (x > 0)` $\to$ `if (true)`
   - Return value mutation: `return x` $\to$ `return undefined`
3. For each mutant, Stryker runs the test suite:
   - **Killed:** If at least one test fails, the mutant is "killed" (the test suite detected the fault).
   - **Survived:** If all tests pass, the mutant "survived" (exposing an assertion blind spot in the tests).
   - **Timed Out:** If the mutant causes an infinite loop.

**Why Mutation Testing is Essential in Financial Engines:**
In financial algorithms, subtle off-by-one errors (such as `<` vs `<=`) or missing boundary assertions can lead to incorrect royalty tier assignments or failure to ceil break-even units. Mutation testing verifies that every mathematical operator and boundary condition in `@nimphy/calc-engine` is actively guarded by a failing test if altered.

---

## 6. Seeded Pseudo-Random Generators (Mulberry32) vs. `Math.random()`

### Q: Why is `Math.random()` forbidden in differential and property testing suites, and how does Mulberry32 ensure deterministic verification?

**A:**

1. **Flakiness & Non-Reproducibility:** If a differential test suite uses unseeded `Math.random()`, a failure that occurs on iteration #847 cannot be reproduced on a developer's machine or in CI. A bug found in a pull request run will vanish upon rerun, creating an untracked, unreproducible defect.
2. **Platform & V8 Engine Drift:** `Math.random()` implementation details and seeds differ across operating systems (Windows vs Linux) and Node.js engine releases.
3. **Auditability (P-03):** To certify a financial engine for regulatory or underwriting use, all verification runs must be 100% deterministic and reproducible on any machine at any point in time.

**Mulberry32 PRNG:**

- A simple, high-quality 32-bit generator with a state space of $2^{32}$.
- State update:
  $$s = (s + \text{0x6D2B79F5}) \pmod{2^{32}}$$
- Non-linear mixing:
  $$t = \text{Math.imul}(s \oplus (s \gg 15), 1 \mid s)$$
  $$t = (t + \text{Math.imul}(t \oplus (t \gg 7), 61 \mid t)) \oplus t$$
  $$\text{output} = ((t \oplus (t \gg 14)) \gg 0) / 4294967296$$
- Given the fixed seed `0x57e9009`, Mulberry32 generates the exact same sequence of pseudo-random numbers on every operating system, architecture, and Node.js version, ensuring complete reproducibility across all 1,024 test vectors.

---

## 7. Dual Differential Execution Modes

### Q: Why does `tests/differential/differential.test.ts` implement two execution modes, and what are the guarantees of each?

**A:**
Differential reference testing provides end-to-end mathematical verification by comparing the production engine against an independent `BigInt` rational oracle. However, running 1,024 vectors across 5 operations (5,120 full calculation comparisons) during mutation testing would result in multi-minute execution times per mutant, multiplying total mutation run times into tens of hours.

**The Two Execution Modes:**

1. **Normal Execution Mode (Default, CI, `pnpm test`, `pnpm test:differential`):**
   - Vector Count: **1,024 vectors** (32 vectors per configuration $\times$ 32 configuration permutations).
   - Calculation Comparisons: **5,120 comparisons** across per-unit economics, scenario totals, break-even, sensitivity analysis, and triad scenarios.
   - Hand-Derived Checkpoints: All 14 hand-derived checkpoints in `fixtures/calc-engine/reference-checkpoints.json`.
   - Purpose: Exhaustive mathematical verification and zero-drift proof across high-density random inputs.
2. **Focused Mutation Runner Mode (`process.env.STRYKER_RUN === 'true'`):**
   - Vector Count: **32 vectors** (1 vector per configuration across all 32 Rule Pack, rounding mode, and aggregation point permutations).
   - Calculation Comparisons: **160 comparisons** across all 5 calculation operations.
   - Hand-Derived Checkpoints: All 14 hand-derived checkpoints remain fully active.
   - Purpose: Fast per-mutant execution within the 4,000 ms Stryker worker timeout without sacrificing permutation coverage.

Both modes cover all 32 configuration dimensions (4 Rule Packs $\times$ 4 rounding modes $\times$ 2 aggregation points) and all 14 hand-derived checkpoints, guaranteeing that every mutation testing run evaluates every configuration permutation while preventing worker IPC timeouts.

---

## 8. Mutation Metrics & Survivor Audit

### Q: What were the authoritative Stryker mutation metrics in STEP-009, and how were surviving mutants audited?

**A:**
The authoritative mutation baseline recorded in `reports/mutation/mutation.json` yielded:

- **Generated Mutants:** 1,728 raw mutants.
- **Ignored Static Mutants:** 1 mutant (`ENGINE_VERSION = '0.1.0'` in `per-unit-calc.ts`) ignored per `ignoreStatic: true`.
- **Score-Eligible Mutants:** 1,727 mutants.
- **Killed:** 1,204 mutants.
- **Timed Out:** 72 mutants (infinite loops in GCD/factorization/long division alongside worker duration timeouts on fundamental entrypoint guards covered by >250 tests).
- **Survived:** 443 mutants.
- **No Coverage:** 8 mutants (mathematically unreachable defensive `CalcOverflowError` blocks).
- **Mutation Score:** **73.89%** ($1,276 / 1,727$).
- **Covered Score:** **74.23%** ($1,276 / 1,719$).
- **Reported Duration:** 114 minutes, 54 seconds (reported).
- **Execution Mode:** Baseline historically executed with `incremental: false`. Current `stryker.calc-engine.config.mjs` is configured with `incremental: true` for future runs.
- **Historical Baseline Distinction:** The historical score of 73.89% reflects the test suite prior to the addition of regression tests.

**Surviving Mutant Classification (443 Total Reconciled in Untracked, Non-Ignored Working-Tree Inventory `learning/notes/step-09-survivor-inventory.md` and mirrored in `reports/mutation/survivor-inventory.md`):**

1. **Category 1: Genuine Assertion Gaps (17 mutants):**
   - Triad scenario ordering conditions (11 mutants: 1383, 1385, 1386, 1389, 1394, 1395, 1398, 1418, 1426, 1427, 1430 in `scenario-calc.ts`).
   - Sensitivity single-driver tie-breaking metadata (2 mutants: 1815, 1817 in `sensitivity-calc.ts`).
   - Rational equality comparisons (4 mutants: 411, 413, 414, 416 in `rational.ts`).
   - _Reconciliation Note:_ The previous report erroneously recorded 15 by miscounting 11 ordering mutants as 9 ($9 + 2 + 4 = 15$). All 17 distinct IDs remain recorded as `Survived` in the historical `mutation.json` baseline report and were confirmed eliminated via post-baseline regression verification (not a new Stryker run). The historical baseline (73.89%) and all original JSON metrics strictly predate these regression tests and are preserved without modification.
2. **Category 2: Behaviorally Equivalent (12 mutants):**
   - Rational mathematical identities (7 mutants: GCD negative denominator divisor normalization, abs on zero, non-Rational property lookup fallbacks, remainder non-zero in repeating decimals).
   - Sensitivity unique-driver sorting invariants (1 mutant: duplicate drivers strictly rejected by input validation).
   - Zero-variance optimization shortcuts (4 mutants in `scenario-calc.ts`: fast-path bypass executes bit-for-bit identical general calculation).
3. **Category 3: Unreachable Under Accepted Input Contract (67 mutants):**
   - No universal 1e9 input bound exists across the engine; reachable ranges are bounded path-specifically by domain constraints and Rule Pack limits:
     - _Per-unit:_ intermediate values bounded within $[-100,000, 100,000]$ cents by Rule Pack caps ($maxListPriceMinor \le 100,000\text{¢}$, $maxPages \le 2,000$).
     - _Single scenario:_ exact-boundary acceptance ($1\text{¢} \times MAX\_SAFE\_INTEGER = MAX\_SAFE\_INTEGER$, verified by test 34), overflow rejection ($units \times price > MAX\_SAFE\_INTEGER$ throws `CalcOverflowError`), and near-boundary coverage ($9,007,199,254,740,000$ in CHK-014 / CP-013). Upfront revenue check ensures downstream net contribution cannot overflow.
     - _Triad scenarios:_ validated through single-scenario contracts.
     - _Break-even:_ $breakEvenUnits \approx MAX\_SAFE\_INTEGER$ with min price $\ge 99\text{¢}$ immediately fails break-even revenue overflow validation on L421.
     - _Sensitivity:_ perturbed units reaching $MAX\_SAFE\_INTEGER$ cannot complete because revenue exceeds $MAX\_SAFE\_INTEGER$ due to the 99¢ minimum price floor across all Rule Packs, failing scenario revenue validation.
   - Negative underflow ($< MIN\_SAFE\_INTEGER$) is mathematically impossible on non-negative quantities ($royalty \ge 0$, $cost \le MAX\_SAFE\_INTEGER \implies royalty - cost \ge -MAX\_SAFE\_INTEGER = MIN\_SAFE\_INTEGER$).
4. **Category 4: Trace or Metadata-Only Behavior (31 mutants):**
   - Non-functional trace step strings, note texts, illustrative disclaimer texts (`SCENARIO_DISCLAIMER_TEXT`), and audit trail logging.
5. **Category 5: Validation or Defensive-Boundary Behavior (316 mutants):**
   - Error code string literals, human-readable error messages, defensive type checks, and redundant multi-layer validation checks delegating to downstream functions.
6. **Category 6: Potentially Meaningful Financial or Public-Result Behavior (0 mutants):**
   - Exactly **0** surviving mutants alter financial calculation logic, monetary values, units, or public calculation outputs. All mathematical operators were 100% killed.

- **Category Sum:** $17 + 12 + 67 + 31 + 316 + 0 = 443$.
