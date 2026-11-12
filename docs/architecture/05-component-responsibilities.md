# 05 — Component Responsibilities

Related: [03](03-architecture-principles.md) (dependency rule), [06](06-database-architecture-and-schema.md), [07](07-api-architecture.md). Layer tag: **D** = domain logic (pure), **A** = application/use-case, **I** = infrastructure integration.

## M-01 `domain` (D)

- **Responsibility:** shared types and invariants: `Money`, `CurrencyCode`, `Provenance`, `Scenario`, `Marketplace`, `Format`, branded IDs, result/error types.
- **Inputs/Outputs:** none (library).
- **Owned data:** none.
- **Dependencies:** none (not even a framework).
- **Public interface:** value-object constructors (`Money.of(minor, currency)`), arithmetic that rejects mixed currency.
- **Errors:** throws `DomainError` subclasses; no I/O errors.
- **Security:** no secrets, no logging.
- **Tests:** unit + property tests (currency mismatch, overflow guard).

## M-02 `calc-engine` (D) — financial calculation engine

- **Responsibility:** compute unit economics, scenario totals, break-even, sensitivity; emit a comprehensive deterministic **trace**.
- **Inputs:** `PerUnitCalcInput` (list price minor, currency, format, pages for physical books, exact decimal string `fileSizeMb` for ebooks), `CalcRulePack` (structural interface containing royalty tiers, print/delivery policies, limits, and declared rounding policy), `engineVersion`.
- **Outputs:** `PerUnitEconomics` containing exact `Rational` intermediate amounts (`exactGrossRoyalty`, `exactApplicableCost`, `exactNetContribution`), `costBreakdown`, rounded `Money` components according to the Rule Pack's declared rounding point (`per_unit` rounds gross royalty and fractional cost once and returns integer Money; `per_total` preserves exact values and defers rounding to STEP-006 quantity aggregation), and `trace` (`CalculationTrace` with ordered steps and exact rational serializations).
- **Owned data:** none. **Dependencies:** `domain` only (`@nimphy/domain`).
- **Public interface:** `calculatePerUnitEconomics(input, rulePack): PerUnitEconomics` — pure, total, deterministic; no I/O, no network, no clock, no randomness, zero floating-point arithmetic for money.
- **Errors:** throws typed `CalcEngineError` subclasses (`CalcInputValidationError`, `CalcCurrencyMismatchError`, `CalcFormatMismatchError`, `NoMatchingRoyaltyTierError`, `RulePackIncompatibleError`, `CalcOverflowError`).
- **Security:** strict boundary validation; rejects non-string/malformed/zero/negative/excessive file sizes and out-of-bounds list prices or page counts.
- **Tests:** hand-derived golden fixtures (`fixtures/calc-engine/golden-per-unit-cases.json`), 100% branch coverage, boundary and rounding tests, property tests, byte-for-byte canonical JSON trace determinism (doc 12).

## M-03 `rules` (D + loader)

- **Responsibility:** Rule Pack schema, validation, semantic versioning, selection of the applicable pack for (marketplace, format, effective date).
- **Inputs:** Rule Pack documents (JSON) with `source`, `retrievedAt`, `effectiveFrom`, parameters, rounding policy.
- **Outputs:** validated immutable `RulePack`; `selectRulePack(marketplace, format, asOf)`.
- **Owned data:** `rule_packs` (via persistence port).
- **Dependencies:** `domain`.
- **Errors:** `RULE_PACK_NOT_FOUND`, `RULE_PACK_INVALID`.
- **Security:** only operators publish; published packs are immutable (content hash).
- **Tests:** schema validation, selection by date edge cases, hash stability.
- **Note:** Rule values must be sourced from official documents; none are asserted in this package (OQ-006).

## M-04 `cases` (A)

- **Responsibility:** use-cases for Business Case, Case Revision, Evidence, Calculation Run, Memo orchestration.
- **Inputs:** authenticated `userId`, DTOs. **Outputs:** DTOs/ids.
- **Owned data:** `business_cases`, `case_revisions`, `evidence_items`, `calculation_runs`, `memos`.
- **Dependencies:** `domain`, `rules`, `calc-engine`, `ai` (port), persistence port.
- **Public interface:** `createCase`, `saveRevision`, `attachEvidence`, `runCalculation`, `generateMemo`, `getRunTrace`. Case and account **deletion are not here**: they belong to `lifecycle` (M-12).
- **Errors:** maps to ERR codes (doc 07).
- **Security:** every function takes `userId` and enforces ownership; no cross-user reads; cases with status `pending_deletion` are invisible (404).
- **Tests:** integration with real Postgres; authorization matrix.

## M-05 `ai` (A + I)

- **Responsibility:** build grounded context, call provider via port, validate structured output, enforce budgets. Rules in doc 09.
- **Inputs:** `CalcResult`, Evidence Items (text), prompt version. **Outputs:** validated `MemoDraft` or typed failure.
- **Owned data:** `ai_invocations` (telemetry/cost, no raw prompts by default).
- **Dependencies:** `domain`; provider SDK behind `LlmPort`.
- **Errors:** `AI_UNAVAILABLE`, `AI_OUTPUT_REJECTED`, `AI_BUDGET_EXCEEDED`.
- **Security:** treats user text as untrusted (prompt injection); never sends secrets; sends minimum data.
- **Tests:** fake provider; evaluation datasets; number-grounding validator tests.

## M-06 `documents` (D + I)

- **Responsibility:** assemble Dossier structure (D, pure) and render Markdown/PDF (I).
- **Inputs:** run, revision, memo, rule ref, disclaimers. **Outputs:** Markdown string, PDF bytes, content hash.
- **Owned data:** `dossiers`.
- **Dependencies:** `domain`; renderer behind `PdfPort` (ADR-012 **OPEN**); storage port.
- **Errors:** `RENDER_FAILED`, `ASSEMBLY_INCOMPLETE`.
- **Security:** escape all user text in Markdown/HTML before rendering; no remote fetches during render (SSRF), no external fonts/images at render time.
- **Tests:** snapshot tests on Markdown; PDF smoke test (page count, text contains key figures).

## M-07 `payments` (A + I)

- **Responsibility:** create PayPal orders (`createOrder`); perform the **single** PayPal capture (`captureOrder`, behind EP-023); settle payment facts from the three evidence sources (`settleCapture`, the only place an order becomes `COMPLETED`/`FAILED`/`REFUNDED`/`REVERSED` and the only place entitlements are granted or revoked); verify, persist, claim and process webhooks (inbox state machine, doc 08 §5); read PayPal's authoritative state (`resolveCapture`); reconcile and expire orders.
- **Inputs:** `userId`, `caseId`, price point, `orderId`; raw webhook bodies and headers.
- **Outputs:** approval URL/order id; order and entitlement changes; domain events.
- **Owned data:** `orders`, `payment_events`, `entitlements`, `price_points`.
- **Dependencies:** `domain`; `PayPalPort` (create, read, **capture**, verify-signature); persistence.
- **Public interface:** `createOrder`, `captureOrder`, `resolveCapture`, `settleCapture`, `receiveWebhook`, `processDueEvents` (sweeper), `reconcile`, `expireOrders`, `requeueEvent`/`dismissEvent` (operator only).
- **Structural rule:** `PayPalPort.captureOrder` is referenced by exactly one use-case, `captureOrder`; the webhook handler, sweeper and reconciler have no access to it (enforced by an import-boundary rule and a test, doc 08 §3.1, §10).
- **Errors:** `ERR-PAY-001…005`, `ERR-HOOK-001/002` (doc 07); internal codes `ORDER_NOT_RESOLVED`, `AMOUNT_MISMATCH`, `UNEXPECTED_CAPTURE`, `ALREADY_APPLIED` recorded as `outcome_reason`/`last_error_code`.
- **Security:** see doc 08 and doc 11; secrets server-only; raw-body signature verification before anything is stored; amount/currency/payee/order mapping checks in `settleCapture`; PayPal calls never inside a DB transaction; lock order `case → order → payment_event` (doc 06 §7).
- **Tests:** doc 08 §10 and doc 12 §7: recorded sandbox payloads, forged/replayed/out-of-order events, duplicate-after-failure, concurrency, crash/rollback injection, structural single-capture-path test.

## M-08 `auth` (I)

- **Responsibility:** session establishment and `currentUser()`; provider integration (ADR-011 **OPEN**).
- **Owned data:** `app_users` (profile linkage).
- **Security:** secure cookies, CSRF protection, session expiry.
- **Tests:** unauthenticated and cross-user access tests.

## M-09 `persistence` (I)

- **Responsibility:** repositories, transactions, migrations.
- **Owned data:** schema itself. **Public interface:** repository interfaces consumed by use-cases.
- **Security:** parameterised queries only; per-query ownership predicates.
- **Tests:** migration up/down on empty DB; constraint tests.

## M-10 `web` (UI + HTTP edge) (I)

- **Responsibility:** pages, forms, route handlers (thin), error mapping, rate limiting hooks.
- **Dependencies:** use-cases only. **No** arithmetic on money, **no** direct DB access.
- **Tests:** component tests, API tests, E2E (doc 12).

## M-11 `ops` (I)

- **Responsibility:** logging, correlation IDs, error tracking, audit log writer (allow-list mapper), scheduled entry points (webhook sweeper, reconciliation/expiry, deletion purge, idempotency-key purge), stuck-event and invariant monitors (doc 08 §5.11), Rule Pack publish script.
- **Owned data:** `audit_log`.
- **Security:** audit log is append-only; admin entry points are not publicly routable (**OPEN** mechanism, FR-023).

## M-12 `lifecycle` (A)

- **Responsibility:** two-phase deletion of cases and accounts and the purge sweeper (doc 06 §8): phase 1 (hide, revoke entitlements, expire unpaid orders, refuse while a payment is in flight), phase 2 (delete stored dossier files, delete content rows, redact payment PII, remove or tombstone the user row, delete the IdP identity), plus the deletion ledger write.
- **Inputs:** authenticated `userId`, `caseId`, `acknowledgePaidLoss`. **Outputs:** `202` result; domain events `cases.deletion.*`, `accounts.deletion.*`.
- **Owned data:** the `status`, `deletion_requested_at`, `purge_attempts`, `purge_last_error` columns on `app_users` and `business_cases`; no other table.
- **Dependencies:** `domain`; persistence (purge role); storage port; `auth` adapter (identity deletion); reads `orders` through `payments` public interfaces and obeys the lock order.
- **Public interface:** `requestCaseDeletion`, `requestAccountDeletion`, `runPurge` (sweeper entry point).
- **Errors:** `ERR-LIFE-001`, `ERR-LIFE-002`; purge failures set `purge_last_error` and are retried.
- **Security:** only the owner can request; deletion never runs from the webhook path; purge role is the only role allowed to `DELETE` immutable content tables (doc 06 §5); no PII in audit rows or logs.
- **Tests:** doc 12 §5 deletion suite: phase-1 atomicity, in-flight payment refusal, FK validity after purge, idempotent resumable purge, tombstone integrity, no resurrection after restore ledger replay.

## Domain vs infrastructure summary

| Domain / application logic | Infrastructure integrations |
|---|---|
| `domain`, `calc-engine`, `rules` (schema/selection), `cases`, `lifecycle` rules, dossier assembly, `payments` state machines and `settleCapture` decision logic | `auth`, `persistence`, PayPal adapter, LLM adapter, PDF renderer, storage adapter, logging, schedulers |
