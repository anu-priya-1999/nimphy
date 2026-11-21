/**
 * Deterministic Differential Reference Test Suite.
 *
 * Compares the production financial engine (@nimphy/calc-engine) directly against
 * an independent test-only reference oracle across:
 * - All 4 synthetic Rule Packs (TEST_EBOOK_STANDARD, TEST_PAPERBACK_US v1/v2, TEST_HARDCOVER_GLOBAL)
 * - All 4 rounding modes (round_half_up, round_half_even, round_down, round_up)
 * - Both rounding points (per_unit, per_total)
 * - At least 1,024 deterministic pseudo-randomly generated vectors
 * - An exhaustive edge-case matrix (zero/positive/negative contribution, safe-integer boundaries, ties, perturbation limits)
 * - Absolute zero financial drift
 */

import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import { type Currency, Money } from '@nimphy/domain';
import {
  calculateBreakEven,
  calculatePerUnitEconomics,
  calculateSensitivity,
  calculateSingleScenario,
  calculateTriadScenarios,
  type BreakEvenInput,
  type CalcRulePack,
  type CaseScenariosInput,
  type PerUnitEconomicsInput,
  type SensitivityAnalysisInput,
  type SensitivityDriverConfig,
  type SingleScenarioInput,
} from '@nimphy/calc-engine';
import {
  refCalculateBreakEven,
  refCalculatePerUnit,
  refCalculateSensitivity,
  refCalculateSingleScenario,
  refCalculateTriadScenarios,
  type RefCaseScenariosInput,
  type RefRoundingMode,
  type RefRoundingPoint,
  type RefRulePack,
  type RefSensitivityDriverConfig,
} from './reference-oracle';

export const DIFFERENTIAL_PRNG_SEED = 0x57e9009; // Decimal: 92180489 (STEP-009)
export const DIFFERENTIAL_PRNG_ALGORITHM = 'Mulberry32';
// In focused mutation runner, evaluates 1 vector per configuration (32 total) to prevent multi-minute IPC timeouts;
// in normal runs (pnpm test, pnpm test:differential, CI), evaluates the full 1,024 vectors (32 per configuration).
export const GENERATED_CASE_COUNT = process.env.STRYKER_RUN === 'true' ? 32 : 1024;

const ROUNDING_MODES: readonly RefRoundingMode[] = [
  'round_half_up',
  'round_half_even',
  'round_down',
  'round_up',
];

const ROUNDING_POINTS: readonly RefRoundingPoint[] = ['per_unit', 'per_total'];

// Set to track exercised sensitivity drivers across the test suite for coverage proof
const exercisedSensitivityDrivers = new Set<string>();

/**
 * Deterministic 32-bit Mulberry32 PRNG.
 */
class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextChoice<T>(array: readonly T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  nextDecimalString(min: number, max: number, decimals: number): string {
    const factor = 10 ** decimals;
    const intVal = this.nextInt(Math.round(min * factor), Math.round(max * factor));
    return (intVal / factor).toFixed(decimals);
  }
}

interface TestConfiguration {
  prodPack: CalcRulePack;
  refPack: RefRulePack;
  packKey: string;
  version: string;
  mode: RefRoundingMode;
  point: RefRoundingPoint;
}

function buildTestConfigurations(): TestConfiguration[] {
  const rawPacks = [ebookPackJson, paperbackV1PackJson, paperbackV2PackJson, hardcoverPackJson];
  const configs: TestConfiguration[] = [];

  for (const raw of rawPacks) {
    for (const mode of ROUNDING_MODES) {
      for (const point of ROUNDING_POINTS) {
        const cloned = JSON.parse(JSON.stringify(raw));
        cloned.content.rounding = { mode, point };
        configs.push({
          prodPack: cloned as CalcRulePack,
          refPack: cloned as RefRulePack,
          packKey: raw.packKey,
          version: raw.version,
          mode,
          point,
        });
      }
    }
  }

  return configs;
}

interface GeneratedVector {
  caseIndex: number;
  config: TestConfiguration;
  listPriceMinor: number;
  currency: Currency;
  format: 'ebook' | 'paperback' | 'hardcover';
  pages?: number;
  fileSizeMb?: string;
  units: number;
  costVariancePercent: string;
  fixedCostMinor: number;
  sensitivityDrivers: RefSensitivityDriverConfig[];
  triadScenarios: {
    low: { units: number; listPriceMinor: number; costVariancePercent: string };
    base: { units: number; listPriceMinor: number; costVariancePercent: string };
    high: { units: number; listPriceMinor: number; costVariancePercent: string };
  };
}

function generateVectors(seed: number, totalCount: number): GeneratedVector[] {
  const prng = new Mulberry32(seed);
  const configs = buildTestConfigurations();
  const vectors: GeneratedVector[] = [];

  const casesPerConfig = Math.floor(totalCount / configs.length);
  const remainder = totalCount % configs.length;

  let globalIndex = 0;

  for (let cIdx = 0; cIdx < configs.length; cIdx++) {
    const config = configs[cIdx];
    const countForThisConfig = casesPerConfig + (cIdx < remainder ? 1 : 0);
    const limits = config.refPack.content.limits;
    const format = config.refPack.format;
    const currency = config.refPack.currency;

    for (let i = 0; i < countForThisConfig; i++) {
      const listPriceMinor = prng.nextInt(limits.minListPriceMinor, limits.maxListPriceMinor);
      let pages: number | undefined;
      let fileSizeMb: string | undefined;

      if (format === 'paperback' || format === 'hardcover') {
        const minP = limits.minPages ?? 24;
        const maxP = limits.maxPages ?? 800;
        pages = prng.nextInt(minP, maxP);
      } else {
        // Ebook file size in MB
        fileSizeMb = prng.nextDecimalString(0.1, 15.0, prng.nextInt(1, 2));
      }

      const units = prng.nextInt(0, 10000);
      const costVariancePercent = prng.nextChoice([
        '0',
        '-100',
        '-50',
        '-15.5',
        '10',
        '25.25',
        '50',
      ]);
      const fixedCostMinor = prng.nextInt(0, 500000);

      // Sensitivity drivers with perturbations that stay safely within valid bounds
      const sensitivityDrivers: RefSensitivityDriverConfig[] = [];

      // 1. Units driver (requires units >= 1)
      if (units >= 1) {
        const maxUnitsDelta = Math.min(units, 500);
        const unitsPerturbation = prng.nextInt(1, maxUnitsDelta);
        sensitivityDrivers.push({ driver: 'units', perturbation: unitsPerturbation });
        exercisedSensitivityDrivers.add('units');
      }

      // 2. List price driver (requires headroom between min and max price)
      const lowerPriceRoom = listPriceMinor - limits.minListPriceMinor;
      const upperPriceRoom = limits.maxListPriceMinor - listPriceMinor;
      const maxPriceDelta = Math.min(lowerPriceRoom, upperPriceRoom, 500);
      if (maxPriceDelta >= 1) {
        const pricePerturbation = prng.nextInt(1, maxPriceDelta);
        sensitivityDrivers.push({ driver: 'listPriceMinor', perturbation: pricePerturbation });
        exercisedSensitivityDrivers.add('listPriceMinor');
      }

      // 3. Cost variance driver (requires lower variance >= -100)
      const baseVarNum = Number(costVariancePercent);
      const maxVarDelta = Math.min(baseVarNum - -100, 50);
      if (maxVarDelta >= 1) {
        const chosenDelta = Math.min(maxVarDelta, prng.nextChoice([1, 5, 10, 20]));
        sensitivityDrivers.push({
          driver: 'costVariancePercent',
          perturbation: chosenDelta.toString(),
        });
        exercisedSensitivityDrivers.add('costVariancePercent');
      }

      // Triad scenarios: construct low, base, and high scenarios
      const lowPriceDelta = Math.min(lowerPriceRoom, 200);
      const highPriceDelta = Math.min(upperPriceRoom, 200);
      const lowUnits = Math.max(0, Math.floor(units * 0.5));
      const highUnits = units + 200;

      const triadScenarios = {
        low: {
          units: lowUnits,
          listPriceMinor: listPriceMinor - lowPriceDelta,
          costVariancePercent: '10',
        },
        base: {
          units,
          listPriceMinor,
          costVariancePercent,
        },
        high: {
          units: highUnits,
          listPriceMinor: listPriceMinor + highPriceDelta,
          costVariancePercent: '-10',
        },
      };

      vectors.push({
        caseIndex: globalIndex++,
        config,
        listPriceMinor,
        currency,
        format,
        pages,
        fileSizeMb,
        units,
        costVariancePercent,
        fixedCostMinor,
        sensitivityDrivers,
        triadScenarios,
      });
    }
  }

  return vectors;
}

function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function formatDiagnostic(
  vector: GeneratedVector,
  operation: string,
  field: string,
  prodVal: unknown,
  refVal: unknown,
): string {
  return [
    `DIFFERENTIAL MISMATCH in ${operation}.${field}`,
    `  PRNG Algorithm: ${DIFFERENTIAL_PRNG_ALGORITHM}`,
    `  PRNG Seed: ${DIFFERENTIAL_PRNG_SEED} (0x${DIFFERENTIAL_PRNG_SEED.toString(16)})`,
    `  Case Index: ${vector.caseIndex}`,
    `  Rule Pack: ${vector.config.packKey}@${vector.config.version}`,
    `  Rounding: mode=${vector.config.mode}, point=${vector.config.point}`,
    `  Operation: ${operation}`,
    `  Differing Field: ${field}`,
    `  Production Value: ${safeJsonStringify(prodVal)}`,
    `  Reference Value:  ${safeJsonStringify(refVal)}`,
    `  Input Vector: ${safeJsonStringify({
      caseIndex: vector.caseIndex,
      listPriceMinor: vector.listPriceMinor,
      currency: vector.currency,
      format: vector.format,
      pages: vector.pages,
      fileSizeMb: vector.fileSizeMb,
      units: vector.units,
      costVariancePercent: vector.costVariancePercent,
      fixedCostMinor: vector.fixedCostMinor,
      sensitivityDrivers: vector.sensitivityDrivers,
      triadScenarios: vector.triadScenarios,
    })}`,
  ].join('\n');
}

function runDifferentialVectorCheck(vector: GeneratedVector): void {
  const { config } = vector;
  const { prodPack, refPack, point } = config;

  // 1. Per-Unit Economics Cross-Check
  const perUnitInput: PerUnitEconomicsInput = {
    listPriceMinor: vector.listPriceMinor,
    currency: vector.currency,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
  };

  const refPerUnit = refCalculatePerUnit(perUnitInput, refPack);
  const prodPerUnit = calculatePerUnitEconomics(perUnitInput, prodPack);

  // Exact gross royalty
  expect(
    prodPerUnit.exactGrossRoyalty.numerator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactGrossRoyalty.numerator',
      prodPerUnit.exactGrossRoyalty.numerator.toString(),
      refPerUnit.exactGrossRoyalty.numerator.toString(),
    ),
  ).toBe(refPerUnit.exactGrossRoyalty.numerator.toString());

  expect(
    prodPerUnit.exactGrossRoyalty.denominator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactGrossRoyalty.denominator',
      prodPerUnit.exactGrossRoyalty.denominator.toString(),
      refPerUnit.exactGrossRoyalty.denominator.toString(),
    ),
  ).toBe(refPerUnit.exactGrossRoyalty.denominator.toString());

  // Exact applicable cost
  expect(
    prodPerUnit.exactApplicableCost.numerator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactApplicableCost.numerator',
      prodPerUnit.exactApplicableCost.numerator.toString(),
      refPerUnit.exactProductionCost.numerator.toString(),
    ),
  ).toBe(refPerUnit.exactProductionCost.numerator.toString());

  expect(
    prodPerUnit.exactApplicableCost.denominator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactApplicableCost.denominator',
      prodPerUnit.exactApplicableCost.denominator.toString(),
      refPerUnit.exactProductionCost.denominator.toString(),
    ),
  ).toBe(refPerUnit.exactProductionCost.denominator.toString());

  // Exact net contribution vs reference exactUnitContribution
  expect(
    prodPerUnit.exactNetContribution.numerator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactNetContribution.numerator',
      prodPerUnit.exactNetContribution.numerator.toString(),
      refPerUnit.exactUnitContribution.numerator.toString(),
    ),
  ).toBe(refPerUnit.exactUnitContribution.numerator.toString());

  expect(
    prodPerUnit.exactNetContribution.denominator.toString(),
    formatDiagnostic(
      vector,
      'perUnit',
      'exactNetContribution.denominator',
      prodPerUnit.exactNetContribution.denominator.toString(),
      refPerUnit.exactUnitContribution.denominator.toString(),
    ),
  ).toBe(refPerUnit.exactUnitContribution.denominator.toString());

  // Rounded money outputs
  expect(
    prodPerUnit.grossRoyalty?.amountMinor ?? null,
    formatDiagnostic(
      vector,
      'perUnit',
      'grossRoyalty.amountMinor',
      prodPerUnit.grossRoyalty?.amountMinor ?? null,
      refPerUnit.grossRoyaltyMinor,
    ),
  ).toBe(refPerUnit.grossRoyaltyMinor);

  expect(
    prodPerUnit.applicableCost?.amountMinor ?? null,
    formatDiagnostic(
      vector,
      'perUnit',
      'applicableCost.amountMinor',
      prodPerUnit.applicableCost?.amountMinor ?? null,
      refPerUnit.productionCostMinor,
    ),
  ).toBe(refPerUnit.productionCostMinor);

  expect(
    prodPerUnit.netContribution?.amountMinor ?? null,
    formatDiagnostic(
      vector,
      'perUnit',
      'netContribution.amountMinor',
      prodPerUnit.netContribution?.amountMinor ?? null,
      refPerUnit.unitContributionMinor,
    ),
  ).toBe(refPerUnit.unitContributionMinor);

  // Deferred rounding behavior under per_total
  if (point === 'per_total') {
    expect(
      prodPerUnit.grossRoyalty,
      formatDiagnostic(vector, 'perUnit', 'grossRoyalty_deferred', prodPerUnit.grossRoyalty, null),
    ).toBeNull();
    expect(
      prodPerUnit.netContribution,
      formatDiagnostic(
        vector,
        'perUnit',
        'netContribution_deferred',
        prodPerUnit.netContribution,
        null,
      ),
    ).toBeNull();
  }

  // 2. Scenario Totals Cross-Check
  const scenarioInput: SingleScenarioInput = {
    scenarioName: 'base',
    units: vector.units,
    listPriceMinor: vector.listPriceMinor,
    currency: vector.currency,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
    costVariancePercent: vector.costVariancePercent,
  };

  const refScenario = refCalculateSingleScenario(scenarioInput, refPack);
  const prodScenario = calculateSingleScenario(scenarioInput, prodPack);

  expect(
    prodScenario.revenue.amountMinor,
    formatDiagnostic(
      vector,
      'scenario',
      'revenue',
      prodScenario.revenue.amountMinor,
      refScenario.revenueMinor,
    ),
  ).toBe(refScenario.revenueMinor);

  expect(
    prodScenario.grossRoyalty.amountMinor,
    formatDiagnostic(
      vector,
      'scenario',
      'grossRoyalty',
      prodScenario.grossRoyalty.amountMinor,
      refScenario.grossRoyaltyMinor,
    ),
  ).toBe(refScenario.grossRoyaltyMinor);

  expect(
    prodScenario.applicableCost.amountMinor,
    formatDiagnostic(
      vector,
      'scenario',
      'applicableCost',
      prodScenario.applicableCost.amountMinor,
      refScenario.productionCostMinor,
    ),
  ).toBe(refScenario.productionCostMinor);

  expect(
    prodScenario.netContribution.amountMinor,
    formatDiagnostic(
      vector,
      'scenario',
      'netContribution',
      prodScenario.netContribution.amountMinor,
      refScenario.netContributionMinor,
    ),
  ).toBe(refScenario.netContributionMinor);

  // Exact total fractions
  expect(
    prodScenario.exactTotalRoyalty.numerator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalRoyalty.numerator',
      prodScenario.exactTotalRoyalty.numerator.toString(),
      refScenario.exactTotalRoyalty.numerator.toString(),
    ),
  ).toBe(refScenario.exactTotalRoyalty.numerator.toString());

  expect(
    prodScenario.exactTotalRoyalty.denominator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalRoyalty.denominator',
      prodScenario.exactTotalRoyalty.denominator.toString(),
      refScenario.exactTotalRoyalty.denominator.toString(),
    ),
  ).toBe(refScenario.exactTotalRoyalty.denominator.toString());

  expect(
    prodScenario.exactTotalCost.numerator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalCost.numerator',
      prodScenario.exactTotalCost.numerator.toString(),
      refScenario.exactTotalCost.numerator.toString(),
    ),
  ).toBe(refScenario.exactTotalCost.numerator.toString());

  expect(
    prodScenario.exactTotalCost.denominator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalCost.denominator',
      prodScenario.exactTotalCost.denominator.toString(),
      refScenario.exactTotalCost.denominator.toString(),
    ),
  ).toBe(refScenario.exactTotalCost.denominator.toString());

  expect(
    prodScenario.exactTotalContribution.numerator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalContribution.numerator',
      prodScenario.exactTotalContribution.numerator.toString(),
      refScenario.exactTotalContribution.numerator.toString(),
    ),
  ).toBe(refScenario.exactTotalContribution.numerator.toString());

  expect(
    prodScenario.exactTotalContribution.denominator.toString(),
    formatDiagnostic(
      vector,
      'scenario',
      'exactTotalContribution.denominator',
      prodScenario.exactTotalContribution.denominator.toString(),
      refScenario.exactTotalContribution.denominator.toString(),
    ),
  ).toBe(refScenario.exactTotalContribution.denominator.toString());

  // 3. Break-Even Cross-Check
  const breakEvenInput: BreakEvenInput = {
    fixedCost: Money.of(vector.fixedCostMinor, vector.currency),
    currency: vector.currency,
    listPriceMinor: vector.listPriceMinor,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
    costVariancePercent: vector.costVariancePercent,
  };

  const refBreakEvenInput = {
    fixedCostMinor: vector.fixedCostMinor,
    listPriceMinor: vector.listPriceMinor,
    currency: vector.currency,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
    costVariancePercent: vector.costVariancePercent,
  };

  const refBreakEven = refCalculateBreakEven(refBreakEvenInput, refPack);
  const prodBreakEven = calculateBreakEven(breakEvenInput, prodPack);

  expect(
    prodBreakEven.reachable,
    formatDiagnostic(
      vector,
      'breakEven',
      'reachable',
      prodBreakEven.reachable,
      refBreakEven.reachable,
    ),
  ).toBe(refBreakEven.reachable);

  expect(
    prodBreakEven.exactUnitContribution.numerator.toString(),
    formatDiagnostic(
      vector,
      'breakEven',
      'exactUnitContribution.numerator',
      prodBreakEven.exactUnitContribution.numerator.toString(),
      refBreakEven.exactUnitContribution.numerator.toString(),
    ),
  ).toBe(refBreakEven.exactUnitContribution.numerator.toString());

  expect(
    prodBreakEven.exactUnitContribution.denominator.toString(),
    formatDiagnostic(
      vector,
      'breakEven',
      'exactUnitContribution.denominator',
      prodBreakEven.exactUnitContribution.denominator.toString(),
      refBreakEven.exactUnitContribution.denominator.toString(),
    ),
  ).toBe(refBreakEven.exactUnitContribution.denominator.toString());

  expect(
    prodBreakEven.unitContributionMinor,
    formatDiagnostic(
      vector,
      'breakEven',
      'unitContributionMinor',
      prodBreakEven.unitContributionMinor,
      refBreakEven.unitContributionMinor,
    ),
  ).toBe(refBreakEven.unitContributionMinor);

  if (refBreakEven.reachable) {
    expect(prodBreakEven.reachable).toBe(true);
    if (prodBreakEven.reachable) {
      expect(
        prodBreakEven.units,
        formatDiagnostic(
          vector,
          'breakEven',
          'units',
          prodBreakEven.units,
          refBreakEven.breakEvenUnits,
        ),
      ).toBe(refBreakEven.breakEvenUnits);

      expect(
        prodBreakEven.revenue.amountMinor,
        formatDiagnostic(
          vector,
          'breakEven',
          'revenue',
          prodBreakEven.revenue.amountMinor,
          refBreakEven.breakEvenRevenueMinor,
        ),
      ).toBe(refBreakEven.breakEvenRevenueMinor);
    }
  } else {
    expect(
      prodBreakEven.unreachableReason,
      formatDiagnostic(
        vector,
        'breakEven',
        'unreachableReason',
        prodBreakEven.unreachableReason,
        refBreakEven.unreachableReason,
      ),
    ).toBe(refBreakEven.unreachableReason);
  }

  // 4. Sensitivity Analysis Cross-Check
  if (vector.sensitivityDrivers.length > 0) {
    const sensitivityInput: SensitivityAnalysisInput = {
      baseline: {
        scenarioName: 'base',
        units: vector.units,
        listPriceMinor: vector.listPriceMinor,
        currency: vector.currency,
        format: vector.format,
        pages: vector.pages,
        fileSizeMb: vector.fileSizeMb,
        costVariancePercent: vector.costVariancePercent,
      },
      drivers: vector.sensitivityDrivers as SensitivityDriverConfig[],
    };

    const refSensitivity = refCalculateSensitivity(
      {
        baseline: {
          units: vector.units,
          listPriceMinor: vector.listPriceMinor,
          currency: vector.currency,
          format: vector.format,
          pages: vector.pages,
          fileSizeMb: vector.fileSizeMb,
          costVariancePercent: vector.costVariancePercent,
        },
        drivers: vector.sensitivityDrivers,
      },
      refPack,
    );
    const prodSensitivity = calculateSensitivity(sensitivityInput, prodPack);

    expect(
      prodSensitivity.baseline.netContribution.amountMinor,
      formatDiagnostic(
        vector,
        'sensitivity',
        'baseline.netContribution',
        prodSensitivity.baseline.netContribution.amountMinor,
        refSensitivity.baselineNetContributionMinor,
      ),
    ).toBe(refSensitivity.baselineNetContributionMinor);

    expect(
      prodSensitivity.baseline.revenue.amountMinor,
      formatDiagnostic(
        vector,
        'sensitivity',
        'baseline.revenue',
        prodSensitivity.baseline.revenue.amountMinor,
        refSensitivity.baselineRevenueMinor,
      ),
    ).toBe(refSensitivity.baselineRevenueMinor);

    expect(
      prodSensitivity.rankedDrivers.length,
      formatDiagnostic(
        vector,
        'sensitivity',
        'rankedDrivers.length',
        prodSensitivity.rankedDrivers.length,
        refSensitivity.rankedDrivers.length,
      ),
    ).toBe(refSensitivity.rankedDrivers.length);

    for (let dIdx = 0; dIdx < refSensitivity.rankedDrivers.length; dIdx++) {
      const refD = refSensitivity.rankedDrivers[dIdx];
      const prodD = prodSensitivity.rankedDrivers[dIdx];

      expect(
        prodD.driver,
        formatDiagnostic(vector, 'sensitivity', `driver[${dIdx}].name`, prodD.driver, refD.driver),
      ).toBe(refD.driver);

      expect(
        prodD.rank,
        formatDiagnostic(vector, 'sensitivity', `driver[${dIdx}].rank`, prodD.rank, refD.rank),
      ).toBe(refD.rank);

      expect(
        prodD.impactScoreMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].impactScoreMinor`,
          prodD.impactScoreMinor,
          refD.impactScoreMinor,
        ),
      ).toBe(refD.impactScoreMinor);

      expect(
        prodD.lowerNetContribution.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].lowerNetContribution`,
          prodD.lowerNetContribution.amountMinor,
          refD.lowerNetContributionMinor,
        ),
      ).toBe(refD.lowerNetContributionMinor);

      expect(
        prodD.upperNetContribution.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].upperNetContribution`,
          prodD.upperNetContribution.amountMinor,
          refD.upperNetContributionMinor,
        ),
      ).toBe(refD.upperNetContributionMinor);

      expect(
        prodD.deltaLower.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].deltaLower`,
          prodD.deltaLower.amountMinor,
          refD.deltaLowerMinor,
        ),
      ).toBe(refD.deltaLowerMinor);

      expect(
        prodD.deltaUpper.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].deltaUpper`,
          prodD.deltaUpper.amountMinor,
          refD.deltaUpperMinor,
        ),
      ).toBe(refD.deltaUpperMinor);

      expect(
        prodD.lowerRevenue.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].lowerRevenue`,
          prodD.lowerRevenue.amountMinor,
          refD.lowerRevenueMinor,
        ),
      ).toBe(refD.lowerRevenueMinor);

      expect(
        prodD.upperRevenue.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].upperRevenue`,
          prodD.upperRevenue.amountMinor,
          refD.upperRevenueMinor,
        ),
      ).toBe(refD.upperRevenueMinor);

      expect(
        prodD.deltaLowerRevenue.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].deltaLowerRevenue`,
          prodD.deltaLowerRevenue.amountMinor,
          refD.deltaLowerRevenueMinor,
        ),
      ).toBe(refD.deltaLowerRevenueMinor);

      expect(
        prodD.deltaUpperRevenue.amountMinor,
        formatDiagnostic(
          vector,
          'sensitivity',
          `driver[${dIdx}].deltaUpperRevenue`,
          prodD.deltaUpperRevenue.amountMinor,
          refD.deltaUpperRevenueMinor,
        ),
      ).toBe(refD.deltaUpperRevenueMinor);
    }
  }

  // 5. Triad Scenarios Cross-Check
  const triadInput: CaseScenariosInput = {
    scenarios: vector.triadScenarios,
    currency: vector.currency,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
  };

  const refTriadInput: RefCaseScenariosInput = {
    scenarios: vector.triadScenarios,
    currency: vector.currency,
    format: vector.format,
    pages: vector.pages,
    fileSizeMb: vector.fileSizeMb,
  };

  const prodTriad = calculateTriadScenarios(triadInput, prodPack);
  const refTriad = refCalculateTriadScenarios(refTriadInput, refPack);

  for (const s of ['low', 'base', 'high'] as const) {
    const prodS = prodTriad.scenarios[s];
    const refS = refTriad.scenarios[s];

    expect(
      prodS.revenue.amountMinor,
      formatDiagnostic(
        vector,
        'triad',
        `${s}.revenue`,
        prodS.revenue.amountMinor,
        refS.revenueMinor,
      ),
    ).toBe(refS.revenueMinor);

    expect(
      prodS.grossRoyalty.amountMinor,
      formatDiagnostic(
        vector,
        'triad',
        `${s}.grossRoyalty`,
        prodS.grossRoyalty.amountMinor,
        refS.grossRoyaltyMinor,
      ),
    ).toBe(refS.grossRoyaltyMinor);

    expect(
      prodS.applicableCost.amountMinor,
      formatDiagnostic(
        vector,
        'triad',
        `${s}.applicableCost`,
        prodS.applicableCost.amountMinor,
        refS.productionCostMinor,
      ),
    ).toBe(refS.productionCostMinor);

    expect(
      prodS.netContribution.amountMinor,
      formatDiagnostic(
        vector,
        'triad',
        `${s}.netContribution`,
        prodS.netContribution.amountMinor,
        refS.netContributionMinor,
      ),
    ).toBe(refS.netContributionMinor);

    expect(
      prodS.exactTotalRoyalty.numerator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalRoyalty.numerator`,
        prodS.exactTotalRoyalty.numerator.toString(),
        refS.exactTotalRoyalty.numerator.toString(),
      ),
    ).toBe(refS.exactTotalRoyalty.numerator.toString());

    expect(
      prodS.exactTotalRoyalty.denominator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalRoyalty.denominator`,
        prodS.exactTotalRoyalty.denominator.toString(),
        refS.exactTotalRoyalty.denominator.toString(),
      ),
    ).toBe(refS.exactTotalRoyalty.denominator.toString());

    expect(
      prodS.exactTotalCost.numerator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalCost.numerator`,
        prodS.exactTotalCost.numerator.toString(),
        refS.exactTotalCost.numerator.toString(),
      ),
    ).toBe(refS.exactTotalCost.numerator.toString());

    expect(
      prodS.exactTotalCost.denominator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalCost.denominator`,
        prodS.exactTotalCost.denominator.toString(),
        refS.exactTotalCost.denominator.toString(),
      ),
    ).toBe(refS.exactTotalCost.denominator.toString());

    expect(
      prodS.exactTotalContribution.numerator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalContribution.numerator`,
        prodS.exactTotalContribution.numerator.toString(),
        refS.exactTotalContribution.numerator.toString(),
      ),
    ).toBe(refS.exactTotalContribution.numerator.toString());

    expect(
      prodS.exactTotalContribution.denominator.toString(),
      formatDiagnostic(
        vector,
        'triad',
        `${s}.exactTotalContribution.denominator`,
        prodS.exactTotalContribution.denominator.toString(),
        refS.exactTotalContribution.denominator.toString(),
      ),
    ).toBe(refS.exactTotalContribution.denominator.toString());
  }

  expect(
    prodTriad.ordering.areInputsMonotonicallyOrdered,
    formatDiagnostic(
      vector,
      'triad',
      'areInputsMonotonicallyOrdered',
      prodTriad.ordering.areInputsMonotonicallyOrdered,
      refTriad.ordering.areInputsMonotonicallyOrdered,
    ),
  ).toBe(refTriad.ordering.areInputsMonotonicallyOrdered);

  expect(
    prodTriad.ordering.areTotalsMonotonicallyOrdered,
    formatDiagnostic(
      vector,
      'triad',
      'areTotalsMonotonicallyOrdered',
      prodTriad.ordering.areTotalsMonotonicallyOrdered,
      refTriad.ordering.areTotalsMonotonicallyOrdered,
    ),
  ).toBe(refTriad.ordering.areTotalsMonotonicallyOrdered);

  expect(
    prodTriad.ordering.netContributionOrderingSatisfied,
    formatDiagnostic(
      vector,
      'triad',
      'netContributionOrderingSatisfied',
      prodTriad.ordering.netContributionOrderingSatisfied,
      refTriad.ordering.netContributionOrderingSatisfied,
    ),
  ).toBe(refTriad.ordering.netContributionOrderingSatisfied);

  expect(
    prodTriad.ordering.revenueOrderingSatisfied,
    formatDiagnostic(
      vector,
      'triad',
      'revenueOrderingSatisfied',
      prodTriad.ordering.revenueOrderingSatisfied,
      refTriad.ordering.revenueOrderingSatisfied,
    ),
  ).toBe(refTriad.ordering.revenueOrderingSatisfied);

  expect(
    prodTriad.ordering.details,
    formatDiagnostic(
      vector,
      'triad',
      'ordering.details',
      prodTriad.ordering.details,
      refTriad.ordering.details,
    ),
  ).toEqual(refTriad.ordering.details);
}

describe('Deterministic Differential Reference Test Suite', () => {
  it('covers all 4 synthetic Rule Packs across all 4 rounding modes and both aggregation points', () => {
    const configs = buildTestConfigurations();
    expect(configs.length).toBe(32); // 4 packs * 4 modes * 2 points
  });

  it(`generates at least ${GENERATED_CASE_COUNT} deterministic test vectors from seed ${DIFFERENTIAL_PRNG_SEED}`, () => {
    const vectors = generateVectors(DIFFERENTIAL_PRNG_SEED, GENERATED_CASE_COUNT);
    expect(vectors.length).toBe(GENERATED_CASE_COUNT);
  });

  it('produces 100% bit-for-bit identical vectors across repeated PRNG runs', () => {
    const run1 = generateVectors(DIFFERENTIAL_PRNG_SEED, 50);
    const run2 = generateVectors(DIFFERENTIAL_PRNG_SEED, 50);

    expect(run1).toEqual(run2);
  });

  it(`cross-checks all ${GENERATED_CASE_COUNT} generated vectors with zero financial drift`, () => {
    const vectors = generateVectors(DIFFERENTIAL_PRNG_SEED, GENERATED_CASE_COUNT);

    for (const vector of vectors) {
      runDifferentialVectorCheck(vector);
    }
  }, 90_000);

  describe('Explicit Financial Edge-Case Matrix', () => {
    const configs = buildTestConfigurations();

    it('evaluates boundary units (zero and one unit) across all configurations', () => {
      for (const config of configs) {
        const isPrint = config.refPack.format !== 'ebook';
        const limits = config.refPack.content.limits;
        const price = Math.min(limits.minListPriceMinor + 100, limits.maxListPriceMinor);

        for (const units of [0, 1]) {
          const vector: GeneratedVector = {
            caseIndex: -1,
            config,
            listPriceMinor: price,
            currency: config.refPack.currency,
            format: config.refPack.format,
            pages: isPrint ? (limits.minPages ?? 24) : undefined,
            fileSizeMb: isPrint ? undefined : '1.0',
            units,
            costVariancePercent: '0',
            fixedCostMinor: 1000,
            sensitivityDrivers: units >= 1 ? [{ driver: 'units', perturbation: 1 }] : [],
            triadScenarios: {
              low: { units: 0, listPriceMinor: price, costVariancePercent: '10' },
              base: { units, listPriceMinor: price, costVariancePercent: '0' },
              high: { units: 10, listPriceMinor: price, costVariancePercent: '-10' },
            },
          };
          runDifferentialVectorCheck(vector);
        }
      }
    });

    it('evaluates boundary list prices (min and max list price) across all configurations', () => {
      for (const config of configs) {
        const isPrint = config.refPack.format !== 'ebook';
        const limits = config.refPack.content.limits;

        for (const price of [limits.minListPriceMinor, limits.maxListPriceMinor]) {
          const vector: GeneratedVector = {
            caseIndex: -2,
            config,
            listPriceMinor: price,
            currency: config.refPack.currency,
            format: config.refPack.format,
            pages: isPrint ? (limits.minPages ?? 24) : undefined,
            fileSizeMb: isPrint ? undefined : '1.0',
            units: 100,
            costVariancePercent: '0',
            fixedCostMinor: 5000,
            sensitivityDrivers: [{ driver: 'units', perturbation: 10 }],
            triadScenarios: {
              low: { units: 50, listPriceMinor: price, costVariancePercent: '5' },
              base: { units: 100, listPriceMinor: price, costVariancePercent: '0' },
              high: { units: 200, listPriceMinor: price, costVariancePercent: '-5' },
            },
          };
          runDifferentialVectorCheck(vector);
        }
      }
    });

    it('evaluates royalty tier boundary values (below, at, and above thresholds) for Ebook', () => {
      const ebookConfigs = configs.filter((c) => c.packKey === 'TEST_EBOOK_STANDARD');
      // Thresholds: 298/299 and 999/1000
      const boundaryPrices = [99, 298, 299, 300, 998, 999, 1000, 1001, 2000];

      for (const config of ebookConfigs) {
        for (const price of boundaryPrices) {
          const vector: GeneratedVector = {
            caseIndex: -3,
            config,
            listPriceMinor: price,
            currency: 'USD',
            format: 'ebook',
            fileSizeMb: '1.0',
            units: 50,
            costVariancePercent: '0',
            fixedCostMinor: 10000,
            sensitivityDrivers: [{ driver: 'units', perturbation: 5 }],
            triadScenarios: {
              low: { units: 20, listPriceMinor: price, costVariancePercent: '0' },
              base: { units: 50, listPriceMinor: price, costVariancePercent: '0' },
              high: { units: 100, listPriceMinor: price, costVariancePercent: '0' },
            },
          };
          runDifferentialVectorCheck(vector);
        }
      }
    });

    it('evaluates cost variance boundaries (-100%, 0%, and high positive variance)', () => {
      for (const config of configs) {
        const isPrint = config.refPack.format !== 'ebook';
        const limits = config.refPack.content.limits;
        const price = Math.min(limits.minListPriceMinor + 200, limits.maxListPriceMinor);

        for (const cv of ['-100', '0', '50', '100']) {
          const vector: GeneratedVector = {
            caseIndex: -4,
            config,
            listPriceMinor: price,
            currency: config.refPack.currency,
            format: config.refPack.format,
            pages: isPrint ? (limits.minPages ?? 24) : undefined,
            fileSizeMb: isPrint ? undefined : '1.0',
            units: 200,
            costVariancePercent: cv,
            fixedCostMinor: 10000,
            sensitivityDrivers: [{ driver: 'units', perturbation: 20 }],
            triadScenarios: {
              low: { units: 100, listPriceMinor: price, costVariancePercent: cv },
              base: { units: 200, listPriceMinor: price, costVariancePercent: cv },
              high: { units: 300, listPriceMinor: price, costVariancePercent: cv },
            },
          };
          runDifferentialVectorCheck(vector);
        }
      }
    });

    it('evaluates positive, zero, and negative unit contribution and break-even behavior', () => {
      const printConfigs = configs.filter((c) => c.packKey.includes('PAPERBACK'));

      for (const config of printConfigs) {
        // 1. Positive unit contribution: list price $15.00, 100 pages -> royalty 900, print cost 252 -> +648 cents
        const positiveVector: GeneratedVector = {
          caseIndex: -10,
          config,
          listPriceMinor: 1500,
          currency: config.refPack.currency,
          format: config.refPack.format,
          pages: 100,
          units: 50,
          costVariancePercent: '0',
          fixedCostMinor: 64800,
          sensitivityDrivers: [{ driver: 'units', perturbation: 10 }],
          triadScenarios: {
            low: { units: 20, listPriceMinor: 1500, costVariancePercent: '0' },
            base: { units: 50, listPriceMinor: 1500, costVariancePercent: '0' },
            high: { units: 100, listPriceMinor: 1500, costVariancePercent: '0' },
          },
        };
        runDifferentialVectorCheck(positiveVector);

        // 2. Exactly zero unit contribution: list price $5.00 (500 cents), 124 pages -> royalty 300, print cost 300 -> exactly 0 cents
        const zeroVector: GeneratedVector = {
          caseIndex: -11,
          config,
          listPriceMinor: 500,
          currency: config.refPack.currency,
          format: config.refPack.format,
          pages: 124, // 100 + (124 - 24) * 2 = 300 print cost == 60% of 500
          units: 10,
          costVariancePercent: '0',
          fixedCostMinor: 10000,
          sensitivityDrivers: [{ driver: 'units', perturbation: 2 }],
          triadScenarios: {
            low: { units: 5, listPriceMinor: 500, costVariancePercent: '0' },
            base: { units: 10, listPriceMinor: 500, costVariancePercent: '0' },
            high: { units: 20, listPriceMinor: 500, costVariancePercent: '0' },
          },
        };
        runDifferentialVectorCheck(zeroVector);

        // 3. Negative unit contribution: list price $5.00, 350 pages -> royalty 300, print cost 752 -> -452 cents
        const negativeVector: GeneratedVector = {
          caseIndex: -12,
          config,
          listPriceMinor: 500,
          currency: config.refPack.currency,
          format: config.refPack.format,
          pages: 350,
          units: 10,
          costVariancePercent: '0',
          fixedCostMinor: 5000,
          sensitivityDrivers: [{ driver: 'units', perturbation: 1 }],
          triadScenarios: {
            low: { units: 5, listPriceMinor: 500, costVariancePercent: '0' },
            base: { units: 10, listPriceMinor: 500, costVariancePercent: '0' },
            high: { units: 20, listPriceMinor: 500, costVariancePercent: '0' },
          },
        };
        runDifferentialVectorCheck(negativeVector);
      }
    });

    it('evaluates safe-integer boundaries near Number.MAX_SAFE_INTEGER without precision loss', () => {
      const hardcoverConfig = configs.find(
        (c) =>
          c.packKey === 'TEST_HARDCOVER_GLOBAL' &&
          c.mode === 'round_down' &&
          c.point === 'per_unit',
      )!;

      // 1. High-volume aggregate revenue near Number.MAX_SAFE_INTEGER:
      // Units: 4,503,599,627,370 @ €20.00 -> 9,007,199,254,740,000 cents (MAX_SAFE_INTEGER is 9,007,199,254,740,091)
      const safeIntVector: GeneratedVector = {
        caseIndex: -20,
        config: hardcoverConfig,
        listPriceMinor: 2000,
        currency: 'EUR',
        format: 'hardcover',
        pages: 75,
        units: 4503599627370,
        costVariancePercent: '0',
        fixedCostMinor: 1000000,
        sensitivityDrivers: [],
        triadScenarios: {
          low: { units: 1000, listPriceMinor: 2000, costVariancePercent: '0' },
          base: { units: 2000, listPriceMinor: 2000, costVariancePercent: '0' },
          high: { units: 3000, listPriceMinor: 2000, costVariancePercent: '0' },
        },
      };
      runDifferentialVectorCheck(safeIntVector);

      // 2. Cloned Rule Pack extending listPriceMinor limit to Number.MAX_SAFE_INTEGER:
      // Verifies Number.MAX_SAFE_INTEGER - 1 and Number.MAX_SAFE_INTEGER price calculations with 1 unit
      const maxSafeIntCloned = JSON.parse(JSON.stringify(hardcoverConfig.prodPack));
      maxSafeIntCloned.content.limits.maxListPriceMinor = Number.MAX_SAFE_INTEGER;
      maxSafeIntCloned.content.royalty.tiers = [
        {
          name: 'safe_int_tier',
          minPriceMinor: 0,
          maxPriceMinor: Number.MAX_SAFE_INTEGER,
          royaltyRateDecimal: '1.0',
        },
      ];

      const customConfig: TestConfiguration = {
        prodPack: maxSafeIntCloned as CalcRulePack,
        refPack: maxSafeIntCloned as RefRulePack,
        packKey: 'TEST_HARDCOVER_GLOBAL',
        version: '1.0.0',
        mode: 'round_down',
        point: 'per_unit',
      };

      for (const price of [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]) {
        const boundaryVector: GeneratedVector = {
          caseIndex: -21,
          config: customConfig,
          listPriceMinor: price,
          currency: 'EUR',
          format: 'hardcover',
          pages: 75,
          units: 1,
          costVariancePercent: '0',
          fixedCostMinor: 100,
          sensitivityDrivers: [],
          triadScenarios: {
            low: { units: 1, listPriceMinor: price, costVariancePercent: '0' },
            base: { units: 1, listPriceMinor: price, costVariancePercent: '0' },
            high: { units: 1, listPriceMinor: price, costVariancePercent: '0' },
          },
        };
        runDifferentialVectorCheck(boundaryVector);
      }
    });

    it('evaluates sensitivity ranking ties with deterministic alphabetical tie-breaking', () => {
      const pbackConfig = configs.find(
        (c) =>
          c.packKey === 'TEST_PAPERBACK_US' &&
          c.version === '1.0.0' &&
          c.mode === 'round_half_up' &&
          c.point === 'per_unit',
      )!;

      // Carefully hand-derived 3-way tie:
      // Baseline: 1000 units @ $10.00, 24 pages (print cost = 100 cents), 60% royalty = 600.
      // Unit contribution = 500 cents. Baseline net contribution = 500,000 cents.
      // 1. costVariancePercent perturbation "60": lower cost 40 -> contrib 560,000 (delta +60,000); upper cost 160 -> contrib 440,000 (delta -60,000). Impact: 60,000.
      // 2. listPriceMinor perturbation 100: lower price $9.00 -> contrib 440,000 (delta -60,000); upper price $11.00 -> contrib 560,000 (delta +60,000). Impact: 60,000.
      // 3. units perturbation 120: lower units 880 -> contrib 440,000 (delta -60,000); upper units 1120 -> contrib 560,000 (delta +60,000). Impact: 60,000.
      const tieDrivers: RefSensitivityDriverConfig[] = [
        { driver: 'units', perturbation: 120 },
        { driver: 'listPriceMinor', perturbation: 100 },
        { driver: 'costVariancePercent', perturbation: '60' },
      ];

      for (const d of tieDrivers) {
        exercisedSensitivityDrivers.add(d.driver);
      }

      const tieVector: GeneratedVector = {
        caseIndex: -30,
        config: pbackConfig,
        listPriceMinor: 1000,
        currency: 'USD',
        format: 'paperback',
        pages: 24,
        units: 1000,
        costVariancePercent: '0',
        fixedCostMinor: 10000,
        sensitivityDrivers: tieDrivers,
        triadScenarios: {
          low: { units: 500, listPriceMinor: 900, costVariancePercent: '10' },
          base: { units: 1000, listPriceMinor: 1000, costVariancePercent: '0' },
          high: { units: 1500, listPriceMinor: 1100, costVariancePercent: '-10' },
        },
      };

      runDifferentialVectorCheck(tieVector);

      // Verify tie details explicitly
      const prodSensitivity = calculateSensitivity(
        {
          baseline: {
            scenarioName: 'base',
            units: 1000,
            listPriceMinor: 1000,
            currency: 'USD',
            format: 'paperback',
            pages: 24,
            costVariancePercent: '0',
          },
          drivers: tieDrivers as SensitivityDriverConfig[],
        },
        pbackConfig.prodPack,
      );

      // All 3 drivers have equal impactScoreMinor = 60000
      expect(prodSensitivity.rankedDrivers[0].impactScoreMinor).toBe(60000);
      expect(prodSensitivity.rankedDrivers[1].impactScoreMinor).toBe(60000);
      expect(prodSensitivity.rankedDrivers[2].impactScoreMinor).toBe(60000);

      // Deterministic alphabetical tie-breaking: costVariancePercent < listPriceMinor < units
      expect(prodSensitivity.rankedDrivers[0].driver).toBe('costVariancePercent');
      expect(prodSensitivity.rankedDrivers[0].rank).toBe(1);

      expect(prodSensitivity.rankedDrivers[1].driver).toBe('listPriceMinor');
      expect(prodSensitivity.rankedDrivers[1].rank).toBe(2);

      expect(prodSensitivity.rankedDrivers[2].driver).toBe('units');
      expect(prodSensitivity.rankedDrivers[2].rank).toBe(3);
    });

    it('evaluates sensitivity perturbation boundary cases and exercises all 3 drivers', () => {
      const pbackConfig = configs.find(
        (c) =>
          c.packKey === 'TEST_PAPERBACK_US' &&
          c.version === '1.0.0' &&
          c.mode === 'round_half_even' &&
          c.point === 'per_unit',
      )!;

      // 1. Units perturbation reaching zero units: baseline = 50, delta = 50 -> lower units = 0
      const unitsZeroVector: GeneratedVector = {
        caseIndex: -40,
        config: pbackConfig,
        listPriceMinor: 1500,
        currency: 'USD',
        format: 'paperback',
        pages: 100,
        units: 50,
        costVariancePercent: '0',
        fixedCostMinor: 10000,
        sensitivityDrivers: [{ driver: 'units', perturbation: 50 }],
        triadScenarios: {
          low: { units: 10, listPriceMinor: 1200, costVariancePercent: '0' },
          base: { units: 50, listPriceMinor: 1500, costVariancePercent: '0' },
          high: { units: 100, listPriceMinor: 1800, costVariancePercent: '0' },
        },
      };
      runDifferentialVectorCheck(unitsZeroVector);
      exercisedSensitivityDrivers.add('units');

      // 2. List price reaching minimum ($5.00 / 500 cents): baseline = 600, delta = 100 -> lower price = 500
      const priceMinVector: GeneratedVector = {
        caseIndex: -41,
        config: pbackConfig,
        listPriceMinor: 600,
        currency: 'USD',
        format: 'paperback',
        pages: 100,
        units: 100,
        costVariancePercent: '0',
        fixedCostMinor: 10000,
        sensitivityDrivers: [{ driver: 'listPriceMinor', perturbation: 100 }],
        triadScenarios: {
          low: { units: 50, listPriceMinor: 500, costVariancePercent: '0' },
          base: { units: 100, listPriceMinor: 600, costVariancePercent: '0' },
          high: { units: 200, listPriceMinor: 700, costVariancePercent: '0' },
        },
      };
      runDifferentialVectorCheck(priceMinVector);
      exercisedSensitivityDrivers.add('listPriceMinor');

      // 3. List price reaching maximum ($250.00 / 25000 cents): baseline = 24500, delta = 500 -> upper price = 25000
      const priceMaxVector: GeneratedVector = {
        caseIndex: -42,
        config: pbackConfig,
        listPriceMinor: 24500,
        currency: 'USD',
        format: 'paperback',
        pages: 100,
        units: 100,
        costVariancePercent: '0',
        fixedCostMinor: 10000,
        sensitivityDrivers: [{ driver: 'listPriceMinor', perturbation: 500 }],
        triadScenarios: {
          low: { units: 50, listPriceMinor: 24000, costVariancePercent: '0' },
          base: { units: 100, listPriceMinor: 24500, costVariancePercent: '0' },
          high: { units: 200, listPriceMinor: 25000, costVariancePercent: '0' },
        },
      };
      runDifferentialVectorCheck(priceMaxVector);

      // 4. Cost variance reaching exactly -100%: baseline = -50%, delta = 50 -> lower variance = -100%
      const costVarBoundaryVector: GeneratedVector = {
        caseIndex: -43,
        config: pbackConfig,
        listPriceMinor: 1500,
        currency: 'USD',
        format: 'paperback',
        pages: 100,
        units: 100,
        costVariancePercent: '-50',
        fixedCostMinor: 10000,
        sensitivityDrivers: [{ driver: 'costVariancePercent', perturbation: '50' }],
        triadScenarios: {
          low: { units: 50, listPriceMinor: 1200, costVariancePercent: '0' },
          base: { units: 100, listPriceMinor: 1500, costVariancePercent: '-50' },
          high: { units: 200, listPriceMinor: 1800, costVariancePercent: '-75' },
        },
      };
      runDifferentialVectorCheck(costVarBoundaryVector);
      exercisedSensitivityDrivers.add('costVariancePercent');

      // Deterministic coverage assertion: verify all 3 drivers are actively exercised
      expect(Array.from(exercisedSensitivityDrivers).sort()).toEqual([
        'costVariancePercent',
        'listPriceMinor',
        'units',
      ]);
    });

    it('evaluates intentionally non-monotonic triad inputs across configurations', () => {
      const pbackConfig = configs.find(
        (c) =>
          c.packKey === 'TEST_PAPERBACK_US' &&
          c.version === '1.0.0' &&
          c.mode === 'round_half_even' &&
          c.point === 'per_unit',
      )!;

      // Inverted units: low units (500) > base units (200) > high units (50)
      const nonMonotonicVector: GeneratedVector = {
        caseIndex: -50,
        config: pbackConfig,
        listPriceMinor: 1500,
        currency: 'USD',
        format: 'paperback',
        pages: 100,
        units: 200,
        costVariancePercent: '0',
        fixedCostMinor: 10000,
        sensitivityDrivers: [],
        triadScenarios: {
          low: { units: 500, listPriceMinor: 1000, costVariancePercent: '0' },
          base: { units: 200, listPriceMinor: 1500, costVariancePercent: '0' },
          high: { units: 50, listPriceMinor: 2000, costVariancePercent: '0' },
        },
      };

      runDifferentialVectorCheck(nonMonotonicVector);
    });
  });
});
