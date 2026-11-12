# Engineering Reference Notes — STEP-005: Per-Unit Economics

- **Module:** `@nimphy/calc-engine` (M-02)
- **Status:** Accepted & Fully Verified (ADR-005 Accepted — repository owner approved 2026-11-12)
- **Primary Dependencies:** `@nimphy/domain` (Zero external npm dependencies)

---

## 1. Module Anatomy & Source Hierarchy

```
packages/calc-engine/
├── package.json                   # Manifest declaring dependency on @nimphy/domain only
├── tsconfig.json                  # Extends tsconfig.base.json, path aliases to @nimphy/domain
├── README.md                      # Comprehensive package documentation and public API usage
└── src/
    ├── index.ts                   # Public barrel entrypoint
    ├── index.test.ts              # Public API export validation test suite
    ├── errors/
    │   ├── calc-error.ts          # Typed error hierarchy extending DomainError
    │   ├── calc-error.test.ts     # Error inheritance and code tests
    │   └── index.ts
    ├── math/
    │   ├── rational.ts            # BigInt rational arithmetic, GCD, decimal conversion, ADR-005 rounding
    │   ├── rational.test.ts       # Arithmetic, edge case, and rounding mode test suite
    │   └── index.ts
    ├── per-unit/
    │   ├── types.ts               # Structural CalcRulePack interfaces, input, breakdown, and trace types
    │   ├── per-unit-calc.ts       # Core calculatePerUnitEconomics logic, validation, and cost derivation
    │   ├── per-unit-calc.test.ts  # Comprehensive validation, boundaries, overflow, and logic tests
    │   ├── trace.test.ts          # Calculation trace determinism and canonical JSON serialization tests
    │   └── index.ts
    └── golden/
        └── golden.test.ts         # Parity verification against independent hand-derived fixtures (32 cases, 33 registered Vitest tests)
```

---

## 2. Key Mathematical Formulations & Derivations

### 2.0 Financial Arithmetic Model & Precision Guarantees

- **Fractional Financial Arithmetic:** Uses exact BigInt rational arithmetic via `Rational` class ($a/b$ fractions).
- **JavaScript `Number` Usage:** Permitted and used for validated safe-integer calculations and boundary checks (e.g. `amountMinor: number`, integer print costs, page counts, limit validation).
- **Financial Rounding:** Uses exact integer quotient/remainder logic (`BigInt` integer division and modulo).
- **No Fractional Floating-Point:** No fractional floating-point financial arithmetic is used anywhere in calculations.

### 2.1 Royalty Selection and Exact Fraction

Given a list price $P$ (minor units) and currency $C$:

1. Validate $P$ against Rule Pack limits $[P_{\min}, P_{\max}]$.
2. Select royalty tier $T_i$ where $P_{\min, i} \le P \le P_{\max, i}$.
3. Parse declared decimal rate string $R$ (e.g. `"0.70"`) to exact fraction $r_{\text{num}} / r_{\text{den}}$ ($7/10$).
4. Compute unrounded gross royalty fraction:
   $$\text{exactGrossRoyalty} = \frac{P \times r_{\text{num}}}{r_{\text{den}}}$$

### 2.2 Physical Print Cost (Paperback / Hardcover)

Given pages $N$, base cost $B$, per-page cost $C_p$, and page threshold $N_0$ (defaults to 0 if omitted):
$$\text{excessPages} = \max(0, N - N_0)$$
$$\text{perPageCostMinor} = \text{excessPages} \times C_p$$
$$\text{totalPrintCostMinor} = B + \text{perPageCostMinor}$$

Authoritative Synthetic Rule Pack Parameters:

- `TEST_PAPERBACK_US/1.0.0`: $B = 100$, $C_p = 2$, $N_0 = 24$.
  - 108 pages: $100 + (108 - 24) \times 2 = 268$ minor units ($2.68).
  - 200 pages: $100 + (200 - 24) \times 2 = 452$ minor units ($4.52).
  - 300 pages: $100 + (300 - 24) \times 2 = 652$ minor units ($6.52).
  - 500 pages: $100 + (500 - 24) \times 2 = 1052$ minor units ($10.52).
- `TEST_PAPERBACK_US/2.0.0`: $B = 120$, $C_p = 2$, $N_0 = 24$.
  - 100 pages: $120 + (100 - 24) \times 2 = 272$ minor units ($2.72).
  - 150 pages: $120 + (150 - 24) \times 2 = 372$ minor units ($3.72).
- `TEST_HARDCOVER_GLOBAL/1.0.0`: $B = 600$, $C_p = 3$, $N_0 = 75$ (EUR).
  - 100 pages: $600 + (100 - 75) \times 3 = 675$ minor units (€6.75).
  - 300 pages: $600 + (300 - 75) \times 3 = 1275$ minor units (€12.75).
  - 500 pages: $600 + (500 - 75) \times 3 = 1875$ minor units (€18.75).

### 2.3 Proportional Ebook Delivery Cost (Decision B)

Given exact decimal file size string $S_{\text{mb}}$ and cost per MB $C_{\text{mb}} = 15$ minor units:
$$\text{exactDeliveryCostMinor} = \text{Rational}(S_{\text{mb}}) \times 15$$

Exact Mathematical Fractions:

- **0.5 MB:** $15 \times \frac{1}{2} = \frac{15}{2} = 7.5$ minor units.
  - Rounding under `round_half_up`: $7.5 \to 8$ minor units ($0.08).
- **2.1 MB:** $15 \times \frac{21}{10} = \frac{315}{10} = \frac{63}{2} = 31.5$ minor units.
  - Rounding under `round_half_up`: $31.5 \to 32$ minor units ($0.32).
- **1.25 MB:** $15 \times \frac{5}{4} = \frac{75}{4} = 18.75$ minor units.
  - Rounding under `round_half_up`: $18.75 \to 19$ minor units ($0.19).
- **0.1 MB:** $15 \times \frac{1}{10} = \frac{15}{10} = \frac{3}{2} = 1.5$ minor units.
  - Rounding under `round_half_up`: $1.5 \to 2$ minor units ($0.02).
- **2 MB:** $15 \times 2 = 30$ minor units exactly. No rounding required.

Example at list price 499 minor units ($4.99, 70% tier):

- Exact gross royalty: $499 \times \frac{70}{100} = \frac{3493}{10} = 349.3$ minor units.
- Rounded gross royalty: $349$ minor units.
- At 0.5 MB: Rounded cost = 8. Net contribution: $349 - 8 = 341$ minor units ($3.41).
- At 2.1 MB: Rounded cost = 32. Net contribution: $349 - 32 = 317$ minor units ($3.17).
- At 1.25 MB: Rounded cost = 19. Net contribution: $349 - 19 = 330$ minor units ($3.30).
- At 0.1 MB: Rounded cost = 2. Net contribution: $349 - 2 = 347$ minor units ($3.47).

---

## 3. Formal Rounding Semantics (Decision A & ADR-005)

| Value / Condition                    | `round_down`          | `round_up`         | `round_half_up`    | `round_half_even`   |
| ------------------------------------ | --------------------- | ------------------ | ------------------ | ------------------- |
| Positive Integer (`+2.0`)            | `+2`                  | `+2`               | `+2`               | `+2`                |
| Positive Fractional non-tie (`+2.4`) | `+2`                  | `+3`               | `+2`               | `+2`                |
| Positive Fractional non-tie (`+2.6`) | `+2`                  | `+3`               | `+3`               | `+3`                |
| Positive Exact Tie (`+2.5`)          | `+2`                  | `+3`               | `+3` (away from 0) | `+2` (nearest even) |
| Positive Exact Tie (`+3.5`)          | `+3`                  | `+4`               | `+4` (away from 0) | `+4` (nearest even) |
| Negative Integer (`-2.0`)            | `-2`                  | `-2`               | `-2`               | `-2`                |
| Negative Fractional non-tie (`-2.4`) | `-2` (trunc toward 0) | `-3` (away from 0) | `-2`               | `-2`                |
| Negative Fractional non-tie (`-2.6`) | `-2` (trunc toward 0) | `-3` (away from 0) | `-3`               | `-3`                |
| Negative Exact Tie (`-2.5`)          | `-2`                  | `-3`               | `-3` (away from 0) | `-2` (nearest even) |
| Negative Exact Tie (`-3.5`)          | `-3`                  | `-4`               | `-4` (away from 0) | `-4` (nearest even) |

---

## 4. Rounding Sequence & Points (Decision C)

- **`per_unit` Sequence:**
  1. $\text{roundedRoyaltyMinor} = \text{round}(\text{exactGrossRoyalty}, \text{rounding.mode})$
  2. $\text{roundedCostMinor} = \text{round}(\text{exactApplicableCost}, \text{rounding.mode})$
  3. $\text{netContributionMinor} = \text{roundedRoyaltyMinor} - \text{roundedCostMinor}$
  4. Return `Money` instances for `grossRoyalty`, `applicableCost`, and `netContribution`.
- **`per_total` Sequence (3-Tier Output Distinction):**
  1. **Exact Rational Amounts (Authoritative):** Both `exactGrossRoyalty`, `exactApplicableCost`, and `exactNetContribution` are preserved as unrounded `Rational` BigInt fractions. These are authoritative for STEP-006 aggregation.
  2. **Integer Money Amount (When Legitimately Available):** If a cost component is already an exact integer minor unit (e.g. physical print cost of 975 minor units), it is populated in `applicableCost` as `Money`. If fractional (e.g. 7.5 cents delivery fee), it is `null`.
  3. **Deferred Amounts Awaiting STEP-006 Aggregation:** `grossRoyalty`, `netContribution`, and fractional costs remain `null` so callers cannot mistakenly consume prematurely rounded unit amounts. Multi-unit aggregation in STEP-006 will multiply exact rationals by quantity and round aggregate sums once.

---

## 5. Negative Contribution & Paperback Boundary Scenarios (Decision D)

- **Authoritative Rule Pack Limit:**
  In `fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json`, `limits.minListPriceMinor = 500` ($5.00), NOT 450.
- **Paperback US v1 Benchmark ($5.00 / 300 pages):**
  - List price: 500 minor units ($5.00).
  - Royalty: $500 \times 60\% = 300$ minor units.
  - Print cost: $100 + (300 - 24) \times 2 = 652$ minor units.
  - Contribution: $300 - 652 = -352$ minor units (USD -3.52).
- **Five-Point Boundary Verification:**
  - $4.00 (400 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
  - $4.50 (450 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
  - $4.99 (499 minor units): reject (`PRICE_OUT_OF_BOUNDS`).
  - $5.00 (500 minor units): accept (exact minimum boundary; yields USD -3.52 at 300 pages).
  - $5.01 (501 minor units): accept (one cent above boundary; yields USD -3.51 at 300 pages).
- **Ebook Negative Scenario ($0.99 / 10 MB):**
  - Royalty: 35 minor units.
  - Delivery cost: 150 minor units.
  - Contribution: $35 - 150 = -115$ minor units (USD -1.15).

---

## 6. Handoff Contract to STEP-006 (Total Economics & Aggregation)

In STEP-006, multi-unit batch projections and case scenario aggregation will consume `PerUnitEconomics`:

- When `rounding.point === 'per_total'`:
  - STEP-006 MUST NOT use unit-level `Money` if null.
  - STEP-006 MUST multiply quantity $Q$ by `exactGrossRoyalty`:
    $$\text{totalGrossRoyaltyExact} = Q \times \text{exactGrossRoyalty}$$
  - STEP-006 MUST multiply quantity $Q$ by `exactApplicableCost`:
    $$\text{totalCostExact} = Q \times \text{exactApplicableCost}$$
  - STEP-006 MUST round each aggregate component separately using `rounding.mode`:
    $$\text{totalGrossRoyaltyRounded} = \text{round}(\text{totalGrossRoyaltyExact}, \text{rounding.mode})$$
    $$\text{totalCostRounded} = \text{round}(\text{totalCostExact}, \text{rounding.mode})$$
  - STEP-006 MUST compute aggregate contribution by subtraction:
    $$\text{totalContribution} = \text{totalGrossRoyaltyRounded} - \text{totalCostRounded}$$
- **Strict Constraint:** STEP-006 is NOT authorized until explicit owner instruction.

---

## 7. Build, Typecheck & Test Reconciliation Summary

- **Package Architecture:** `@nimphy/calc-engine` has `"typecheck": "tsc --noEmit"` in `package.json` and no build script. It is an internal workspace library consumed directly as TypeScript source.
- **Root Build:** Root `pnpm build` executes `pnpm --filter @nimphy/web build` (Next.js app). Package emission is verified via `pnpm --filter @nimphy/calc-engine typecheck` and `pnpm typecheck`.
- **`rootDir` in tsconfig:** Removed from `packages/calc-engine/tsconfig.json` because TypeScript forbids source files outside `rootDir` when resolving `@nimphy/domain/src` via tsconfig paths.
- **Reconciled Test Counts & Golden Fixtures:**
  - `@nimphy/calc-engine`: 109 tests across 6 test files (`golden.test.ts` [33: 1 inventory check + 32 case evaluations], `rational.test.ts` [31], `per-unit-calc.test.ts` [31], `calc-error.test.ts` [7], `trace.test.ts` [4], `index.test.ts` [3]).
  - Workspace: 439 tests across 31 test files.
  - Golden fixtures: 32 cases in `fixtures/calc-engine/golden-per-unit-cases.json` (evaluated via 33 registered Vitest tests in `golden.test.ts`).
  - Coverage: calc-engine 100% Statements / 100% Branches / 100% Functions / 100% Lines. Monorepo: 99.93% Statements, 99.23% Branches.
- **Versioning Invariants & Distinctions:**
  - **Calculation Engine Reproducibility Versioning:** `@nimphy/calc-engine` package version `0.1.0`, `CALC_ENGINE_MODULE_VERSION = '0.1.0'`, and `CalculationTrace.engineVersion = '0.1.0'`. These pin the deterministic financial calculation engine module and trace schema for reproducible calculation replay.
  - **Architecture Specification Versioning:** `0.4.0`. This tracks repository-wide architecture specifications and roadmap progression across milestones (Phase 1).
