# @nimphy/rules

`@nimphy/rules` is the versioned Rule Pack schema, deterministic loader, SemVer selection, and content hashing package for Nimphy (Module M-03).

It encapsulates the v1 Rule Pack schema, pure schema validation, content integrity verification (SHA-256), date-based SemVer selector, and in-memory registry loader.

---

## Architectural Principles & Constraints

This package strictly conforms to the Nimphy Architecture Principles (doc 03, AGENTS.md):

1. **Deterministic Core (P-01):** Rule parameters are purely declarative. Rounding policies and formulas are explicit and reproducible without runtime side-effects.
2. **Strict Inward Dependency (AGENTS.md §2, doc 03 §3):** Depends exclusively on `@nimphy/domain`. It imports no AI, no database client, and no UI framework.
3. **Traceability (P-03):** Every calculation run traces directly to an immutable Rule Pack ID and content hash.
4. **Immutability for Evidence (P-04, ADR-006):** Published Rule Packs are strictly immutable. Registering a differing content hash for the same `(packKey, version)` is rejected at the boundary. All loaded packs and nested policies are deep-frozen (`Object.isFrozen`).
5. **Verify at the Boundary (P-05):** Strict schema validation, calendar date validity (including leap-year checks), SemVer 2.0.0 enforcement, format-specific parameter checks, and bit-for-bit content hash verification.
6. **Synthetic Test Separation (ADR-006, doc 12 §4):** All test fixtures and built-in example packs carry the `TEST_*` prefix and explicit synthetic disclaimers. Commercial facts and real publisher numbers are never fabricated.

---

## Public API & Modules

### 1. Schema Types & Vocabularies

- **`RulePack`**: Complete immutable entity corresponding to the `rule_packs` table in doc 06 §3.
- **`RulePackStatus`**: `'draft' | 'published' | 'retired'` (with runtime-frozen `RULE_PACK_STATUSES`).
- **`RoundingMode`**: `'round_half_up' | 'round_half_even' | 'round_down' | 'round_up'` (ADR-005, doc 12 §3).
- **`RoundingPoint`**: `'per_unit' | 'per_total'` (accumulation point where rounding occurs).
- **`RoyaltyPolicy` & `RoyaltyTier`**: Declarative price tiers with exact decimal rate strings (e.g. `"0.70"`) preventing IEEE-754 floating-point errors.
- **`PrintCostPolicy`**: Base cost and per-page cost in integer minor units for physical books (`paperback`, `hardcover`).
- **`DeliveryCostPolicy`**: File distribution fee per megabyte in integer minor units for digital books (`ebook`).
- **`BookLimitsPolicy`**: Minimum and maximum list prices (minor units) and page counts.

### 2. Validation & Parsing

- **`validateRulePack(raw: unknown)`**: Safe validator returning `{ valid: boolean, issues: RulePackValidationIssue[], pack?: RulePack }`.
- **`parseRulePack(raw: unknown)`**: Strict parser returning a deep-frozen `RulePack` or throwing `RulePackInvalidError` (code `RULE_PACK_INVALID`).
- **`safeParseRulePack(raw: unknown)`**: Discriminated union parser returning `{ success: true, data: RulePack } | { success: false, error: RulePackInvalidError }`.
- **`isSyntheticPackKey(key)` & `assertSyntheticPackKey(key)`**: Enforces `TEST_*` prefix on test fixtures per ADR-006.

### 3. Content Hashing (SHA-256)

- **`computeRulePackContentHash(content: unknown)`**: Produces a deterministic `sha256:<64-hex>` digest using `@nimphy/domain`'s canonical JSON serializer (lexicographical UTF-16 sorting, active-path cycle detection) and pure SHA-256 hasher.
- **`verifyRulePackContentHash(pack)`**: Verifies that `pack.contentHash` matches `computeRulePackContentHash(pack.content)` bit-for-bit.
- **`computeRulePackEnvelopeHash(pack)`**: Hashes the full canonical metadata envelope.

### 4. Selector & Date-Based Matching

- **`selectRulePack(packs, criteria)`**: Resolves the single applicable Rule Pack for `(marketplace, format, asOf)`:
  - Validates `asOf` calendar date string (`YYYY-MM-DD`) or UTC `Date`.
  - Inclusive date boundary checks: `effectiveFrom <= asOf <= (effectiveTo ?? infinity)`.
  - Filters by format, marketplace, and status (defaults to `'published'`).
  - Resolves overlapping windows via SemVer 2.0.0 descending precedence.
  - Throws `RulePackNotFoundError` (code `RULE_PACK_NOT_FOUND`) if no pack matches.

### 5. Loader & Registry

- **`RulePackLoader`**: In-memory registry with indexing by nominal UUID `id` and `(packKey, version)`:
  - `register(packOrRaw)`: Validates, freezes, and registers a pack with overwrite protection.
  - `loadFromJson(jsonString)`: Parses JSON string and registers.
  - `loadFromObject(raw)`: Validates plain object and registers.
  - `loadRulePackFromFile(filePath)`: Synchronous file loader from disk.
  - `loadRulePacksFromDirectory(dirPath)`: Recursively scans a directory for `pack.json` files.
  - `select(criteria)`: Delegates to selector over registered packs.
  - `getById(id)` & `getByKeyAndVersion(key, version)`: O(1) indexed lookups.

### 6. Built-in Synthetic Test Packs

- `TEST_EBOOK_STANDARD_1_0_0`: Standard USD ebook with 3 pricing tiers and delivery fee.
- `TEST_PAPERBACK_US_1_0_0`: Historical USD paperback (effective 2025-01-01 to 2025-12-31).
- `TEST_PAPERBACK_US_2_0_0`: Successor USD paperback (effective 2026-01-01 to open-ended).
- `TEST_HARDCOVER_GLOBAL_1_0_0`: EUR international hardcover with `round_down` and `per_total` accumulation.
- `SYNTHETIC_TEST_PACKS`: Array of all 4 synthetic packs.

---

## Usage Example

```typescript
import { RulePackLoader, SYNTHETIC_TEST_PACKS, selectRulePack } from '@nimphy/rules';

// Direct Selection
const pack = selectRulePack(SYNTHETIC_TEST_PACKS, {
  marketplace: 'TEST_MARKETPLACE',
  format: 'ebook',
  asOf: '2026-06-15',
});
console.log(pack.packKey); // "TEST_EBOOK_STANDARD"
console.log(pack.contentHash); // "sha256:..."

// In-Memory Registry Loader
const loader = new RulePackLoader(SYNTHETIC_TEST_PACKS);
const paperback = loader.select({
  marketplace: 'TEST_MARKETPLACE',
  format: 'paperback',
  asOf: '2026-03-01',
});
console.log(paperback.version); // "2.0.0"
```
