import { type CurrencyCode, Money } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import ebookPackJson from '../../../../fixtures/rules/TEST_EBOOK_STANDARD/1.0.0/pack.json';
import hardcoverPackJson from '../../../../fixtures/rules/TEST_HARDCOVER_GLOBAL/1.0.0/pack.json';
import paperbackV1PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/1.0.0/pack.json';
import paperbackV2PackJson from '../../../../fixtures/rules/TEST_PAPERBACK_US/2.0.0/pack.json';
import type { CalcRulePack } from '../per-unit/types';
import { calculateSingleScenario } from '../scenarios/scenario-calc';
import { calculateBreakEven } from './break-even-calc';

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

describe('Break-Even Property-Based Testing (Mulberry32 PRNG)', () => {
  const packs = [
    ebookPackJson as unknown as CalcRulePack,
    paperbackV1PackJson as unknown as CalcRulePack,
    paperbackV2PackJson as unknown as CalcRulePack,
    hardcoverPackJson as unknown as CalcRulePack,
  ];

  it('Property 1: Fixed-Cost Monotonicity: F2 >= F1 implies Q_be(F2) >= Q_be(F1)', () => {
    const prng = createPrng(2001);
    let comparisonsEvaluated = 0;

    for (let i = 0; i < 50; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(prng, Math.max(minPrice, 2000), Math.min(maxPrice, 5000));

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;

      const f1Minor = randomInt(prng, 0, 500000);
      const f2Minor = f1Minor + randomInt(prng, 0, 500000);

      const res1 = calculateBreakEven(
        {
          fixedCost: Money.of(f1Minor, pack.currency as CurrencyCode),
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      const res2 = calculateBreakEven(
        {
          fixedCost: Money.of(f2Minor, pack.currency as CurrencyCode),
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      // Verify reachability by construction (positive unit contribution, non-negative fixed cost)
      expect(res1.reachable).toBe(true);
      expect(res2.reachable).toBe(true);

      if (res1.reachable && res2.reachable) {
        comparisonsEvaluated++;
        expect(res2.units).toBeGreaterThanOrEqual(res1.units);
        expect(res2.revenue.amountMinor).toBeGreaterThanOrEqual(res1.revenue.amountMinor);
      }
    }

    // Guarantee non-vacuous property execution
    expect(comparisonsEvaluated).toBe(50);
  });

  it('Property 2: Threshold Coverage under Supported Synthetic Packs: Total Contribution at formula Q_be covers Fixed Cost', () => {
    const prng = createPrng(2002);
    let testsEvaluated = 0;

    for (let i = 0; i < 50; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(prng, Math.max(minPrice, 2000), Math.min(maxPrice, 5000));

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;

      const fixedCostMinor = randomInt(prng, 100, 500000);

      const be = calculateBreakEven(
        {
          fixedCost: Money.of(fixedCostMinor, pack.currency as CurrencyCode),
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(be.reachable).toBe(true);
      if (be.reachable && be.units > 0) {
        testsEvaluated++;
        // Run scenario aggregation at Q_be
        const scenario = calculateSingleScenario(
          {
            scenarioName: 'base',
            units: be.units,
            listPriceMinor,
            currency: pack.currency,
            format: pack.format,
            pages,
            fileSizeMb,
          },
          pack,
        );

        // For supported synthetic packs (per_unit and per_total with round_half_up),
        // total contribution at the formula-defined Q_be covers fixed cost.
        // Note: As established in repository owner Decision 1, the formula does not guarantee
        // universal coverage for all theoretical Rule Pack configurations (e.g. per_total with round_half_even).
        expect(scenario.netContribution.amountMinor).toBeGreaterThanOrEqual(fixedCostMinor);
      }
    }

    expect(testsEvaluated).toBe(50);
  });

  it('Property 3: Minimum Whole-Unit Optimality for per_unit: Q_be - 1 does not cover Fixed Cost', () => {
    const prng = createPrng(2003);
    let testsEvaluated = 0;

    // Filter to per_unit packs where unit contribution is an integer minor unit
    // guaranteeing monotonic whole-unit optimality: Q_be - 1 strictly under-covers.
    // (Under per_total, aggregate rounded contribution can be non-monotonic, so Q_be - 1 does not establish optimality).
    const perUnitPacks = packs.filter((p) => p.content.rounding.point === 'per_unit');

    for (let i = 0; i < 50; i++) {
      const pack = perUnitPacks[randomInt(prng, 0, perUnitPacks.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(prng, Math.max(minPrice, 1500), Math.min(maxPrice, 5000));

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;

      const fixedCostMinor = randomInt(prng, 100, 500000);

      const be = calculateBreakEven(
        {
          fixedCost: Money.of(fixedCostMinor, pack.currency as CurrencyCode),
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(be.reachable).toBe(true);
      if (be.reachable && be.units >= 1) {
        testsEvaluated++;
        // Evaluate scenario at Q_be - 1
        const prevScenario = calculateSingleScenario(
          {
            scenarioName: 'base',
            units: be.units - 1,
            listPriceMinor,
            currency: pack.currency,
            format: pack.format,
            pages,
            fileSizeMb,
          },
          pack,
        );

        expect(prevScenario.netContribution.amountMinor).toBeLessThan(fixedCostMinor);
      }
    }

    expect(testsEvaluated).toBe(50);
  });

  it('Property 4: Calculation Determinism across Repeated Executions', () => {
    const prng = createPrng(2004);

    for (let i = 0; i < 25; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(prng, minPrice, maxPrice);

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 300);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 5)}` : undefined;
      const fixedCostMinor = randomInt(prng, 0, 300000);

      const input = {
        fixedCost: Money.of(fixedCostMinor, pack.currency as CurrencyCode),
        listPriceMinor,
        currency: pack.currency,
        format: pack.format,
        pages,
        fileSizeMb,
      };

      const res1 = calculateBreakEven(input, pack);
      const res2 = calculateBreakEven(input, pack);

      expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
    }
  });

  it('Property 5: Revenue Consistency: revenueMinor === listPriceMinor * units', () => {
    const prng = createPrng(2005);
    let testsEvaluated = 0;

    for (let i = 0; i < 30; i++) {
      const pack = packs[randomInt(prng, 0, packs.length - 1)]!;
      const limits = pack.content.limits;
      const minPrice = limits ? limits.minListPriceMinor : 99;
      const maxPrice = limits ? limits.maxListPriceMinor : 20000;
      const listPriceMinor = randomInt(prng, Math.max(minPrice, 2000), Math.min(maxPrice, 5000));

      const isEbook = pack.format === 'ebook';
      const pages = isEbook ? undefined : randomInt(prng, limits?.minPages ?? 24, 200);
      const fileSizeMb = isEbook ? `${randomInt(prng, 1, 3)}` : undefined;
      const fixedCostMinor = randomInt(prng, 0, 500000);

      const be = calculateBreakEven(
        {
          fixedCost: Money.of(fixedCostMinor, pack.currency as CurrencyCode),
          listPriceMinor,
          currency: pack.currency,
          format: pack.format,
          pages,
          fileSizeMb,
        },
        pack,
      );

      expect(be.reachable).toBe(true);
      if (be.reachable) {
        testsEvaluated++;
        expect(be.revenue.amountMinor).toBe(listPriceMinor * be.units);
      }
    }

    expect(testsEvaluated).toBe(30);
  });
});
