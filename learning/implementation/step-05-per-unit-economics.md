# Implementation Record — STEP-005: Per-Unit Economics

- **Step Identifier:** STEP-005
- **Step Name:** Per-Unit Economics Engine (Final Corrective Implementation & ADR-005 Acceptance)
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `e54073006136b0701bc89826d7143dea205ba164`
- **Status:** Accepted & Fully Verified (ADR-005 Accepted — repository owner approved 2026-11-12)

---

## A. Objective & Executive Summary

The objective of STEP-005 was to implement the foundational per-unit financial calculation engine within `packages/calc-engine` (Module M-02) per `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, and canonical architectural requirements (docs 02, 03, 05, 06, 12, 17, 18, 22).

Following the formal owner authorization on 2026-11-12 approving Decisions A, B, C, and D, and accepting ADR-005, this implementation delivers:

1. **Deterministic Core Calculation:** Computes gross royalty, applicable production/distribution costs (physical print cost or digital ebook delivery cost), and net per-unit contribution with zero I/O, zero AI, zero network, zero fractional floating-point financial arithmetic (fractional financial calculations use exact BigInt rational arithmetic via `Rational`, JavaScript `Number` is permitted for validated safe-integer calculations and boundary checks, and financial rounding uses exact integer quotient/remainder logic), and zero clock/random dependencies (Principle P-01, P-02).
2. **Exact Rational Mathematics (`Rational`):** Arbitrary-precision BigInt rational fractions ($a/b$) handling all intermediate financial steps, decimal conversions, and exact proportional scaling with zero loss of precision.
3. **Formal Rounding Engine (ADR-005 Accepted):** Full implementation of four rounding modes (`round_half_up`, `round_half_even`, `round_down`, `round_up`) and two rounding points (`per_unit`, `per_total`).
4. **Proportional Ebook Delivery Cost (Decision B):** Accepts exact decimal file sizes (`fileSizeMb: string`), rejects invalid/zero/negative/scientific inputs, and computes delivery cost via exact rational multiplication without rounding up to whole megabytes.
5. **Two-Stage Cost Rounding Sequence (Decision C):** In `per_unit`, exact gross royalty and any fractional monetary cost are rounded independently using the Rule Pack's declared rounding mode before subtraction. In `per_total`, exact rational values are preserved and rounding is deferred until multi-unit aggregation in STEP-006.
6. **Reproducible Calculation Trace:** Complete, structured, discriminated calculation trace recording engine version, input parameters, selected royalty tier, rational calculation steps, cost breakdown, and rounding operations for independent verification (Principle P-03, P-04).
7. **Typed Error Hierarchy:** Domain-specific errors extending `DomainError` from `@nimphy/domain`, guaranteeing descriptive machine-readable error codes and safe integer checks.
8. **Strict Inward Modularity:** `packages/calc-engine` depends strictly and solely on `@nimphy/domain`. It does NOT import `@nimphy/rules`, `@nimphy/persistence`, `@nimphy/payments`, or any outside package.
9. **Hand-Derived Golden Fixtures:** 32 independently derived golden test cases across all four synthetic Rule Packs (`TEST_EBOOK_STANDARD/1.0.0`, `TEST_PAPERBACK_US/1.0.0`, `TEST_PAPERBACK_US/2.0.0`, `TEST_HARDCOVER_GLOBAL/1.0.0`), covering tier boundaries, page thresholds, fractional delivery sizes, and rounding edge cases (evaluated via 33 registered Vitest tests in `golden.test.ts`).
10. **100% Branch Coverage:** Full branch (100%), statement (100%), function (100%), and line (100%) coverage achieved across all source files in `packages/calc-engine`.

---

## B. Formal Owner Decisions Implemented

On 2026-11-12, the repository owner formally approved four key financial policy decisions:

### Decision A — Rounding Semantics (ADR-005)

1. **`round_half_up`:** Nearest integer minor unit; exact ties away from zero ($+2.5 \to +3$, $-2.5 \to -3$).
2. **`round_half_even`:** Nearest integer minor unit; exact ties to the nearest even integer ($+2.5 \to +2$, $+3.5 \to +4$, $-2.5 \to -2$, $-3.5 \to -4$).
3. **`round_down`:** Toward zero (truncation) ($+2.7 \to +2$, $-2.7 \to -2$).
4. **`round_up`:** Away from zero ($+2.1 \to +3$, $-2.1 \to -3$).

### Decision B — Fractional Ebook File Size

- Public input contract: `fileSizeMb: string` (e.g. `"0.1"`, `"0.5"`, `"1"`, `"2.1"`, `"10.25"`).
- Rejects non-string values, empty strings, zero, negative numbers, `NaN`, `Infinity`, and scientific notation (`1e2`). Length bound at 50 characters to prevent resource exhaustion.
- Formula: $\text{deliveryCostMinorExact} = \text{costPerMbMinor} \times \text{Rational}(\text{fileSizeMb})$.
- No ceiling-to-whole-MB policy; exact proportional billing via rational arithmetic.

### Decision C — Rounding Sequence

- **`per_unit`:**
  1. Compute exact gross royalty as `Rational`.
  2. Round gross royalty to integer minor units using the Rule Pack's `rounding.mode`.
  3. Compute exact production/distribution cost as `Rational`.
  4. Round any fractional monetary cost using the same `rounding.mode`.
  5. Net contribution = rounded gross royalty minus rounded cost.
  6. Return `Money` instances in integer minor units.
- **`per_total` (3-tier distinction):**
  1. **Exact rational amounts (authoritative for STEP-006 aggregation):** `exactGrossRoyalty`, `exactApplicableCost`, and `exactNetContribution` remain fully available as unrounded `Rational` BigInt fractions.
  2. **Integer Money amount, when legitimately available:** `applicableCost` is populated with integer `Money` if the cost is already an exact integer minor unit (e.g. physical print cost 975 minor units); if fractional (e.g. delivery fee 7.5 cents), it is `null`.
  3. **Deferred amounts awaiting STEP-006 aggregation:** `grossRoyalty`, `netContribution`, and fractional costs remain `null` so no premature unit-level rounding is implied. STEP-006 aggregates exact components by quantity ($Q \times \text{exactGrossRoyalty}$, $Q \times \text{exactApplicableCost}$) and rounds aggregate royalty and cost separately, exactly once.

### Decision D — Negative Paperback Fixture & Minimum Price Boundary

- Replaced the invalid $4.00 paperback calculation ($4.00 was below the actual minimum allowable list price of $5.00 in `TEST_PAPERBACK_US/1.0.0`; `limits.minListPriceMinor = 500`) with a valid $5.00 paperback calculation at 300 pages:
  - List price: $5.00 (500 minor units).
  - Royalty: $500 \times 60\% = 300$ minor units.
  - Print cost: $100 + (300 - 24) \times 2 = 652$ minor units.
  - Contribution: $300 - 652 = -352$ minor units (USD -3.52).
- Authoritatively verified actual Rule Pack limits and 5 boundary conditions for paperback minimum list price:
  - $4.00 (400 minor units): reject (`PRICE_OUT_OF_BOUNDS`)
  - $4.50 (450 minor units): reject (`PRICE_OUT_OF_BOUNDS`)
  - $4.99 (499 minor units): reject (`PRICE_OUT_OF_BOUNDS`)
  - $5.00 (500 minor units): accept (exact minimum boundary, yields USD -3.52 at 300 pages)
  - $5.01 (501 minor units): accept (one minor unit above minimum, yields USD -3.51 at 300 pages)
- Corrected all historical references mistakenly citing 450 as the paperback minimum; the accepted STEP-004 Rule Pack baseline `fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json` specifies `limits.minListPriceMinor = 500`.

---

## C. Architectural Invariants & Design Choices

### 1. Inward Dependency Boundaries (Principle P-02, AGENTS.md §2)

Dependency arrows point strictly inward toward `domain`:

```
packages/calc-engine ──► packages/domain
packages/rules ────────► packages/domain
packages/domain ───────► (NONE)
```

`packages/calc-engine` defines structural interfaces (`CalcRulePack`, `CalcRoyaltyTier`, `CalcPrintCostPolicy`, `CalcDeliveryCostPolicy`, `CalcRoundingPolicy`) in `packages/calc-engine/src/per-unit/types.ts` that structurally match the frozen v1 Rule Pack schema from STEP-004. Any valid `RulePack` instantiated by `packages/rules` can be passed directly to `calculatePerUnitEconomics` without casts, runtime adapters, or prohibited imports.

### 2. Financial Arithmetic Model & Exact Rational Arithmetic (`packages/calc-engine/src/math/rational.ts`)

- **Architectural Arithmetic Guarantees:**
  - Fractional financial arithmetic uses exact BigInt rational arithmetic (`Rational`).
  - JavaScript `Number` is permitted for validated safe-integer calculations and boundary checks (e.g. `amountMinor: number`, integer print costs, page counts, limit validation).
  - Financial rounding uses exact integer quotient/remainder logic (`BigInt` integer division and modulo).
  - No fractional floating-point financial arithmetic is used anywhere in calculations.
- Arbitrary-precision BigInt numerator and denominator.
- Euclid's GCD reduction ensures canonical lowest terms upon instantiation.
- Operations: `add()`, `subtract()`, `multiply()`, `divide()`, `abs()`, `negate()`, `compare()`, `equals()`.
- Exact decimal parser `Rational.fromDecimal(decimalStr)` parses decimal strings directly into BigInt fractions without fractional floating-point intermediary representation.
- Formatters: `toDecimalString()` returns exact strings for terminating decimals (prime factors of denominator $\subseteq \{2, 5\}$) and bounded representations with `...` for periodic fractions.
- `toJSON()` emits `{ numerator: string, denominator: string, decimalString: string }`, ensuring compatibility with RFC 8785 canonical JSON without failing on native BigInt.

### 3. Proportional Ebook Delivery Cost Calculation

Delivery cost is calculated as:

```typescript
const sizeRational = Rational.fromDecimal(input.fileSizeMb);
const costPerMbRational = Rational.from(deliveryPolicy.costPerMbMinor);
const exactDeliveryCost = sizeRational.multiply(costPerMbRational);
```

Examples verified against hand-derived arithmetic:

- **0.5 MB:** $15 \times 0.5 = 7.5$ minor units. Under `round_half_up` at `per_unit`: $7.5 \to 8$ minor units.
- **2.1 MB:** $15 \times 2.1 = 31.5$ minor units. Under `round_half_up` at `per_unit`: $31.5 \to 32$ minor units.
- **1.25 MB:** $15 \times 1.25 = 18.75$ minor units. Under `round_half_up` at `per_unit`: $18.75 \to 19$ minor units.
- **0.1 MB:** $15 \times 0.1 = 1.5$ minor units. Under `round_half_up` at `per_unit`: $1.5 \to 2$ minor units.
- **2 MB:** $15 \times 2 = 30$ minor units exactly. No rounding necessary.

### 4. Deterministic Trace Design (`CalculationTrace`)

Every calculation emits a comprehensive, strictly deterministic calculation trace:

- `engineVersion`: pinned module version (`0.1.0`, matching `packages/calc-engine/package.json`).
- `input`: serialized input parameters (`listPriceMinor`, `currency`, `format`, `pages`, `fileSizeMb`).
- `rulePackRef`: Rule Pack identity metadata (`id`, `packKey`, `version`, `contentHash`).
- `royaltyTier`: selected tier name, boundaries, and decimal rate string.
- `grossRoyaltyExact`: exact numerator, denominator, and decimal string.
- `costBreakdown`: typed cost details (`print` or `delivery`, including exact rational strings and rounded amounts).
- `rounding`: declared mode, point, and applied operations (auditing both royalty and cost rounding).
- `netContributionExact`: exact numerator, denominator, and decimal string.
- `steps`: array of typed discriminated steps (`VALIDATE_INPUT`, `SELECT_ROYALTY_TIER`, `CALCULATE_GROSS_ROYALTY`, `CALCULATE_PRODUCTION_COST`, `APPLY_ROUNDING`, `CALCULATE_NET_CONTRIBUTION`).
- **Determinism Guarantee:** Contains zero timestamps, zero UUIDs, zero random values, producing byte-for-byte identical canonical JSON under RFC 8785 (`toCanonicalJson`).

---

## D. Public API (`packages/calc-engine/src/index.ts`)

```typescript
// Module Metadata
export const CALC_ENGINE_MODULE_NAME = 'calc-engine';
export const CALC_ENGINE_MODULE_VERSION = '0.1.0';

// Core Function
export function calculatePerUnitEconomics(
  input: PerUnitCalcInput,
  rulePack: CalcRulePack,
): PerUnitEconomics;

// Math
export { Rational, RoundingMode, RoundingPoint } from './math';

// Errors
export {
  CalcEngineError,
  CalcInputValidationError,
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  NoMatchingRoyaltyTierError,
  RulePackIncompatibleError,
  CalcOverflowError,
} from './errors';

// Types
export type {
  CalcRulePack,
  CalcRulePackContent,
  CalcRoyaltyTier,
  CalcPrintCostPolicy,
  CalcDeliveryCostPolicy,
  CalcRoundingPolicy,
  CalcBookLimitsPolicy,
  PerUnitCalcInput,
  CostBreakdown,
  RoundingOperation,
  CalculationTraceStep,
  CalculationTrace,
  PerUnitEconomics,
} from './per-unit';
```

---

## E. Verification & Golden Fixture Summary

### 1. Hand-Derived Golden Fixtures (`fixtures/calc-engine/golden-per-unit-cases.json`)

The suite contains **32 hand-derived golden fixture cases** across all 4 synthetic Rule Packs:

1. **Ebook Standard (`TEST_EBOOK_STANDARD/1.0.0` — 15 cases):**
   - Tier 1 lower boundary ($0.99, 35%: 34.65 -> 35 cents royalty, 1 MB delivery = 15 cents, contribution = 20 cents).
   - Tier 1 upper boundary ($2.98, 35%: 104.30 -> 104 cents royalty, 1 MB delivery = 15 cents, contribution = 89 cents).
   - Tier 2 lower boundary ($2.99, 70%: 209.30 -> 209 cents royalty, 1 MB delivery = 15 cents, contribution = 194 cents).
   - Tier 2 entry ($3.00, 70%: 210.00 -> 210 cents royalty, contribution = 195 cents).
   - Tier 2 exact mathematical half-cent tie ($3.05, 70%: 213.50 -> 214 cents royalty, contribution = 199 cents).
   - Tier 2 upper boundary ($9.99, 70%: 699.30 -> 699 cents royalty, contribution = 684 cents).
   - Tier 3 lower boundary ($10.00, 35%: 350.00 -> 350 cents royalty, contribution = 335 cents).
   - Tier 3 just above boundary ($10.01, 35%: 350.35 -> 350 cents royalty, contribution = 335 cents).
   - Tier 3 maximum limit ($200.00, 35%: 7000 cents royalty, contribution = 6985 cents).
   - Negative contribution ($0.99, 10 MB: 35 cents royalty, 150 cents delivery, contribution = -115 cents).
   - Large file size ($19.99, 50 MB: 700 cents royalty, 750 cents delivery, contribution = -50 cents).
   - Proportional delivery 0.5 MB ($4.99, 0.5 MB: 349.3 -> 349 royalty, 7.5 -> 8 delivery, contribution = 341 cents / USD 3.41).
   - Proportional delivery 2.1 MB ($4.99, 2.1 MB: 349.3 -> 349 royalty, 31.5 -> 32 delivery, contribution = 317 cents / USD 3.17).
   - Proportional delivery 1.25 MB ($4.99, 1.25 MB: 349.3 -> 349 royalty, 18.75 -> 19 delivery, contribution = 330 cents / USD 3.30).
   - Proportional delivery 0.1 MB ($4.99, 0.1 MB: 349.3 -> 349 royalty, 1.5 -> 2 delivery, contribution = 347 cents / USD 3.47).
2. **Paperback US v1 (`TEST_PAPERBACK_US/1.0.0` — 7 cases):**
   - 24 pages minimum ($12.99: base 100, excess 0 -> 100 print, 779 royalty, contribution = 679 cents).
   - 25 pages ($12.99: base 100 + 1\*2 = 102 print, contribution = 677 cents).
   - 108 pages ($14.99: base 100 + 84\*2 = 268 print, 899 royalty, contribution = 631 cents).
   - 200 pages ($14.99: base 100 + 176\*2 = 452 print, 899 royalty, contribution = 447 cents).
   - 500 pages ($19.99: base 100 + 476\*2 = 1052 print, 1199 royalty, contribution = 147 cents).
   - Negative contribution ($5.00, 300 pages: base 100 + 276\*2 = 652 print, 300 royalty, contribution = -352 cents / USD -3.52).
   - Maximum limits ($250.00, 800 pages: base 100 + 776\*2 = 1652 print, 15000 royalty, contribution = 13348 cents).
3. **Paperback US v2 (`TEST_PAPERBACK_US/2.0.0` — 4 cases):**
   - 24 pages ($14.99: base 120, excess 0 -> 120 print, 899 royalty, contribution = 779 cents).
   - 100 pages ($14.99: base 120 + 76\*2 = 272 print, 899 royalty, contribution = 627 cents).
   - 150 pages ($14.99: base 120 + 126\*2 = 372 print, 899 royalty, contribution = 527 cents).
   - 200 pages ($14.99: base 120 + 176\*2 = 472 print, 899 royalty, contribution = 427 cents).
4. **Hardcover Global v1 (`TEST_HARDCOVER_GLOBAL/1.0.0` — 6 cases, EUR, round_down, per_total):**
   - 75 pages (€25.00: print 600, royalty €12.50, exact contribution €6.50; per-unit Money is `null`).
   - 100 pages (€25.00: print 675, royalty €12.50, exact contribution €5.75; `null` per-unit Money).
   - 200 pages (€29.99: print 975, royalty 1499.50 cents, exact contribution 524.50 cents; `null` per-unit Money).
   - 300 pages (€35.00: print 1275, royalty €17.50 [50%], exact contribution 475 cents; `null` per-unit Money).
   - 500 pages (€15.00: print 1875, royalty €7.50, exact contribution -1125 cents; `null` per-unit Money).
   - 1000 pages (€500.00: print 3375, royalty €250.00, exact contribution €216.25; `null` per-unit Money).

### 2. Coverage Results & Test Reconciliation

- `packages/calc-engine`: **109 passing tests across 6 test files** (`per-unit-calc.test.ts` [31], `rational.test.ts` [31], `golden.test.ts` [33: 1 inventory check + 32 case evaluations], `calc-error.test.ts` [7], `trace.test.ts` [4], `index.test.ts` [3]).
- Monorepo total: **31 test files, 439/439 tests passing (100%)**.
- Golden fixture count: **32 independently derived cases** in `fixtures/calc-engine/golden-per-unit-cases.json`.
- Code coverage:
  - `packages/calc-engine`: **100% Statements (342/342), 100% Branches (99/99), 100% Functions (25/25), 100% Lines (342/342)**.
  - Workspace: **99.93% Statements (2442/2444), 99.23% Branches (789/795), 100% Functions (151/151), 99.93% Lines (2442/2444)**.

### 3. Build & Typecheck Verification

- **Package Scripts:** `packages/calc-engine/package.json` contains `"scripts": { "typecheck": "tsc --noEmit" }` and no separate build script.
- **Internal Workspace Architecture:** `packages/calc-engine` is a pure internal TypeScript package consumed directly from `./src/index.ts`. Root `pnpm build` executes Next.js application build (`pnpm --filter @nimphy/web build`) and does not emit package artifacts for internal libraries.
- **Package Emission Validation:** Verified via `pnpm --filter @nimphy/calc-engine typecheck` and workspace-wide via `pnpm typecheck` (`pnpm -r run typecheck`).
- **`rootDir` Removal Justification:** In `packages/calc-engine/tsconfig.json`, `rootDir` was removed because TypeScript's compiler option enforces that all input source files must reside within `rootDir`. When importing `@nimphy/domain/src` via tsconfig paths, TypeScript flags `TS6059` if `rootDir` is pinned to `src`. Removing `rootDir` allows cross-package path imports while preserving strict typechecking.

### 4. Versioning Invariants & Distinctions

- **Calculation Engine Reproducibility Versioning:** `@nimphy/calc-engine` package version `0.1.0`, `CALC_ENGINE_MODULE_VERSION = '0.1.0'`, and `CalculationTrace.engineVersion = '0.1.0'`. These pin the deterministic financial calculation engine module and trace schema for reproducible calculation replay.
- **Architecture Specification Versioning:** `0.4.0`. This tracks repository-wide architecture specifications and roadmap progression across milestones (Phase 1).
