import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_EBOOK_STANDARD_1_0_0,
  TEST_HARDCOVER_GLOBAL_1_0_0,
  TEST_PAPERBACK_US_1_0_0,
  TEST_PAPERBACK_US_2_0_0,
} from '../synthetic/test-packs';
import { loadRulePackFromFile, loadRulePacksFromDirectory } from './fs-loader';
import { verifyRulePackContentHash } from '../hashing/content-hash';
import { isSyntheticPackKey } from '../schema/validator';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../fixtures/rules');

const FIXTURE_DATA = [
  {
    pack: TEST_EBOOK_STANDARD_1_0_0,
    cases: {
      packKey: 'TEST_EBOOK_STANDARD',
      version: '1.0.0',
      description:
        'Synthetic threshold, boundary, and rounding test cases for ebook royalty calculation',
      disclaimer: 'SYNTHETIC TEST CASES ONLY. Not derived from actual retailer formulas.',
      cases: [
        {
          id: 'case_min_boundary',
          description: 'Lower boundary of list price ($0.99, tier standard_low 35%)',
          listPriceMinor: 99,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.35',
          expectedGrossRoyaltyMinor: 35,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_tier1_upper',
          description: 'Upper boundary of tier 1 ($2.98, tier standard_low 35%)',
          listPriceMinor: 298,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.35',
          expectedGrossRoyaltyMinor: 104,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_tier2_lower',
          description: 'Lower boundary of tier 2 ($2.99, tier standard_mid 70%)',
          listPriceMinor: 299,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.70',
          expectedGrossRoyaltyMinor: 209,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_mid_standard',
          description: 'Standard mid-tier pricing ($4.99, tier standard_mid 70%)',
          listPriceMinor: 499,
          fileSizeMb: 2,
          expectedRoyaltyRate: '0.70',
          expectedGrossRoyaltyMinor: 349,
          expectedDeliveryCostMinor: 30,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_half_cent_boundary',
          description: 'Half-cent rounding boundary ($5.50 * 70% = $3.85 exact)',
          listPriceMinor: 550,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.70',
          expectedGrossRoyaltyMinor: 385,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_tier2_upper',
          description: 'Upper boundary of tier 2 ($9.99, tier standard_mid 70%)',
          listPriceMinor: 999,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.70',
          expectedGrossRoyaltyMinor: 699,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_tier3_lower',
          description: 'Lower boundary of tier 3 ($10.00, tier standard_high 35%)',
          listPriceMinor: 1000,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.35',
          expectedGrossRoyaltyMinor: 350,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
        {
          id: 'case_max_price',
          description: 'Maximum list price ($200.00, tier standard_high 35%)',
          listPriceMinor: 20000,
          fileSizeMb: 1,
          expectedRoyaltyRate: '0.35',
          expectedGrossRoyaltyMinor: 7000,
          expectedDeliveryCostMinor: 15,
          roundingMode: 'round_half_up',
        },
      ],
    },
    readme: `# TEST_EBOOK_STANDARD (v1.0.0)

> [!WARNING]
> **SYNTHETIC TEST FIXTURE ONLY**
> This Rule Pack contains synthetic test parameters designed exclusively for automated unit and calculation testing. It does NOT contain real Amazon KDP royalty rates, delivery fees, or pricing constraints.

## Specification

- **Pack Key:** \`TEST_EBOOK_STANDARD\`
- **Version:** \`1.0.0\`
- **Status:** \`published\`
- **Marketplace:** \`TEST_MARKETPLACE\`
- **Format:** \`ebook\`
- **Currency:** \`USD\`
- **Effective Window:** \`2026-01-01\` to \`open-ended\`
- **Rounding:** \`round_half_up\`, \`per_unit\`
- **Source Reference:** \`Synthetic Test Specification SYNTH-EBOOK-001\`
`,
  },
  {
    pack: TEST_PAPERBACK_US_1_0_0,
    cases: {
      packKey: 'TEST_PAPERBACK_US',
      version: '1.0.0',
      description: 'Synthetic test cases for paperback printing cost and royalty calculation',
      disclaimer: 'SYNTHETIC TEST CASES ONLY. Not derived from actual retailer formulas.',
      cases: [
        {
          id: 'case_min_pages',
          description: 'Minimum pages (24 pages, at base cost threshold)',
          listPriceMinor: 1299,
          pages: 24,
          expectedBaseCostMinor: 100,
          expectedPerPageCostMinor: 0,
          expectedTotalPrintCostMinor: 100,
          expectedRoyaltyRate: '0.60',
        },
        {
          id: 'case_above_threshold',
          description: 'Pages exceeding threshold (25 pages -> 1 page excess * 2 cents)',
          listPriceMinor: 1299,
          pages: 25,
          expectedBaseCostMinor: 100,
          expectedPerPageCostMinor: 2,
          expectedTotalPrintCostMinor: 102,
          expectedRoyaltyRate: '0.60',
        },
        {
          id: 'case_standard_length',
          description: 'Standard 200-page novel (176 pages excess * 2 cents = 352 cents)',
          listPriceMinor: 1499,
          pages: 200,
          expectedBaseCostMinor: 100,
          expectedPerPageCostMinor: 352,
          expectedTotalPrintCostMinor: 452,
          expectedRoyaltyRate: '0.60',
        },
      ],
    },
    readme: `# TEST_PAPERBACK_US (v1.0.0)

> [!WARNING]
> **SYNTHETIC TEST FIXTURE ONLY**
> This Rule Pack contains synthetic test parameters designed exclusively for automated unit and calculation testing. It does NOT contain real Amazon KDP or IngramSpark printing formulas.

## Specification

- **Pack Key:** \`TEST_PAPERBACK_US\`
- **Version:** \`1.0.0\`
- **Status:** \`published\`
- **Marketplace:** \`TEST_MARKETPLACE\`
- **Format:** \`paperback\`
- **Currency:** \`USD\`
- **Effective Window:** \`2025-01-01\` to \`2025-12-31\` (Historical window)
- **Rounding:** \`round_half_even\`, \`per_unit\`
- **Print Cost:** Base \$1.00 (100 minor units) + \$0.02 (2 minor units) / page above 24 pages
- **Source Reference:** \`Synthetic Test Specification SYNTH-PRINT-001\`
`,
  },
  {
    pack: TEST_PAPERBACK_US_2_0_0,
    cases: {
      packKey: 'TEST_PAPERBACK_US',
      version: '2.0.0',
      description: 'Synthetic test cases for paperback v2.0.0 (updated base cost to 120 cents)',
      disclaimer: 'SYNTHETIC TEST CASES ONLY. Not derived from actual retailer formulas.',
      cases: [
        {
          id: 'case_v2_min_pages',
          description: 'Minimum pages (24 pages, updated base cost 120 cents)',
          listPriceMinor: 1499,
          pages: 24,
          expectedBaseCostMinor: 120,
          expectedPerPageCostMinor: 0,
          expectedTotalPrintCostMinor: 120,
          expectedRoyaltyRate: '0.60',
        },
        {
          id: 'case_v2_standard_length',
          description:
            'Standard 200-page book under v2.0.0 rules (120 base + 352 per-page = 472 cents)',
          listPriceMinor: 1499,
          pages: 200,
          expectedBaseCostMinor: 120,
          expectedPerPageCostMinor: 352,
          expectedTotalPrintCostMinor: 472,
          expectedRoyaltyRate: '0.60',
        },
      ],
    },
    readme: `# TEST_PAPERBACK_US (v2.0.0)

> [!WARNING]
> **SYNTHETIC TEST FIXTURE ONLY**
> This Rule Pack contains synthetic test parameters designed exclusively for automated unit and calculation testing. It does NOT contain real Amazon KDP or IngramSpark printing formulas.

## Specification

- **Pack Key:** \`TEST_PAPERBACK_US\`
- **Version:** \`2.0.0\`
- **Status:** \`published\`
- **Marketplace:** \`TEST_MARKETPLACE\`
- **Format:** \`paperback\`
- **Currency:** \`USD\`
- **Effective Window:** \`2026-01-01\` to \`open-ended\` (Successor window)
- **Rounding:** \`round_half_even\`, \`per_unit\`
- **Print Cost:** Base \$1.20 (120 minor units) + \$0.02 (2 minor units) / page above 24 pages
- **Source Reference:** \`Synthetic Test Specification SYNTH-PRINT-002\`
`,
  },
  {
    pack: TEST_HARDCOVER_GLOBAL_1_0_0,
    cases: {
      packKey: 'TEST_HARDCOVER_GLOBAL',
      version: '1.0.0',
      description:
        'Synthetic test cases for international EUR hardcover rules (round_down, per_total)',
      disclaimer: 'SYNTHETIC TEST CASES ONLY. Not derived from actual retailer formulas.',
      cases: [
        {
          id: 'case_eur_hardcover_min',
          description: 'Minimum 75 pages (€6.00 base cost)',
          listPriceMinor: 2500,
          pages: 75,
          expectedBaseCostMinor: 600,
          expectedPerPageCostMinor: 0,
          expectedTotalPrintCostMinor: 600,
          expectedRoyaltyRate: '0.50',
        },
        {
          id: 'case_eur_hardcover_standard',
          description: '200 pages (600 base + 125 * 3 = 975 cents = €9.75)',
          listPriceMinor: 2999,
          pages: 200,
          expectedBaseCostMinor: 600,
          expectedPerPageCostMinor: 375,
          expectedTotalPrintCostMinor: 975,
          expectedRoyaltyRate: '0.50',
        },
      ],
    },
    readme: `# TEST_HARDCOVER_GLOBAL (v1.0.0)

> [!WARNING]
> **SYNTHETIC TEST FIXTURE ONLY**
> This Rule Pack contains synthetic test parameters designed exclusively for automated unit and calculation testing. It does NOT contain real publisher formulas.

## Specification

- **Pack Key:** \`TEST_HARDCOVER_GLOBAL\`
- **Version:** \`1.0.0\`
- **Status:** \`published\`
- **Marketplace:** \`TEST_GLOBAL\`
- **Format:** \`hardcover\`
- **Currency:** \`EUR\`
- **Effective Window:** \`2026-01-01\` to \`open-ended\`
- **Rounding:** \`round_down\`, \`per_total\`
- **Print Cost:** Base €6.00 (600 minor units) + €0.03 (3 minor units) / page above 75 pages
- **Source Reference:** \`Synthetic Test Specification SYNTH-HARDCOVER-EUR-001\`
`,
  },
];

beforeAll(() => {
  for (const item of FIXTURE_DATA) {
    const dir = path.join(FIXTURES_ROOT, item.pack.packKey, item.pack.version);
    fs.mkdirSync(dir, { recursive: true });

    const packPath = path.join(dir, 'pack.json');
    if (!fs.existsSync(packPath)) {
      fs.writeFileSync(packPath, JSON.stringify(item.pack, null, 2) + '\n', 'utf8');
    }

    const casesPath = path.join(dir, 'cases.json');
    if (!fs.existsSync(casesPath)) {
      fs.writeFileSync(casesPath, JSON.stringify(item.cases, null, 2) + '\n', 'utf8');
    }

    const readmePath = path.join(dir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, item.readme.trim() + '\n', 'utf8');
    }
  }
});

describe('Fixtures Directory Integrity & Verification', () => {
  it('all fixture packs load, pass schema validation, and have matching content hashes', () => {
    const packs = loadRulePacksFromDirectory(FIXTURES_ROOT);
    expect(packs.length).toBe(4);

    for (const pack of packs) {
      expect(isSyntheticPackKey(pack.packKey)).toBe(true);
      expect(verifyRulePackContentHash(pack)).toBe(true);
      expect(pack.status).toBe('published');
    }
  });

  it('verifies TEST_EBOOK_STANDARD 1.0.0 fixture against built-in pack', () => {
    const fixturePath = path.join(FIXTURES_ROOT, 'TEST_EBOOK_STANDARD', '1.0.0', 'pack.json');
    const loaded = loadRulePackFromFile(fixturePath);
    expect(loaded).toEqual(TEST_EBOOK_STANDARD_1_0_0);
  });

  it('verifies TEST_PAPERBACK_US 1.0.0 fixture against built-in pack', () => {
    const fixturePath = path.join(FIXTURES_ROOT, 'TEST_PAPERBACK_US', '1.0.0', 'pack.json');
    const loaded = loadRulePackFromFile(fixturePath);
    expect(loaded).toEqual(TEST_PAPERBACK_US_1_0_0);
  });

  it('verifies TEST_PAPERBACK_US 2.0.0 fixture against built-in pack', () => {
    const fixturePath = path.join(FIXTURES_ROOT, 'TEST_PAPERBACK_US', '2.0.0', 'pack.json');
    const loaded = loadRulePackFromFile(fixturePath);
    expect(loaded).toEqual(TEST_PAPERBACK_US_2_0_0);
  });

  it('verifies TEST_HARDCOVER_GLOBAL 1.0.0 fixture against built-in pack', () => {
    const fixturePath = path.join(FIXTURES_ROOT, 'TEST_HARDCOVER_GLOBAL', '1.0.0', 'pack.json');
    const loaded = loadRulePackFromFile(fixturePath);
    expect(loaded).toEqual(TEST_HARDCOVER_GLOBAL_1_0_0);
  });

  it('verifies cases.json exists and is valid JSON in all fixture directories', () => {
    const fixtureDirs = [
      path.join(FIXTURES_ROOT, 'TEST_EBOOK_STANDARD', '1.0.0'),
      path.join(FIXTURES_ROOT, 'TEST_PAPERBACK_US', '1.0.0'),
      path.join(FIXTURES_ROOT, 'TEST_PAPERBACK_US', '2.0.0'),
      path.join(FIXTURES_ROOT, 'TEST_HARDCOVER_GLOBAL', '1.0.0'),
    ];

    for (const dir of fixtureDirs) {
      const casesPath = path.join(dir, 'cases.json');
      expect(fs.existsSync(casesPath)).toBe(true);

      const content = fs.readFileSync(casesPath, 'utf8');
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed.cases)).toBe(true);
      expect(parsed.cases.length).toBeGreaterThan(0);

      const readmePath = path.join(dir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
    }
  });
});
