# Implementation Record — STEP-003: Domain Primitives

- **Step Identifier:** STEP-003
- **Step Name:** Domain Primitives
- **Phase:** Phase 0 (Foundations)
- **Architecture Package Version:** 0.3.0
- **Status:** Complete (Implemented, Tested & Locally Verified)

---

## A. Objective

The objective of STEP-003 was to implement the pure domain foundation of Nimphy in `packages/domain` (Module M-01) according to `docs/architecture/17-implementation-roadmap.md`, `AGENTS.md`, and canonical architecture documents (doc 03, 05, 06, 12, 18, 22).

This implementation provides:

1. **Immutable `Money` Value Object:** Integer minor units, ISO currency codes, overflow guards, and exact arithmetic with zero floating-point representation.
2. **Strongly Typed Currency Representation:** Explicit approved ISO-4217 currencies (`USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`) with exact minor-unit exponents (e.g. 2 for USD, 0 for JPY).
3. **Canonical Provenance Vocabulary:** Strict typing and runtime assertion for `user_input`, `official_fact`, `estimate`, and `assumption`, with uncertainty classification.
4. **Type-Safe Branded Identifiers:** Nominal branded UUID types preventing accidental cross-assignment across all 12 authorized entity types (`UserId`, `CaseId`, `RevisionId`, etc.).
5. **Typed Domain Error Hierarchy:** Structured domain errors with stable machine-readable error codes inheriting from `DomainError`.
6. **Deterministic Canonical JSON & Pure SHA-256 Hashing:** Lexicographically sorted key serialization with cycle detection and a pure TypeScript SHA-256 implementation (NIST FIPS 180-4 compliant).
7. **Zero-Dependency Architecture:** `@nimphy/domain` depends on zero external packages and zero workspace packages, with zero I/O and zero AI imports.

---

## B. Architectural Invariants & Design Choices

### 1. Money Value Object (`packages/domain/src/money/money.ts`)

- **Integer Minor Units:** Money stores amounts strictly as integer minor units (`amountMinor: number`) constrained within JavaScript safe integer bounds (`[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`).
- **No Floating-Point Representation:** Float numbers are strictly forbidden for monetary storage and calculation.
- **No Silent Rounding (P-01, ADR-005):** Multiplications that would result in non-integer minor units throw an `InvalidMoneyError` rather than silently rounding. Rounding policies belong exclusively to declared Rule Packs in subsequent steps.
- **Negative Zero Normalization:** Any negative zero (`-0`) input is normalized to positive zero (`0`).
- **Currency Mismatch Protection:** Addition, subtraction, and comparison operations between mismatched currencies throw `CurrencyMismatchError`.
- **Overflow Guards:** Arithmetic operations (`add`, `subtract`, `multiply`) verify safe integer boundaries, throwing `MoneyOverflowError` on overflow.
- **Runtime Immutability:** All instances execute `Object.freeze(this)` upon construction.
- **Decimal String Parser (`Money.fromDecimal`):** Parses human-readable decimal strings (e.g. `"19.99"`, `"-4.50"`, `"2500"`) into minor units using pure string manipulation and integer math without floating-point arithmetic. Enforces currency exponent constraints (e.g. at most 2 decimals for USD, 0 decimals for JPY).

### 2. Currency Codes & Metadata (`packages/domain/src/money/currency.ts`)

- **Approved Scope:** Only approved currencies are accepted: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`.
- **Boundary Validation:** `parseCurrencyCode` normalizes whitespace and casing, throwing `UnsupportedCurrencyError` for arbitrary or unapproved codes.
- **Variable Exponents:** Supports currencies with 2 decimal places (`USD`, `EUR`, `GBP`, `CAD`, `AUD`) and 0 decimal places (`JPY`), avoiding false assumptions that all currencies have 2 decimals.

### 3. Provenance (`packages/domain/src/provenance/provenance.ts`)

- **Established Terminology:** Preserves the canonical vocabulary: `user_input`, `official_fact`, `estimate`, `assumption`.
- **Boundary Guards:** `isProvenance`, `assertProvenance`, and `parseProvenance` guarantee runtime safety at system boundaries.
- **Uncertainty Classification:** `isUncertain(provenance)` identifies whether an input represents an estimate or assumption, driving mandatory illustrative disclaimers and AI evaluation checks (Principle P-07).
- **Container Interface:** `Provenanced<T>` pairs any domain value with its provenance classification and optional evidence item references.

### 4. Branded Identifiers (`packages/domain/src/identifiers/branded-ids.ts`)

- **Nominal Typing:** Implements `Branded<string, BrandName>` using a unique symbol brand tag.
- **Authorized Identifiers:** `UserId`, `CaseId`, `RevisionId`, `EvidenceId`, `RulePackId`, `RunId`, `MemoId`, `DossierId`, `PricePointId`, `OrderId`, `PaymentEventId`, `EntitlementId`.
- **Validation:** Enforces RFC 4122 UUID structure via regex, rejecting empty strings, whitespace, and malformed strings with `InvalidIdentifierError`. Normalizes valid UUIDs to lowercase.

### 5. Domain Errors (`packages/domain/src/errors/domain-error.ts`)

- **Base Class:** `DomainError` extends JavaScript `Error`, establishing prototype linkage and exposing `readonly code: string` and `readonly details?: Record<string, unknown>`.
- **Subclasses:**
  - `InvalidMoneyError` (`INVALID_MONEY`)
  - `CurrencyMismatchError` (`CURRENCY_MISMATCH`)
  - `MoneyOverflowError` (`MONEY_OVERFLOW`)
  - `UnsupportedCurrencyError` (`UNSUPPORTED_CURRENCY`)
  - `InvalidProvenanceError` (`INVALID_PROVENANCE`)
  - `InvalidIdentifierError` (`INVALID_IDENTIFIER`)
  - `CanonicalSerializationError` (`CANONICAL_SERIALIZATION_ERROR`)

### 6. Canonical JSON & Hashing Utility (`packages/domain/src/canonical/`)

- **Deterministic Key Sorting:** Object keys are sorted strictly in Unicode lexicographical code-point order at all nesting depths.
- **Serialization Semantics:** Arrays preserve element order; `undefined` object properties are omitted; `undefined` array elements become `null`; objects with `toJSON()` methods are evaluated first.
- **Cycle & Guard Detection:** Circular references and non-finite numbers (`NaN`, `Infinity`, `-Infinity`) throw `CanonicalSerializationError`.
- **Pure TypeScript SHA-256:** Independent FIPS 180-4 standard SHA-256 implementation with zero external runtime dependencies, verified against NIST test vectors.
- **Inputs & Results Hashing:** `hashCanonicalJson` produces `sha256:<64-hex>` strings used for `inputs_hash`, `results_hash`, and `content_hash` (doc 06 §4).

---

## C. Files Created and Modified

### 1. Created Files

- `packages/domain/src/errors/domain-error.ts`: Domain error class hierarchy.
- `packages/domain/src/errors/domain-error.test.ts`: Vitest suite for domain errors (13 tests).
- `packages/domain/src/errors/index.ts`: Public exports for domain errors.
- `packages/domain/src/money/currency.ts`: Supported currency codes, metadata, and validation.
- `packages/domain/src/money/currency.test.ts`: Vitest suite for currency logic (11 tests).
- `packages/domain/src/money/money.ts`: Immutable Money value object.
- `packages/domain/src/money/money.test.ts`: Vitest suite for Money value object (38 tests).
- `packages/domain/src/money/index.ts`: Public exports for money module.
- `packages/domain/src/provenance/provenance.ts`: Provenance classifications, guards, and descriptions.
- `packages/domain/src/provenance/provenance.test.ts`: Vitest suite for provenance (11 tests).
- `packages/domain/src/provenance/index.ts`: Public exports for provenance.
- `packages/domain/src/identifiers/branded-ids.ts`: Nominal branded UUID identifiers and parsers.
- `packages/domain/src/identifiers/branded-ids.test.ts`: Vitest suite for branded IDs (9 tests).
- `packages/domain/src/identifiers/index.ts`: Public exports for identifiers.
- `packages/domain/src/canonical/sha256.ts`: Pure TypeScript SHA-256 implementation.
- `packages/domain/src/canonical/sha256.test.ts`: NIST FIPS 180-4 test vectors (6 tests).
- `packages/domain/src/canonical/canonical-json.ts`: Deterministic JSON serialization and hashing.
- `packages/domain/src/canonical/canonical-json.test.ts`: Vitest suite for canonical JSON (14 tests).
- `packages/domain/src/canonical/index.ts`: Public exports for canonical utilities.
- `packages/domain/src/types.ts`: Shared domain enums (`ScenarioName`, `BookFormat`).
- `packages/domain/src/types.test.ts`: Vitest suite for shared domain enums (4 tests).
- `packages/domain/README.md`: Package architecture, usage guidelines, and API documentation.
- `prompts/step-03.md`: Exact prompt archive for STEP-003.
- `learning/implementation/step-03-domain-primitives.md`: This comprehensive implementation record.
- `learning/interviews/step-03-domain-primitives.md`: Senior engineering interview questions and answers.
- `learning/notes/step-03-domain-primitives.md`: Technical discoveries, trade-offs, and reference notes.

### 2. Modified Files

- `packages/domain/src/index.ts`: Re-exported intentional public domain API.
- `docs/DESIGN.md`: Updated to record STEP-003 completion and system state.

---

## D. Verification and Test Results

All verification suites executed cleanly with zero errors:

| Suite                   | Command                          | Result                                           |
| :---------------------- | :------------------------------- | :----------------------------------------------- |
| **Dependency Check**    | `pnpm install --frozen-lockfile` | Passed (lockfile clean)                          |
| **Typecheck**           | `pnpm typecheck`                 | Passed (8 packages checked, 0 errors)            |
| **Linting**             | `pnpm lint`                      | Passed (0 errors, 0 warnings)                    |
| **Prettier Format**     | `pnpm format:check`              | Passed                                           |
| **Boundary Checker**    | `pnpm boundaries:check`          | Passed (24 files checked, 0 boundary violations) |
| **Documentation Check** | `pnpm docs:check`                | Passed (23 files, 88 links verified)             |
| **Full Test Suite**     | `pnpm test`                      | Passed (**166/166 tests passed**, 13 test files) |
| **Production Build**    | `pnpm build`                     | Passed (Next.js Turbopack build succeeded)       |
| **Git Whitespace**      | `git diff --check`               | Passed (0 errors)                                |

### Test Count Breakdown

- **STEP-001 & STEP-002 Suites:** 60 tests (boundaries: 17, check-docs: 13, check-commit: 24, setup-hooks: 4, web smoke: 2).
- **STEP-003 Domain Suites:** 106 tests across 8 dedicated test suites:
  - `packages/domain/src/money/money.test.ts`: 38 tests
  - `packages/domain/src/canonical/canonical-json.test.ts`: 14 tests
  - `packages/domain/src/errors/domain-error.test.ts`: 13 tests
  - `packages/domain/src/provenance/provenance.test.ts`: 11 tests
  - `packages/domain/src/money/currency.test.ts`: 11 tests
  - `packages/domain/src/identifiers/branded-ids.test.ts`: 9 tests
  - `packages/domain/src/canonical/sha256.test.ts`: 6 tests
  - `packages/domain/src/types.test.ts`: 4 tests
- **Total Passing Tests:** 166 tests.
