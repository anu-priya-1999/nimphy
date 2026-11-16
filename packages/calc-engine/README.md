# @nimphy/calc-engine

`@nimphy/calc-engine` is the pure, deterministic financial calculation engine for Nimphy (Module M-02).

It encapsulates exact rational arithmetic, per-unit economics (STEP-005), and multi-unit scenario totals (STEP-006) for book self-publishing royalties and costs across formats (`ebook`, `paperback`, `hardcover`).

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

## Public API Reference

```typescript
import {
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

### 1. `calculateSingleScenario(input, rulePack)`

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

### 2. `calculateTriadScenarios(input, rulePack)`

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

### 3. `calculatePerUnitEconomics(input, rulePack)`

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
