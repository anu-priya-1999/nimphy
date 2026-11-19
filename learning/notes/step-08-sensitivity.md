# Engineering Notes — STEP-008: Deterministic Sensitivity Analysis Engine

- **Author:** Nimphy Engineering Agent
- **Date:** 2026-11-18
- **Milestone:** STEP-008 (Engine: Sensitivity Analysis)
- **Status:** Complete & Fully Verified

---

## 1. Architectural Scope & Core Invariants

STEP-008 delivers the pure deterministic sensitivity analysis engine in `packages/calc-engine/src/sensitivity/` per `docs/architecture/17-implementation-roadmap.md` and functional requirement FR-008.

### Delivered Capabilities

- Pure function `calculateSensitivity(input, rulePack)`.
- Types: `SensitivityAnalysisInput`, `SensitivityDriverConfig`, `SensitivityAnalysisResult`, `SensitivityDriverResult`, `SensitivityCalculationTrace`.
- Declared driver allow-list: `units`, `listPriceMinor`, `costVariancePercent`.
- One-at-a-time (OAT) lower ($D_i^-$) and upper ($D_i^+$) perturbations.
- Primary metric: total scenario net contribution in integer minor units.
- Absolute impact score: $I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$.
- Deterministic ranking: descending by impact score; secondary tie-break by UTF-16 code-point order (`costVariancePercent` < `listPriceMinor` < `units`).
- Exact decimal arithmetic for cost variance via `Rational`.
- Deterministic canonical audit trace (zero timestamps, zero random UUIDs).
- Full immutability via recursive `deepFreeze`.
- 21 hand-derived golden fixture cases across all 4 synthetic Rule Packs.
- 100% statement, branch, function, and line coverage across `packages/calc-engine`.

### Excluded Capabilities (Out of Scope for STEP-008)

- Multi-parameter simultaneous perturbations or cross-elasticities.
- Unapproved drivers (currency, format, marketplace, page count, file size).
- Database migrations or entity persistence (deferred to STEP-010/011).
- API HTTP routes (deferred to STEP-013).
- Frontend UI components or charts (deferred to STEP-014).
- AI prompt generation or narrative memos (deferred to STEP-015).

---

## 2. Sensitivity Drivers & Input Specifications

| Driver                | Type         | Representation                           | Constraints                                           |
| --------------------- | ------------ | ---------------------------------------- | ----------------------------------------------------- |
| `units`               | Safe Integer | Volume in whole copies                   | $> 0$, $\le \text{MAX\_SAFE\_INTEGER}$                |
| `listPriceMinor`      | Safe Integer | Minor currency units (e.g. cents)        | $> 0$, $\le \text{MAX\_SAFE\_INTEGER}$                |
| `costVariancePercent` | String       | Percentage points (e.g. `"10"`, `"5.5"`) | Valid positive decimal string ($> 0$, $\le 50$ chars) |

### Driver Allow-List Validation

```typescript
export const SENSITIVITY_DRIVERS = ['units', 'listPriceMinor', 'costVariancePercent'] as const;

export type SensitivityDriver = (typeof SENSITIVITY_DRIVERS)[number];

export function isSensitivityDriver(value: unknown): value is SensitivityDriver {
  return typeof value === 'string' && SENSITIVITY_DRIVERS.includes(value as SensitivityDriver);
}
```

---

## 3. Mathematical Model & Ranking Formulas

### Perturbation Formulas

For each driver $D_i$ with perturbation $\Delta_i$:

- **Units:**
  $$Q_i^- = Q_{\text{base}} - \Delta_{\text{units}}, \quad Q_i^+ = Q_{\text{base}} + \Delta_{\text{units}}$$
- **List Price:**
  $$P_i^- = P_{\text{base}} - \Delta_{\text{price}}, \quad P_i^+ = P_{\text{base}} + \Delta_{\text{price}}$$
- **Cost Variance:**
  $$V_i^- = V_{\text{base}} - \Delta_{\text{variance}}, \quad V_i^+ = V_{\text{base}} + \Delta_{\text{variance}}$$
  _(evaluated via exact `Rational` fraction arithmetic)_

### Delta & Impact Score Formulas

Given baseline scenario net contribution $C_{\text{base}}$ and perturbed contributions $C_i^-, C_i^+$:

$$\Delta_i^- = C_i^- - C_{\text{base}}$$
$$\Delta_i^+ = C_i^+ - C_{\text{base}}$$
$$I_i = \max(|\Delta_i^-|, |\Delta_i^+|)$$

### Deterministic Tie-Breaking Rule

When $I_a = I_b$:
$$\text{rankOrder}(a, b) = a.\text{driver} < b.\text{driver} ? -1 : 1$$

Code-point values:

1. `'costVariancePercent'`: `0x0063` (c)
2. `'listPriceMinor'`: `0x006C` (l)
3. `'units'`: `0x0075` (u)

---

## 4. Boundary Error Matrix

| Condition                       | Failure Trigger                        | Error Class                |
| ------------------------------- | -------------------------------------- | -------------------------- |
| Empty drivers array             | `drivers.length === 0`                 | `CalcInputValidationError` |
| Unknown driver name             | `!isSensitivityDriver(d.driver)`       | `CalcInputValidationError` |
| Duplicate driver                | Seen in set                            | `CalcInputValidationError` |
| Non-positive perturbation       | $\le 0$ or NaN                         | `CalcInputValidationError` |
| Non-safe integer                | `!Number.isSafeInteger(p)`             | `CalcInputValidationError` |
| Invalid decimal string          | Regex / Rational parse fail            | `CalcInputValidationError` |
| Excessively long decimal string | `p.length > 50`                        | `CalcInputValidationError` |
| Lower units $< 0$               | $Q_i^- < 0$                            | `CalcInputValidationError` |
| Lower/upper price out of bounds | $< \text{floor}$ or $> \text{ceiling}$ | `CalcInputValidationError` |
| Lower cost variance $< -100\%$  | $V_i^- < -100$                         | `CalcInputValidationError` |
| Safe integer overflow           | $> \text{MAX\_SAFE\_INTEGER}$          | `CalcOverflowError`        |

---

## 5. Canonical Audit Trace Architecture

The trace structure records every intermediate step without timestamps or random identifiers:

```typescript
export interface SensitivityCalculationTrace {
  readonly engineVersion: string;
  readonly rulePack: { readonly rulePackId: string; readonly contentHash: string };
  readonly baselineSummary: {
    readonly scenarioName: ScenarioName;
    readonly units: number;
    readonly listPriceMinor: number;
    readonly costVariancePercent: string;
    readonly revenueMinor: number;
    readonly grossRoyaltyMinor: number;
    readonly applicableCostMinor: number;
    readonly netContributionMinor: number;
  };
  readonly steps: readonly SensitivityTraceStep[];
  readonly rankedDrivers: readonly SensitivityTraceRankEntry[];
}
```
