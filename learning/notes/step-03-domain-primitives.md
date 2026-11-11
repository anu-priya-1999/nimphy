# Engineering Reference Notes — STEP-003: Domain Primitives Hardening

- **Date:** 2026-11-10
- **Step:** STEP-003 (Domain Primitives Hardening & Correctness Review)
- **Focus:** Exact Rational Arithmetic, Immutability Guarantees, Deterministic Canonical JSON, Cryptographic Hashing, Unicode / UTF-8 Standards, UUID Boundaries, V8 Coverage Instrumentation

---

## 1. Technical Discoveries & Mathematical Hardening

### A. IEEE 754 Floating-Point Multiplication Reproduction

JavaScript numbers are 64-bit binary floating-point numbers conforming to IEEE 754. In base-2 binary floating point, decimal fractions such as `0.1`, `0.2`, and `0.29` have no finite binary representation:

$$0.29_{10} = 0.01001010001111010111..._2$$

When performing floating-point multiplication in software:

```typescript
const amountMinor = 100; // $1.00
const factor = 0.29; // 29%
const result = amountMinor * factor; // 28.999999999999996!
```

In the initial implementation of `Money.multiply(factor: number)`, the method computed `Math.round(this.amountMinor * factor)`. However, if callers passed non-integers or attempted exact arithmetic, edge cases emerged:

1. `Number.isSafeInteger(28.999999999999996)` is `false`.
2. Silent rounding could alter fractional pennies without explicit rule pack instructions.
3. If validation checked `Number.isInteger(amountMinor * factor)` prior to rounding, it would throw `InvalidMoneyError` even when mathematically the product should be an exact integer ($100 \times 0.29 = 29$).

#### Hardened Solution: Exact BigInt Rational Multiplication

To uphold **Principle P-01 (Deterministic Core)** and **Rule 4 (No Floats for Money)**:

1. `Money.multiply(factor: number)` now strictly requires `Number.isInteger(factor)`. If a non-integer is passed, it rejects immediately with an explanatory `InvalidMoneyError` pointing callers to exact decimal or rational methods.
2. `Money.multiplyDecimal(decimalString: string)`:
   - Parses the decimal string without floating-point conversion using regular expressions (`/^-?\d+(\.\d+)?$/`).
   - Normalizes the decimal fraction to base-10 integer power: $\text{factor} = \frac{N}{10^D}$.
   - Performs BigInt multiplication: $\text{scaled} = \text{BigInt}(this.amountMinor) \times N$.
   - Enforces exact divisibility: `scaled % denominator === 0n`. If non-zero, it throws `InvalidMoneyError("Cannot multiply money ... resulted in fractional minor units with zero-rounding policy")`.
   - Validates that the quotient fits within `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
3. `Money.multiplyRatio(numerator: bigint | number, denominator: bigint | number)`:
   - Validates safe integer bounds on both operands.
   - Enforces non-zero denominator (`denominator !== 0n`).
   - Computes $\frac{\text{amountMinor} \times \text{numerator}}{\text{denominator}}$ via BigInt arithmetic.
   - Enforces exact integer divisibility with zero silent rounding.

### B. JavaScript Integer Representation & Safe Integer Bounds

The maximum integer that JavaScript can represent without precision degradation is $2^{53} - 1$ (`Number.MAX_SAFE_INTEGER`, $9,007,199,254,740,991$), and the minimum is $-(2^{53} - 1)$ (`Number.MIN_SAFE_INTEGER`, $-9,007,199,254,740,991$).

Beyond these bounds:

```javascript
Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2; // true!
```

In `@nimphy/domain`:

- Every integer minor unit passed to `Money.of` or produced by arithmetic is checked via `Number.isSafeInteger(val)`.
- If an operation exceeds this range, it throws `MoneyOverflowError`.
- For standard book publishing and royalty modeling, $\$90\text{ trillion}$ in minor units ($9 \times 10^{15}$) provides safety margin over any realistic calculation.

### C. Negative Zero (`-0`) Normalization

In IEEE 754, negative zero (`-0`) exists as a distinct bit pattern:

```javascript
Object.is(-0, 0); // false
JSON.stringify(-0); // "0"
```

If an arithmetic calculation produces `-0` (e.g. `0 * -1` or `-100 + 100` via specific operations):

- `Money.of` normalizes `-0`: `this.amountMinor = Object.is(amountMinor, -0) ? 0 : amountMinor;`
- In `canonical-json.ts`: numbers equal to `-0` are normalized to string `"0"`.

### D. Decimal Parsing Without Floating-Point Math

Parsing `"19.99"` with `parseFloat("19.99") * 100` produces `1998.9999999999998` in JavaScript floats:

```javascript
Math.floor(19.99 * 100) === 1998; // OFF BY ONE CENT BUG!
```

To avoid this, `Money.fromDecimal` treats decimal input as a string format:

1. Validates string structure via regex: `^-?\d+(\.\d+)?$`.
2. Splits into integer and fractional string parts.
3. Pads or validates the fraction based on the currency's declared minor-unit exponent (e.g. 2 for USD, 0 for JPY).
4. Assembles the minor unit string and parses it as a safe integer.
   This guarantees exact integer minor units without float conversion.

### E. Zero-Decimal Currencies: The JPY Case

Most software libraries assume all currencies have two fractional digits (cents). In publishing, Japanese Yen (`JPY`) is a core Amazon KDP marketplace currency (doc 02 §A-3).

- In JPY, prices are integers with 0 fractional digits (`¥2500`).
- If an engine divides by 100 or formats as `25.00 JPY`, the price is off by a factor of 100.
- `@nimphy/domain` explicitly models `minorUnitExponent: 0` for `JPY`.
- Decimal parsing rejects fractional JPY strings with `InvalidMoneyError`.
- Decimal formatting produces `"2500"` without decimal points.

---

## 2. Immutability Engineering: Compile-Time vs Runtime

### Compile-Time `as const` vs `Object.freeze`

In TypeScript, applying `as const` creates a readonly tuple type:

```typescript
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;
```

While TypeScript prevents direct mutations at compile time (`SUPPORTED_CURRENCIES.push('CHF')` fails typecheck), TypeScript types are completely erased at runtime. JavaScript consumers, external plugins, or unsafe casts (`(SUPPORTED_CURRENCIES as any).push('CHF')`) can mutate the underlying array, corrupting domain validation tables across the entire Node process.

#### Hardened Solution: Runtime Freezing

In `@nimphy/domain`, all exported vocabularies are wrapped in `Object.freeze(...)`:

- `SUPPORTED_CURRENCIES`: frozen array of ISO currency codes.
- `PROVENANCE_VALUES`: frozen array of provenance tags.
- `SCENARIO_NAMES`: frozen array of financial scenario names.
- `BOOK_FORMATS`: frozen array of publishing book formats.

Attempting to mutate any of these arrays at runtime in strict mode immediately throws `TypeError: Cannot add property ..., object is not extensible` or `Cannot assign to read only property`.

### Defensive Copying in `createProvenanced<T>`

In the initial implementation, `Provenanced<T>` was a plain TypeScript interface:

```typescript
export interface Provenanced<T> {
  readonly value: T;
  readonly provenance: Provenance;
  readonly evidenceRefs?: readonly string[];
}
```

If an external caller passed a mutable `evidenceRefs` array:

```typescript
const refs = ['ref-1'];
const item: Provenanced<number> = { value: 42, provenance: 'user_input', evidenceRefs: refs };
refs.push('malicious-ref'); // Mutated after creation!
```

The hardened implementation provides `createProvenanced<T>`:

1. Validates that `provenance` is a valid `Provenance` enum member.
2. Defensively copies and freezes `evidenceRefs`: `Object.freeze([...evidenceRefs])`.
3. Freezes the outer container object: `Object.freeze({ value, provenance, ...(evidenceRefs ? { evidenceRefs: frozenRefs } : {}) })`.
4. Leaves caller-owned generic payload `value: T` untouched to prevent mutating caller-owned domain objects while guaranteeing that the provenance envelope is completely immutable.

---

## 3. Deterministic Canonical JSON Serialization

Cryptographic hashes of domain state (e.g. calculation runs, case revisions, rule packs) require deterministic canonical JSON serialization. The implementation enforces the following invariant rules:

### A. Accepted vs Rejected Data Types

| Data Type                                                         | Behavior                                                                                                       | Rationale                                                                                                             |
| :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `string`, `boolean`                                               | Encoded per standard JSON.                                                                                     | Primitive, fully deterministic.                                                                                       |
| `number`                                                          | Finite numbers serialized. `-0` normalized to `"0"`. `NaN` and `Infinity` throw `CanonicalSerializationError`. | IEEE-754 edge cases must not produce non-standard JSON (`null` or unquoted literals).                                 |
| `null`                                                            | Encoded as `null`.                                                                                             | Standard JSON primitive.                                                                                              |
| `undefined`, `function`, `symbol`                                 | At top-level: throws `CanonicalSerializationError`. Inside objects: omitted. Inside arrays: encoded as `null`. | Matches `JSON.stringify` semantics while preventing top-level undefined states.                                       |
| Sparse Arrays (`new Array(3)`)                                    | Converted to `[null,null,null]`.                                                                               | `Array.prototype.map` skips holes, producing malformed `"[,,]"`. Hardened index-based iteration maps holes to `null`. |
| Plain Objects                                                     | Keys sorted lexicographically by UTF-16 code units.                                                            | Guarantees identical serialized string regardless of key insertion order.                                             |
| Objects with custom `toJSON()`                                    | Invoked to produce serializable value.                                                                         | Allows domain objects (such as `Money`) to control their canonical JSON representation.                               |
| Non-plain Objects (`Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`) | Throws `CanonicalSerializationError`.                                                                          | Prevents non-deterministic or lossy default serialization of complex object graphs.                                   |

### B. Cycle Detection vs DAG (Diamond Reference) Support

A naive cycle detector using a global `visited: Set<object>` causes false positives on Directed Acyclic Graphs (DAGs):

```typescript
const shared = { id: 'shared-data' };
const dag = { left: shared, right: shared };
```

A global visited set would encounter `shared` under `right` and throw a circular reference error, even though `dag` contains no cycle.

Conversely, without cycle detection, recursive `toJSON()` implementations can cause infinite recursion and crash the V8 runtime with `RangeError: Maximum call stack size exceeded`:

```typescript
const selfReferential = {
  toJSON() {
    return this;
  },
};
```

#### Hardened Solution: Active Call-Path Cycle Tracking

The serializer maintains an `activePath = new Set<object>()` tracking only objects currently being serialized along the active ancestor stack:

```typescript
if (activePath.has(obj)) {
  throw new CanonicalSerializationError(
    'Circular reference detected during canonical serialization',
  );
}
activePath.add(obj);
try {
  // serialize children...
} finally {
  activePath.delete(obj); // Remove upon stack unwind
}
```

This guarantees:

1. True circular references (including mutual cycles and self-returning `toJSON()` calls) are detected and throw `CanonicalSerializationError`.
2. Valid DAGs / diamond references serialize perfectly because `shared` is removed from `activePath` before the sibling branch is traversed.

---

## 4. UUID Validation Contract & Storage Alignment

### Domain Boundary vs Database Schema

PostgreSQL's native `uuid` column type stores a 128-bit quantity. PostgreSQL's parser accepts any 32-character hexadecimal string formatted with standard hyphens (`8-4-4-4-12` format), regardless of the UUID version bits:

```sql
SELECT '11111111-2222-3333-4444-555555555555'::uuid; -- VALID
SELECT '00000000-0000-0000-0000-000000000000'::uuid; -- VALID (nil UUID)
```

In the initial implementation, `branded-ids.ts` used a strict RFC 4122 v4 regular expression: `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.

This caused several critical problems:

1. **Broken Test Fixtures:** Synthetic test IDs (`11111111-2222-3333-4444-555555555555`) used across unit and integration tests failed validation.
2. **Version Lock-in:** Prevents migration to modern time-ordered UUIDv7 identifiers.
3. **Rejection of Valid System IDs:** Nil UUIDs and externally generated compliant UUIDs were rejected.

#### Hardened Contract

In `@nimphy/domain`:

- Validates canonical 128-bit UUID textual layout: `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`.
- Normalizes parsed UUIDs to lowercase strings.
- Guarantees 100% compatibility with PostgreSQL's `uuid` type, UUIDv4 (`crypto.randomUUID()`), UUIDv7, nil UUIDs, and synthetic test fixtures.

---

## 5. Pure SHA-256 Cryptography & Differential Verification

### Architectural Isolation (Zero Node / Zero External Dependencies)

To satisfy **Principle P-01** and preserve execution independence across Node, Edge, Browser, and Worker runtimes, `@nimphy/domain` implements FIPS 180-4 SHA-256 purely in TypeScript using standard 32-bit unsigned bitwise operations.

### Differential Verification Against `node:crypto`

To prove cryptographic correctness beyond doubt, `sha256.test.ts` was expanded with differential testing:

1. Computes hashes across:
   - Empty string `""`.
   - ASCII strings (`"hello world"`, `"The quick brown fox jumps over the lazy dog"`).
   - Unicode multi-byte strings (`"Hello, 世界! 🌍"`).
   - Long repeating strings (10,000 characters).
   - Realistic canonical JSON domain payloads (case revisions, financial runs).
2. For every input, compares the output of `sha256Hex(input)` directly against `crypto.createHash('sha256').update(input, 'utf8').digest('hex')`.
3. 100% agreement observed across all test vectors.

### WHATWG / RFC 3629 UTF-8 Fallback & Surrogate Pair Handling

When running in environments where global `TextEncoder` is unavailable, `sha256.ts` includes a pure-TypeScript fallback UTF-8 encoder (`utf8EncodeFallback`).

In JavaScript, strings are UTF-16 code units. Unicode characters outside the Basic Multilingual Plane (BMP, code points $> \text{0xFFFF}$) are represented as surrogate pairs:

- High surrogate: `0xD800` to `0xDBFF`.
- Low surrogate: `0xDC00` to `0xDFFF`.

If a string contains an unpaired surrogate (a high surrogate without a matching low surrogate, or an isolated low surrogate), naive encoders would emit invalid byte sequences or throw unhandled exceptions.

#### Hardened Solution: Standard Unicode Replacement (`U+FFFD`)

Per WHATWG encoding specification and RFC 3629:

- Well-formed surrogate pairs are decoded into the 21-bit scalar value:
  $$\text{cp} = ((\text{high} - 0xD800) \times 0x400) + (\text{low} - 0xDC00) + 0x10000$$
  and encoded as 4 UTF-8 bytes: `[0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)]`.
- Any unpaired high or low surrogate emits the standard Unicode Replacement Character `U+FFFD`, encoded in UTF-8 as three bytes: `0xEF, 0xBF, 0xBD`.

---

## 6. Windows PowerShell Console Codepage Observations

During verification on Windows workstations, console output occasionally printed currency symbols as mojibake:

- `€` displayed as `â‚¬`
- `£` displayed as `Â£`
- `¥` displayed as `Â¥`

### Root Cause Analysis

This is a known Windows console artifact:

1. Windows PowerShell defaults to legacy OEM codepages (such as Windows-1252 or CP437).
2. When UTF-8 multi-byte sequences (`0xE2 0x82 0xAC` for `€`) are rendered in CP1252 without `chcp 65001`, the terminal displays the individual bytes as CP1252 characters (`â‚¬`).
3. Verification confirmed that the source code files (`currency.ts`) and compiled JS output are 100% clean UTF-8. Tests verifying exact Unicode code points (`'€'.charCodeAt(0) === 0x20AC`) pass without error.

---

## 7. Vitest V8 Coverage Instrumentation

To satisfy the canonical roadmap requirement (≥95% coverage across Statements, Branches, Functions, and Lines):

1. Pinned `@vitest/coverage-v8@3.0.8` in root `devDependencies`.
2. Added `test:coverage` script to root `package.json`: `vitest run --coverage`.
3. Configured `vitest.config.ts` with coverage exclusions for root config and test files, targeting production source code:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['packages/domain/src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/types.ts', '**/*.d.ts'],
  thresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
}
```

### Coverage Results Achieved

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |    99.31 |     100 |     100 |
 src               |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 src/canonical     |     100 |    98.71 |     100 |     100 |
  canonical-json.ts|     100 |    98.38 |     100 |     100 | 129
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

Total Production Domain Code Coverage:

- **Statements:** 100%
- **Branches:** 99.31%
- **Functions:** 100%
- **Lines:** 100%
- **Total Repository Tests:** 200/200 passing across 14 test suites.
