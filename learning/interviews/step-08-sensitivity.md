# Technical Interview Preparation — STEP-008: Deterministic Sensitivity Analysis Engine

This document provides senior-level engineering and financial explanations of the architecture, mathematical contracts, and implementation decisions in Nimphy STEP-008.

---

## 1. Sensitivity Analysis in Commercial Publishing & Capital Underwriting

### Q: What is sensitivity analysis in capital underwriting, and why is One-at-a-Time (OAT) perturbation chosen over Monte Carlo simulation for Nimphy's deterministic core?

**A:** Sensitivity analysis is a financial modeling technique that determines how different values of an independent input variable impact a specific dependent target variable under a given set of assumptions. In book publishing and creative underwriting:

- Publishers commit upfront capital (editing, illustration, design, marketing) based on forecast scenarios.
- The project's return is vulnerable to fluctuations in retail pricing, customer demand (sales volume), and variable production cost shocks (inflation in paper prices, supply chain shifts).
- Sensitivity analysis identifies which business assumptions exert the greatest leverage or risk on financial viability.

**Why One-at-a-Time (OAT) over Monte Carlo Simulation:**

1. **Determinism and Auditability (P-01, P-03):** Monte Carlo simulation relies on pseudo-random sampling from assumed probability distributions (normal, log-normal, triangular). In an audit or legal dispute, a probabilistic simulation is non-reproducible unless seeded, and its results are non-deterministic across platforms. In contrast, OAT evaluates explicit, deterministic perturbations ($\pm \Delta$) with zero randomness.
2. **Attribution Transparency:** When multiple parameters vary simultaneously, isolating the exact marginal effect of a single driver requires complex multivariate decomposition (such as Sobol indices or Shapley values). OAT isolates the exact partial effect $\frac{\partial \text{Contribution}}{\partial D_i}$ evaluated at the baseline point, providing unambiguous attribution to authors and acquisition editors.
3. **Computational Efficiency & Zero-I/O Simplicity (P-02):** Monte Carlo requires tens of thousands of scenario evaluations per run. OAT evaluates exactly $2k + 1$ scenarios (where $k$ is the number of declared drivers; $k \le 3$ in Nimphy). For $k = 3$, exactly 7 scenario evaluations occur in milliseconds with zero memory overhead or background worker requirements.

---

## 2. Sensitivity Drivers and Domain Representations

### Q: Why are sensitivity drivers restricted strictly to `units`, `listPriceMinor`, and `costVariancePercent`, and how are their perturbations represented?

**A:** In accordance with FR-006 and FR-008, scenario planning in Nimphy is parameterized by the triplet of variables that define operational scenario variance:

1. `units`: Sales volume.
2. `listPriceMinor`: Retail list price in minor currency units.
3. `costVariancePercent`: Percentage variance applied to the Rule Pack's variable print/manufacturing costs.

Other attributes (such as book format, page count, file size, marketplace, and currency) represent **structural physical specifications** or **contractual parameters**, not continuous sensitivity drivers. Changing a page count alters the physical book dimensions; changing currency alters the denomination. Allowing arbitrary structural variables into sensitivity analysis would violate the scenario boundary and conflate product redesign with market sensitivity.

**Perturbation Representations:**

- `units`: Positive safe integer (e.g. `100` units). Units are discrete count values; fractional books do not exist.
- `listPriceMinor`: Positive safe integer in minor currency units (e.g. `200` represents \$2.00). Avoids floating-point cents.
- `costVariancePercent`: Non-empty exact decimal string (e.g. `"10"`, `"5.5"` percentage points). Represents percentage points added/subtracted to/from the baseline cost variance.

---

## 3. The Absolute Impact Score and Primary Metric

### Q: Why is total scenario net contribution used as the primary ranking metric instead of retail revenue, and how is the impact score defined?

**A:**

- **Retail Revenue ($P \times Q$):** Retail revenue measures gross consumer spending. However, in publishing, the publisher/author collects only a platform royalty (e.g. 60% or 70%), from which print and distribution costs must be deducted. An increase in retail price might significantly increase gross sales revenue while having a muted effect on net cash flow if platform tier rules or print penalties apply.
- **Net Contribution ($\text{Royalty} - \text{Cost}$):** Net contribution represents the actual cash retained to cover fixed overhead and generate operating profit. A capital underwriter or commercial author makes solvency and investment decisions based on net cash flow, not vanity top-line revenue.

**Impact Score Definition:**
For each driver $D_i$:

1. Lower delta: $\Delta_i^- = \text{Contribution}_i^- - \text{Contribution}_{\text{base}}$
2. Upper delta: $\Delta_i^+ = \text{Contribution}_i^+ - \text{Contribution}_{\text{base}}$
3. Impact score:
   $$I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$$

This definition captures the maximum exposure (either upside opportunity or downside risk) in minor currency units under the specified perturbation $\Delta_i$. Because non-linearities (such as cost floors, delivery fees, or percentage royalty thresholds) can cause asymmetric responses, taking the maximum of the absolute upper and lower deviations ensures the worst-case / best-case financial exposure is fully captured.

---

## 4. Deterministic Tie-Breaking Without Locale Dependence

### Q: How does the engine resolve ties when two drivers produce identical impact scores, and why is UTF-16 code-point sorting mandatory?

**A:** If two drivers produce identical impact scores (for example, if both list price and units perturbations result in an impact score of exactly \$500.00), the engine must sort them deterministically.

**Why standard locale sorting (`localeCompare`) is forbidden:**

- `String.prototype.localeCompare()` depends on the host operating system's active locale and ICU library version. A calculation executed on an English (US) server could sort differently than one executed on a Swedish or German system (e.g., handling of accents, casefolding, or collation rules).
- This violates Principle P-01 (deterministic core) and P-03 (traceability).

**The Deterministic Solution:**
Drivers are sorted using direct JavaScript relational operators (`<` and `>`), which compare Unicode UTF-16 code units:

```typescript
rankedDrivers.sort((a, b) => {
  const diff = b.impactScore.amountMinor - a.impactScore.amountMinor;
  if (diff !== 0) {
    return diff;
  }
  return a.driver < b.driver ? -1 : 1;
});
```

Because duplicate drivers are rejected during input validation, $a.\text{driver} = b.\text{driver}$ never occurs during the sort. The resulting tie-break order is strictly:

1. `'costVariancePercent'` (`0x0063`)
2. `'listPriceMinor'` (`0x006C`)
3. `'units'` (`0x0075`)

This ordering is 100% deterministic, immutable, and identical across all Node.js runtimes, operating systems, and architectures.

---

## 5. Strict Boundary Enforcement versus Silent Clamping

### Q: If a lower perturbation produces negative units or a price below the Rule Pack minimum, why does the engine fail explicitly rather than silently clamping to the boundary?

**A:** Silent clamping is a dangerous anti-pattern in financial engineering:

1. **Distorted Ranking:** If an author sets baseline units to 100 and tests a perturbation of 200 units, the lower perturbation would be $-100$ units. If clamped to 0 units, the lower scenario tests a 100-unit drop, not a 200-unit drop. The reported impact score would be artificially halved, leading to an invalid sensitivity ranking relative to other drivers whose perturbations were evaluated at their full requested size.
2. **False Sense of Security:** In financial underwriting, requesting a sensitivity range that exceeds operational viability indicates that the model assumptions or perturbation bounds are invalid for that business case. Silent clamping masks this error from the user.
3. **Fail-Closed Contract (P-05):** In accordance with Nimphy's core principles, calculations verify at the boundary and fail closed. If a perturbed scenario is mathematically or contractually invalid, the engine throws a typed `CalcInputValidationError`.

---

## 6. Exact Rational Arithmetic for Cost Variance

### Q: Why is cost variance perturbation calculated using exact `Rational` fractions rather than standard JavaScript floating-point addition?

**A:** Cost variance is expressed as a percentage string (e.g., `"10"` or `"7.5"`). In JavaScript:
$$0.1 + 0.2 = 0.30000000000000004$$
If baseline cost variance is `"5.1"` and perturbation is `"0.2"`, binary floating-point addition could evaluate to `5.299999999999999`.

When converted back to a string or passed into downstream financial formulas, this floating-point dust propagates into printing cost calculations, leading to unexpected 1-cent discrepancies or failing golden fixture assertions.

In Nimphy:

- The perturbation string is parsed into an exact `Rational` fraction (e.g., $2/10$).
- Baseline variance is parsed into a `Rational` fraction (e.g., $51/10$).
- Addition and subtraction are performed with BigInt cross-multiplication:
  $$\frac{51}{10} + \frac{2}{10} = \frac{53}{10}$$
- The result is serialized to a clean, normalized decimal string (`"5.3"`) with zero floating-point imprecision.

---

## 7. Verification Strategy & Analytic Sign Invariants

### Q: How do analytic sign checks verify calculation correctness without relying on circular implementation logic?

**A:** Analytic sign checks evaluate fundamental economic invariants that must hold for any rational economic model:

1. **Price Monotonicity:** Holding units and costs constant, an increase in retail price must strictly increase gross royalty and net contribution ($\frac{\partial \text{Contribution}}{\partial P} > 0$).
2. **Cost Monotonicity:** Holding units and price constant, an increase in manufacturing cost variance must decrease or leave flat net contribution ($\frac{\partial \text{Contribution}}{\partial C} \le 0$).
3. **Volume Monotonicity:** When unit contribution is positive ($U > 0$), an increase in units sold must strictly increase total net contribution ($\frac{\partial \text{Contribution}}{\partial Q} \ge 0$).

These checks verify that the perturbation engine correctly links lower/upper scenarios and that deltas exhibit the correct algebraic signs regardless of specific Rule Pack constants.
