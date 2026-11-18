# @nimphy/calc-engine

`@nimphy/calc-engine` is the pure, deterministic financial calculation engine for Nimphy (Module M-02).

It encapsulates exact rational arithmetic, per-unit economics (STEP-005), multi-unit scenario totals (STEP-006), and break-even analysis (STEP-007) for book self-publishing royalties and costs across formats (`ebook`, `paperback`, `hardcover`).

---

## Architectural Principles & Guarantees

This package strictly conforms to the Nimphy Architecture Principles (Doc 03, `AGENTS.md`):

1. **Deterministic Core, Probabilistic Edge (P-01):**
   All calculations are pure mathematical functions with zero I/O, zero network access, zero filesystem calls, zero system clock dependencies (`Date.now()`), zero randomness (`Math.random()`), and zero AI imports. Given identical inputs, outputs are bit-for-bit identical across all machines and runtimes.
2. **Zero Floating-Point Financial Arithmetic (AGENTS.md §4, ADR-005):**
   Floating-point types (`number`) are forbidden for monetary arithmetic. Minor units (cents, pence, yen) are represented as integers paired with ISO-4217 currencies via `@nimphy/domain`'s `Money` value object. Intermediate fractions and rates are handled via exact `Rational` arithmetic using native `BigInt`.
3. **Strict Inward Dependency Arrow (AGENTS.md §2, Doc 03 §3):**
   `@nimphy/calc-engine` depends exclusively on `@nimphy/domain`. It imports no web frameworks, no database drivers, no external utility libraries, and no AI services.
4. **Traceability (P-03):**
   Every calculation produces a structured, deterministic `CalculationTrace` or `ScenarioCalculationTrace` recording all intermediate rational values, unrounded fractions, rounding operations, and rule pack references, enabling full auditability and exact replay without nondeterministic metadata (no timestamps, no random IDs).
5. **Immutability for Evidence (P-04):**
   All returned results, traces, steps, and lists are deeply frozen (`Object.freeze`) and immutable. Inputs are never mutated.
6. **Honest Uncertainty (P-07, FR-006):**
   All scenario outputs explicitly carry `isIllustrative: true` and the standard disclaimer `SCENARIO_DISCLAIMER_TEXT` to prevent users or downstream systems from treating projections as guarantees.
7. **Exhaustive Testability (P-09):**
   Requires 100% branch, statement, function, and line test coverage, validated via deterministic property-based tests (PRNG), golden fixtures, regression tests, and canonical JSON replay tests.

---

## Mathematical Foundations: Exact `Rational` Arithmetic

The `Rational` class (`src/math/rational.ts`) represents rational numbers $\frac{p}{q}$ using native `bigint` for numerator and denominator:

- **Canonical Normalization:** Every rational is automatically reduced to lowest terms via Euclidean Greatest Common Divisor ($\gcd(|p|, q)$) upon construction. The denominator is strictly positive ($q > 0$).
- **Division by Zero Protection:** Attempting to construct $\frac{p}{0}$ throws a `CalcEngineError`.
- **Pure Arithmetic:** Exact addition, subtraction, multiplication, and division:
  $$\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}, \quad \frac{a}{b} \times \frac{c}{d} = \frac{ac}{bd}$$
- **Rounding Modes (ADR-005):**
  - `round_half_up`: Standard commercial rounding (round half away from zero).
  - `round_half_even`: Banker's rounding (round half to nearest even integer).
  - `round_down`: Truncation toward zero (floor for positive values).
  - `round_up`: Ceiling away from zero.
- **Conversion to Minor Units:** Converts exact rational minor units into safe integer minor units according to the Rule Pack's declared rounding mode:
  $$\text{round}(p/q, \text{mode}) \implies \text{BigInt} \implies \text{Number (minor units)}$$

---

## Accepted ADR-005 Aggregation Contract

Multi-unit scenario aggregation in STEP-006 adheres strictly to the accepted ADR-005 aggregation contract.

### A. `per_total` Rounding Policy

When the Rule Pack declares `rounding.point === 'per_total'`:

Per-unit rounding is explicitly deferred. STEP-005 preserves exact rational amounts:

- `exactGrossRoyalty`
- `exactApplicableCost`
- `exactNetContribution`

For quantity $Q$ units:

1. Multiply exact per-unit components by integer quantity $Q$:
   $$\text{exactTotalRoyalty} = \text{exactGrossRoyalty} \times Q$$
   $$\text{exactTotalCost} = \text{exactApplicableCostVaried} \times Q$$
2. Round aggregate royalty exactly once using the declared rounding mode:
   $$\text{roundedTotalRoyalty} = \text{round}(\text{exactTotalRoyalty}, \text{mode})$$
3. Round aggregate cost exactly once using the declared rounding mode:
   $$\text{roundedTotalCost} = \text{round}(\text{exactTotalCost}, \text{mode})$$
4. Derive aggregate net contribution by subtraction after rounding:
   $$\text{totalContribution} = \text{roundedTotalRoyalty} - \text{roundedTotalCost}$$

**Key Rules:**

- Never round per-unit values first under `per_total`.
- Never compute aggregate contribution by rounding exact net contribution directly; aggregate royalty and cost must be rounded separately before subtraction.

### B. `per_unit` Rounding Policy

When the Rule Pack declares `rounding.point === 'per_unit'`:

STEP-005 already performs rounding to integer minor units per unit:

- `grossRoyalty` ($R_{\text{unit}} \in \mathbb{Z}$)
- `applicableCost` ($C_{\text{unit}} \in \mathbb{Z}$)

For quantity $Q$ units:

1. Multiply already-rounded integer minor-unit amounts by $Q$:
   $$\text{totalRoyalty} = R_{\text{unit}} \times Q$$
   $$\text{totalCost} = C_{\text{unit}} \times Q$$
2. Derive aggregate net contribution by subtraction:
   $$\text{totalContribution} = \text{totalRoyalty} - \text{totalCost}$$

**Key Rules:**

- Do not apply secondary rounding to values already rounded per unit.
- Preserve exact rational totals in the trace for comparison and auditability.

---

## Scenario Modeling & Cost Variance (FR-006)

In accordance with FR-006, each scenario (low, base, high) is parameterized by:

- `units`: Units sold (non-negative safe integer).
- `listPriceMinor`: Retail list price in minor units (within Rule Pack bounds).
- `costVariancePercent`: Exact decimal string representing percentage variance on Rule Pack per-unit production/distribution cost ($\ge -100\%$, e.g. `"0"`, `"15"`, `"-20"`, `"-100"`). JSON numeric values are rejected; omitted values default to `"0"`.

### Cost Variance Multiplier Formula

Cost variance scales the Rule Pack's exact applicable production/distribution cost:

$$M = \frac{100 + \text{costVariancePercent}}{100} = 1 + \frac{\text{costVariancePercent}}{100}$$
$$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$

- `costVariancePercent: "0"` $\implies M = 1$ (base case: exact Rule Pack cost).
- `costVariancePercent: "15"` $\implies M = 1.15$ (costs increase by 15%, reducing net contribution).
- `costVariancePercent: "-20"` $\implies M = 0.80$ (costs decrease by 20%, increasing net contribution).
- `costVariancePercent: "-100"` $\implies M = 0$ (costs eliminated).
- `costVariancePercent < -100%` (e.g. `"-100.01"`) is rejected with `CalcInputValidationError`.

### Scenario Independence & Ordering

Each scenario in a triad (`low`, `base`, `high`) is calculated independently from its own supplied parameters. No artificial multipliers are applied to derive one scenario from another.

When scenario parameters are ordered according to their documented economic directions:

- Units: $\text{low} \le \text{base} \le \text{high}$
- Price: $\text{low} \le \text{base} \le \text{high}$
- Cost Variance: $\text{low} \ge \text{base} \ge \text{high}$ (lower variance means lower costs)

The engine verifies the monotonic ordering property:
$$\text{low.netContribution} \le \text{base.netContribution} \le \text{high.netContribution}$$

If user inputs are unordered, the engine reports the results faithfully without silently reordering them.

---

## Break-Even Economics Engine (STEP-007)

The break-even calculation engine implements FR-007 to determine the whole-unit sales threshold and associated gross retail sales revenue required to amortize a specified fixed cost (e.g., editing, cover design, illustration).

### Exact Roadmap Ceiling Formula

Break-even volume is calculated as the mathematical ceiling of fixed cost divided by the applicable exact unit contribution, implemented without floating-point arithmetic:

$$Q_{\text{be}} = \left\lceil \frac{\text{FixedCost}}{\text{ExactUnitContribution}} \right\rceil$$

Using native `BigInt` integer division and remainder on exact rational fractions:

$$\text{Numerator} = \text{FixedCostMinor} \times U_{\text{denominator}}$$
$$\text{Denominator} = U_{\text{numerator}}$$
$$\text{quotient} = \lfloor \text{Numerator} / \text{Denominator} \rfloor, \quad \text{remainder} = \text{Numerator} \pmod{\text{Denominator}}$$

- **Exact Division ($\text{remainder} = 0$):** $Q_{\text{be}} = \text{quotient}$.
- **Non-Zero Remainder ($\text{remainder} > 0$):** $Q_{\text{be}} = \text{quotient} + 1$.

Never uses `Math.ceil()` or floating-point ratios.

### Break-Even Revenue Definition

Break-even revenue is defined as:

$$\text{Revenue}_{\text{be}} = \text{listPriceMinor} \times Q_{\text{be}}$$

Its precise semantic meaning is:

**Gross retail sales revenue at the whole-unit, formula-defined break-even threshold.**

This is gross retail sales revenue, not the author's royalty income, publisher proceeds, or net profit. This definition maintains strict consistency with the existing scenario aggregation engine's revenue calculation (`units * listPriceMinor`). Both $Q_{\text{be}}$ and $\text{Revenue}_{\text{be}}$ are validated against JavaScript safe integer boundaries (`Number.MAX_SAFE_INTEGER`).

### Rounding Policy Interaction (ADR-005)

The engine distinguishes:

- The **formula-defined break-even quantity** required by the roadmap ($Q_{\text{be}} = \lceil \text{FixedCost} / \text{ExactUnitContribution} \rceil$).
- The **minimum quantity that happens to cover fixed cost** under independently rounded aggregate ledger components.

The formula-defined quantity is not claimed to always be the minimum rounded-ledger threshold.

- **`per_unit` Rounding Policy:** Uses already-rounded per-unit royalty $R_{\text{unit}}$ and rounded varied unit cost $C_{\text{unit}}$. Unit contribution is the integer minor unit $U_{\text{unit}} = R_{\text{unit}} - C_{\text{unit}}$. Since scenario total contribution is $Q \times U_{\text{unit}}$, the ceiling formula guarantees that total contribution at $Q_{\text{be}}$ covers fixed cost and $Q_{\text{be}} - 1$ strictly fails to cover it.
- **`per_total` Rounding Policy:** Preserves unrounded rational unit contribution $U_{\text{exact}} = R_{\text{exact}} - C_{\text{varied}}$ and evaluates the exact rational ceiling $\lceil \text{FixedCost} / U_{\text{exact}} \rceil$.
  - **Interaction with Independent Aggregate Ledger Rounding:** Under ADR-005, the scenario ledger independently rounds aggregate royalties and aggregate costs.
  - _Integer-Shift Property & Rounding Modes:_ For non-negative aggregate amounts ($R, C \ge 0$) and integer fixed costs $F \in \mathbb{Z}_{\ge 0}$, the rounding modes `round_half_up`, `round_down`, and `round_up` preserve the integer-shift property ($\text{round}(x + F) = \text{round}(x) + F$), guaranteeing that $\text{round}(R) - \text{round}(C) \ge F$.
  - _Demonstrated `round_half_even` Exception:_ `round_half_even` is the demonstrated exception because tie-breaking depends on the parity of the integer part, which flips under odd integer fixed costs.
  - _Counterexample:_ Under `round_half_even` with exact royalty = 2.5, exact cost = 1.5, exact contribution = 1.0, and fixed cost = 1: the formula yields $Q_{\text{be}} = \lceil 1 / 1 \rceil = 1$. However, at $Q = 1$, aggregate royalty rounds to 2 and aggregate cost rounds to 2, yielding rounded aggregate contribution of 0 (under-covering fixed cost 1). At $Q = 2$, rounded contribution is 2 (covering fixed cost 1).
  - _Architectural Boundaries:_ While the Rule Pack schema permits all four rounding modes with `per_total`, `round_down` is not classified as an unsafe mode based on this counterexample, nor is disallowing it recommended without a valid independent counterexample. Universal rounded-ledger coverage is not guaranteed across all permitted configurations unless formally established.

### Unreachable Break-Even Contracts

When unit contribution is zero or negative, the break-even threshold is mathematically unreachable:

- **Zero Contribution ($U = 0$):** Sales generate zero net margin; fixed costs can never be amortized. Result returns `reachable: false` with `unreachableReason: 'ZERO_CONTRIBUTION'`.
- **Negative Contribution ($U < 0$):** Each sale generates a financial loss; higher unit volume increases total loss. Result returns `reachable: false` with `unreachableReason: 'NEGATIVE_CONTRIBUTION'`.
- **Zero Fixed Cost Boundary ($F = 0$):**
  - If $U > 0$: $Q_{\text{be}} = 0$ units, $\text{Revenue}_{\text{be}} = \$0.00$, `reachable: true`.
  - If $U \le 0$: Remains `reachable: false`. A zero or negative unit contribution is never labelled reachable merely because fixed cost is zero.

The API model is a discriminated union on `reachable`. When `reachable === false`, `units` and `revenue` are omitted to prevent misleading zero-unit or fabricated outputs.

---

## Public API Reference

```typescript
import {
  // Break-even economics calculation (STEP-007)
  calculateBreakEven,

  // Scenario totals calculation (STEP-006)
  calculateSingleScenario,
  calculateTriadScenarios,
  evaluateScenarioOrdering,

  // Per-unit economics calculation (STEP-005)
  calculatePerUnitEconomics,

  // Exact rational arithmetic
  Rational,

  // Calculation errors
  CalcEngineError,
  CalcInputValidationError,
  CalcCurrencyMismatchError,
  CalcFormatMismatchError,
  CalcOverflowError,
} from '@nimphy/calc-engine';
```

### 1. `calculateBreakEven(input, rulePack)`

Calculates deterministic break-even units and revenue for a specified fixed cost.

```typescript
import { Money } from '@nimphy/domain';

const result = calculateBreakEven(
  {
    fixedCost: Money.of(250000, 'USD'), // $2,500.00 fixed production cost
    listPriceMinor: 1499, // $14.99 list price
    currency: 'USD',
    format: 'paperback',
    pages: 200,
    costVariancePercent: '0',
  },
  paperbackRulePack,
);

if (result.reachable) {
  console.log(result.units); // 560
  console.log(result.revenue.toFormattedString()); // "$8394.40"
  console.log(result.unitContributionMinor); // 447
} else {
  console.log(result.unreachableReason); // 'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION'
}
```

### 2. `calculateSingleScenario(input, rulePack)`

Calculates multi-unit totals and economics for an individual scenario.

```typescript
const result = calculateSingleScenario(
  {
    scenarioName: 'base',
    units: 500,
    listPriceMinor: 999, // $9.99
    costVariancePercent: '0',
    currency: 'USD',
    format: 'paperback',
    pages: 200,
  },
  paperbackRulePack,
);

console.log(result.units); // 500
console.log(result.revenue.amountMinor); // 499500 ($4,995.00)
console.log(result.grossRoyalty.amountMinor); // 299500 ($2,995.00)
console.log(result.applicableCost.amountMinor); // 226000 ($2,260.00)
console.log(result.netContribution.amountMinor); // 73500 ($735.00)
console.log(result.isIllustrative); // true
console.log(result.disclaimer); // 'Illustrative scenarios for planning purposes only; not guaranteed financial outcomes.'
```

### 3. `calculateTriadScenarios(input, rulePack)`

Calculates the complete triad of low, base, and high scenarios.

```typescript
const triad = calculateTriadScenarios(
  {
    scenarios: {
      low: { units: 100, listPriceMinor: 799, costVariancePercent: '10' },
      base: { units: 500, listPriceMinor: 999, costVariancePercent: '0' },
      high: { units: 2500, listPriceMinor: 1299, costVariancePercent: '-10' },
    },
    currency: 'USD',
    format: 'paperback',
    pages: 200,
  },
  paperbackRulePack,
);

console.log(triad.ordering.areTotalsMonotonicallyOrdered); // true
console.log(triad.totals.base.netContribution.amountMinor); // 73500
console.log(triad.disclaimer); // SCENARIO_DISCLAIMER_TEXT
```

### 4. `calculatePerUnitEconomics(input, rulePack)`

Calculates per-unit economics (STEP-005) for a single copy.

```typescript
const perUnit = calculatePerUnitEconomics(
  {
    listPriceMinor: 499, // $4.99
    currency: 'USD',
    format: 'ebook',
    fileSizeMb: '1.5',
  },
  ebookRulePack,
);
```

---

## Error Handling

All calculation errors inherit from `CalcEngineError` (which extends `@nimphy/domain`'s `DomainError`):

| Error Class                 | Error Code               | Description                                                                                                                                                    |
| --------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CalcInputValidationError`  | `CALC_INPUT_INVALID`     | Invalid units, negative price, out-of-bounds price/page count, invalid cost variance ($< -100\%$, non-decimal string, NaN), or missing required format fields. |
| `CalcCurrencyMismatchError` | `CALC_CURRENCY_MISMATCH` | Input currency does not match Rule Pack currency.                                                                                                              |
| `CalcFormatMismatchError`   | `CALC_FORMAT_MISMATCH`   | Input book format does not match Rule Pack format.                                                                                                             |
| `CalcOverflowError`         | `CALC_OVERFLOW`          | Calculations exceed JavaScript safe integer bounds (`Number.MAX_SAFE_INTEGER`).                                                                                |
