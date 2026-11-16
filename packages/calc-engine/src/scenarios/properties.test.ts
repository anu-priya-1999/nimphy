import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario, calculateTriadScenarios } from './scenario-calc';

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

describe('Scenario & Total Economics Property-Based Testing (Mulberry32 PRNG)', () => {
  const packs = [
    ebookPackJson as unknown as CalcRulePack,
    paperbackV1PackJson as unknown as CalcRulePack,
    paperbackV2PackJson as unknown as CalcRulePack,
    hardcoverPackJson as unknown as CalcRulePack,
  ];

  it('Property 1: Unit Monotonicity for Non-Negative Unit Contribution', () => {
    const prng = createPrng(1001);

    for (let i = 0; i < 50; i++) {
      // Pick a random pack
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;

      // Ensure price is reasonably high to ensure positive unit contribution
      const minPrice = limits.minListPriceMinor;
      const maxPrice = limits.maxListPriceMinor;
      const listPriceMinor = randomInt(prng, Math.max(minPrice, 1000), Math.min(maxPrice, 5000));

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 5)}` : undefined;

      const q1 = randomInt(prng, 0, 500);
      const q2 = q1 + randomInt(prng, 1, 500);

      const res1 = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: q1,
          listPriceMinor,
          costVariancePercent: '0',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      const res2 = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: q2,
          listPriceMinor,
          costVariancePercent: '0',
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      if (
        res1.perUnitEconomics.exactNetContribution.isPositive() ||
        res1.perUnitEconomics.exactNetContribution.isZero()
      ) {
        expect(res2.netContribution.amountMinor).toBeGreaterThanOrEqual(
          res1.netContribution.amountMinor,
        );
      }
    }
  });

  it('Property 2: Unit Monotonicity for Negative Unit Contribution', () => {
    // Paperback US v1 at minimum price $5.00 with large page count produces negative unit contribution
    const pack = paperbackV1PackJson as unknown as CalcRulePack;
    const prng = createPrng(1002);

    for (let i = 0; i < 25; i++) {
      const q1 = randomInt(prng, 0, 300);
      const q2 = q1 + randomInt(prng, 1, 300);

      const res1 = calculateSingleScenario(
        {
          scenarioName: 'low',
          units: q1,
          listPriceMinor: 500, // $5.00
          costVariancePercent: '0',
          currency: 'USD',
          format: 'paperback',
          pages: 400, // 400 pages -> print cost = 100 + 376*2 = 852 cents; royalty = 300 cents -> unit contribution = -552 cents
        },
        pack,
      );

      const res2 = calculateSingleScenario(
        {
          scenarioName: 'low',
          units: q2,
          listPriceMinor: 500,
          costVariancePercent: '0',
          currency: 'USD',
          format: 'paperback',
          pages: 400,
        },
        pack,
      );

      // Increasing quantity on unprofitable title must worsen (or keep at 0) total contribution
      expect(res2.netContribution.amountMinor).toBeLessThanOrEqual(
        res1.netContribution.amountMinor,
      );
    }
  });

  it('Property 3: Monotonic Scenario Ordering (Low <= Base <= High) under Economically Ordered Parameters', () => {
    const prng = createPrng(1003);

    for (let i = 0; i < 50; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;

      const pLow = randomInt(
        prng,
        limits.minListPriceMinor,
        Math.min(limits.maxListPriceMinor, limits.minListPriceMinor + 500),
      );
      const pBase = Math.min(limits.maxListPriceMinor, pLow + randomInt(prng, 0, 500));
      const pHigh = Math.min(limits.maxListPriceMinor, pBase + randomInt(prng, 0, 800));

      const uLow = randomInt(prng, 10, 200);
      const uBase = uLow + randomInt(prng, 0, 400);
      const uHigh = uBase + randomInt(prng, 0, 1000);

      // Cost variance: low >= base >= high (higher variance means higher cost, reducing profit)
      const cvLow = randomInt(prng, 10, 30);
      const cvBase = randomInt(prng, 0, 10);
      const cvHigh = randomInt(prng, -20, 0);

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits.minPages ?? 24, 150);
      const fileSizeMb = isEbook ? '1' : undefined;

      const triad = calculateTriadScenarios(
        {
          scenarios: {
            low: { units: uLow, listPriceMinor: pLow, costVariancePercent: String(cvLow) },
            base: { units: uBase, listPriceMinor: pBase, costVariancePercent: String(cvBase) },
            high: { units: uHigh, listPriceMinor: pHigh, costVariancePercent: String(cvHigh) },
          },
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(triad.ordering.areInputsMonotonicallyOrdered).toBe(true);

      // Verify net contribution ordering
      expect(triad.scenarios.low.netContribution.amountMinor).toBeLessThanOrEqual(
        triad.scenarios.base.netContribution.amountMinor,
      );
      expect(triad.scenarios.base.netContribution.amountMinor).toBeLessThanOrEqual(
        triad.scenarios.high.netContribution.amountMinor,
      );

      // Verify revenue ordering
      expect(triad.scenarios.low.revenue.amountMinor).toBeLessThanOrEqual(
        triad.scenarios.base.revenue.amountMinor,
      );
      expect(triad.scenarios.base.revenue.amountMinor).toBeLessThanOrEqual(
        triad.scenarios.high.revenue.amountMinor,
      );
    }
  });

  it('Property 4: Zero Quantity Invariant (Q = 0 yields zero across all financial totals)', () => {
    const prng = createPrng(1004);

    for (let i = 0; i < 30; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const listPriceMinor = randomInt(prng, limits.minListPriceMinor, limits.maxListPriceMinor);

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? '1.5' : undefined;

      const res = calculateSingleScenario(
        {
          scenarioName: 'base',
          units: 0,
          listPriceMinor,
          costVariancePercent: String(randomInt(prng, -50, 50)),
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(res.revenue.amountMinor).toBe(0);
      expect(res.grossRoyalty.amountMinor).toBe(0);
      expect(res.applicableCost.amountMinor).toBe(0);
      expect(res.netContribution.amountMinor).toBe(0);
      expect(res.exactTotalRoyalty.isZero()).toBe(true);
      expect(res.exactTotalCost.isZero()).toBe(true);
      expect(res.exactTotalContribution.isZero()).toBe(true);
    }
  });

  it('Property 5: Exact Revenue Linearity (Revenue = listPrice * units)', () => {
    const prng = createPrng(1005);

    for (let i = 0; i < 40; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const listPriceMinor = randomInt(
        prng,
        limits.minListPriceMinor,
        Math.min(limits.maxListPriceMinor, 10000),
      );
      const units = randomInt(prng, 0, 5000);

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? '1' : undefined;

      const res = calculateSingleScenario(
        {
          scenarioName: 'base',
          units,
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(res.revenue.amountMinor).toBe(listPriceMinor * units);
    }
  });

  it('Property 6: Net Contribution Derivation Identity (Contribution = Royalty - Cost)', () => {
    const prng = createPrng(1006);

    for (let i = 0; i < 50; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const listPriceMinor = randomInt(
        prng,
        limits.minListPriceMinor,
        Math.min(limits.maxListPriceMinor, 10000),
      );
      const units = randomInt(prng, 1, 1000);

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? '0.75' : undefined;

      const res = calculateSingleScenario(
        {
          scenarioName: 'base',
          units,
          listPriceMinor,
          costVariancePercent: String(randomInt(prng, -20, 40)),
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      // In minor units, Money subtraction holds exactly
      expect(res.netContribution.amountMinor).toBe(
        res.grossRoyalty.amountMinor - res.applicableCost.amountMinor,
      );

      // Exact Rational subtraction holds exactly
      const diffRational = res.exactTotalRoyalty.subtract(res.exactTotalCost);
      expect(res.exactTotalContribution.equals(diffRational)).toBe(true);
    }
  });
});
