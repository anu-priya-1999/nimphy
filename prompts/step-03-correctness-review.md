# NIMPHY — STEP-003 MASTER PROMPT

# DOMAIN PRIMITIVES: CORRECTNESS REVIEW, HARDENING, TESTING AND DOCUMENTATION FINALIZATION

## ROLE

Act as a Principal Domain Architect, Staff TypeScript Engineer, Financial Systems Engineer, Cryptographic Software Reviewer, Test Architect and Technical Documentation Lead.

You are working on Nimphy, a publishing business-case and decision-intelligence SaaS platform.

STEP-001 (Project Scaffolding) and STEP-002 (Documentation and Architecture Boundary Tooling) are complete.

The initial implementation of STEP-003 (Domain Primitives) has also been completed and reported as passing 166 tests.

However, an independent source-code review identified potential correctness issues that must be investigated and resolved before STEP-003 is approved.

Your responsibility is to:

1. Independently review the existing domain implementation.
2. Reproduce and diagnose actual defects.
3. Correct every genuine correctness issue.
4. Preserve valid existing implementations and avoid unnecessary rewrites.
5. Strengthen mathematical, serialization, immutability and cryptographic correctness.
6. Satisfy the canonical roadmap's coverage requirement.
7. Run comprehensive tests and verification.
8. Update ALL THREE existing STEP-003 learning documents after hardening is complete.
9. Preserve the original STEP-003 implementation prompt.
10. Create a separate correctness-review prompt and implementation record.
11. Update the one existing `docs/DESIGN.md` after technical verification.
12. Perform a final verification after all documentation changes.

**This task is a continuation and hardening of STEP-003. It does not authorize STEP-004.**

---

# CRITICAL EXECUTION ORDER — NON-NEGOTIABLE

You MUST follow the phases below sequentially.

Documentation must not be finalized before implementation hardening and technical verification.

## PHASE A — INSPECT AND REPRODUCE

Inspect the complete existing implementation.

Reproduce every suspected issue with a test or a focused executable reproduction.

Record findings temporarily for the implementation work.

Do not modify the learning documents, package README, architecture documents, ADRs or `docs/DESIGN.md` during this phase.

## PHASE B — IMPLEMENTATION HARDENING

Correct all confirmed defects in the source code.

Do not weaken correctness guarantees or remove valid functionality merely to simplify implementation.

Do not begin documentation finalization.

## PHASE C — TESTING AND COVERAGE

Add comprehensive regression tests, differential tests, property tests where appropriate, and coverage instrumentation.

Run tests and coverage.

Return to Phase B whenever a required implementation or test fails.

Do not proceed until the implementation satisfies its technical requirements.

## PHASE D — COMPLETE TECHNICAL VERIFICATION

Run the full repository verification suite.

Inspect the final source-code diff.

Confirm that the implementation meets the roadmap and Definition of Done.

If any mandatory requirement remains unmet, fix it before proceeding.

## PHASE E — DOCUMENTATION FINALIZATION

ONLY AFTER PHASES A–D HAVE SUCCEEDED:

Update all three existing learning documents:

- `learning/implementation/step-03-domain-primitives.md`
- `learning/interviews/step-03-domain-primitives.md`
- `learning/notes/step-03-domain-primitives.md`

Create:

- `learning/implementation/step-03-correctness-review.md`

Preserve:

- `prompts/step-03.md`

Create:

- `prompts/step-03-correctness-review.md`

Update where justified:

- `packages/domain/README.md`
- Relevant architecture documents.
- Relevant ADRs.
- The ONE existing `docs/DESIGN.md`.

All documentation must reflect the final corrected and verified implementation, not an intermediate version.

## PHASE F — FINAL POST-DOCUMENTATION VERIFICATION

After updating all documentation, run the applicable full verification suite again.

Ensure documentation changes have not broken formatting, links, tests, build or architecture boundaries.

## PHASE G — FINAL REPORT

Produce the complete report only after the previous phases are finished.

Choose:

- READY FOR STEP-003 APPROVAL
- NOT READY — FURTHER CORRECTIONS REQUIRED

Do not approve STEP-003 on the owner's behalf.

Do not begin STEP-004.

Stop and wait for owner review.

**HARDEN CODE FIRST. VERIFY SECOND. UPDATE ALL LEARNING DOCUMENTS AND DESIGN.md THIRD. RUN FINAL VERIFICATION LAST.**

---

# PHASE A — SOURCE-OF-TRUTH AND PRE-FLIGHT INSPECTION

Before modifying code, inspect the following.

### Governance

- `AGENTS.md`
- `docs/DESIGN.md`
- `README.md`

### Canonical architecture

- `docs/architecture/00-README.md`
- `docs/architecture/02-product-scope-and-requirements.md`
- `docs/architecture/03-architecture-principles.md`
- `docs/architecture/05-component-responsibilities.md`
- `docs/architecture/06-database-architecture-and-schema.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- `docs/architecture/22-definition-of-done.md`

### STEP-003 historical records

- `prompts/step-03.md`
- `learning/implementation/step-03-domain-primitives.md`
- `learning/interviews/step-03-domain-primitives.md`
- `learning/notes/step-03-domain-primitives.md`

### Source implementation

Inspect the complete contents of:

- `packages/domain/src/money/money.ts`
- `packages/domain/src/money/currency.ts`
- `packages/domain/src/provenance/provenance.ts`
- `packages/domain/src/identifiers/branded-ids.ts`
- `packages/domain/src/errors/domain-error.ts`
- `packages/domain/src/canonical/canonical-json.ts`
- `packages/domain/src/canonical/sha256.ts`
- All domain test files.
- `packages/domain/src/index.ts`
- All relevant configuration and package manifests.

Also inspect:

- The current Git working tree.
- Previous STEP-003 changes.
- Existing dependency boundaries.
- Existing coverage configuration.

Extract the exact STEP-003 scope and acceptance criteria from the canonical roadmap.

The roadmap and accepted ADRs are authoritative.

Do not assume the earlier review findings are automatically correct. Reproduce each finding against the actual code.

Record the initial Git status and current source-code state.

For this entire task, preserve the original STEP-003 implementation history.

---

# PHASE B — IMPLEMENTATION HARDENING

# 1. MONEY VALUE OBJECT: EXACT FINANCIAL ARITHMETIC

Inspect:

`packages/domain/src/money/money.ts`

The current implementation stores monetary amounts as integer minor units. This is the correct foundation.

However, the multiplication implementation uses:

`this.amountMinor * factor`

where `factor` is a JavaScript number.

This can produce IEEE-754 floating-point inaccuracies.

Example:

```ts
100 * 0.29;
```

may produce:

```ts
28.999999999999996;
```

This could incorrectly reject a mathematically exact result of 29 minor units.

## Investigation

1. Reproduce the issue.
2. Inspect all Money callers.
3. Inspect the existing public multiplication contract.
4. Determine the safest backwards-compatible change.
5. Document the proposed API internally before implementing it.

## Required correction

Implement exact multiplication without relying on floating-point multiplication to determine financial correctness.

Evaluate:

- Decimal-string factors.
- Rational factors using BigInt numerator and denominator.
- Exact division and remainder checks.
- Safe integer result constraints.
- Negative, positive and zero factors.
- Overflow conditions.
- Invalid inputs.

A suitable API may provide:

```ts
Money.multiplyDecimal('0.29');
```

or:

```ts
Money.multiplyRatio(29n, 100n);
```

You may choose one or both based on the architecture and maintainability.

The exact decimal factor `0.29` multiplied by 100 minor units must produce exactly 29 minor units.

A fractional minor-unit result must be rejected unless an explicit future calculation policy authorizes rounding.

Do not:

- Use epsilon comparisons to hide inaccuracies.
- Silently round.
- Convert an already calculated floating-point number into a decimal string and claim the original precision has been recovered.
- Introduce a rounding policy into Money itself.

Rounding policies belong to future rule-pack and financial calculation logic.

If the existing `multiply(number)` API cannot guarantee the required semantics, replace or deprecate it with a safe documented API.

## Mandatory Money invariants

1. Integer minor-unit storage.
2. No silent financial rounding.
3. No floating-point financial storage.
4. Currency mismatch rejection.
5. Overflow rejection.
6. Unsafe integer rejection.
7. Negative-zero normalization.
8. Immutability.
9. Exact decimal parsing.
10. Explicit multiplication semantics.

Also review:

- `add()`
- `subtract()`
- `multiply()`
- `negate()`
- `abs()`
- `equals()`
- `compare()`
- `toDecimalString()`
- `toFormattedString()`
- `fromDecimal()`
- `fromJSON()`

Check every operation for safe integer behavior.

## Required tests

Cover:

- Positive amounts.
- Negative amounts.
- Zero.
- Exact multiplication by integer factors.
- Exact multiplication by decimal factors.
- Exact rational multiplication.
- Fractional minor-unit rejection.
- Non-finite values.
- Invalid decimal strings.
- Overflow.
- Safe integer boundaries.
- Currency mismatch.
- Immutability.
- Decimal parsing.
- Every supported currency exponent.

Do not report the multiplication API as correct until its real public behavior is covered by tests.

---

# 2. CURRENCY AND PROVENANCE VOCABULARY: RUNTIME IMMUTABILITY

Inspect:

- `packages/domain/src/money/currency.ts`
- `packages/domain/src/provenance/provenance.ts`

Current arrays use `as const`.

This provides compile-time readonly typing but does not itself freeze the runtime arrays.

Investigate:

- `SUPPORTED_CURRENCIES`
- `PROVENANCE_VALUES`

## Required correction

Make both vocabularies genuinely immutable at runtime.

Requirements:

1. Preserve TypeScript literal-union inference.
2. Freeze exported arrays.
3. Ensure validation logic cannot be bypassed through runtime mutation.
4. Keep currency metadata consistent with the vocabulary.
5. Preserve runtime validation.
6. Reject unsupported currency values.
7. Reject unsupported provenance values.

Review `CURRENCY_METADATA` as well.

Add tests proving runtime immutability and validator integrity.

Do not claim TypeScript `readonly` alone prevents runtime mutation.

---

# 3. CANONICAL JSON: DETERMINISM AND INPUT SAFETY

Inspect:

`packages/domain/src/canonical/canonical-json.ts`

Canonical JSON is used for integrity-related hashes.

Ambiguous or lossy serialization is unacceptable.

Investigate and correct the following cases.

## A. Top-level unsupported values

The current serializer may return an empty string for:

- `undefined`
- Functions.
- Symbols.

An empty string is not valid canonical JSON.

Reject unsupported top-level values with `CanonicalSerializationError`.

Ensure `hashCanonicalJson()` cannot silently hash an invalid or ambiguous serialization result.

## B. Sparse arrays

Investigate arrays such as:

```ts
const value = new Array(3);
```

The implementation must not silently skip missing array slots or produce invalid JSON.

Choose an explicit strategy:

- Reject sparse arrays, or
- Convert holes according to a clearly documented canonical rule.

Ensure a sparse array never becomes an empty array or produces malformed JSON.

Add tests for sparse arrays at multiple nesting levels.

## C. Unsupported JavaScript values

Inspect how the serializer handles:

- `Map`
- `Set`
- `Date`
- RegExp.
- Class instances.
- Typed arrays.
- Other non-plain objects.

Do not silently serialize objects with meaningful contents as `{}`.

Define and document an explicit supported-value contract.

Reject unsupported objects with a descriptive `CanonicalSerializationError`, unless the architecture authorizes a deliberate canonical representation.

Do not invent a universal serializer for every JavaScript type.

## D. Custom toJSON() and cycles

The current serializer evaluates custom `toJSON()` methods.

Test:

1. Normal Money serialization.
2. A custom object returning a plain object.
3. `toJSON()` returning itself.
4. Indirect cycles through `toJSON()`.
5. Nested circular references.
6. Repeated but non-circular references.
7. A custom `toJSON()` method returning an unsupported object.

Track the active serialization path so genuine cycles are rejected without incorrectly rejecting repeated references in different branches.

Prevent uncontrolled recursion.

Preserve valid Money serialization.

## E. Canonical serialization rules

Preserve and document:

- Lexicographical object-key ordering.
- Stable array ordering.
- Valid JSON encoding.
- Deterministic number representation.
- Defined undefined-value behavior.
- Cycle detection.
- Money serialization.

Reject unsupported values rather than silently discarding them when doing so would create ambiguous hash inputs.

Add comprehensive unit tests.

---

# 4. UUID VALIDATION: CLARIFY THE CONTRACT

Inspect:

`packages/domain/src/identifiers/branded-ids.ts`

The current regular expression checks UUID textual structure but is described as RFC 4122 UUID validation.

These are not necessarily equivalent.

Inspect the database architecture and establish the intended identifier contract.

Choose deliberately:

1. Canonical UUID textual-format validation only.
2. UUID textual format plus version and variant validation.

Do not reject legitimate database identifiers without architectural justification.

Ensure the source comments, package documentation and tests agree.

Cover:

- Valid lowercase UUIDs.
- Valid uppercase UUIDs.
- Invalid characters.
- Incorrect group lengths.
- Missing separators.
- Empty strings.
- Whitespace.
- Version/variant restrictions if adopted.
- Normalization behavior.

Preserve branded identifier type safety.

Do not add ID generation or persistence behavior unless explicitly authorized.

---

# 5. PROVENANCED<T>: IMMUTABILITY GUARANTEES

Inspect:

`packages/domain/src/provenance/provenance.ts`

The generic `Provenanced<T>` wrapper currently uses TypeScript readonly properties.

This does not automatically make the nested generic value deeply immutable.

Design a truthful immutability contract.

Consider a factory that:

1. Validates the provenance classification.
2. Creates the wrapper.
3. Copies evidence references.
4. Freezes the evidence-reference array.
5. Freezes the outer wrapper.
6. Preserves the supplied generic value without falsely claiming arbitrary deep immutability.

Do not deeply freeze an arbitrary generic object unless the architecture explicitly requires it.

Document whether the generic value is caller-owned, copied or immutable by contract.

Add tests for the exact guarantees.

---

# 6. SHA-256: DIFFERENTIAL CRYPTOGRAPHIC VERIFICATION

Inspect:

`packages/domain/src/canonical/sha256.ts`

The existing implementation is a pure TypeScript SHA-256 implementation with no runtime dependencies.

Preserve that design unless a genuine correctness defect is found.

Add differential tests against Node's built-in crypto implementation.

Use `node:crypto` only in the test environment:

```ts
createHash('sha256');
```

Production domain code must remain free of Node-specific runtime dependencies.

## Required test inputs

- Empty input.
- NIST test vectors.
- ASCII.
- Unicode.
- Supplementary-plane Unicode characters.
- UTF-8 currency symbols.
- Inputs of 55, 56, 63, 64 and 65 bytes.
- Inputs of 127, 128 and 129 bytes.
- Multiple SHA-256 blocks.
- Larger practical payloads.
- Uint8Array inputs.

## UTF-8 fallback

Inspect behavior when `TextEncoder` is unavailable.

Verify:

- Valid surrogate pairs.
- Unpaired high surrogates.
- Unpaired low surrogates.
- Replacement behavior consistent with the expected UTF-8 encoding semantics.

Create tests that exercise the fallback path without changing the production public API unnecessarily.

Do not change a correct hash implementation just to simplify its code.

Document the verification methodology.

---

# 7. CURRENCY SYMBOL AND UTF-8 VALIDATION

Inspect the actual source-file bytes and encoding for:

- Euro.
- Pound.
- Yen.
- Dollar symbols.

The previous terminal output displayed suspicious sequences such as:

- `â‚¬`
- `Â£`
- `Â¥`

Determine whether these are actual source corruption or PowerShell display encoding issues.

Verify expected Unicode values with tests.

Do not rewrite correct UTF-8 source merely because a terminal displays mojibake.

Document the difference between source-file encoding and terminal display encoding.

---

# 8. ADDITIONAL DOMAIN QUALITY REVIEW

Inspect all public exports from:

`packages/domain/src/index.ts`

Review:

- Accidental exposure of internal helpers.
- Error codes and error types.
- Constructor safety.
- Public API consistency.
- Accurate JSDoc.
- TypeScript declarations.
- Runtime validation.
- Dependency boundaries.
- Circular imports.
- Immutability semantics.
- `abs()` and `negate()` at safe integer boundaries.

Ensure no public construction path bypasses Money invariants.

Do not create unnecessary abstractions.

---

# PHASE C — TESTING AND COVERAGE

# 9. IMPLEMENT COMPREHENSIVE REGRESSION TESTS

All tests must exercise public behavior.

Cover every corrected issue.

Use the existing Vitest infrastructure.

Tests must be deterministic.

No real network, database, system clock or uncontrolled randomness.

Add:

- Unit tests.
- Boundary tests.
- Property-based tests where justified.
- Differential SHA-256 tests.
- Regression tests for every reproduced defect.

Preserve existing tests unless they genuinely encode an incorrect contract.

Do not weaken existing tests just to make the suite pass.

# 10. COVERAGE REQUIREMENT

Read the exact coverage requirement in:

- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/12-testing-and-ai-evaluation.md`
- `docs/architecture/22-definition-of-done.md`

STEP-003 requires at least 95% coverage.

Install a coverage provider compatible with the pinned Vitest version.

Prefer the matching V8 provider.

Add:

`pnpm test:coverage`

Measure actual production coverage for:

`packages/domain/src/`

Report:

- Statements.
- Branches.
- Functions.
- Lines.
- Per-file coverage.

Meet the roadmap's actual threshold.

If the architecture leaves the metric definition ambiguous, use at least 95% for each of statements, branches, functions and lines as the conservative implementation target.

Do not game coverage by excluding difficult production code.

Do not add meaningless tests.

Do not claim that test count equals coverage.

If the required threshold is not met, continue improving tests and implementation before proceeding.

---

# PHASE D — COMPLETE TECHNICAL VERIFICATION

# 11. REQUIRED VERIFICATION COMMANDS

After all source-code hardening and tests are complete, run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm boundaries:check
pnpm docs:check
pnpm test
pnpm test:coverage
pnpm build
git diff --check
```

Record the actual exit code and relevant output for every command.

Check:

- Domain package has zero workspace dependencies.
- No infrastructure dependencies entered the domain layer.
- No cyclic imports exist.
- All corrected Money behavior is covered.
- Canonical JSON behavior is unambiguous.
- SHA-256 matches the trusted implementation.
- Coverage thresholds pass.
- All existing STEP-001 and STEP-002 functionality still passes.
- No future roadmap features were implemented.

If an implementation or test fails:

1. Return to PHASE B or C.
2. Correct it.
3. Re-run the affected tests.
4. Re-run the full verification suite.

Do not proceed to documentation finalization with unresolved technical failures.

# 12. SOURCE AND ARCHITECTURE REVIEW

Inspect the final source-code diff.

Confirm:

- All confirmed defects were corrected.
- Public API contracts are accurate.
- No architecture boundary was violated.
- No future product features were introduced.
- No tests were weakened.
- Coverage was genuinely measured.
- No secrets or credentials were added.

Review ADR-005 and other related decisions.

If an architecture decision must change:

- Explain the context.
- Document alternatives.
- Explain the selected approach.
- Record consequences.
- Preserve the historical decision.
- Do not silently mark an accepted ADR as superseded.

Do not modify the architecture package unnecessarily.

Keep the 23 canonical documents intact unless a genuine architectural correction is necessary.

---

# PHASE E — DOCUMENTATION FINALIZATION

**Only begin this phase after all implementation, test, coverage and technical verification requirements have passed.**

At this point, the source code is the final corrected implementation.

All documentation must now be updated to describe that actual implementation.

Do not document intermediate fixes as if they were the final behavior.

# 13. UPDATE ALL THREE EXISTING LEARNING DOCUMENTS

This requirement is mandatory.

You MUST update all three original STEP-003 learning documents.

Do not update only the implementation document.

## A. Implementation record

Update:

`learning/implementation/step-03-domain-primitives.md`

Make the complete document consistent with the final implementation.

Include:

- Original implementation and its verified behavior.
- Issues found during review.
- How defects were reproduced.
- Root-cause analysis.
- Corrected implementations.
- Before-and-after examples.
- Final public API contracts.
- Mathematical invariants.
- Currency behavior.
- Provenance behavior.
- Branded ID validation.
- Canonical JSON rules.
- SHA-256 verification.
- Immutability guarantees.
- Coverage measurements.
- Actual tests and commands.
- Remaining limitations.

Preserve the historical fact that the initial implementation underwent a correctness review.

Create an additional chronological review record:

`learning/implementation/step-03-correctness-review.md`

This record must explain:

1. What prompted the review.
2. Original findings.
3. Reproduction evidence.
4. Root causes.
5. Corrections.
6. Tests added.
7. Coverage achieved.
8. Final verification.
9. Decisions and remaining limitations.

Do not erase historical implementation information.

## B. Senior engineering interview document

Update:

`learning/interviews/step-03-domain-primitives.md`

Retain original useful questions and answers.

Add detailed senior-level interview questions and answers covering:

1. IEEE-754 floating-point behavior.
2. Exact financial multiplication.
3. Decimal arithmetic versus rational arithmetic.
4. BigInt and safe integer boundaries.
5. Minor units and currency exponents.
6. Explicit rounding policy.
7. TypeScript readonly versus runtime immutability.
8. Generic value-object immutability.
9. Canonical JSON.
10. Sparse arrays.
11. Unsupported JavaScript types.
12. toJSON() and cycle detection.
13. UUID textual format versus version/variant validation.
14. SHA-256 internals.
15. Differential cryptographic verification.
16. UTF-8 and Unicode handling.
17. Statement, branch, function and line coverage.
18. Domain errors and dependency direction.

For EVERY question provide:

- Interview-ready answer.
- Detailed technical explanation.
- Nimphy-specific example.
- Architectural trade-offs.
- Common mistakes.
- Likely follow-up questions.

Answers must reflect the corrected implementation.

Do not teach previously defective behavior as the final design.

This document should prepare the owner to confidently explain and defend the engineering work in senior software engineering interviews.

## C. Technical notes

Update:

`learning/notes/step-03-domain-primitives.md`

Include detailed explanations of:

- IEEE-754 floating-point limitations.
- Exact decimal-string parsing.
- Rational multiplication with BigInt.
- Safe integer overflow.
- Currency exponents.
- Runtime-frozen vocabularies.
- Canonical JSON accepted and rejected values.
- Sparse array handling.
- Active-path cycle detection.
- Custom toJSON() behavior.
- UUID validation semantics.
- Provenanced<T> guarantees.
- SHA-256 message padding and block processing.
- NIST test vectors.
- Differential testing against Node crypto.
- UTF-8 encoding and malformed surrogates.
- Coverage measurement.
- Windows PowerShell encoding observations.

Provide reproducible examples and troubleshooting commands.

Clearly distinguish:

- Actual implemented behavior.
- Rejected approaches.
- Known limitations.
- Future architectural decisions.

All explanations must agree with the final source code.

---

# 14. PROMPT ARCHIVE

Preserve:

`prompts/step-03.md`

Do not overwrite the original STEP-003 implementation prompt.

Create:

`prompts/step-03-correctness-review.md`

Save the complete correctness-review prompt used for this task.

Do not describe reconstructed material as an exact historical chat transcript.

---

# 15. DOMAIN PACKAGE README

Update:

`packages/domain/README.md`

Document the final implementation:

- Package purpose.
- Public exports.
- Money representation.
- Exact multiplication API.
- Rounding behavior.
- Supported currencies.
- Currency limitations.
- Provenance vocabulary.
- Branded identifier contract.
- Domain errors.
- Canonical JSON input contract.
- SHA-256 behavior and test methodology.
- Actual immutability guarantees.
- Dependency restrictions.
- Unit and coverage commands.

Examples must compile against the final public API.

Remove stale examples.

---

# 16. ARCHITECTURE DOCUMENTS AND ADRs

Review relevant architecture decisions.

Update an existing ADR or architecture document only if the corrected implementation reveals a genuine inconsistency.

Do not create unnecessary architecture documents.

Do not silently change an accepted decision.

If a decision requires owner approval, mark it Proposed and report it.

Keep exactly the existing 23 numbered architecture documents unless a justified architectural change is approved.

Ensure all learning documents and architecture references remain consistent.

---

# 17. UPDATE THE ONE LIVING DESIGN DOCUMENT

Update only:

`docs/DESIGN.md`

There must remain exactly ONE `docs/DESIGN.md`.

Do not create per-step DESIGN files.

The document must reflect the final verified state.

Include:

- Architecture package version.
- Phase and STEP-003 status.
- Completed domain modules.
- Final public APIs.
- Money invariants.
- Currency limitations.
- Provenance classifications.
- Branded IDs.
- Domain error structure.
- Canonical JSON contract.
- SHA-256 verification.
- Immutability guarantees.
- Coverage results.
- Actual test count.
- Verification command results.
- Exact files changed.
- ADR updates.
- Open questions.
- Next authorized step: STEP-004, only if STEP-003 is genuinely ready.

Distinguish actual verified results from assumptions and unverified external checks.

Do not claim that remote GitHub Actions passed unless it actually executed.

---

# PHASE F — FINAL POST-DOCUMENTATION VERIFICATION

# 18. FINAL VALIDATION AFTER DOCUMENTATION

After updating all three learning documents, README, prompt archive, architecture references and DESIGN.md, run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm boundaries:check
pnpm docs:check
pnpm test
pnpm test:coverage
pnpm build
git diff --check
```

The tests and coverage must still pass.

Documentation links must remain valid.

Formatting must pass.

No architectural boundaries may be violated.

If a documentation-only check fails, fix the documentation and repeat the affected checks.

If a source or test check fails, return to implementation hardening, correct the issue and rerun the full suite.

Do not claim success on the basis of earlier test results when later changes invalidate them.

## Final scope inspection

Confirm:

- No STEP-004 functionality was introduced.
- No royalty formulas were implemented.
- No database integrations were introduced.
- No AI integrations were introduced.
- No payment integrations were introduced.
- No existing historical learning records were erased.
- All three original learning documents were updated.
- Both original and review prompts are preserved.
- Only one DESIGN.md exists.
- All 23 canonical architecture documents remain present.
- The domain dependency boundary remains intact.
- No credentials or secrets were added.

---

# PHASE G — FINAL REPORT

# 19. REPORT FORMAT

Produce a detailed final report with the following sections.

## A. Original findings

For each issue report:

- Was it reproduced?
- Root cause.
- Severity.
- Correction.

## B. Money implementation

Document:

- Final multiplication API.
- Decimal and rational semantics.
- Exactness.
- Overflow checks.
- Rounding behavior.

## C. Currency and provenance

Document:

- Runtime immutability.
- Supported currency list.
- Currency metadata.
- Provenance validation.

## D. Canonical JSON

Document:

- Accepted values.
- Rejected values.
- Sparse array behavior.
- Cycle detection.
- toJSON() behavior.

## E. Identifier contract

Document the final UUID validation semantics.

## F. Provenanced<T>

Document the actual shallow/deep immutability guarantees.

## G. SHA-256

Provide differential verification results and test-input categories.

## H. Coverage

Show actual:

- Statements.
- Branches.
- Functions.
- Lines.
- Per-file coverage where available.

## I. Testing

Report:

- Previous test count.
- Additional tests.
- Final test count.
- Actual command results.
- Actual exit codes.
- Remaining warnings.

## J. Documentation

List:

- Implementation document updated.
- Interview document updated.
- Notes document updated.
- Correctness-review implementation record created.
- Original prompt preserved.
- Review prompt archived.
- Package README updated.
- Architecture documents/ADRs changed, if any.
- DESIGN.md updated.

## K. Architecture and scope

Report any deviations or open decisions.

Confirm STEP-004 was not started.

## L. Approval recommendation

Choose exactly one:

**READY FOR STEP-003 APPROVAL**

or

**NOT READY — FURTHER CORRECTIONS REQUIRED**

Do not approve STEP-003 on the owner's behalf.

Do not begin STEP-004.

STOP and wait for explicit owner approval.

---

# FINAL NON-NEGOTIABLE RULE

The correct execution order is:

1. Inspect.
2. Reproduce defects.
3. Harden implementation.
4. Add comprehensive tests.
5. Measure required coverage.
6. Complete technical verification.
7. Review source and architecture.
8. Update implementation record.
9. Update interview document.
10. Update technical notes.
11. Preserve and archive prompts.
12. Update package README.
13. Update architecture documents and ADRs where justified.
14. Update the ONE existing docs/DESIGN.md.
15. Run final verification after all documentation changes.
16. Produce the final report.
17. Stop for owner approval.

**Never write final learning documentation about an implementation that has not yet been hardened and verified.**
