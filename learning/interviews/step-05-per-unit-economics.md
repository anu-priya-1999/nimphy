# Senior Engineering Interview Preparation — STEP-005: Per-Unit Economics

This document contains senior-level technical interview questions, trade-offs, and architectural defenses regarding the design, implementation, and formal owner acceptance of the per-unit economics calculation engine, exact rational arithmetic, ADR-005 rounding engine, and calculation trace in Nimphy.

---

## 1. Architectural Principles & Modularity

### Q1: Why does `packages/calc-engine` define structural interfaces (`CalcRulePack`, etc.) rather than importing `RulePack` directly from `packages/rules`?

**Answer:**

1. **Architectural Modularity Invariant (AGENTS.md §2, Principle P-02):**
   The architecture strictly dictates that dependency arrows point inward toward `domain`:
   ```
   packages/calc-engine ──► packages/domain
   packages/rules ────────► packages/domain
   packages/domain ───────► (NONE)
   ```
   `packages/calc-engine` must never depend on `packages/rules`. If `calc-engine` imported `RulePack` from `rules`, it would create a direct coupling between the engine and the rule pack loading/storage subsystem, compromising independent packaging, pure testing, and future extraction.
2. **TypeScript Structural Subtyping:**
   TypeScript uses a structural type system. By declaring minimal structural interfaces in `packages/calc-engine/src/per-unit/types.ts` that match the frozen v1 Rule Pack contract, any valid `RulePack` produced by `@nimphy/rules` is assignable to `CalcRulePack` without runtime overhead, type assertions, or adapters.
3. **Pure Function with Zero I/O (Principle P-01):**
   `packages/calc-engine` remains a 100% pure computational core: zero filesystem, zero database, zero clock/randomness, zero AI imports.

---

## 2. Mathematical Correctness & Exact Rational Arithmetic

### Q2: Why did you implement an explicit `Rational` class using BigInt instead of using JavaScript's native `number` or a library like `bignumber.js`?

**Answer:**

1. **Precise Role Distinction for Arithmetic:**
   - **Fractional Financial Arithmetic:** Uses exact BigInt rational arithmetic via `Rational` ($a/b$ fractions) for gross royalty and fractional digital delivery calculations.
   - **JavaScript `Number` Usage:** Permitted and used strictly for validated safe-integer calculations and boundary checks (e.g. `amountMinor: number`, integer print costs, page counts, limit bounds).
   - **Financial Rounding:** Uses exact integer quotient/remainder logic (`BigInt` integer division and modulo).
   - **Zero Fractional Floats:** No fractional floating-point financial arithmetic is permitted or used.
2. **IEEE-754 Precision Limitations:**
   Standard JavaScript numbers are 64-bit binary floating-point values (`binary64`). Decimals like `0.1`, `0.7`, and `0.35` cannot be represented exactly in binary. For example:
   ```javascript
   299 * 0.7 = 209.30000000000004
   0.1 + 0.2 = 0.30000000000000004
   ```
   In financial systems, binary floating-point errors accumulate during multiplication and division, leading to off-by-one errors and audit failures.
3. **Exact Rational Representation ($a/b$):**
   By modeling fractional currency amounts as a pair of arbitrary-precision BigInt integers ($\text{numerator} \in \mathbb{Z}, \text{denominator} \in \mathbb{N}^+$) reduced to lowest terms via Euclid's algorithm, every fraction is represented exactly with zero precision loss.
4. **Zero External Runtime Dependencies:**
   Third-party libraries like `bignumber.js` or `decimal.js` introduce supply-chain vulnerabilities, bundle bloat, and foreign object models. Implementing a compact, purpose-built `Rational` class in ~370 lines of pure TypeScript achieves complete mathematical precision, zero dependencies, and 100% test branch coverage.

### Q3: How does `Rational` handle non-terminating decimals (e.g. $1/3$, $1/7$) during serialization?

**Answer:**

- In canonical representation, rationals are stored as exact BigInt numerator and denominator pairs (`"numerator": "1"`, `"denominator": "3"`).
- When converting to a decimal string representation (`toDecimalString()`), the algorithm analyzes the prime factorization of the denominator:
  - If the denominator has only prime factors of 2 and 5 ($\text{denominator} = 2^a \cdot 5^b$), the fraction terminates in exactly $\max(a, b)$ decimal places. The algorithm scales the fraction and formats it without precision loss.
  - If the denominator has prime factors other than 2 and 5, it is mathematically periodic and non-terminating in base 10. The algorithm computes up to `maxDecimals` digits using long division and appends an explicit ellipsis (`...`), signaling to callers and auditors that the decimal representation is an approximation, whereas the rational fraction is exact.
- `toJSON()` returns `{ numerator: string, denominator: string, decimalString: string }`, ensuring compatibility with RFC 8785 canonical JSON without failing on native BigInt.

---

## 3. Formally Approved ADR-005 Rounding Semantics (Decision A)

### Q4: Explain the four rounding modes defined in ADR-005, particularly regarding negative numbers and ties.

**Answer:**

On 2026-11-12, the repository owner formally approved the following exact rounding semantics:

1. **`round_half_up` (Nearest integer, ties away from zero):**
   - Rounds to nearest integer. If the fractional part is exactly $0.5$, rounds away from zero.
   - Positive: $+2.5 \to +3$, $+2.49 \to +2$.
   - Negative: $-2.5 \to -3$, $-2.49 \to -2$.
2. **`round_half_even` (Banker's rounding, ties to nearest even integer):**
   - Rounds to nearest integer. If the fractional part is an exact half-way tie ($0.5$), rounds to the nearest even integer.
   - $+2.5 \to +2$ (2 is even); $+3.5 \to +4$ (4 is even); $-2.5 \to -2$; $-3.5 \to -4$.
   - Eliminates statistical bias when aggregating many rounded transactions.
3. **`round_down` (Toward zero / truncation):**
   - Discards fractional parts toward zero: $\text{sign}(x) \cdot \lfloor |x| \rfloor$.
   - $+2.7 \to +2$; $-2.7 \to -2$.
   - _Crucial Distinction:_ It is NOT mathematical floor ($\lfloor -2.7 \rfloor = -3$). It truncates toward zero.
4. **`round_up` (Away from zero):**
   - Rounds fractional parts away from zero: $\text{sign}(x) \cdot \lceil |x| \rceil$.
   - $+2.1 \to +3$; $-2.1 \to -3$.

---

## 4. Fractional Ebook Delivery Cost (Decision B)

### Q5: How are fractional ebook file sizes handled, and why is `fileSizeMb: string` used instead of `number`?

**Answer:**

1. **Exact Public Contract (`fileSizeMb: string`):**
   Floating-point numbers in JavaScript (`0.1`, `0.5`, `2.1`) suffer from binary representation errors. Receiving `fileSizeMb` as an exact decimal string guarantees that the caller's input is preserved with bit-level accuracy without IEEE-754 distortion.
2. **Strict Validation:**
   - Validated against regular expression `/^\d+(\.\d+)?$/`.
   - Length capped at 50 characters to prevent denial-of-service / memory exhaustion attacks.
   - Non-string types, empty strings, zero, negative numbers, `NaN`, `Infinity`, and scientific notation (`1e2`) are rejected with domain-specific error `DELIVERY_SIZE_INVALID`.
3. **Proportional Billing (No Integer-MB Ceiling):**
   Per Decision B, delivery costs are proportional to the exact file size supplied in MB:
   $$\text{deliveryCostMinorExact} = \text{costPerMbMinor} \times \text{Rational}(\text{fileSizeMb})$$
   No arbitrary whole-MB ceiling policy is applied; exact rational arithmetic is used throughout.

---

## 5. Two-Stage Rounding Sequence & Rounding Points (Decision C)

### Q6: What is the rounding sequence in `per_unit` vs `per_total`?

**Answer:**

Per Owner Decision C:

1. **`per_unit` Rounding Sequence:**
   - Step 1: Calculate exact gross royalty as `Rational`.
   - Step 2: Round gross royalty to integer minor units using the Rule Pack's declared `rounding.mode`.
   - Step 3: Calculate exact production/distribution cost as `Rational`.
   - Step 4: If the cost has fractional minor units (e.g. $7.5$ minor units for 0.5 MB delivery), round that fractional cost using the same `rounding.mode`.
   - Step 5: Net contribution = rounded gross royalty minus rounded cost.
   - Step 6: Return `Money` instances in integer minor units.
2. **`per_total` Rounding Sequence (3-Tier Output Distinction):**
   - **Tier 1 (Exact Rational Amounts):** Both exact gross royalty and exact production/distribution cost are preserved as unrounded `Rational` instances (`exactGrossRoyalty`, `exactApplicableCost`, `exactNetContribution`). These are authoritative for STEP-006 aggregation.
   - **Tier 2 (Integer Money, when legitimately available):** If a cost component is already an exact integer minor unit (e.g. physical print cost of 975 cents), it is legitimately populated in `applicableCost` as `Money.of(975, 'EUR')`. If fractional (e.g. 7.5 cents delivery fee), it is `null`.
   - **Tier 3 (Deferred Amounts awaiting STEP-006 aggregation):** `grossRoyalty`, `netContribution`, and fractional costs remain `null` so callers cannot mistakenly consume prematurely rounded unit amounts. In STEP-006, multi-unit volume aggregation multiplies the exact rational values ($Q \times \text{exactGrossRoyalty}$, $Q \times \text{exactApplicableCost}$), and each aggregate sum is rounded separately, exactly once.

---

## 6. Negative Contribution & Limit Validation (Decision D)

### Q7: Why was the $4.00 paperback fixture rejected, and how is negative contribution handled?

**Answer:**

1. **Rule Pack Limit Rejection & Minimum Price Baseline:**
   In `fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json`, the authoritative minimum allowable list price is $5.00 (`limits.minListPriceMinor: 500`), NOT 450. A list price of $4.00 (400 minor units), $4.50 (450 minor units), or $4.99 (499 minor units) violates Rule Pack limits. The engine throws `CalcInputValidationError` with code `PRICE_OUT_OF_BOUNDS`. Treating $4.00 as a valid calculation in earlier drafts was an audit error corrected in STEP-005.
2. **Boundary Testing ($4.00, $4.50, $4.99, $5.00, $5.01):**
   The engine's boundary test suite explicitly verifies:
   - $4.00 (400 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
   - $4.50 (450 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
   - $4.99 (499 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
   - $5.00 (500 minor units): accept (exact minimum boundary).
   - $5.01 (501 minor units): accept (one minor unit above boundary).
3. **Owner-Approved Negative Contribution Benchmark ($5.00 / 300 pages):**
   Per Decision D, the valid negative contribution scenario is tested at $5.00 list price (500 minor units) with 300 pages:
   - Royalty: $500 \times 60\% = 300$ minor units.
   - Print cost: $100 + (300 - 24) \times 2 = 652$ minor units.
   - Contribution: $300 - 652 = -352$ minor units (USD -3.52).
4. **Honest Financial Representation:**
   `Money` allows negative amounts. The engine returns negative contribution without throwing or clamping to zero, accurately reflecting unprofitable print scenarios for downstream break-even and pricing analysis.

---

## 7. Traceability & Determinism (Principle P-01, P-03, P-04)

### Q8: How does the calculation trace satisfy Principle P-01, P-03, and P-04?

**Answer:**

1. **P-01 (Deterministic Core):**
   The calculation trace is a pure function of the input parameters and the Rule Pack. Given identical inputs, the emitted trace is byte-for-byte identical.
2. **P-03 (Traceability):**
   The trace records every step:
   - Input list price, currency, format, pages, file size.
   - Pinned Rule Pack ID, key, SemVer, and cryptographic content hash.
   - Selected royalty tier name, price bounds, and decimal rate string.
   - Intermediate exact rational values for gross royalty.
   - Cost component breakdown (base cost, per-page cost, excess pages, or file size and MB rate, with exact rational strings).
   - Applied rounding mode, rounding point, exact unrounded values, and rounded values for both royalty and fractional cost.
   - Final net contribution.
3. **P-04 (Immutability & Audit):**
   The trace contains NO timestamps, NO UUIDs, and NO random values. It serializes deterministically via RFC 8785 canonical JSON (`toCanonicalJson`).

---

## 8. Testing Strategy & Coverage

### Q9: How was 100% branch coverage achieved and verified across `packages/calc-engine`?

**Answer:**

- **Independent Benchmark:** 32 golden cases independently hand-derived and cross-verified against all 4 synthetic Rule Packs under `fixtures/calc-engine/golden-per-unit-cases.json` (evaluated via 33 registered Vitest tests in `golden.test.ts`, including 1 fixture inventory check and 32 case evaluations).
- **Zero Dead Code:** Branch coverage analysis identified unreachable branches (e.g. redundant `try/catch` around `Rational.fromDecimal` after strict regex validation, duplicate overflow checks on already-validated numerators). These were eliminated cleanly.
- **Boundary Verification:** Every comparison boundary, tier edge, rounding tie, and error condition is directly exercised:
  - Missing format inputs (`pages` missing for print, `fileSizeMb` missing for ebook).
  - Currency mismatch, format mismatch, price out of bounds.
  - Non-string, empty, zero, negative, invalid decimal, and scientific notation `fileSizeMb`.
  - All 4 rounding modes across positive ties, negative ties, and non-ties.
  - `per_unit` vs `per_total` deferred rounding.
  - Paperback minimum price boundaries ($4.00, $4.50, $4.99 reject; $5.00, $5.01 accept).
- **Result:**
  - `packages/calc-engine`: 109 passing tests across 6 test files, achieving **100% Statements (342/342), 100% Branches (99/99), 100% Functions (25/25), 100% Lines (342/342)**.
  - Monorepo: 439 passing tests across 31 test files, achieving **99.93% Statements, 99.23% Branches, 100% Functions, 99.93% Lines**.

---

## 9. Build, Packaging & Typecheck Distinction

### Q10: How does package build and typecheck verification work for `@nimphy/calc-engine`, and why was `rootDir` removed from its tsconfig?

**Answer:**

1. **Package Script Contract:**
   `packages/calc-engine/package.json` contains:
   ```json
   "scripts": {
     "typecheck": "tsc --noEmit"
   }
   ```
   There is no separate `build` script in `packages/calc-engine`, nor is one required.
2. **Monorepo Consumption Architecture:**
   The monorepo uses source-based TypeScript package resolution. Internal packages (`domain`, `calc-engine`, `rules`) expose their entry points directly via `main: "./src/index.ts"` and `types: "./src/index.ts"`. Root `pnpm build` is configured as `pnpm --filter @nimphy/web build`, building the Next.js web application. It does not validate library package emission.
3. **Typecheck & Emission Validation:**
   Package-level compilation and type correctness are verified by running `pnpm --filter @nimphy/calc-engine typecheck` (`tsc --noEmit`), and monorepo-wide via `pnpm typecheck` (`pnpm -r run typecheck`).
4. **Justification for `rootDir` Removal in `tsconfig.json`:**
   `packages/calc-engine/tsconfig.json` imports from `@nimphy/domain/src` via path mapping. If `rootDir` is set to `"src"`, TypeScript enforces that all processed source files must be located under `packages/calc-engine/src`. Importing from `../domain/src` triggers `TS6059: File '.../packages/domain/src/index.ts' is not under 'rootDir' '.../packages/calc-engine/src'`. Removing `rootDir` allows `tsc --noEmit` to validate types across workspace package boundaries without error.
5. **Versioning Invariants & Distinctions:**
   - Calculation engine reproducibility versioning: `@nimphy/calc-engine` package version `0.1.0`, `CALC_ENGINE_MODULE_VERSION = '0.1.0'`, `CalculationTrace.engineVersion = '0.1.0'`.
   - Architecture specification versioning: `0.4.0`.
