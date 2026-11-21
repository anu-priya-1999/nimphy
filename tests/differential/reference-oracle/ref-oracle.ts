/**
 * Independent Reference Calculation Oracle for Financial Cross-Check.
 *
 * CRITICAL INDEPENDENCE CONTRACT:
 * - This implementation is 100% test-only.
 * - It derives all calculations independently using RefRational (BigInt exact math).
 * - It does NOT import or call ANY function from packages/calc-engine:
 *     NO calculatePerUnitEconomics
 *     NO calculateSingleScenario
 *     NO calculateTriadScenarios
 *     NO calculateBreakEven
 *     NO calculateSensitivity
 *     NO production Rational
 *     NO production rounding helpers
 */

import { RefRational, type RefRoundingMode, type RefRoundingPoint } from './ref-rational';

export interface RefRoyaltyTier {
  readonly name: string;
  readonly minPriceMinor: number;
  readonly maxPriceMinor: number | null;
  readonly royaltyRateDecimal: string;
}

export interface RefRoundingPolicy {
  readonly mode: RefRoundingMode;
  readonly point: RefRoundingPoint;
}

export interface RefRulePack {
  readonly packKey: string;
  readonly version: string;
  readonly format: string;
  readonly currency: string;
  readonly content: {
    readonly rounding: RefRoundingPolicy;
    readonly royalty: {
      readonly tiers: readonly RefRoyaltyTier[];
    };
    readonly printCost: {
      readonly baseCostMinor: number;
      readonly costPerPageMinor: number;
      readonly pageThreshold: number;
    } | null;
    readonly deliveryCost: {
      readonly costPerMbMinor: number;
    } | null;
    readonly limits: {
      readonly minListPriceMinor: number;
      readonly maxListPriceMinor: number;
      readonly minPages: number | null;
      readonly maxPages: number | null;
    };
  };
}

export interface RefPerUnitInput {
  readonly listPriceMinor: number;
  readonly currency: string;
  readonly format: string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
}

export interface RefPerUnitResult {
  readonly tierName: string;
  readonly royaltyRateDecimal: string;
  readonly exactGrossRoyalty: RefRational;
  readonly exactProductionCost: RefRational;
  readonly exactUnitContribution: RefRational;
  readonly grossRoyaltyMinor: number | null;
  readonly productionCostMinor: number | null;
  readonly unitContributionMinor: number | null;
}

export interface RefScenarioInput {
  readonly units: number;
  readonly listPriceMinor: number;
  readonly currency: string;
  readonly format: string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
  readonly costVariancePercent?: string;
}

export interface RefScenarioResult {
  readonly revenueMinor: number;
  readonly grossRoyaltyMinor: number;
  readonly productionCostMinor: number;
  readonly netContributionMinor: number;
  readonly exactTotalRoyalty: RefRational;
  readonly exactTotalCost: RefRational;
  readonly exactTotalContribution: RefRational;
}

export interface RefBreakEvenInput {
  readonly fixedCostMinor: number;
  readonly listPriceMinor: number;
  readonly currency: string;
  readonly format: string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
  readonly costVariancePercent?: string;
}

export interface RefBreakEvenResult {
  readonly reachable: boolean;
  readonly unreachableReason?: 'ZERO_CONTRIBUTION' | 'NEGATIVE_CONTRIBUTION';
  readonly unitContributionMinor: number | null;
  readonly exactUnitContribution: RefRational;
  readonly breakEvenUnits: number | null;
  readonly breakEvenRevenueMinor: number | null;
}

export type RefSensitivityDriver = 'units' | 'listPriceMinor' | 'costVariancePercent';

export interface RefSensitivityDriverConfig {
  readonly driver: RefSensitivityDriver;
  readonly perturbation: number | string;
}

export interface RefSensitivityInput {
  readonly baseline: {
    readonly units: number;
    readonly listPriceMinor: number;
    readonly currency: string;
    readonly format: string;
    readonly pages?: number;
    readonly fileSizeMb?: string;
    readonly costVariancePercent?: string;
  };
  readonly drivers: readonly RefSensitivityDriverConfig[];
}

export interface RefSensitivityDriverResult {
  readonly driver: RefSensitivityDriver;
  readonly rank: number;
  readonly impactScoreMinor: number;
  readonly lowerNetContributionMinor: number;
  readonly upperNetContributionMinor: number;
  readonly deltaLowerMinor: number;
  readonly deltaUpperMinor: number;
  readonly lowerRevenueMinor: number;
  readonly upperRevenueMinor: number;
  readonly deltaLowerRevenueMinor: number;
  readonly deltaUpperRevenueMinor: number;
}

export interface RefSensitivityResult {
  readonly baselineNetContributionMinor: number;
  readonly baselineRevenueMinor: number;
  readonly rankedDrivers: readonly RefSensitivityDriverResult[];
}

/**
 * Derives matching royalty tier from Rule Pack.
 */
function findMatchingTier(
  listPriceMinor: number,
  tiers: readonly RefRoyaltyTier[],
): RefRoyaltyTier {
  for (const tier of tiers) {
    const minSatisfied = listPriceMinor >= tier.minPriceMinor;
    const maxSatisfied = tier.maxPriceMinor === null || listPriceMinor <= tier.maxPriceMinor;
    if (minSatisfied && maxSatisfied) {
      return tier;
    }
  }
  throw new Error(`RefOracle: No matching royalty tier for listPriceMinor=${listPriceMinor}`);
}

/**
 * Independently calculates per-unit economics.
 */
export function refCalculatePerUnit(
  input: RefPerUnitInput,
  rulePack: RefRulePack,
): RefPerUnitResult {
  const matchingTier = findMatchingTier(input.listPriceMinor, rulePack.content.royalty.tiers);
  const rateRational = RefRational.fromDecimalString(matchingTier.royaltyRateDecimal);
  const listPriceRational = RefRational.fromNumber(input.listPriceMinor);

  // Exact gross royalty: P * rate
  const exactGrossRoyalty = listPriceRational.multiply(rateRational);

  // Exact production / delivery cost
  let exactProductionCost = RefRational.zero();
  if (input.format === 'paperback' || input.format === 'hardcover') {
    const printCost = rulePack.content.printCost;
    if (printCost) {
      const pages = input.pages ?? 0;
      let costMinor = printCost.baseCostMinor;
      if (pages > printCost.pageThreshold) {
        costMinor += (pages - printCost.pageThreshold) * printCost.costPerPageMinor;
      }
      exactProductionCost = RefRational.fromNumber(costMinor);
    }
  } else if (input.format === 'ebook') {
    const deliveryCost = rulePack.content.deliveryCost;
    if (deliveryCost && input.fileSizeMb !== undefined) {
      const sizeRational = RefRational.fromDecimalString(input.fileSizeMb);
      const costPerMb = RefRational.fromNumber(deliveryCost.costPerMbMinor);
      exactProductionCost = costPerMb.multiply(sizeRational);
    }
  }

  // Exact unit contribution: Gross Royalty - Production Cost
  const exactUnitContribution = exactGrossRoyalty.subtract(exactProductionCost);

  const rounding = rulePack.content.rounding;
  let grossRoyaltyMinor: number | null = null;
  let productionCostMinor: number | null = null;
  let unitContributionMinor: number | null = null;

  if (rounding.point === 'per_unit') {
    grossRoyaltyMinor = Number(exactGrossRoyalty.round(rounding.mode));
    productionCostMinor = Number(exactProductionCost.round(rounding.mode));
    unitContributionMinor = grossRoyaltyMinor - productionCostMinor;
  } else {
    // Under per_total, gross royalty and net contribution rounding is deferred.
    // However, if production cost is already an exact integer minor unit, it requires no rounding.
    grossRoyaltyMinor = null;
    unitContributionMinor = null;
    productionCostMinor =
      exactProductionCost.denominator === 1n ? Number(exactProductionCost.numerator) : null;
  }

  return {
    tierName: matchingTier.name,
    royaltyRateDecimal: matchingTier.royaltyRateDecimal,
    exactGrossRoyalty,
    exactProductionCost,
    exactUnitContribution,
    grossRoyaltyMinor,
    productionCostMinor,
    unitContributionMinor,
  };
}

/**
 * Independently calculates single scenario totals.
 */
export function refCalculateSingleScenario(
  input: RefScenarioInput,
  rulePack: RefRulePack,
): RefScenarioResult {
  const perUnit = refCalculatePerUnit(
    {
      listPriceMinor: input.listPriceMinor,
      currency: input.currency,
      format: input.format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
    rulePack,
  );

  // Apply cost variance: M = (100 + costVariancePercent) / 100
  let exactApplicableCostVaried = perUnit.exactProductionCost;
  const costVarianceStr = input.costVariancePercent ?? '0';
  if (costVarianceStr !== '0') {
    const varianceRational = RefRational.fromDecimalString(costVarianceStr);
    const hundred = RefRational.fromBigInt(100n);
    const multiplier = hundred.add(varianceRational).divide(hundred);
    exactApplicableCostVaried = perUnit.exactProductionCost.multiply(multiplier);
  }

  const units = input.units;
  const revenueMinor = units * input.listPriceMinor;

  if (units === 0) {
    return {
      revenueMinor: 0,
      grossRoyaltyMinor: 0,
      productionCostMinor: 0,
      netContributionMinor: 0,
      exactTotalRoyalty: RefRational.zero(),
      exactTotalCost: RefRational.zero(),
      exactTotalContribution: RefRational.zero(),
    };
  }

  const rounding = rulePack.content.rounding;
  const unitsRational = RefRational.fromNumber(units);
  const exactTotalRoyalty = perUnit.exactGrossRoyalty.multiply(unitsRational);
  const exactTotalCost = exactApplicableCostVaried.multiply(unitsRational);
  const exactTotalContribution = exactTotalRoyalty.subtract(exactTotalCost);

  let grossRoyaltyMinor: number;
  let productionCostMinor: number;
  let netContributionMinor: number;

  if (rounding.point === 'per_total') {
    grossRoyaltyMinor = Number(exactTotalRoyalty.round(rounding.mode));
    productionCostMinor = Number(exactTotalCost.round(rounding.mode));
    netContributionMinor = grossRoyaltyMinor - productionCostMinor;
  } else {
    // per_unit aggregation
    const unitRoyaltyMinor = Number(perUnit.exactGrossRoyalty.round(rounding.mode));
    const unitCostMinor = Number(exactApplicableCostVaried.round(rounding.mode));
    grossRoyaltyMinor = unitRoyaltyMinor * units;
    productionCostMinor = unitCostMinor * units;
    netContributionMinor = grossRoyaltyMinor - productionCostMinor;
  }

  return {
    revenueMinor,
    grossRoyaltyMinor,
    productionCostMinor,
    netContributionMinor,
    exactTotalRoyalty,
    exactTotalCost,
    exactTotalContribution,
  };
}

/**
 * Independently calculates break-even units and revenue.
 */
export function refCalculateBreakEven(
  input: RefBreakEvenInput,
  rulePack: RefRulePack,
): RefBreakEvenResult {
  const perUnit = refCalculatePerUnit(
    {
      listPriceMinor: input.listPriceMinor,
      currency: input.currency,
      format: input.format,
      pages: input.pages,
      fileSizeMb: input.fileSizeMb,
    },
    rulePack,
  );

  let exactApplicableCostVaried = perUnit.exactProductionCost;
  const costVarianceStr = input.costVariancePercent ?? '0';
  if (costVarianceStr !== '0') {
    const varianceRational = RefRational.fromDecimalString(costVarianceStr);
    const hundred = RefRational.fromBigInt(100n);
    const multiplier = hundred.add(varianceRational).divide(hundred);
    exactApplicableCostVaried = perUnit.exactProductionCost.multiply(multiplier);
  }

  const rounding = rulePack.content.rounding;
  let exactUnitContribution: RefRational;
  let unitContributionMinor: number | null = null;

  if (rounding.point === 'per_unit') {
    const unitRoyaltyMinor = Number(perUnit.exactGrossRoyalty.round(rounding.mode));
    const unitCostMinor = Number(exactApplicableCostVaried.round(rounding.mode));
    unitContributionMinor = unitRoyaltyMinor - unitCostMinor;
    exactUnitContribution = RefRational.fromNumber(unitContributionMinor);
  } else {
    exactUnitContribution = perUnit.exactGrossRoyalty.subtract(exactApplicableCostVaried);
    unitContributionMinor =
      exactUnitContribution.denominator === 1n ? Number(exactUnitContribution.numerator) : null;
  }

  if (!exactUnitContribution.isPositive()) {
    const unreachableReason = exactUnitContribution.isZero()
      ? 'ZERO_CONTRIBUTION'
      : 'NEGATIVE_CONTRIBUTION';
    return {
      reachable: false,
      unreachableReason,
      unitContributionMinor,
      exactUnitContribution,
      breakEvenUnits: null,
      breakEvenRevenueMinor: null,
    };
  }

  if (input.fixedCostMinor === 0) {
    return {
      reachable: true,
      unitContributionMinor,
      exactUnitContribution,
      breakEvenUnits: 0,
      breakEvenRevenueMinor: 0,
    };
  }

  // Exact ceiling: ceil( FixedCost / UnitContribution )
  // = ceil( (FixedCost * U_den) / U_num )
  const fixedCostBig = BigInt(input.fixedCostMinor);
  const numBig = fixedCostBig * exactUnitContribution.denominator;
  const denBig = exactUnitContribution.numerator;

  const q = numBig / denBig;
  const r = numBig % denBig;
  const breakEvenUnitsBig = r === 0n ? q : q + 1n;
  const breakEvenUnits = Number(breakEvenUnitsBig);
  const breakEvenRevenueMinor = breakEvenUnits * input.listPriceMinor;

  return {
    reachable: true,
    unitContributionMinor,
    exactUnitContribution,
    breakEvenUnits,
    breakEvenRevenueMinor,
  };
}

/**
 * Independently calculates sensitivity analysis.
 */
export function refCalculateSensitivity(
  input: RefSensitivityInput,
  rulePack: RefRulePack,
): RefSensitivityResult {
  const baseScenario = refCalculateSingleScenario(input.baseline, rulePack);
  const baseContrib = baseScenario.netContributionMinor;
  const baseRevenue = baseScenario.revenueMinor;

  interface EvaluatedDriver {
    driver: RefSensitivityDriver;
    impactScore: number;
    lowerContrib: number;
    upperContrib: number;
    deltaLower: number;
    deltaUpper: number;
    lowerRevenue: number;
    upperRevenue: number;
    deltaLowerRevenue: number;
    deltaUpperRevenue: number;
  }

  const evaluations: EvaluatedDriver[] = [];

  for (const config of input.drivers) {
    let lowerScenario: RefScenarioResult;
    let upperScenario: RefScenarioResult;

    if (config.driver === 'units') {
      const delta = Number(config.perturbation);
      lowerScenario = refCalculateSingleScenario(
        { ...input.baseline, units: input.baseline.units - delta },
        rulePack,
      );
      upperScenario = refCalculateSingleScenario(
        { ...input.baseline, units: input.baseline.units + delta },
        rulePack,
      );
    } else if (config.driver === 'listPriceMinor') {
      const delta = Number(config.perturbation);
      lowerScenario = refCalculateSingleScenario(
        { ...input.baseline, listPriceMinor: input.baseline.listPriceMinor - delta },
        rulePack,
      );
      upperScenario = refCalculateSingleScenario(
        { ...input.baseline, listPriceMinor: input.baseline.listPriceMinor + delta },
        rulePack,
      );
    } else {
      // costVariancePercent
      const deltaStr = String(config.perturbation);
      const baseVar = RefRational.fromDecimalString(input.baseline.costVariancePercent ?? '0');
      const deltaVar = RefRational.fromDecimalString(deltaStr);
      const lowerVarStr = baseVar.subtract(deltaVar).toDecimalString();
      const upperVarStr = baseVar.add(deltaVar).toDecimalString();

      lowerScenario = refCalculateSingleScenario(
        { ...input.baseline, costVariancePercent: lowerVarStr },
        rulePack,
      );
      upperScenario = refCalculateSingleScenario(
        { ...input.baseline, costVariancePercent: upperVarStr },
        rulePack,
      );
    }

    const deltaLower = lowerScenario.netContributionMinor - baseContrib;
    const deltaUpper = upperScenario.netContributionMinor - baseContrib;
    const impactScore = Math.max(Math.abs(deltaLower), Math.abs(deltaUpper));

    const deltaLowerRevenue = lowerScenario.revenueMinor - baseRevenue;
    const deltaUpperRevenue = upperScenario.revenueMinor - baseRevenue;

    evaluations.push({
      driver: config.driver,
      impactScore,
      lowerContrib: lowerScenario.netContributionMinor,
      upperContrib: upperScenario.netContributionMinor,
      deltaLower,
      deltaUpper,
      lowerRevenue: lowerScenario.revenueMinor,
      upperRevenue: upperScenario.revenueMinor,
      deltaLowerRevenue,
      deltaUpperRevenue,
    });
  }

  // Deterministic sorting:
  // 1. Impact score descending
  // 2. Driver code-point order ascending
  const sorted = [...evaluations].sort((a, b) => {
    if (b.impactScore !== a.impactScore) {
      return b.impactScore - a.impactScore;
    }
    return a.driver < b.driver ? -1 : 1;
  });

  const rankedDrivers: RefSensitivityDriverResult[] = sorted.map((d, idx) => ({
    driver: d.driver,
    rank: idx + 1,
    impactScoreMinor: d.impactScore,
    lowerNetContributionMinor: d.lowerContrib,
    upperNetContributionMinor: d.upperContrib,
    deltaLowerMinor: d.deltaLower,
    deltaUpperMinor: d.deltaUpper,
    lowerRevenueMinor: d.lowerRevenue,
    upperRevenueMinor: d.upperRevenue,
    deltaLowerRevenueMinor: d.deltaLowerRevenue,
    deltaUpperRevenueMinor: d.deltaUpperRevenue,
  }));

  return {
    baselineNetContributionMinor: baseContrib,
    baselineRevenueMinor: baseRevenue,
    rankedDrivers,
  };
}

export interface RefScenarioParametersInput {
  readonly units: number;
  readonly listPriceMinor: number;
  readonly costVariancePercent?: string;
  readonly scenarioName?: string;
}

export interface RefCaseScenariosInput {
  readonly scenarios: {
    readonly low: RefScenarioParametersInput;
    readonly base: RefScenarioParametersInput;
    readonly high: RefScenarioParametersInput;
  };
  readonly currency: string;
  readonly format: string;
  readonly pages?: number;
  readonly fileSizeMb?: string;
}

export interface RefScenarioOrderingDetails {
  readonly lowContributionMinor: number;
  readonly baseContributionMinor: number;
  readonly highContributionMinor: number;
  readonly lowRevenueMinor: number;
  readonly baseRevenueMinor: number;
  readonly highRevenueMinor: number;
}

export interface RefScenarioOrderingEvaluation {
  readonly areInputsMonotonicallyOrdered: boolean;
  readonly areTotalsMonotonicallyOrdered: boolean;
  readonly netContributionOrderingSatisfied: boolean;
  readonly revenueOrderingSatisfied: boolean;
  readonly details: RefScenarioOrderingDetails;
}

export interface RefTriadScenariosResult {
  readonly scenarios: {
    readonly low: RefScenarioResult;
    readonly base: RefScenarioResult;
    readonly high: RefScenarioResult;
  };
  readonly ordering: RefScenarioOrderingEvaluation;
}

/**
 * Independently calculates triad scenario totals (low, base, high) and evaluates monotonic ordering.
 */
export function refCalculateTriadScenarios(
  input: RefCaseScenariosInput,
  rulePack: RefRulePack,
): RefTriadScenariosResult {
  const sharedProps = {
    currency: input.currency,
    format: input.format,
    pages: input.pages,
    fileSizeMb: input.fileSizeMb,
  };

  const low = refCalculateSingleScenario(
    {
      units: input.scenarios.low.units,
      listPriceMinor: input.scenarios.low.listPriceMinor,
      costVariancePercent: input.scenarios.low.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  const base = refCalculateSingleScenario(
    {
      units: input.scenarios.base.units,
      listPriceMinor: input.scenarios.base.listPriceMinor,
      costVariancePercent: input.scenarios.base.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  const high = refCalculateSingleScenario(
    {
      units: input.scenarios.high.units,
      listPriceMinor: input.scenarios.high.listPriceMinor,
      costVariancePercent: input.scenarios.high.costVariancePercent,
      ...sharedProps,
    },
    rulePack,
  );

  // Independent monotonic input ordering check
  const lowCostVar = RefRational.fromDecimalString(input.scenarios.low.costVariancePercent ?? '0');
  const baseCostVar = RefRational.fromDecimalString(
    input.scenarios.base.costVariancePercent ?? '0',
  );
  const highCostVar = RefRational.fromDecimalString(
    input.scenarios.high.costVariancePercent ?? '0',
  );

  const priceOrdered =
    input.scenarios.low.listPriceMinor <= input.scenarios.base.listPriceMinor &&
    input.scenarios.base.listPriceMinor <= input.scenarios.high.listPriceMinor;

  const unitsOrdered =
    input.scenarios.low.units <= input.scenarios.base.units &&
    input.scenarios.base.units <= input.scenarios.high.units;

  // Higher cost variance is adverse, reducing net contribution.
  // Therefore monotonic cost variance ordering is low >= base >= high.
  const costVarianceOrdered =
    lowCostVar.compare(baseCostVar) >= 0 && baseCostVar.compare(highCostVar) >= 0;

  const areInputsMonotonicallyOrdered = priceOrdered && unitsOrdered && costVarianceOrdered;

  const netContributionOrderingSatisfied =
    low.netContributionMinor <= base.netContributionMinor &&
    base.netContributionMinor <= high.netContributionMinor;

  const revenueOrderingSatisfied =
    low.revenueMinor <= base.revenueMinor && base.revenueMinor <= high.revenueMinor;

  const areTotalsMonotonicallyOrdered =
    netContributionOrderingSatisfied && revenueOrderingSatisfied;

  return {
    scenarios: {
      low,
      base,
      high,
    },
    ordering: {
      areInputsMonotonicallyOrdered,
      areTotalsMonotonicallyOrdered,
      netContributionOrderingSatisfied,
      revenueOrderingSatisfied,
      details: {
        lowContributionMinor: low.netContributionMinor,
        baseContributionMinor: base.netContributionMinor,
        highContributionMinor: high.netContributionMinor,
        lowRevenueMinor: low.revenueMinor,
        baseRevenueMinor: base.revenueMinor,
        highRevenueMinor: high.revenueMinor,
      },
    },
  };
}
