# Implementation Record — STEP-008: Deterministic Sensitivity Analysis Engine

- **Step Identifier:** STEP-008
- **Step Name:** Engine: Sensitivity Analysis
- **Phase:** Phase 1 (Deterministic Core)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `9ba8361987cca29222ba257cecae4cf58b584603`
- **Status:** Complete & Fully Verified; Awaiting Formal Owner Acceptance (100% Branch Coverage on `packages/calc-engine`)

---

## A. Objective & Executive Summary

The objective of STEP-008 was to design and implement a production-quality, mathematically rigorous, deterministic Sensitivity Analysis Engine inside `packages/calc-engine` (Module M-02) per `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, functional requirement FR-008, and canonical architectural principles (docs 02, 03, 04, 05, 06, 07, 12, 17, 18, 22).

Following the strict scope and contracts mandated by the repository owner, this implementation delivers:

1. **Pure Deterministic Calculation (P-01, P-02):** Computes one-at-a-time scenario perturbations with zero I/O, zero network calls, zero filesystem access, zero system clock dependencies, zero randomness, zero AI imports, and zero floating-point financial arithmetic.
2. **Declared Sensitivity Driver Allow-List (FR-006 / FR-008):**
   - Strictly restricts sensitivity drivers to the declared scenario parameters: `units`, `listPriceMinor`, and `costVariancePercent`.
   - Rejects arbitrary or unapproved drivers (e.g. format, pages, file size, currency) with typed `CalcInputValidationError`.
   - Enforces domain-appropriate perturbation representations:
     - `units`: Positive safe integer count.
     - `listPriceMinor`: Positive safe integer minor currency units.
     - `costVariancePercent`: Positive exact decimal string percentage points.
3. **One-at-a-Time Perturbation Model:**
   - Evaluates a valid baseline scenario via `calculateSingleScenario`.
   - For each declared driver $D_i$ with perturbation $\Delta_i$, computes:
     $$D_i^- = D_i - \Delta_i, \quad D_i^+ = D_i + \Delta_i$$
   - Strictly preserves all other baseline scenario inputs without alteration or cross-contamination.
   - Evaluates lower ($D_i^-$) and upper ($D_i^+$) scenarios through the existing `calculateSingleScenario` engine.
4. **Strict Boundary Handling & Fail-Closed Validation:**
   - Perturbed inputs are never silently clamped to boundaries or replaced.
   - Negative units ($< 0$), list prices outside Rule Pack allowed ranges ($[\text{priceFloorMinor}, \text{priceCeilingMinor}]$), cost variances below $-100\%$, or arithmetic overflows trigger explicit typed errors (`CalcInputValidationError` or `CalcOverflowError`).
5. **Primary Metric, Impact Score, and Deterministic Ranking:**
   - Primary sensitivity metric is **total scenario net contribution** in integer minor currency units.
   - For each driver $D_i$, computes:
     $$\Delta_i^- = \text{Contribution}_i^- - \text{Contribution}_{\text{base}}$$
     $$\Delta_i^+ = \text{Contribution}_i^+ - \text{Contribution}_{\text{base}}$$
     $$I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$$
   - Ranks drivers strictly:
     1. Primary: Impact score $I_i$ descending.
     2. Secondary (Deterministic Tie-Break): Driver identifier ascending via UTF-16 code-point order (`costVariancePercent` < `listPriceMinor` < `units`).
   - Ranking is completely invariant to driver input order.
6. **Deterministic Canonical Audit Trace (P-03):**
   - Emits structured `SensitivityCalculationTrace` containing engine version, rule pack reference and hash, baseline scenario summary, perturbation configurations, evaluated lower/upper scenarios with contribution deltas, impact scores, and ranking tie-break decisions.
   - Excludes all non-deterministic artifacts (no timestamps, random UUIDs, or machine environment paths).
7. **Deep Immutability & Caller Object Protection (P-04):**
   - Recursively deep-freezes all returned result structures, summary objects, ranked driver arrays, and trace trees using `deepFreeze`.
   - Clones declared driver objects (`input.drivers.map((driver) => ({ ...driver }))`) prior to freezing, ensuring caller-owned driver configurations and input arrays remain completely unfrozen and mutable.
8. **Exhaustive Testing & 100% Branch Coverage (P-09):**
   - Added 65 tests across unit tests (39), golden fixtures (22), and deterministic property suites (4).
   - Achieves 100% statement, 100% branch, 100% function, and 100% line coverage in `packages/calc-engine`.
   - Monorepo test suite passes 100% with 655 tests across 42 test files (322 tests in `packages/calc-engine` across 17 test files).
   - CI workflow `.github/workflows/ci.yml` upgraded to execute `pnpm test:coverage` to strictly enforce coverage thresholds on remote runners.

---

## B. Architectural & Mathematical Design

### 1. Sensitivity Driver Allow-List and Input Validation

In accordance with Section 2 of the prompt, the allow-list is strictly bounded to the three FR-006 scenario parameters:

```typescript
export const SENSITIVITY_DRIVERS = ['units', 'listPriceMinor', 'costVariancePercent'] as const;

export type SensitivityDriver = (typeof SENSITIVITY_DRIVERS)[number];
```

Validation guarantees:

- `drivers` array is non-empty.
- Each driver is an approved element of `SENSITIVITY_DRIVERS`.
- No duplicate drivers exist in the request.
- `units` perturbation is a positive safe integer ($> 0$, $\le \text{MAX\_SAFE\_INTEGER}$).
- `listPriceMinor` perturbation is a positive safe integer ($> 0$, $\le \text{MAX\_SAFE\_INTEGER}$).
- `costVariancePercent` perturbation is a non-empty string representing a strictly positive exact decimal ($> 0$), bounded to a maximum length of 50 characters before rational parsing (matching `scenario-calc.ts`).
- Baseline scenario input is fully validated by `calculateSingleScenario`.

### 2. Exact Decimal Perturbation for Cost Variance

To uphold Principle P-01 (deterministic core) and avoid IEEE 754 floating-point contamination:

- Cost variance perturbations are parsed into exact `Rational` fractions:
  $$\Delta_{\text{cost}} = \text{Rational.fromDecimalString}(\text{perturbation})$$
- Lower and upper percentage points are calculated using exact rational addition and subtraction:
  $$\text{baseRatio} = \text{Rational.fromDecimalString}(\text{baseline.costVariancePercent})$$
  $$\text{lowerRatio} = \text{baseRatio} - \Delta_{\text{cost}}$$
  $$\text{upperRatio} = \text{baseRatio} + \Delta_{\text{cost}}$$
- The resulting exact fractions are formatted back to normalized exact decimal strings via `toDecimalString()`.
- If the lower variance falls below $-100\%$, `CalcInputValidationError` is thrown immediately.

### 3. Impact Metric and Ranking Semantics

Given:

- Baseline net contribution: $C_{\text{base}}$
- Lower perturbation net contribution: $C_i^-$
- Upper perturbation net contribution: $C_i^+$

The integer minor unit contribution differences are computed:
$$\Delta_i^- = C_i^- - C_{\text{base}}$$
$$\Delta_i^+ = C_i^+ - C_{\text{base}}$$

The absolute impact score is defined as:
$$I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$$

Drivers are sorted using a deterministic comparator:

```typescript
rankedDrivers.sort((a, b) => {
  const diff = b.impactScore.amountMinor - a.impactScore.amountMinor;
  if (diff !== 0) {
    return diff;
  }
  return a.driver < b.driver ? -1 : 1;
});
```

Because duplicate drivers are rejected at the boundary, $a.\text{driver} = b.\text{driver}$ is impossible in the sort comparator. The secondary tie-break is purely lexical UTF-16 code-point order:

1. `'costVariancePercent'` (U+0063)
2. `'listPriceMinor'` (U+006C)
3. `'units'` (U+0075)

This order is completely independent of locale and input ordering.

---

## C. File Inventory & Line Counts

| Path                                                              | Purpose                                                                              | Lines |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| `packages/calc-engine/src/sensitivity/types.ts`                   | Complete TypeScript type contracts, input/result/trace interfaces, driver type guard | 208   |
| `packages/calc-engine/src/sensitivity/sensitivity-calc.ts`        | Pure deterministic sensitivity calculation engine implementation                     | 525   |
| `packages/calc-engine/src/sensitivity/index.ts`                   | Module barrel exports                                                                | 23    |
| `packages/calc-engine/src/sensitivity/sensitivity-calc.test.ts`   | 37 unit tests covering validation, boundaries, overflow, signs, ties, immutability   | 982   |
| `packages/calc-engine/src/sensitivity/golden-sensitivity.test.ts` | 22 tests verifying 21 hand-derived golden fixture cases and inventory                | 165   |
| `packages/calc-engine/src/sensitivity/properties.test.ts`         | 4 property test suites with Mulberry32 PRNG (determinism, parity, monotonicity)      | 260   |
| `fixtures/calc-engine/golden-sensitivity-cases.json`              | 21 hand-derived golden sensitivity cases across all 4 synthetic Rule Packs           | 884   |
| `prompts/step-08.md`                                              | Canonical Prompt Archive for STEP-008                                                | 320   |
| `learning/implementation/step-08-sensitivity.md`                  | Detailed implementation record                                                       | ~280  |
| `learning/interviews/step-08-sensitivity.md`                      | Senior technical interview preparation document                                      | ~260  |
| `learning/notes/step-08-sensitivity.md`                           | Concise engineering reference notes                                                  | ~180  |
| `packages/calc-engine/src/index.ts`                               | Updated root package barrel exporting sensitivity capabilities                       | 86    |
| `packages/calc-engine/src/index.test.ts`                          | Updated root package tests asserting sensitivity exports and README example          | 158   |
| `packages/calc-engine/README.md`                                  | Updated package documentation with Section 1 `calculateSensitivity`                  | 461   |
| `vitest.config.ts`                                                | Coverage exclusion for `packages/calc-engine/src/sensitivity/types.ts`               | 26    |
| `docs/DESIGN.md`                                                  | Living design document updated with STEP-008 records                                 | ~1100 |

---

## D. Verification Results

All required verification suites executed cleanly with zero errors and zero warnings:

1. `pnpm typecheck`: Clean (0 errors across all workspaces).
2. `pnpm lint`: Clean (0 lint warnings or errors).
3. `pnpm format:check`: Clean (All matched files use Prettier code style).
4. `pnpm arch:check`: Clean (`pnpm docs:check` and `pnpm boundaries:check` passed 100%).
5. `pnpm test:coverage`:
   - `packages/calc-engine`: **100% Statements, 100% Branches, 100% Functions, 100% Lines** (322 tests across 17 test files).
   - Monorepo: **655/655 tests passed across 42 test files**.
   - Enforced directly in `.github/workflows/ci.yml`.
6. `git diff --check`: Clean (no trailing whitespace or conflict markers).

---

## E. Git Discipline & Scope Boundary

All modified and newly created files remain strictly in the local working tree. No files have been staged (`git add`), committed (`git commit`), stashed, reset, or pushed to remote. STEP-009 remains strictly unauthorized.
