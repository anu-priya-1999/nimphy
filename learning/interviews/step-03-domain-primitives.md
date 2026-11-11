# Senior Engineering Interview Preparation — STEP-003: Domain Primitives

This document compiles senior domain architecture and TypeScript engineering interview questions and in-depth answers based on the STEP-003 implementation of `@nimphy/domain`.

---

## 1. Value Objects in Domain-Driven Design (DDD)

### Q: What is a Value Object in Domain-Driven Design, and how does `Money` fulfill this pattern in `@nimphy/domain`?

**A:** In DDD, a Value Object is an immutable conceptual whole whose identity is determined solely by the equivalence of its attributes rather than a persistent conceptual identity or database primary key. If two instances have identical attributes, they are indistinguishable and interchangeable.

In `@nimphy/domain`, `Money` exemplifies the Value Object pattern through three fundamental properties:

1. **Attribute-Based Equality (`equals`):** Two `Money` instances are equal if and only if they share identical `currency` codes and `amountMinor` values. `Money.of(1500, 'USD').equals(Money.of(1500, 'USD')) === true`, regardless of reference identity.
2. **Strict Immutability:** Once instantiated, state cannot change. Construction calls `Object.freeze(this)`. Any operation (`add`, `subtract`, `multiply`, `negate`, `abs`) produces a new `Money` instance rather than mutating the original.
3. **Conceptual Cohesion:** An amount cannot exist without a currency, and a currency cannot perform financial calculations without an amount. They are inextricably bound as a single unit.

---

## 2. Money Representation & Financial Precision

### Q: Why does Nimphy represent monetary values as integer minor units rather than floating-point numbers or arbitrary-precision decimal strings?

**A:** In computing, binary floating-point representations (IEEE 754 64-bit floats used in JavaScript `number`) represent fractions in base 2. In base 2, simple decimal fractions like $0.1$ or $0.7$ cannot be represented with finite precision (analogous to $1/3$ in base 10). Consequently, arithmetic operations like `0.1 + 0.2 === 0.30000000000000004` introduce cumulative precision drift. In financial and royalty accounting, off-by-one-cent discrepancies lead to reconciliation failures, audit non-compliance, and legal disputes.

By representing money as an integer count of **minor units** (e.g. cents, pence, yen):

- All storage and arithmetic remain strictly within integer mathematics, where addition, subtraction, and comparison are exact.
- JavaScript `number` accurately represents all integers up to $2^{53} - 1$ ($9,007,199,254,740,991$), representing over \$90 trillion minor units, far exceeding any individual book publication or royalty volume.
- PostgreSQL maps minor units directly to 64-bit `bigint`, eliminating floating-point conversions between the application layer and database storage.

---

## 3. Floating-Point Precision Pitfalls

### Q: How does `Money.fromDecimal("19.99", "USD")` parse decimal input without introducing floating-point arithmetic?

**A:** A common developer mistake is parsing a string with `parseFloat("19.99") * 100`. In IEEE 754, `19.99 * 100` can yield `1998.9999999999998`, which truncates or rounds to $1998$ instead of $1999$.

In `@nimphy/domain`, `Money.fromDecimal` completely bypasses floating-point arithmetic:

1. It validates the string using an integer/decimal regular expression (`/^-?\d+(\.\d+)?$/`).
2. It splits the string into integer and fractional substrings around the decimal delimiter (`.`).
3. It retrieves the minor-unit exponent for the currency (e.g., $2$ for USD, $0$ for JPY).
4. For $2$-decimal currencies, it pads the fractional string with trailing zeros to exactly $2$ digits (e.g., `"19.9"` becomes `"19"` and `"90"`).
5. It concatenates the strings (`"1990"`) and parses the resulting integer string directly via `Number(combinedStr)`.
6. It checks `Number.isSafeInteger` on the resulting integer before creating the `Money` instance.

This guarantees exact conversion from human input to minor units with zero floating-point error.

---

## 4. Currency Handling & Variable Minor Units

### Q: Why is it an architectural defect to assume all currencies have two fractional digits, and how does Nimphy handle zero-decimal currencies like Japanese Yen (`JPY`)?

**A:** ISO-4217 defines variable minor-unit exponents across world currencies:

- Exponent 2: USD, EUR, GBP, CAD, AUD (1 unit = 100 minor units).
- Exponent 0: JPY (Japanese Yen), KRW (Korean Won) (1 unit = 1 minor unit; there are no "cents").
- Exponent 3: BHD (Bahraini Dinar), KWD (Kuwaiti Dinar) (1 unit = 1000 minor units).

Assuming every currency has 2 decimal places leads to severe currency corruption: a list price of 2500 JPY would either be multiplied by 100 to 250,000 or divided by 100 to 25.

In `@nimphy/domain`, `CURRENCY_METADATA` explicitly defines `minorUnitExponent: 0` for `JPY`.

- `Money.fromDecimal("2500", "JPY")` parses directly to `2500` minor units.
- Any attempt to provide a fractional amount for JPY (e.g., `Money.fromDecimal("2500.5", "JPY")`) throws `InvalidMoneyError`.
- `toDecimalString()` and `toFormattedString()` check the exponent and omit decimal points for zero-decimal currencies (`"¥2500"`).

---

## 5. Branded Types vs. TypeScript Structural Typing

### Q: TypeScript uses a structural type system (duck typing). How do Branded Types overcome this to prevent accidental assignment of a `UserId` to a `CaseId`?

**A:** By default, TypeScript considers any two types with the same shape structurally compatible. If both `UserId` and `CaseId` are declared as `type UserId = string; type CaseId = string;`, the compiler permits:

```typescript
function getCase(caseId: CaseId) { ... }
const userId: UserId = "11111111-2222-3333-4444-555555555555";
getCase(userId); // Validates without error! Silent domain bug!
```

To enforce nominal typing (nominal distinction by declared name), `@nimphy/domain` uses **Branded Types**:

```typescript
declare const BrandSymbol: unique symbol;

export type Branded<T, BrandName extends string> = T & {
  readonly [BrandSymbol]: BrandName;
};

export type UserId = Branded<string, 'UserId'>;
export type CaseId = Branded<string, 'CaseId'>;
```

Because `BrandSymbol` is a unique symbol, the compiler considers `{ [BrandSymbol]: 'UserId' }` and `{ [BrandSymbol]: 'CaseId' }` mutually incompatible. Assigning a `UserId` to a `CaseId` parameter triggers a compile-time error:

```
Type 'UserId' is not assignable to type 'CaseId'.
Type '"UserId"' is not assignable to type '"CaseId"'.
```

At runtime, the brand symbol does not exist on the string, introducing zero object allocation or memory overhead.

---

## 6. Domain Errors & Security Implications

### Q: What is the design rationale behind Nimphy's `DomainError` hierarchy, and how does it prevent information leakage?

**A:** In production systems, throwing generic errors (`throw new Error(...)`) or framework-specific exceptions leaks implementation details, creates brittle error handling, and complicates boundary mapping.

`@nimphy/domain` implements a cohesive `DomainError` hierarchy:

1. **Stable Machine-Readable Codes:** Every error specifies a constant code (`INVALID_MONEY`, `CURRENCY_MISMATCH`, `MONEY_OVERFLOW`, `UNSUPPORTED_CURRENCY`, `INVALID_IDENTIFIER`). Higher layers (API routes, use cases) map these directly to RFC 7807 problem details (e.g. `ERR-VAL-001`, `ERR-VAL-002`) without parsing error message strings.
2. **Structured Details:** Rich contextual properties (e.g., `expectedCurrency`, `actualCurrency`, `operation`) are stored in a frozen `details` dictionary.
3. **Information Leakage Prevention:** Domain errors only contain domain concepts. They never expose stack traces, database column names, internal infrastructure URLs, or user credentials.
4. **Independent Testability:** Tests use `expect(() => ...).toThrow(CurrencyMismatchError)` and inspect `err.code` and `err.details`.

---

## 7. Principle of Immutability for Evidence (P-04)

### Q: Why must Domain Value Objects be strictly immutable at runtime, and how is this implemented in `Money`?

**A:** In financial calculation engines, aliasing bugs occur when a mutable object is passed into a function and modified in place:

```typescript
// If Money were mutable:
const itemCost = Money.of(1000, 'USD');
calcEngine.applyDiscount(itemCost); // Mutates itemCost.amountMinor to 800!
// Now the caller's reference to itemCost has silently changed!
```

Under Principle P-04 (Immutability for evidence), calculation inputs, rule applications, and run results form an auditable, reproducible snapshot.

To ensure immutability:

1. Properties are marked `readonly` in TypeScript declarations: `readonly amountMinor: number;`.
2. The constructor executes `Object.freeze(this)`. Any attempt at runtime to reassign a property (`money.amountMinor = 500`) throws a `TypeError` in strict mode.
3. All operations return new instances.

---

## 8. Modularity & Dependency Boundaries

### Q: Why does `@nimphy/domain` have zero workspace dependencies and zero external dependencies?

**A:** The Domain layer sits at the absolute center of Clean Architecture / Onion Architecture (AGENTS.md §2, doc 03 §3).
All dependency arrows point inward toward `domain`:

```
web -> use-cases -> calc-engine / rules / ai / payments / persistence -> domain
```

If `domain` imported an external library (such as an ORM, React, Next.js, or an external math library):

- A vulnerability or breaking change in that external dependency would ripple through every package in the monorepo.
- Domain logic could not be executed cleanly in pure worker environments, edge runtimes, or client bundles.
- Boundary tooling (`pnpm boundaries:check` and `@nimphy/architecture-boundaries`) strictly validates that `@nimphy/domain` has zero dependencies in its `package.json` and zero external imports in its source files.

---

## 9. Deterministic Canonical Serialization & Hashing

### Q: Why does Nimphy require canonical JSON serialization and pure SHA-256 hashing at the domain layer?

**A:** In Nimphy, case revisions, calculation runs, and rule packs rely on cryptographic hashes for evidence and cache validation:

- `case_revisions.inputs_hash`: SHA-256 of canonical inputs (doc 06 §4).
- `calculation_runs.results_hash`: SHA-256 of canonical engine results (NFR-001, doc 06 §4).
- `rule_packs.content_hash`: SHA-256 of immutable rule content.

Standard `JSON.stringify` does not guarantee deterministic key ordering: `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce different JSON strings and therefore completely different cryptographic hashes.

`toCanonicalJson` ensures:

1. Object keys are recursively sorted in Unicode lexicographical order.
2. Value objects with `toJSON()` methods (like `Money`) are evaluated prior to stringification.
3. Arrays maintain sequence while elements are recursively canonicalized.
4. Circular references and non-finite numbers are rejected.

`sha256Hex` implements the FIPS 180-4 standard in pure TypeScript, ensuring byte-level hash determinism across all operating systems and runtimes without native library dependencies.

---

## 10. Test Strategy for Domain Primitives

### Q: How do the domain test suites ensure test determinism and satisfy the Definition of Done?

**A:** Per doc 12 §2 and doc 22:

1. **Zero External I/O:** The 106 tests in `packages/domain` use zero network calls, zero file I/O, zero database connections, and zero non-deterministic clocks (`Date.now()`) or random number generators (`Math.random()`).
2. **Mathematical Invariant Verification:** Tests assert pure algebraic properties:
   - Additive identity ($a + 0 = a$).
   - Additive inverse ($a + (-a) = 0$).
   - Commutativity ($a + b = b + a$).
   - Associativity ($(a + b) + c = a + (b + c)$).
3. **NIST Benchmark Verification:** The pure TypeScript SHA-256 implementation is validated directly against official NIST FIPS 180-4 test vectors (including empty string, 3-byte message, and block-boundary 448-bit message).
4. **Negative Boundary Coverage:** Extensive tests verify rejection of fractional minor units, non-finite numbers, integer overflows, unsupported currencies, mismatched currencies, and malformed identifiers.
