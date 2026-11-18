# Engineering Notes — STEP-007: Break-Even Economics Engine

- **Author:** Nimphy Engineering Agent
- **Date:** 2026-11-17
- **Milestone:** STEP-007 (Engine: Break-Even)
- **Status:** Complete & Fully Verified

---

## 1. Architectural Context & Scope Bounds

STEP-007 implements the break-even calculation engine in `packages/calc-engine/src/break-even/` per `docs/architecture/17-implementation-roadmap.md` and functional requirement FR-007.

### What STEP-007 Delivers

- Pure mathematical function `calculateBreakEven(input, rulePack)`.
- Types: `BreakEvenInput`, `BreakEvenResult`, `BreakEvenUnreachableReason`, `BreakEvenCalculationTrace`, `BreakEvenTraceStep`.
- Exact integer ceiling arithmetic via native `BigInt` with zero floating-point math.
- Type-safe discriminated union distinguishing reachable cases from zero and negative contribution unreachable cases.
- Discrete whole-unit retail revenue calculation ($\text{listPrice} \times Q_{\text{be}}$).
- Zero fixed-cost boundary handling ($Q_{\text{be}} = 0$ for positive contribution; unreachable for non-positive contribution).
- Deterministic, timestamp-free audit trace with deep immutability (`deepFreeze`).
- 21 hand-derived golden fixture cases in `fixtures/calc-engine/golden-break-even-cases.json`.
- 100% statement, branch, function, and line coverage in `packages/calc-engine`.

### What STEP-007 Explicitly Excludes

- API route handlers and server endpoints (scheduled for STEP-013).
- Database migrations, table schemas, or repository persistence (scheduled for STEP-010/011).
- Frontend UI components, break-even charts, or cards (scheduled for STEP-014).
- Sensitivity analysis (strictly deferred to STEP-008).
- AI prompt drafting or narrative memo synthesis (deferred to STEP-015).

---

## 2. Mathematical Derivations & Ceiling Algorithm

### The Mathematical Formula

Given:

- Fixed Capital Cost: $F \in \mathbb{N}_0$ (in integer minor units, e.g. cents).
- Applicable Unit Contribution: $U = R - C$ (in minor units).

The theoretical continuous break-even unit volume is:
$$Q^* = \frac{F}{U}$$

Because books are discrete commodities sold in whole units ($Q \in \mathbb{N}_0$), the minimum whole-unit break-even threshold is:
$$Q_{\text{be}} = \lceil Q^* \rceil = \left\lceil \frac{F}{U} \right\rceil$$

### Exact BigInt Rational Algorithm

Representing $U$ as an exact rational fraction $\frac{U_{\text{num}}}{U_{\text{den}}}$ (where $U_{\text{num}}, U_{\text{den}} \in \mathbb{N}^+$):
$$\frac{F}{U} = \frac{F \times U_{\text{den}}}{U_{\text{num}}}$$

Let:
$$\text{Numerator} = BigInt(F) \times BigInt(U_{\text{den}})$$
$$\text{Denominator} = BigInt(U_{\text{num}})$$

Using BigInt Euclidean division with remainder:
$$\text{quotient} = \text{Numerator} / \text{Denominator}$$
$$\text{remainder} = \text{Numerator} \% \text{Denominator}$$

The ceiling condition:

$$
Q_{\text{be}} = \begin{cases}
0, & \text{if } F = 0 \\
\text{quotient}, & \text{if } \text{remainder} = 0n \\
\text{quotient} + 1n, & \text{if } \text{remainder} > 0n
\end{cases}
$$

### Preserved Benchmark Examples & Calculations (Decision 3)

#### Example 1: Paperback Non-Zero Remainder Requiring Ceiling

- Book format: `paperback` ($14.99 list price, 200 pages).
- Gross royalty: 60% of $14.99 = 899.4 -> 899 cents ($8.99) under `round_half_even`.
- Print cost: 100 base + (200 - 24) \* 2 = 452 cents ($4.52).
- Unit contribution: $8.99 - $4.52 = $4.47 (447 cents).
- Fixed cost: $F = \$1,500.00 = 150,000$ cents.
- Division: $150,000 / 447 = 335$ with remainder $255 > 0$ ($150,000 - 335 \times 447 = 255$).
- Quotient: 335.
- Remainder: 255.
- Formula-defined threshold: $Q_{\text{be}} = 335 + 1 = 336$ units.
- Gross retail sales revenue: $\text{Revenue}_{\text{be}} = 336 \times \$14.99 = \$5,036.64$ (503,664 cents).

#### Example 2: Paperback Exact Integer Division

- Book format: `paperback` ($20.00 list price, 100 pages).
- List price: 2,000 cents ($20.00).
- Royalty: 60% of $20.00 = 1,200 cents ($12.00).
- Print cost: 100 base + (100 - 24) \* 2 = 252 cents ($2.52).
- Unit contribution: 1,200 - 252 = 948 cents ($9.48).
- Fixed cost: $F = \$9,480.00 = 948,000$ cents.
- Quotient: 1,000.
- Remainder: 0.
- Division: $948,000 / 948 = 1,000$ with remainder 0.
- Formula-defined threshold: $Q_{\text{be}} = 1,000$ units.
- Gross retail sales revenue: $\text{Revenue}_{\text{be}} = 1,000 \times \$20.00 = \$20,000.00$ (2,000,000 cents).

#### Example 3: Fractional Rational under `per_total`

- Fixed cost: $F = €5,000.00 = 500,000$ cents.
- List price: €29.99 (2999 cents), pages: 200.
- Exact royalty: $2999 / 2 = 1499.5$ cents.
- Print cost: 975 cents.
- Exact contribution: $1499.5 - 975 = 524.5 = 1049 / 2$ cents.
- $\text{Numerator} = 500,000 \times 2 = 1,000,000$.
- $\text{Denominator} = 1049$.
- $\text{quotient} = 953, \quad \text{remainder} = 303$.
- $Q_{\text{be}} = 953 + 1 = 954$ units.
- Gross retail sales revenue: $\text{Revenue}_{\text{be}} = 954 \times €29.99 = €28,610.46$.

#### Example 4: Negative Unit Contribution (Mathematically Unreachable)

- Book format: `paperback` ($5.00 list price, 300 pages).
- Gross royalty: 60% of $5.00 = 300 cents ($3.00).
- Print cost: 100 base + (300 - 24) \* 2 = 652 cents ($6.52).
- Unit contribution: $300 - 652 = -352$ cents (-$3.52 per unit).
- Result: Mathematically unreachable (`unreachableReason: 'NEGATIVE_CONTRIBUTION'`).
- Units and revenue are strictly omitted from the result.

---

### Mandatory Rounding-Mode Investigation (Decision 1)

1. **Source-Level Schema & Validation Inspection:**

   - `packages/rules/src/schema/types.ts` defines:
     - `ROUNDING_MODES = ['round_half_up', 'round_half_even', 'round_down', 'round_up']`
     - `ROUNDING_POINTS = ['per_unit', 'per_total']`
   - `packages/rules/src/schema/validator.ts` (lines 123-151) validates `rounding.mode` via `isRoundingMode` and `rounding.point` via `isRoundingPoint` as independent properties.
   - **Finding:** The architecture permits all four rounding modes with `per_total`. In particular, `round_half_up`, `round_half_even`, `round_down`, and `round_up` are completely valid and accepted by the schema and validator.

2. **Analysis of the Integer-Shift Property:**

   - For non-negative aggregate amounts ($R \ge 0, C \ge 0$) and an integer fixed cost $F \in \mathbb{Z}_{\ge 0}$, exact rational coverage is $R - C \ge F \iff R \ge C + F$.
   - When aggregate ledger components are rounded independently, the condition for rounded coverage is $\text{round}(R) - \text{round}(C) \ge F$.
   - A rounding function preserves this inequality if it satisfies the **integer-shift property** (translation invariance by integers: $\text{round}(x + F) = \text{round}(x) + F$ for integer $F$) combined with weak monotonicity:
     - `round_down` ($\lfloor x \rfloor$ for $x \ge 0$): For any integer $F \ge 0$, $\lfloor x + F \rfloor = \lfloor x \rfloor + F$. Therefore, $R \ge C + F \implies \lfloor R \rfloor \ge \lfloor C + F \rfloor = \lfloor C \rfloor + F \implies \lfloor R \rfloor - \lfloor C \rfloor \ge F$. The integer-shift property is strictly preserved.
     - `round_up` ($\lceil x \rceil$ for $x \ge 0$): For any integer $F$, $\lceil x + F \rceil = \lceil x \rceil + F$. Coverage is preserved.
     - `round_half_up` ($\lfloor x + 0.5 \rfloor$ for $x \ge 0$): $\lfloor (x + F) + 0.5 \rfloor = \lfloor (x + 0.5) + F \rfloor = \lfloor x + 0.5 \rfloor + F$. Coverage is preserved.
   - `round_half_even` is the **demonstrated exception** because tie-breaking depends on the parity of the integer part $\lfloor x \rfloor$. Adding an odd integer fixed cost $F$ flips the parity of the integer part. Consequently, exact half-integer ties round in opposite directions, breaking the integer-shift identity ($\text{round\_half\_even}(x + F) \ne \text{round\_half\_even}(x) + F$).

3. **Demonstrated Counterexample under `per_total` + `round_half_even`:**

   - Exact per-unit royalty: 2.5 minor units ($5/2$)
   - Exact per-unit cost: 1.5 minor units ($3/2$)
   - Exact unit contribution: $2.5 - 1.5 = 1.0$ ($1/1$)
   - Fixed cost: $F = 1$ minor unit (an odd integer)
   - Roadmap formula break-even volume:
     $Q_{\text{be}} = \left\lceil \frac{1}{1.0} \right\rceil = 1 \text{ unit}$
   - Multi-unit scenario aggregation under ADR-005 at $Q = 1$:
     - Exact total royalty: $2.5 \times 1 = 2.5$ -> `round_half_even(2.5)` rounds to nearest even integer = 2 minor units (rounds down).
     - Exact total cost: $1.5 \times 1 = 1.5$ -> `round_half_even(1.5)` rounds to nearest even integer = 2 minor units (rounds up).
     - Scenario aggregate net contribution: $2 - 2 = 0$ minor units.
     - Fixed cost coverage comparison: $\text{NetContribution}(1) = 0 < F = 1$. Under-covers by 1 minor unit!
   - At $Q = 2$:
     - Exact total royalty: $2.5 \times 2 = 5$ -> rounds to 5.
     - Exact total cost: $1.5 \times 2 = 3$ -> rounds to 3.
     - Scenario aggregate net contribution: $5 - 3 = 2 \ge 1$.
     - Therefore, the minimum quantity covering fixed cost in the rounded ledger is 2 units, while the formula-defined quantity is 1 unit.

4. **Corrected Rounding-Mode Conclusions & Architectural Integrity:**

   - **Do not classify `round_down` as unsafe:** `round_down` preserves the integer-shift property for non-negative amounts and integer fixed costs, and is not invalidated by the `round_half_even` counterexample.
   - **Do not recommend disallowing `round_down`:** Any proposal to disallow `round_down` without a valid independent counterexample is mathematically unjustified and rejected.
   - **Preserve schema permissiveness:** The current Rule Pack schema permits all four rounding modes with `per_total`.
   - **No silent contract changes:** Neither the Rule Pack schema, validator, ADR-005, nor the financial calculation implementation is modified.
   - **Honest uncertainty (P-07):** The documentation explicitly distinguishes the formula-defined quantity from the rounded-ledger threshold. We do not claim that every possible financial behavior has been formally proven unless the proof is actually established.

---

## 3. Boundary Conditions & Edge Cases

| Case                                 | Conditions                              | Expected Behavior                                                    |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| **Zero Fixed Cost, Positive Margin** | $F = 0, U > 0$                          | $Q_{\text{be}} = 0$, $\text{Revenue} = 0$, `reachable: true`.        |
| **Zero Fixed Cost, Negative Margin** | $F = 0, U < 0$                          | `reachable: false`, `unreachableReason: 'NEGATIVE_CONTRIBUTION'`.    |
| **Zero Fixed Cost, Zero Margin**     | $F = 0, U = 0$                          | `reachable: false`, `unreachableReason: 'ZERO_CONTRIBUTION'`.        |
| **Zero Unit Margin**                 | $F > 0, U = 0$                          | `reachable: false`, `unreachableReason: 'ZERO_CONTRIBUTION'`.        |
| **Negative Unit Margin**             | $F > 0, U < 0$                          | `reachable: false`, `unreachableReason: 'NEGATIVE_CONTRIBUTION'`.    |
| **Exact Divisibility**               | $F \pmod U = 0$                         | $Q_{\text{be}} = F / U$, `ceilingApplied: false`.                    |
| **Remainder Divisibility**           | $F \pmod U > 0$                         | $Q_{\text{be}} = \lfloor F / U \rfloor + 1$, `ceilingApplied: true`. |
| **1 Minor Unit Fixed Cost**          | $F = 1, U > 1$                          | $Q_{\text{be}} = 1$.                                                 |
| **1 Minor Unit Margin**              | $F > 0, U = 1$                          | $Q_{\text{be}} = F$.                                                 |
| **Units Overflow**                   | $Q_{\text{be}} > 2^{53} - 1$            | Throws typed `CalcOverflowError`.                                    |
| **Revenue Overflow**                 | $P \times Q_{\text{be}} > 2^{53} - 1$   | Throws typed `CalcOverflowError`.                                    |
| **Currency Mismatch**                | `fixedCost.currency !== input.currency` | Throws typed `CalcCurrencyMismatchError`.                            |

---

## 4. API Contract & Type Definitions

```typescript
export interface BreakEvenInput {
  readonly fixedCost: Money;
  readonly listPriceMinor: number;
  readonly currency: CurrencyCode | string;
  readonly format: BookFormat | string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
  readonly costVariancePercent?: string;
}

export type BreakEvenUnreachableReason = 'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION';

export type BreakEvenResult =
  | {
      readonly reachable: true;
      readonly units: number;
      readonly revenue: Money;
      readonly fixedCost: Money;
      readonly unitContributionMinor: number | null;
      readonly exactUnitContribution: Rational;
      readonly isIllustrative: true;
      readonly disclaimer: string;
      readonly trace: BreakEvenCalculationTrace;
    }
  | {
      readonly reachable: false;
      readonly unreachableReason: BreakEvenUnreachableReason;
      readonly fixedCost: Money;
      readonly unitContributionMinor: number | null;
      readonly exactUnitContribution: Rational;
      readonly isIllustrative: true;
      readonly disclaimer: string;
      readonly trace: BreakEvenCalculationTrace;
    };
```

---

## 5. Failure Modes & Troubleshooting

1. **`CalcCurrencyMismatchError`:**
   - **Trigger:** Calling `calculateBreakEven` where `fixedCost.currency` (e.g. `EUR`) differs from `input.currency` (e.g. `USD`), or where `input.currency` does not match the Rule Pack currency.
   - **Resolution:** Verify caller currency normalization before invoking the calculation engine.
2. **`CalcOverflowError`:**
   - **Trigger:** Break-even units or retail revenue exceeding `Number.MAX_SAFE_INTEGER` ($9,007,199,254,740,991$).
   - **Resolution:** Validates that user inputs do not combine extreme fixed costs with near-zero margins.
3. **`CalcInputValidationError('FIXED_COST_OUT_OF_BOUNDS')`:**
   - **Trigger:** Supplying negative fixed cost (`fixedCost.amountMinor < 0`).
   - **Resolution:** Ensure user inputs represent positive amortization targets.
