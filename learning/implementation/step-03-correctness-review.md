# Correctness Review & Implementation Hardening Record — STEP-003: Domain Primitives

- **Document Identifier:** STEP-003-REVIEW
- **Document Type:** Chronological Review & Hardening Audit Record
- **Step Name:** Domain Primitives (Hardening & Verification Finalization)
- **Phase:** Phase 0 (Foundations)
- **Architecture Package Version:** 0.3.0
- **Status:** Complete & Accepted (Audits 1, 2, and 3 Verified; 215/215 Tests Passed across 15 Suites; 100% Statements / 99.32% Branches Coverage; Fully Verified)

---

## 1. Context & Master Audit Scope

Following the initial completion and hardening of STEP-003 (Domain Primitives), an independent owner-acceptance audit was executed to formally verify the domain primitives against the system architecture principles (P-01 through P-10), ADR-005, and the definition of done.

The final acceptance audit comprised three sequential audit tracks:

1. **AUDIT 1 — Money Rounding Policy:** Exact arithmetic, non-representable minor-unit behavior, safe integer boundaries, and alignment with ADR-005 and Principle P-01.
2. **AUDIT 2 — Property-Based Testing:** Genuine invariant property tests across generated inputs and PRNG seeds for Money, Canonical JSON, SHA-256 differential correctness, and Provenance classification boundaries.
3. **AUDIT 3 — Canonical JSON Contract:** Comprehensive boundary verification and documentation of the serialization contract, preventing silent data loss, hash ambiguities, and uncontrolled cycles.

---

## 2. Audit 1: Money Rounding Policy (Accepted)

- **Audit Status:** **ACCEPTED / VERIFIED**
- **Findings & Mechanics:**
  1. `multiplyDecimal(string)` converts decimal strings directly to BigInt fractions $\frac{\text{numerator}}{\text{denominator}}$ without IEEE-754 floating-point operations. For example, `100 USD * "0.29"` computes $100\text{n} \times 29\text{n} / 100\text{n} = 29\text{n}$, completely avoiding the standard float precision trap ($28.999999999999996$).
  2. Non-representable fractional minor units fail closed: `(amountBig * numBig) % denBig !== 0n` throws `InvalidMoneyError`. Under no circumstances are minor units silently rounded, truncated, or floored at the primitive level.
  3. Safe integer arithmetic is strictly guarded. Intermediate operations use native arbitrary-precision `BigInt`, and the final quotient is verified against `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`, throwing `MoneyOverflowError` on overflow.
  4. Throwing on fractional minor units is the architecturally correct design per ADR-005 and Principle P-01: domain primitives must never impose an arbitrary rounding policy. Rounding points and modes are declared exclusively by Rule Packs (`packages/rules`) and executed by the calculation engine (`packages/calc-engine`).
- **Remediation During Audit:** Fixed a lint violation in `provenance.test.ts` line 139 where an `as any` cast violated `AGENTS.md` §4; refactored to `as unknown as Provenance` with zero ESLint warnings remaining.

---

## 3. Audit 2: Property-Based Testing (Completed)

- **Audit Status:** **ACCEPTED / VERIFIED**
- **Objective:** Establish genuine property-based invariant tests with reproducible generated input sets, rather than relying solely on example-based test assertions, without adding external runtime dependencies.
- **Implementation (`packages/domain/src/properties.test.ts`):**
  - Implemented a deterministic, seedable Mulberry32 pseudo-random number generator (PRNG) with fixed seeds (`0xdeadbeef`, `1001`, `2001`, `3001`, `4001`, `5001`), ensuring 100% reproducible test runs.
  - Implemented random integer generators, string generators (ASCII, Unicode, supplementary plane), byte buffer generators (`Uint8Array`), and key shuffle/permutation utilities.
- **Verified Invariants:**
  1. **Money Addition/Subtraction Consistency:**
     - Tested across 200 generated integer pairs in safe minor-unit bounds ($|a|, |b| \le 10^{13}$).
     - Verified commutativity: $a + b = b + a$.
     - Verified additive identity: $a + 0 = a$ and $a - 0 = a$.
     - Verified additive inverse: $a + (-a) = 0$ and $a - a = 0$.
     - Verified addition/subtraction round-trip consistency: $(a + b) - b = a$ and $(a - b) + b = a$.
     - Verified double negation: $-(-a) = a$.
     - Verified associativity across 100 generated triplets within safe bounds: $(a + b) + c = a + (b + c)$.
  2. **Money Safe-Integer Invariants:**
     - Verified across 200 constructed instances that `amountMinor` is always an integer within `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`.
     - Boundary overflow: For 50 generated positive integers $k$, `MAX_SAFE_INTEGER + k` throws `MoneyOverflowError`.
     - Boundary underflow: For 50 generated positive integers $k$, `MIN_SAFE_INTEGER - k` throws `MoneyOverflowError`.
     - Non-integer float factors: 100 generated floats with non-zero fractional components throw `InvalidMoneyError`.
     - Fractional minor units: 100 generated ratios with non-zero remainders throw `InvalidMoneyError`.
     - Integer and rational multiplication overflow beyond safe integer range throws `MoneyOverflowError`.
  3. **Canonical JSON Determinism Across Permutations:**
     - Tested across 100 randomly generated nested JSON data structures (objects, arrays, strings, numbers, booleans, null) with depths up to 3.
     - For each structure, generated random permutations of object keys at all nesting levels.
     - Verified: `canonicalJson(original) === canonicalJson(permuted)`.
     - Verified: `hashCanonicalJson(original) === hashCanonicalJson(permuted)`.
     - Verified: `-0` in any nested position consistently normalizes to `"0"`.
  4. **SHA-256 Differential Parity with `node:crypto`:**
     - Verified 250 diverse generated inputs against Node's native `createHash('sha256')`:
       - 50 random ASCII strings (lengths 0 to 500).
       - 50 multilingual Unicode strings (Greek, Cyrillic, CJK, Arabic, Hebrew, currency symbols).
       - 50 supplementary-plane Unicode strings (emojis, mathematical symbols).
       - Critical SHA-256 block boundary lengths: 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 255, 256, 511, 512, 513 bytes.
       - 50 random byte buffers (`Uint8Array`, lengths 0 to 1024).
     - Verified: `sha256Hex(x) === nodeSha256(x)` for 100% of generated inputs.
  5. **Provenance Exhaustive Validation:**
     - Verified positive acceptance for strictly the 4 canonical values (`user_input`, `official_fact`, `estimate`, `assumption`).
     - Verified negative rejection across 200 generated invalid candidates: case variations (`User_Input`, `OFFICIAL_FACT`), substrings (`user`, `fact`), numbers, booleans, symbols, functions, objects, arrays, null, undefined, and random strings.
     - Confirmed that `isProvenance` returns `false`, and `assertProvenance`, `parseProvenance`, and `createProvenanced` throw `InvalidProvenanceError`.
     - Verified that whitespace-padded strings (e.g. `' user_input '`) are rejected by strict validation guards (`isProvenance` / `assertProvenance`) while parsed cleanly by `parseProvenance`.

---

## 4. Audit 3: Canonical JSON Contract (Completed)

- **Audit Status:** **ACCEPTED / VERIFIED**
- **Objective:** Formally specify, verify, and test the canonical serialization contract across all edge cases, preventing silent data loss or ambiguous hashing.
- **Contract Rules & Verified Behaviors:**
  1. **Top-Level Rejection:** Top-level `undefined`, `function`, and `symbol` values throw `CanonicalSerializationError`.
  2. **Object Key Sorting:** All object keys are sorted strictly in Unicode lexicographical order.
  3. **Object Property Omission:** Properties with values of `undefined`, functions, or symbols are omitted from object representations, matching standard JSON semantics (`{"a":1,"fn":()=>42}` becomes `{"a":1}`).
  4. **Array Elements:** Array element order is strictly preserved. Array holes (sparse arrays) and array elements that are `undefined`, functions, or symbols are canonicalized to `null`, matching standard JSON semantics (`[1, , () => {}, 2]` becomes `[1,null,null,2]`).
  5. **Primitive Encoding & Normalization:** Primitives are encoded via standard JSON; `-0` is strictly normalized to `0`.
  6. **Value Object Evaluation (`toJSON`):** Objects implementing `toJSON()` (such as `Money`) are evaluated before serialization. Self-referential or mutually cycling `toJSON()` methods throw `CanonicalSerializationError`.
  7. **Cycle Detection:** Active-path traversal tracking (`activePath = new Set<object>()`) detects and rejects genuine circular references (`CanonicalSerializationError`).
  8. **DAG Support:** Repeated non-cyclic object references (e.g. diamond references in objects or repeated objects in arrays) serialize cleanly without false-positive cycle errors.
  9. **Fail-Closed Type Safety:** Unsupported values that cannot be deterministically represented (`Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`, `TypedArray`, non-finite numbers `NaN`/`Infinity`, `BigInt`, and class instances without `toJSON()`) throw `CanonicalSerializationError`.
  10. **Consistency:** Exported `canonicalJson` alias of `toCanonicalJson`. Verified that for all supported types:
      `hashCanonicalJson(x) === 'sha256:' + sha256Hex(canonicalJson(x))`
      `hashCanonicalJson(x, false) === sha256Hex(canonicalJson(x))`
- **Documentation Updated:** Documented the full 10-point serialization contract in `packages/domain/README.md` §6.

---

## 5. Final Technical Verification Suite Results

All 10 required repository verification commands were executed directly and achieved exit code 0:

|   #    | Command                          | Target / Scope                          | Exit Code | Verified Result                                        |
| :----: | :------------------------------- | :-------------------------------------- | :-------: | :----------------------------------------------------- |
| **1**  | `pnpm install --frozen-lockfile` | Monorepo dependencies                   |  **`0`**  | Clean lockfile; no changes required                    |
| **2**  | `pnpm typecheck`                 | `tsc --noEmit` across all 8 packages    |  **`0`**  | 0 TypeScript errors                                    |
| **3**  | `pnpm lint`                      | ESLint 10 with local architecture rules |  **`0`**  | 0 errors, 0 warnings across monorepo                   |
| **4**  | `pnpm format:check`              | Prettier 3.5.3                          |  **`0`**  | All files adhere to Prettier code style                |
| **5**  | `pnpm boundaries:check`          | Architecture dependency checker         |  **`0`**  | 34 files / 61 import declarations; clean DAG           |
| **6**  | `pnpm docs:check`                | Documentation & ADR link validator      |  **`0`**  | 23 docs, 88 links, 22 ADR statuses valid               |
| **7**  | `pnpm test`                      | Vitest 3.0.8                            |  **`0`**  | **215 / 215 tests passing across 15 suites**           |
| **8**  | `pnpm test:coverage`             | Vitest with v8 coverage provider        |  **`0`**  | **100% Stmt / 99.32% Branch / 100% Func / 100% Lines** |
| **9**  | `pnpm build`                     | Next.js App Router production build     |  **`0`**  | Turbopack build succeeded with 0 errors                |
| **10** | `git diff --check`               | Git whitespace & patch check            |  **`0`**  | Clean diff with zero whitespace anomalies              |

### Detailed Coverage Report (`packages/domain/src/`)

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |    99.32 |     100 |     100 |
 src               |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  types.ts         |     100 |      100 |     100 |     100 |
 src/canonical     |     100 |    97.75 |     100 |     100 |
  ...nical-json.ts |     100 |    96.66 |     100 |     100 | 8,135
  index.ts         |     100 |      100 |     100 |     100 |
  sha256.ts        |     100 |      100 |     100 |     100 |
 src/errors        |     100 |      100 |     100 |     100 |
  domain-error.ts  |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 src/identifiers   |     100 |      100 |     100 |     100 |
  branded-ids.ts   |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 src/money         |     100 |      100 |     100 |     100 |
  currency.ts      |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  money.ts         |     100 |      100 |     100 |     100 |
 src/provenance    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  provenance.ts    |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------
```

---

## 6. Architectural Decisions & Remaining Risks

1. **Rounding Policy Handoff (ADR-005):** `Money` in `@nimphy/domain` represents an atomic integer minor unit and correctly throws on fractional results. When implementing STEP-004 (`packages/rules`) and STEP-005 (`packages/calc-engine`), Rule Packs must explicitly declare their rounding points (e.g. per-copy royalty vs. aggregated monthly batch) and rounding modes (e.g. half-up vs. round-to-even), and provide calculation-level decimal arithmetic before constructing the final `Money` instances.
2. **Canonical JSON Plain-Object Contract:** Unsupported types (such as `Date` or `Map`) fail closed by throwing `CanonicalSerializationError`. If future roadmap steps require serializing temporal moments in calculation inputs/traces, they must be formatted explicitly as ISO-8601 strings or epoch integers before serialization.
3. **Pure TypeScript SHA-256 Performance:** The pure TypeScript SHA-256 implementation is NIST FIPS 180-4 compliant and differentials match `node:crypto` 100%. While ideal for deterministic canonical hashing of calculation payloads and rule pack signatures with zero runtime dependencies, large file uploads (such as future PDF exports in STEP-023) will utilize stream-based native hashing at the persistence/infrastructure boundary rather than in-memory string hashing.

---

## 7. Audit Verdict & Stop Condition

**ALL THREE AUDITS ARE FORMALLY COMPLETE AND VERIFIED.**

- Audit 1 (Money Rounding Policy): Verified & Accepted.
- Audit 2 (Property-Based Testing): Verified & Accepted (11 property tests, 215 tests total).
- Audit 3 (Canonical JSON Contract): Verified & Accepted.
- All 10 repository verification commands executed cleanly with exit code 0.
- Monorepo coverage stands at 100% Statements / 99.32% Branches.
- Strict scope bounds preserved (no STEP-004 code, no calculation logic, no KDP values).

**STEP-003 IS READY FOR FINAL OWNER APPROVAL.**
