import { describe, expect, it } from 'vitest';
import { parseRulePackId } from '@nimphy/domain';
import {
  computeRulePackContentHash,
  computeRulePackEnvelopeHash,
  verifyRulePackContentHash,
} from './content-hash';
import type { RulePack, RulePackContent } from '../schema/types';

describe('Rule Pack Content Hashing', () => {
  const sampleContent: RulePackContent = {
    rounding: {
      mode: 'round_half_up',
      point: 'per_unit',
    },
    royalty: {
      tiers: [
        {
          name: 'standard',
          minPriceMinor: 99,
          maxPriceMinor: 2000,
          royaltyRateDecimal: '0.70',
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
  };

  it('computes stable and deterministic hash regardless of key order', () => {
    const hash1 = computeRulePackContentHash(sampleContent);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Reorder keys
    const reordered = {
      limits: sampleContent.limits,
      rounding: sampleContent.rounding,
      deliveryCost: sampleContent.deliveryCost,
      printCost: sampleContent.printCost,
      royalty: sampleContent.royalty,
    };

    const hash2 = computeRulePackContentHash(reordered);
    expect(hash2).toBe(hash1);
  });

  it('changes hash when any nested content parameter changes', () => {
    const originalHash = computeRulePackContentHash(sampleContent);

    // Change delivery cost
    const modifiedDelivery = {
      ...sampleContent,
      deliveryCost: { costPerMbMinor: 16 },
    };
    expect(computeRulePackContentHash(modifiedDelivery)).not.toBe(originalHash);

    // Change rounding mode
    const modifiedRounding = {
      ...sampleContent,
      rounding: { mode: 'round_half_even' as const, point: 'per_unit' as const },
    };
    expect(computeRulePackContentHash(modifiedRounding)).not.toBe(originalHash);

    // Change royalty rate
    const modifiedRoyalty = {
      ...sampleContent,
      royalty: {
        tiers: [
          {
            name: 'standard',
            minPriceMinor: 99,
            maxPriceMinor: 2000,
            royaltyRateDecimal: '0.69',
          },
        ],
      },
    };
    expect(computeRulePackContentHash(modifiedRoyalty)).not.toBe(originalHash);
  });

  it('verifies matching hash correctly', () => {
    const hash = computeRulePackContentHash(sampleContent);
    expect(
      verifyRulePackContentHash({
        content: sampleContent,
        contentHash: hash,
      }),
    ).toBe(true);
  });

  it('rejects mismatched or tampered hash', () => {
    expect(
      verifyRulePackContentHash({
        content: sampleContent,
        contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      }),
    ).toBe(false);

    expect(
      verifyRulePackContentHash({
        content: sampleContent,
        contentHash: 'not-a-sha256-digest',
      }),
    ).toBe(false);
  });

  it('computes deterministic full envelope hash', () => {
    const hash = computeRulePackContentHash(sampleContent);
    const pack: RulePack = {
      id: parseRulePackId('550e8400-e29b-41d4-a716-446655440001'),
      packKey: 'TEST_EBOOK_STANDARD',
      version: '1.0.0',
      status: 'published',
      marketplace: 'TEST_MARKETPLACE',
      format: 'ebook',
      currency: 'USD',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      sourceRef: 'Synthetic Test Specification',
      sourceRetrievedAt: '2026-01-01',
      content: sampleContent,
      contentHash: hash,
    };

    const envelopeHash = computeRulePackEnvelopeHash(pack);
    expect(envelopeHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Identical pack yields identical envelope hash
    const envelopeHash2 = computeRulePackEnvelopeHash({
      ...pack,
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(envelopeHash2).toBe(envelopeHash);
  });
});
