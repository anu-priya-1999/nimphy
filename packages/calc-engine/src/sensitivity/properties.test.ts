import { toCanonicalJson } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario } from '../scenarios/scenario-calc';
import type { SingleScenarioInput } from '../scenarios/types';
import { calculateSensitivity } from './sensitivity-calc';
import type { SensitivityInput } from './types';

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
function createPrng(seed = 0xabcdef42) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(prng: () => number, min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

describe('Sensitivity Analysis Property-Based Testing (Mulberry32 PRNG)', () => {
  const packs = [
    ebookPackJson as unknown as CalcRulePack,
    paperbackV1PackJson as unknown as CalcRulePack,
    paperbackV2PackJson as unknown as CalcRulePack,
    hardcoverPackJson as unknown as CalcRulePack,
  ];

  it('Property 1: Bit-for-bit canonical determinism across repeated runs', () => {
    const prng = createPrng(3001);

    for (let i = 0; i < 25; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(
        prng,
        Math.max(minPrice + 100, 1000),
        Math.min(maxPrice - 100, 5000),
      );

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;
      const units = randomInt(prng, 100, 1000);

      const input: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units,
          listPriceMinor,
          costVariancePercent: '0',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        drivers: [
          { driver: 'units', perturbation: randomInt(prng, 10, 50) },
          { driver: 'listPriceMinor', perturbation: randomInt(prng, 10, 50) },
          { driver: 'costVariancePercent', perturbation: `${randomInt(prng, 1, 10)}` },
        ],
      };

      const res1 = calculateSensitivity(input, pack);
      const res2 = calculateSensitivity(input, pack);

      expect(toCanonicalJson(res1)).toBe(toCanonicalJson(res2));
    }
  });

  it('Property 2: Unchanged baseline parameters remain untouched in one-at-a-time perturbations', () => {
    const prng = createPrng(3002);

    for (let i = 0; i < 25; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(
        prng,
        Math.max(minPrice + 100, 1000),
        Math.min(maxPrice - 100, 5000),
      );

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;
      const units = randomInt(prng, 100, 1000);

      const input: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units,
          listPriceMinor,
          costVariancePercent: '5',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        drivers: [
          { driver: 'units', perturbation: randomInt(prng, 10, 50) },
          { driver: 'listPriceMinor', perturbation: randomInt(prng, 10, 50) },
          { driver: 'costVariancePercent', perturbation: `${randomInt(prng, 1, 10)}` },
        ],
      };

      const result = calculateSensitivity(input, pack);

      for (const d of result.rankedDrivers) {
        if (d.driver === 'units') {
          // listPrice and costVariance must remain untouched
          expect(d.lowerScenario.listPrice.amountMinor).toBe(listPriceMinor);
          expect(d.upperScenario.listPrice.amountMinor).toBe(listPriceMinor);
        } else if (d.driver === 'listPriceMinor') {
          // units must remain untouched
          expect(d.lowerScenario.units).toBe(units);
          expect(d.upperScenario.units).toBe(units);
        } else {
          // costVariancePercent: units and listPrice must remain untouched
          expect(d.lowerScenario.units).toBe(units);
          expect(d.upperScenario.units).toBe(units);
          expect(d.lowerScenario.listPrice.amountMinor).toBe(listPriceMinor);
          expect(d.upperScenario.listPrice.amountMinor).toBe(listPriceMinor);
        }
      }
    }
  });

  it('Property 3: Ranking is descending by impact score with deterministic tie-breaking', () => {
    const prng = createPrng(3003);

    for (let i = 0; i < 25; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(
        prng,
        Math.max(minPrice + 100, 1000),
        Math.min(maxPrice - 100, 5000),
      );

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;
      const units = randomInt(prng, 100, 1000);

      const input: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units,
          listPriceMinor,
          costVariancePercent: '0',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        drivers: [
          { driver: 'units', perturbation: randomInt(prng, 10, 50) },
          { driver: 'listPriceMinor', perturbation: randomInt(prng, 10, 50) },
          { driver: 'costVariancePercent', perturbation: `${randomInt(prng, 1, 10)}` },
        ],
      };

      const result = calculateSensitivity(input, pack);

      for (let j = 0; j < result.rankedDrivers.length - 1; j++) {
        const current = result.rankedDrivers[j]!;
        const next = result.rankedDrivers[j + 1]!;

        // 1. Monotonicity of rank index
        expect(current.rank).toBe(j + 1);
        expect(next.rank).toBe(j + 2);

        // 2. Descending impact score
        expect(current.impactScoreMinor).toBeGreaterThanOrEqual(next.impactScoreMinor);

        // 3. Stable tie-break if impact scores are equal
        if (current.impactScoreMinor === next.impactScoreMinor) {
          expect(current.driver < next.driver).toBe(true);
        }
      }
    }

    // Explicit non-vacuous tie verification: at units = 0, price and cost variance both yield impact 0
    for (const pack of packs) {
      const isEbook = pack.format === 'ebook';
      const tieInput: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units: 0,
          listPriceMinor: 2000,
          costVariancePercent: '0',
          currency: pack.currency,
          format: pack.format,
          pages: isEbook ? undefined : 100,
          fileSizeMb: isEbook ? '1' : undefined,
        },
        drivers: [
          { driver: 'listPriceMinor', perturbation: 100 },
          { driver: 'costVariancePercent', perturbation: '10' },
        ],
      };
      const tieResult = calculateSensitivity(tieInput, pack);
      expect(tieResult.rankedDrivers[0]!.impactScoreMinor).toBe(0);
      expect(tieResult.rankedDrivers[1]!.impactScoreMinor).toBe(0);
      expect(tieResult.rankedDrivers[0]!.driver).toBe('costVariancePercent');
      expect(tieResult.rankedDrivers[1]!.driver).toBe('listPriceMinor');
      expect(tieResult.rankedDrivers[0]!.driver < tieResult.rankedDrivers[1]!.driver).toBe(true);
    }
  });

  it('Property 4: Exact agreement with independently invoked calculateSingleScenario across all drivers', () => {
    const prng = createPrng(3004);

    for (let i = 0; i < 20; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(
        prng,
        Math.max(minPrice + 100, 1000),
        Math.min(maxPrice - 100, 5000),
      );

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;
      const units = randomInt(prng, 100, 1000);
      const pertUnits = randomInt(prng, 10, 50);
      const pertPrice = randomInt(prng, 10, 50);
      const pertVariance = `${randomInt(prng, 1, 10)}`;

      const input: SensitivityInput = {
        baseline: {
          scenarioName: 'base',
          units,
          listPriceMinor,
          costVariancePercent: '5',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        drivers: [
          { driver: 'units', perturbation: pertUnits },
          { driver: 'listPriceMinor', perturbation: pertPrice },
          { driver: 'costVariancePercent', perturbation: pertVariance },
        ],
      };

      const result = calculateSensitivity(input, pack);

      for (const d of result.rankedDrivers) {
        let expectedLowerInput: SingleScenarioInput;
        let expectedUpperInput: SingleScenarioInput;

        if (d.driver === 'units') {
          expectedLowerInput = {
            ...input.baseline,
            scenarioName: 'base',
            units: units - pertUnits,
          };
          expectedUpperInput = {
            ...input.baseline,
            scenarioName: 'base',
            units: units + pertUnits,
          };
        } else if (d.driver === 'listPriceMinor') {
          expectedLowerInput = {
            ...input.baseline,
            scenarioName: 'base',
            listPriceMinor: listPriceMinor - pertPrice,
          };
          expectedUpperInput = {
            ...input.baseline,
            scenarioName: 'base',
            listPriceMinor: listPriceMinor + pertPrice,
          };
        } else {
          const baseV = 5;
          const pertV = parseInt(pertVariance, 10);
          expectedLowerInput = {
            ...input.baseline,
            scenarioName: 'base',
            costVariancePercent: `${baseV - pertV}`,
          };
          expectedUpperInput = {
            ...input.baseline,
            scenarioName: 'base',
            costVariancePercent: `${baseV + pertV}`,
          };
        }

        const independentLower = calculateSingleScenario(expectedLowerInput, pack);
        const independentUpper = calculateSingleScenario(expectedUpperInput, pack);

        expect(d.lowerNetContribution.amountMinor).toBe(
          independentLower.netContribution.amountMinor,
        );
        expect(d.upperNetContribution.amountMinor).toBe(
          independentUpper.netContribution.amountMinor,
        );
      }
    }
  });
});
