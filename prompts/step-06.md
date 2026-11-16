# Canonical Prompt Archive — STEP-006: Engine: Scenarios and Totals

This document archives the official prompt instructions provided by the repository owner for the authorization and implementation of STEP-006.

---

## 1. Official Step Authorization & Scope Directive

```markdown
# NIMPHY — STEP-006 IMPLEMENTATION

## Engine: Scenarios and Totals

You are working in the Nimphy monorepo:
`C:\Users\HP\Desktop\Projects\nimphy`
GitHub repository: `anu-priya-1999/nimphy`

Your task is to implement STEP-006 — Engine: scenarios and totals, following the repository's actual architecture, roadmap, accepted owner decisions and engineering standards.
This step is explicitly authorized by the repository owner.
Do not skip analysis, invent product requirements, weaken existing guarantees, or expand the scope.

### 1. Mandatory source-of-truth review

1. AGENTS.md
2. docs/DESIGN.md
3. docs/architecture/02-product-scope-and-requirements.md
4. docs/architecture/03-architecture-principles.md
5. docs/architecture/05-component-responsibilities.md
6. docs/architecture/12-testing-and-ai-evaluation.md
7. docs/architecture/17-implementation-roadmap.md
8. docs/architecture/18-architecture-decision-records.md
9. docs/architecture/22-definition-of-done.md
10. learning/implementation/step-05-per-unit-economics.md
11. learning/notes/step-05-per-unit-economics.md
12. packages/calc-engine/README.md

### 2. STEP-006 official scope

The authoritative roadmap entry is:
`docs/architecture/17-implementation-roadmap.md`

STEP-006 is:
**Engine: scenarios and totals**

Official scope:

- Low/base/high totals.
- Scenario parameter validation.
- Scenario ordering properties.
- Golden and property tests.
- Determinism test must pass.

Dependency: STEP-005.
The relevant product requirement is FR-006 in docs/architecture/02-product-scope-and-requirements.md.
FR-006 requires low/base/high scenarios defined by explicit user-editable parameters:

- Units sold.
- Price.
- Cost variance.
  Scenario parameters must be stored with the run and scenarios must be labelled illustrative.
  Do not implement STEP-007 or STEP-008 in this task.

### 3. Critical financial contract: accepted ADR-005

ADR-005 was formally accepted by the repository owner on 2026-11-12.
You MUST implement the total-level aggregation contract exactly as specified.

A. per_total rounding point:
For a per-unit result whose Rule Pack declares:
`rounding.point === 'per_total'`
STEP-005 preserves exact rational amounts:

- exactGrossRoyalty
- exactApplicableCost
- exactNetContribution
  The per-unit Money fields whose rounding has been deferred remain null.
  STEP-006 MUST NOT substitute null per-unit Money values, or partially available cost Money values, for the authoritative exact rational amounts.

For quantity Q, calculate:
exactTotalRoyalty = exactPerUnitRoyalty _ Q
exactTotalCost = exactPerUnitCost _ Q
roundedTotalRoyalty = round(exactTotalRoyalty, rulePack.rounding.mode)
roundedTotalCost = round(exactTotalCost, rulePack.rounding.mode)
totalContribution = roundedTotalRoyalty - roundedTotalCost

Requirements:

1. Aggregate exact royalty and exact cost independently.
2. Multiply the exact rational components by quantity.
3. Round aggregate royalty exactly once.
4. Round aggregate cost exactly once.
5. Derive total contribution by subtraction after rounding.
6. Use the exact Rational implementation from STEP-005.
7. Use the Rule Pack's declared rounding mode.
8. Never round each unit first under per_total.
9. Never calculate aggregate contribution by rounding exact net contribution as a substitute for the separately rounded components.

B. per_unit rounding point:
For rounding.point === 'per_unit':
STEP-005 already performs the required per-unit rounding.
The total calculation must preserve that policy:

- Use the already-rounded per-unit royalty.
- Use the already-rounded per-unit applicable cost.
- Aggregate those integer minor-unit amounts by quantity.
- Derive aggregate contribution by subtraction.
  Do not apply an additional aggregate rounding operation to values already rounded per unit.

C. Important distinction:
The two rounding policies must remain mathematically distinct.
Add tests proving that the two approaches can produce different results for fractional minor-unit values.
Use the existing Rational arithmetic and rounding implementation. Do not introduce fractional floating-point financial arithmetic.

### 4. Scenario calculation requirements

1. Accept explicit scenario parameters.
2. Validate all parameters before calculation.
3. Calculate each scenario independently using its own approved inputs.
4. Use calculatePerUnitEconomics as the existing per-unit calculation foundation.
5. Aggregate the scenario's per-unit economics according to the Rule Pack rounding point.
6. Produce scenario-level totals.
7. Preserve the low/base/high scenario identities.
8. Preserve the inputs and calculation results necessary for deterministic replay.
   The scenario calculation must not mutate its input objects, Rule Packs or existing per-unit results.

Zero units sold must be tested explicitly and handled consistently with the domain contract.
Do not silently clamp invalid values, convert malformed inputs, or accept invalid monetary parameters.

Scenario independence:
Low, base and high are three independently parameterized scenarios. Do not calculate the base result and manufacture the other two results by multiplying or arbitrarily adjusting the base total.

Scenario ordering:
When scenario parameters are ordered according to their documented economic directions, verify that:
low.totalContribution <= base.totalContribution <= high.totalContribution
Do not silently reorder scenarios to manufacture low/base/high ordering. Report supplied values and calculated results faithfully.

### 5. Deterministic scenario output and trace

Scenario calculations must not depend on:

- Current timestamps.
- Random IDs.
- Randomness.
- Environment-dependent calculations.
- Network access.
- Filesystem access.
- AI or external services.

Record in the trace:

- Scenario identity (low, base, or high).
- Explicit scenario input parameters.
- Quantity used for aggregation.
- The relevant per-unit calculation result.
- Rule Pack identity/version information available from the existing input and trace.
- Rounding mode and rounding point.
- Exact aggregate amounts where applicable.
- Rounded aggregate royalty.
- Rounded aggregate applicable cost.
- Aggregate contribution derived by subtraction.

### 6. Testing requirements

1. Dedicated scenario golden fixture set across all 4 synthetic Rule Packs.
2. Low/base/high scenarios, different quantities, prices, cost variances, zero units, integer edge cases.
3. Explicit tests proving per_total and per_unit produce different results on fractional minor units.
4. Property-based tests verifying monotonic ordering, zero-unit behavior, linear scaling with zero variance under per_unit, and cost variance impact.
5. Determinism test verifying bit-for-bit identical canonical JSON output on repeated runs.
6. 100% branch coverage required for packages/calc-engine.

### 7. Documentation and governance

1. prompts/step-06.md
2. learning/implementation/step-06-scenarios-and-totals.md
3. learning/notes/step-06-scenarios-and-totals.md
4. learning/interviews/step-06-scenarios-and-totals.md
5. Update docs/DESIGN.md (the ONE and only design doc).
```

---

## 2. Formally Reconciled Owner Decisions (Stage 2)

Prior to code implementation, the following architectural clarifications were formally presented to and approved by the repository owner:

1. **`costVariance` Semantics (FR-006):**

   - **Resolution:** Cost variance is defined as a percentage adjustment on the Rule Pack per-unit production/distribution cost:
     $$M = 1 + \frac{\text{costVariancePercent}}{100}$$
     $$\text{exactApplicableCostVaried} = \text{exactApplicableCost} \times M$$
   - A positive variance increases production/distribution cost (reducing contribution); a negative variance decreases cost (increasing contribution). Base scenario default is `0`.
   - Valid range is $\ge -100\%$. Values $< -100\%$ are rejected as negative cost is unphysical.

2. **Scenario Parameter Contracts:**

   - Explicit, absolute parameters per scenario:
     `units`: non-negative safe integer.
     `listPriceMinor`: integer minor units within Rule Pack limits.
     `costVariancePercent`: exact decimal string $\ge -100\%$, e.g. `"0"`, `"10"`, `"-10"`.

3. **Domain Contracts Location:**
   - `ScenarioParameters`, `ScenarioTotals`, `SCENARIO_DISCLAIMER_TEXT`, and type guards `isScenarioParameters`, `isScenarioTotals` are established in `@nimphy/domain` and re-exported from its root.

---

## 3. Governance and Roadmap Sequence Reconciliation

Per the authoritative roadmap in `docs/architecture/17-implementation-roadmap.md`, the canonical step sequence is:

- **STEP-006 — Engine: Scenarios and Totals** (Current — Complete & Fully Verified; Awaiting Formal Owner Acceptance)
- **STEP-007 — Engine: Break-even** (Next — Strictly Unauthorized)
- **STEP-008 — Engine: Sensitivity**
- **STEP-009 — Differential Reference Check**

STEP-007 is strictly unauthorized until explicit, written authorization from the repository owner. Owner acceptance is not claimed.
