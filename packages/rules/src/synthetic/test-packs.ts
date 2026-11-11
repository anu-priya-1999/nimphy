import { parseRulePack } from '../schema/validator';
import type { RulePack } from '../schema/types';

/**
 * Built-in synthetic Rule Pack: TEST_EBOOK_STANDARD v1.0.0
 * For testing and synthetic calculation runs only. Contains no actual commercial publisher data.
 */
export const TEST_EBOOK_STANDARD_1_0_0: RulePack = parseRulePack({
  id: '550e8400-e29b-41d4-a716-446655440001',
  packKey: 'TEST_EBOOK_STANDARD',
  version: '1.0.0',
  status: 'published',
  marketplace: 'TEST_MARKETPLACE',
  format: 'ebook',
  currency: 'USD',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  sourceRef: 'Synthetic Test Specification SYNTH-EBOOK-001',
  sourceRetrievedAt: '2026-01-01',
  content: {
    rounding: {
      mode: 'round_half_up',
      point: 'per_unit',
    },
    royalty: {
      tiers: [
        {
          name: 'standard_low',
          minPriceMinor: 99,
          maxPriceMinor: 298,
          royaltyRateDecimal: '0.35',
        },
        {
          name: 'standard_mid',
          minPriceMinor: 299,
          maxPriceMinor: 999,
          royaltyRateDecimal: '0.70',
        },
        {
          name: 'standard_high',
          minPriceMinor: 1000,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.35',
        },
      ],
    },
    printCost: null,
    deliveryCost: {
      costPerMbMinor: 15,
    },
    limits: {
      minListPriceMinor: 99,
      maxListPriceMinor: 20000,
      minPages: null,
      maxPages: null,
    },
  },
});

/**
 * Built-in synthetic Rule Pack: TEST_PAPERBACK_US v1.0.0 (Historical window: 2025-01-01 to 2025-12-31)
 * For testing date-based selection and version transitions.
 */
export const TEST_PAPERBACK_US_1_0_0: RulePack = parseRulePack({
  id: '550e8400-e29b-41d4-a716-446655440002',
  packKey: 'TEST_PAPERBACK_US',
  version: '1.0.0',
  status: 'published',
  marketplace: 'TEST_MARKETPLACE',
  format: 'paperback',
  currency: 'USD',
  effectiveFrom: '2025-01-01',
  effectiveTo: '2025-12-31',
  sourceRef: 'Synthetic Test Specification SYNTH-PRINT-001',
  sourceRetrievedAt: '2025-01-01',
  content: {
    rounding: {
      mode: 'round_half_even',
      point: 'per_unit',
    },
    royalty: {
      tiers: [
        {
          name: 'fixed_60',
          minPriceMinor: 0,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.60',
        },
      ],
    },
    printCost: {
      baseCostMinor: 100,
      costPerPageMinor: 2,
      pageThreshold: 24,
    },
    deliveryCost: null,
    limits: {
      minListPriceMinor: 500,
      maxListPriceMinor: 25000,
      minPages: 24,
      maxPages: 800,
    },
  },
});

/**
 * Built-in synthetic Rule Pack: TEST_PAPERBACK_US v2.0.0 (Effective from: 2026-01-01 to null)
 * Updated printing base cost to 120 cents for testing date transitions.
 */
export const TEST_PAPERBACK_US_2_0_0: RulePack = parseRulePack({
  id: '550e8400-e29b-41d4-a716-446655440003',
  packKey: 'TEST_PAPERBACK_US',
  version: '2.0.0',
  status: 'published',
  marketplace: 'TEST_MARKETPLACE',
  format: 'paperback',
  currency: 'USD',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  sourceRef: 'Synthetic Test Specification SYNTH-PRINT-002',
  sourceRetrievedAt: '2026-01-01',
  content: {
    rounding: {
      mode: 'round_half_even',
      point: 'per_unit',
    },
    royalty: {
      tiers: [
        {
          name: 'fixed_60',
          minPriceMinor: 0,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.60',
        },
      ],
    },
    printCost: {
      baseCostMinor: 120,
      costPerPageMinor: 2,
      pageThreshold: 24,
    },
    deliveryCost: null,
    limits: {
      minListPriceMinor: 500,
      maxListPriceMinor: 25000,
      minPages: 24,
      maxPages: 800,
    },
  },
});

/**
 * Built-in synthetic Rule Pack: TEST_HARDCOVER_GLOBAL v1.0.0 (EUR currency, round_down, per_total)
 * For testing international currency and alternative rounding policies.
 */
export const TEST_HARDCOVER_GLOBAL_1_0_0: RulePack = parseRulePack({
  id: '550e8400-e29b-41d4-a716-446655440004',
  packKey: 'TEST_HARDCOVER_GLOBAL',
  version: '1.0.0',
  status: 'published',
  marketplace: 'TEST_GLOBAL',
  format: 'hardcover',
  currency: 'EUR',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  sourceRef: 'Synthetic Test Specification SYNTH-HARDCOVER-EUR-001',
  sourceRetrievedAt: '2026-01-01',
  content: {
    rounding: {
      mode: 'round_down',
      point: 'per_total',
    },
    royalty: {
      tiers: [
        {
          name: 'fixed_50',
          minPriceMinor: 0,
          maxPriceMinor: null,
          royaltyRateDecimal: '0.50',
        },
      ],
    },
    printCost: {
      baseCostMinor: 600,
      costPerPageMinor: 3,
      pageThreshold: 75,
    },
    deliveryCost: null,
    limits: {
      minListPriceMinor: 1500,
      maxListPriceMinor: 50000,
      minPages: 75,
      maxPages: 1000,
    },
  },
});

/**
 * All built-in synthetic test rule packs.
 */
export const SYNTHETIC_TEST_PACKS: readonly RulePack[] = Object.freeze([
  TEST_EBOOK_STANDARD_1_0_0,
  TEST_PAPERBACK_US_1_0_0,
  TEST_PAPERBACK_US_2_0_0,
  TEST_HARDCOVER_GLOBAL_1_0_0,
]);
