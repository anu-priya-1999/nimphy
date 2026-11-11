# @nimphy/domain

`@nimphy/domain` is the zero-dependency foundational package for Nimphy (Module M-01). It encapsulates pure domain primitives, immutable value objects, branded entity identifiers, provenance classifications, domain error types, and deterministic canonical JSON serialization and hashing.

---

## Architectural Principles & Constraints

This package strictly upholds the Nimphy Architecture Principles (doc 03, AGENTS.md):

1. **Deterministic Core (P-01):** Pure domain logic with zero I/O, zero network calls, zero clock/randomness, zero AI imports, and no floating-point financial arithmetic.
2. **Strict Inward Dependency (AGENTS.md §2, doc 03 §3):** Depends on nothing. It does not import from any other workspace package, framework (Next.js, React), database client, or external runtime libraries.
3. **Immutability for Evidence (P-04):** Value objects (`Money`), provenance wrappers, metadata dictionaries, and vocabulary arrays are runtime-frozen (`Object.freeze`).
4. **Verify at the Boundary (P-05):** Strict runtime validation for all constructors, parsers, and type guards; reject invalid states immediately.
5. **Honest Uncertainty (P-07):** Explicit provenance classifications on all inputs (`user_input`, `official_fact`, `estimate`, `assumption`).

---

## Public API & Modules

### 1. Money Value Object (`@nimphy/domain`)

Represents an exact financial amount in integer minor units (e.g. cents, pence, yen) paired with an approved ISO-4217 currency code.

- **Storage:** Integer minor units (`number` guaranteed within safe integer boundaries `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`).
- **No Floating-Point Financial Math:** Prevents precision loss and rounding anomalies (ADR-005).
- **Exact Multiplication API:**
  - `multiply(factor: number)`: Requires integer factor. Non-integers throw `InvalidMoneyError` to prevent IEEE-754 precision loss.
  - `multiplyDecimal(decimalString: string)`: Exact multiplication by decimal strings (e.g. `"0.29"` or `"-1.5"`) via BigInt rational arithmetic without floating-point math.
  - `multiplyRatio(numerator, denominator)`: Exact rational multiplication by BigInt or safe integer fractions (e.g. `29n / 100n` or `3 / 2`).
- **No Silent Rounding:** Arithmetic operations that would yield fractional minor units throw an `InvalidMoneyError`. Rounding policies belong exclusively to Rule Packs and calculation engines (ADR-005).
- **Currency Mismatch Protection:** Addition, subtraction, and comparison operations between mismatched currencies throw `CurrencyMismatchError`.
- **Overflow Guards:** Operations that exceed safe integer boundaries throw `MoneyOverflowError`.

```typescript
import { Money } from '@nimphy/domain';

// Construction
const price = Money.of(1499, 'USD'); // $14.99
const zero = Money.zero('USD'); // $0.00
const parsed = Money.fromDecimal('19.99', 'USD'); // Exactly 1999 minor units without floats

// Exact Arithmetic
const total = price.add(Money.of(500, 'USD')); // $19.99
const diff = total.subtract(price); // $5.00
const double = price.multiply(2); // $29.98 (integer factor)
const cut = Money.of(100, 'USD').multiplyDecimal('0.29'); // Exactly 29 USD minor units ($0.29)
const share = Money.of(1000, 'USD').multiplyRatio(3n, 2n); // Exactly 1500 USD minor units ($15.00)
const negative = price.negate(); // -$14.99

// Value Equality & Comparison
price.equals(Money.of(1499, 'USD')); // true
price.greaterThan(zero); // true
price.compare(total); // -1

// Formatting & Serialization
price.toJSON(); // { amountMinor: 1499, currency: 'USD' }
price.toDecimalString(); // "14.99"
price.toFormattedString(); // "$14.99"
price.toString(); // "14.99 USD"
```

---

### 2. Supported Currencies (`@nimphy/domain`)

The architecture limits currency support in MVP to a validated explicit set (ADR-005, doc 02 §A-2). The exported array is frozen at runtime:

| Currency Code | Minor Unit Exponent | Symbol | Name              | Unicode Symbol Hex |
| :------------ | :------------------ | :----- | :---------------- | :----------------- |
| `USD`         | 2                   | `$`    | US Dollar         | `0x24`             |
| `EUR`         | 2                   | `€`    | Euro              | `0x20AC`           |
| `GBP`         | 2                   | `£`    | British Pound     | `0x00A3`           |
| `CAD`         | 2                   | `CA$`  | Canadian Dollar   | —                  |
| `AUD`         | 2                   | `A$`   | Australian Dollar | —                  |
| `JPY`         | 0                   | `¥`    | Japanese Yen      | `0x00A5`           |

```typescript
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  parseCurrencyCode,
  getCurrencyMetadata,
  getMinorUnitExponent,
} from '@nimphy/domain';

isSupportedCurrency('USD'); // true
parseCurrencyCode(' eur '); // 'EUR'
getMinorUnitExponent('JPY'); // 0
Object.isFrozen(SUPPORTED_CURRENCIES); // true
```

---

### 3. Provenance Classifications (`@nimphy/domain`)

All facts and figures in Nimphy carry an explicit provenance label (doc 03 §P-07, doc 06 §4):

- `user_input`: Direct author/user input without third-party evidence.
- `official_fact`: Verified against official publisher rate cards or legal rules.
- `estimate`: Extrapolated from industry benchmarks or comparable data.
- `assumption`: Working hypothesis requiring sensitivity testing.

```typescript
import {
  PROVENANCE_VALUES,
  isProvenance,
  parseProvenance,
  isUncertain,
  createProvenanced,
  type Provenanced,
} from '@nimphy/domain';

isProvenance('estimate'); // true
isUncertain('estimate'); // true
isUncertain('user_input'); // false
Object.isFrozen(PROVENANCE_VALUES); // true

// Factory creating a frozen wrapper with copied & frozen evidence refs
const item: Provenanced<number> = createProvenanced(450, 'estimate', ['ev_1']);
Object.isFrozen(item); // true
Object.isFrozen(item.evidenceRefs); // true
```

---

### 4. Branded Identifiers (`@nimphy/domain`)

Type-safe nominal identifiers prevent accidental interchange of UUID keys at compile time. Validates canonical 128-bit UUID textual structure (8-4-4-4-12 hex digits, case-insensitive, normalized to lowercase), matching PostgreSQL's native `uuid` type across versions (v4, v7, nil, synthetic test fixtures):

- `UserId`
- `CaseId`
- `RevisionId`
- `EvidenceId`
- `RulePackId`
- `RunId`
- `MemoId`
- `DossierId`
- `PricePointId`
- `OrderId`
- `PaymentEventId`
- `EntitlementId`

```typescript
import { parseUserId, parseCaseId, isUserId, type UserId, type CaseId } from '@nimphy/domain';

const userId: UserId = parseUserId('f47ac10b-58cc-4372-a567-0e02b2c3d479');
const caseId: CaseId = parseCaseId('11111111-2222-3333-4444-555555555555');

// Compilation error: Type 'CaseId' is not assignable to type 'UserId'.
// const invalid: UserId = caseId;
```

---

### 5. Domain Error Hierarchy (`@nimphy/domain`)

Structured domain errors with stable machine-readable codes inheriting from `DomainError`:

- `DomainError`: Base error class with `code` and optional structured `details`.
- `InvalidMoneyError` (`INVALID_MONEY`): Invalid construction parameters, non-integer multipliers, or fractional minor units.
- `CurrencyMismatchError` (`CURRENCY_MISMATCH`): Operations attempted across differing currencies.
- `MoneyOverflowError` (`MONEY_OVERFLOW`): Integer overflow beyond safe integer range.
- `UnsupportedCurrencyError` (`UNSUPPORTED_CURRENCY`): Unapproved currency codes.
- `InvalidProvenanceError` (`INVALID_PROVENANCE`): Unrecognized provenance classifications.
- `InvalidIdentifierError` (`INVALID_IDENTIFIER`): Empty, malformed, or non-UUID identifiers.
- `CanonicalSerializationError` (`CANONICAL_SERIALIZATION_ERROR`): Top-level undefined/function/symbol, circular references, or unsupported object types.

---

### 6. Canonical JSON & SHA-256 Hashing (`@nimphy/domain`)

Deterministic JSON stringification with lexicographically sorted keys, sparse array canonicalization to `null`, active-path cycle detection, and pure TypeScript SHA-256 implementation (NIST FIPS 180-4 compliant). Used for computing `inputs_hash`, `results_hash`, and `content_hash` (doc 06 §4, doc 07 §4, doc 12 §3.4).

#### Canonical Serialization Contract:

1. **Top-Level Rejection:** Top-level `undefined`, `function`, and `symbol` throw `CanonicalSerializationError`.
2. **Object Key Sorting:** Object keys are sorted strictly in Unicode lexicographical order.
3. **Property Omission:** Properties with values of `undefined`, `function`, or `symbol` are omitted, matching standard JSON semantics.
4. **Array Handling:** Arrays preserve element order. Sparse array holes and array items that are `undefined`, `function`, or `symbol` are canonicalized to `null`.
5. **Primitive Normalization:** Primitives use standard JSON encoding; `-0` is strictly normalized to `0`.
6. **Value Object Evaluation (`toJSON`):** Objects implementing `toJSON()` (such as `Money`) are evaluated before serialization. Self-referential or mutually cycling `toJSON()` calls throw `CanonicalSerializationError`.
7. **Cycle Detection:** Active-path traversal tracking detects and rejects genuine circular references (`CanonicalSerializationError`).
8. **DAG Support:** Repeated non-cyclic object references in independent branches or arrays serialize cleanly without false-positive cycle errors.
9. **Fail-Closed Type Safety:** Unsupported values that cannot be deterministically represented (`Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`, `TypedArray`, non-finite numbers `NaN`/`Infinity`, `BigInt`, and class instances without `toJSON()`) throw `CanonicalSerializationError` to prevent silent data loss or ambiguous hashing.
10. **Consistent Hashing:** `canonicalJson(val)` and `toCanonicalJson(val)` produce identical outputs; `hashCanonicalJson(val)` consistently produces `"sha256:"` prepended hexadecimal hash of the canonical string.

```typescript
import { toCanonicalJson, canonicalJson, hashCanonicalJson, sha256Hex } from '@nimphy/domain';

const canonical = toCanonicalJson({ b: 2, a: 1 });
// '{"a":1,"b":2}'

const hash = hashCanonicalJson({ b: 2, a: 1 });
// 'sha256:...'
```

---

## Testing & Coverage

Run package tests:

```bash
pnpm test packages/domain
```

Run test coverage:

```bash
pnpm test:coverage
```

Current test metrics: **200/200 tests passing; 100% Statements, 99.31% Branches, 100% Functions, 100% Lines across `@nimphy/domain`**.
All tests are deterministic with zero external dependencies, no network, and no real clock.
