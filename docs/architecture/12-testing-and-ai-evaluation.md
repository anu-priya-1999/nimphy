# 12 — Testing and AI Evaluation

Related: [05](05-component-responsibilities.md), [08](08-event-schema-and-payment-lifecycle.md), [09](09-ai-architecture.md), [22](22-definition-of-done.md). Tool names are **Proposed** (Vitest, Playwright, a Postgres test container); none exist yet.

## 1. Test pyramid

| Layer | Scope | Target tooling (Proposed) |
|---|---|---|
| Unit | `domain`, `calc-engine`, `rules`, validators, renderers | Vitest |
| Property | engine invariants | fast-check |
| Integration | use-cases + real Postgres | Vitest + ephemeral Postgres |
| API | route handlers, auth, errors, idempotency | Vitest + HTTP harness |
| E2E | critical user journeys | Playwright |
| Security | authz matrix, webhook forgery, scanning | scripted + CI tools |
| AI eval | memo quality and grounding | custom harness, fake + real provider |

## 2. Unit testing

Pure modules only; no network, clock, or randomness (injected). Coverage gate: `calc-engine` 100% branch; `domain`/`rules` ≥ 95% (targets, not measurements).

## 3. Financial calculation test strategy

1. **Golden fixtures:** hand-verified input → expected output files (JSON) checked into the repo; expected values computed independently (spreadsheet or hand calculation recorded in the fixture's `derivation` field) — not copied from engine output.
2. **Boundary conditions:** zero units; one unit; list price at rule thresholds (just below, at, just above); zero/negative contribution ⇒ break-even "not reachable"; maximum supported magnitudes; empty fixed-cost list; exact-integer break-even (no spurious +1); break-even requiring ceiling.
3. **Rounding:** every rounding mode in each Rule Pack tested at .5 boundaries and at accumulation points (per-unit vs per-total rounding must match the pack's declared point); negative values; currency with different minor-unit exponents (if supported — **OPEN**).
4. **Determinism:** run twice, compare byte-equal canonical JSON; run across Node versions in CI matrix.
5. **Properties:** raising units never lowers total net contribution when per-unit contribution ≥ 0; scenario ordering low ≤ base ≤ high holds when parameters are ordered; sensitivity sign matches analytic direction; currency mismatch rejected; addition associativity in integer minor units.
6. **Trace completeness:** every output number has a trace entry whose inputs resolve.
7. **Mutation testing** on `calc-engine` (target score OPEN) to catch weak assertions.
8. **Cross-check:** an independent reference implementation of core formulas (spreadsheet or a second small script) compared against the engine on random inputs (differential test).

## 4. Royalty-rule test fixtures

`fixtures/rules/<pack_key>/<version>/` contains: the pack JSON, source reference, and a table of cases at every threshold and rounding edge. **All fixture numbers are synthetic until Rule Packs are sourced from official documents** (OQ-006); synthetic packs are named `TEST_*` and cannot be published to production (CI check + DB check on `pack_key` prefix).

## 5. Integration and database testing

Real Postgres; migrations applied from empty and from previous snapshot; constraint tests (unique event id, one entitlement per order, one open order per case, entitlement `CHECK` active ⇒ case present, immutability triggers reject UPDATE); transaction tests (webhook Tx X atomicity, rollback on failure, Tx F recording); claim/lease tests (`SKIP LOCKED`, attempt counting); lock-order and deadlock tests (doc 06 §7); ownership tests (user A cannot read B's rows through any repository method).

**Deletion and data-lifecycle suite (doc 06 §8):** phase 1 is atomic (hide, revoke entitlements, expire unpaid orders); refusal with `ERR-LIFE-001` while an order is `CAPTURE_REQUESTED` and with `ERR-LIFE-002` without `acknowledgePaidLoss`; after purge every foreign key is valid (`orders.case_id` and `entitlements.case_id` null, financial rows keep a valid user row); a case with an active entitlement cannot be purged (CHECK); purge is idempotent and resumable after an injected failure at each step; tombstone rows hold no PII (CHECK) and are created only when orders exist, otherwise the user row is removed; `raw_body` redacted only for final events; `ai_invocations` anonymised; dossier files removed before rows; no resurrection after a simulated restore plus ledger replay; deleted resources are 404 on every endpoint during `pending_deletion`.

## 6. API testing

Contract tests per endpoint (EP-001…EP-022): success, validation errors with ERR codes, auth failure, cross-user 404, idempotency replay and conflict, pagination, rate-limit response, no internal leakage in errors, entitlement gating (402).

## 7. Payment webhook testing

Fake `PayPalPort` plus recorded real sandbox payloads. The authoritative, complete list of capture, webhook-processing, retry, concurrency and monitoring tests is **doc 08 §10**; this section adds the CI-level expectations. Required classes: forged signature (400, no row); **duplicate delivery after a failed first attempt** (the defect fixed in 0.3.0: the retry must be processed, not treated as done); duplicate after success; N concurrent identical deliveries ⇒ one claim, one entitlement; crash between persist and processing; rollback atomicity (injected failure after the entitlement insert); poison event ⇒ `FAILED_TERMINAL` with alert, `requeue` and `dismiss` audited; unmappable capture event never ignored; out-of-order events; amount/currency/payee/capture-id mismatch ⇒ `REJECTED`; unexpected capture on an `EXPIRED` order; double concurrent `POST /capture` ⇒ exactly one PayPal capture call; capture timeout then resolve by read (no second capture with a different key); `PayPal-Request-Id` ≤ 38 characters; structural test that only one use-case references `PayPalPort.captureOrder`; checkout kill switch does not block capture or webhooks; verification API outage ⇒ 503 and no row; oversized body; malformed JSON; reconciliation recovers a missed event and expires `CAPTURE_REQUESTED` orders read-only; stuck-event and invariant monitoring queries return seeded violations; property test over interleavings of the three evidence sources. A **sandbox end-to-end test** runs manually before each release (live PayPal not used in CI); simulator mock events cannot use postback verification (doc 08 §0), so tests use recorded real sandbox events or self-verification.

## 8. Security testing

Authorization matrix; CSRF test; XSS payloads in titles/evidence through UI, memo, Markdown and PDF; SQL-injection probes on string inputs; SSRF check that no outbound request is made from user-supplied URLs; secret-scanning; dependency audit; header/CSP checks; forged-webhook suite. Pre-launch manual review against doc 11.

## 9. AI evaluation

**Datasets** (`eval/ai/`): ≥ 30 synthetic cases at launch (target, adjustable): typical, sparse-evidence, all-assumption, negative-contribution (break-even unreachable), extreme magnitudes, tied sensitivity, evidence containing prompt-injection strings, evidence containing fake numbers ("this will sell 50,000 copies"), non-English notes, empty evidence.

**Metrics:**

| Metric | Definition | Gate |
|---|---|---|
| Grounding pass-rate | % memos passing the number-grounding validator on first attempt | tracked; post-validation must be 100% stored memos |
| Ungrounded-number leakage | numerals in stored memos not traceable to run | must be 0 |
| Prohibited-language rate | guarantee/promise phrases | must be 0 in stored memos |
| Uncertainty coverage | memos stating uncertainty when estimates/assumptions present | 100% |
| Missing-evidence coverage | listed gaps ÷ actual gaps | 100% |
| Injection resistance | adversarial cases not altering behaviour/numbers | 100% on set |
| Rubric quality (human) | clarity, usefulness, faithfulness (1–5) | trend; threshold OPEN |
| Cost per memo | tokens × configured rate | within budget (doc 16) |
| Latency | p50/p95 | NFR-003 |

Provider-dependent runs are non-deterministic: use fixed seeds where supported, repeat N times, and gate on rates; the validator (deterministic) is tested exhaustively with unit tests.

## 10. Regression testing

Any change to prompt, model id, validator, engine, or Rule Pack triggers: full unit suite, golden fixtures, and the AI evaluation set; diffs of rendered Markdown for a fixed set of dossiers are reviewed.

## 11. Test environments

| Env | Data | PayPal | AI |
|---|---|---|---|
| Unit | none | fake | fake |
| CI integration | ephemeral DB | fake | fake |
| Staging | synthetic | sandbox | real (low cap) |
| Prod | real | live | real |

No production data in non-production environments.

## 12. CI verification gates (see also doc 22)

1. Typecheck (strict), lint, format check.
2. Import-boundary check (doc 03 dependency rule).
3. Unit + property tests; coverage thresholds.
4. Migrations from empty + from previous.
5. Integration + API tests.
6. Golden fixture and determinism tests.
7. Dependency audit and secret scan.
8. Build succeeds.
9. E2E smoke on preview deployment (when it exists).
10. AI evaluation run on changes touching `ai/`, `prompts/`, or models (may be a manual/nightly gate to limit cost).
11. Docs check: required architecture filenames present; internal links resolve.
