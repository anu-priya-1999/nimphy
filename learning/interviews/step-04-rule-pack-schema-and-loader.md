# Senior Engineering Interview Preparation — STEP-004: Rule Pack Schema and Loader

This guide contains senior-level technical interview questions, trade-offs, and architectural defenses regarding the design and implementation of the Rule Pack schema, deterministic loader, and content hashing in Nimphy.

---

## 1. Architectural Architecture & Design Decisions

### Q1: Why are publishing rules represented as declarative JSON data rather than TypeScript functions or executable code modules?

**Answer:**

1. **P-04 Immutability & Auditability:** Calculation runs must be auditable years after creation. If rules were executable code, tracking what version of code ran requires tracking git hashes, compiler versions, and runtime semantics. Storing rules as declarative data in the database (`rule_packs` table) with a cryptographic content hash enables bit-for-bit reproducibility.
2. **Security & Sandbox Isolation:** Executing dynamic user or operator-supplied code opens severe security vulnerabilities (arbitrary code execution). Declarative parameters (royalty tiers, print costs, limits, rounding modes) can be safely validated and evaluated by a pure calculation engine (Principle P-01).
3. **Database Constraints & Versioning:** Declarative Rule Packs allow the database to enforce relational constraints (`calculation_runs.rule_pack_id references rule_packs(id)` with `NO ACTION` preventing deletion), immutability triggers, and unique constraints `unique (pack_key, version)`.

### Q2: Why is canonical JSON serialization mandatory before computing the content hash?

**Answer:**
Standard `JSON.stringify()` in JavaScript does not guarantee deterministic key ordering. Two objects with identical fields inserted in different order produce different JSON strings (e.g. `{"a":1,"b":2}` vs `{"b":2,"a":1}`). If hashed directly, identical rule definitions would produce completely different cryptographic digests.
Canonical JSON serialization (`toCanonicalJson` in `@nimphy/domain`) guarantees:

1. Lexicographical sorting of object keys by UTF-16 code units.
2. Consistent formatting of primitive values (no optional whitespace).
3. Active-path cycle detection to prevent stack overflows.
4. Evaluation of `toJSON()` methods on custom entities.
   This guarantees that hashing rule content is bit-for-bit deterministic across Node versions, operating systems, and platforms.

### Q3: How does the Rule Pack selector resolve date boundaries and overlapping versions?

**Answer:**
The selector implements `selectRulePack(marketplace, format, asOf)`:

1. **Calendar Date Normalization:** `asOf` is converted to an ISO calendar date string (`YYYY-MM-DD`) in UTC, preventing timezone drift.
2. **Inclusive Window Checks:** A pack is applicable if `pack.effectiveFrom <= asOf && (pack.effectiveTo === null || pack.effectiveTo >= asOf)`. The boundaries are inclusive: on the exact date of `effectiveFrom` or `effectiveTo`, the pack is active.
3. **SemVer Precedence:** When multiple versions of a pack have overlapping validity windows (e.g., a bugfix patch `1.0.1` superseding `1.0.0`), candidate packs are sorted using SemVer 2.0.0 precedence rules (major > minor > patch > prerelease). The highest SemVer version is selected.
4. **Deterministic Tie-Breaking:** In the rare case of multiple matching packs with identical version numbers (different pack keys), ties are broken deterministically by `packKey` locale comparison.
5. **Fail-Closed:** If no pack matches, the selector throws `RulePackNotFoundError` (stable code `RULE_PACK_NOT_FOUND`).

### Q4: Why are royalty rates represented as decimal strings (e.g. `"0.70"`) instead of JavaScript numbers (`0.7`)?

**Answer:**
In IEEE-754 floating-point arithmetic, numbers like `0.7` cannot be represented precisely in binary floating-point (`0.7` becomes `0.69999999999999995559...`). Performing arithmetic directly with floats introduces accumulated precision loss.
By storing rates as exact decimal strings (e.g. `"0.70"`, `"0.35"`), the calculation engine can parse them into exact BigInt rational fractions (`70n / 100n` = `7n / 10n`) using `Money.multiplyDecimal` or `Money.multiplyRatio`. This guarantees exact integer rational arithmetic without floating-point artifacts (ADR-005, Principle P-01).

### Q5: What is the difference between rounding modes and accumulation points (ADR-005)?

**Answer:**

1. **Rounding Mode:** Specifies how fractional minor units are resolved:
   - `round_half_up`: 0.5 rounds away from zero (standard arithmetic rounding).
   - `round_half_even`: Banker's rounding; rounds to the nearest even integer to reduce statistical bias.
   - `round_down`: Truncates towards zero / floor.
   - `round_up`: Rounds upwards towards ceiling.
2. **Rounding Point (Accumulation Point):** Specifies _when_ rounding is performed:
   - `'per_unit'`: The royalty or print cost is rounded to an exact integer minor unit for a single copy, then multiplied by total unit volume.
   - `'per_total'`: Exact fractional amounts accumulate across total volume, and rounding is applied once to the aggregated sum.
     Different retailers and distributors use different policies. ADR-005 mandates that every Rule Pack explicitly declares its rounding mode and point, and forbids silent default assumptions.

### Q6: How does the architecture quarantine synthetic test data from production?

**Answer:**

1. **Prefix Enforcement:** All test pack keys must begin with `TEST_` (e.g. `TEST_EBOOK_STANDARD`).
2. **Validation Guards:** Utilities `isSyntheticPackKey` and `assertSyntheticPackKey` enforce this pattern.
3. **CI and Database Gates (ADR-006, doc 12 §4):** A CI check and database check constraint prevent any pack with key starting with `TEST_` from being published to production environments.
4. **Realistic but Clearly Synthetic Values:** Print costs, delivery costs, and royalty tiers use realistic structures and numbers, but are explicitly cited as `Synthetic Test Specification` with disclaimers warning against commercial reliance.
