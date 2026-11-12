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

1. **Golden fixtures:** hand-verified input → expected output files (JSON) checked into the repo (`fixtures/calc-engine/golden-per-unit-cases.json`); expected values computed independently with exact rational arithmetic (recorded in the fixture's `derivation` field) — never copied from engine execution.
2. **Exact rational inputs & file sizes:** Ebook delivery inputs must provide exact decimal strings (`fileSizeMb: string`, e.g. `"0.1"`, `"0.5"`, `"1"`, `"2.1"`, `"10.25"`). Zero, negative, empty, non-decimal, scientific notation, and non-string inputs are strictly rejected.
3. **Proportional delivery cost & fractional cost rounding:** Delivery costs are proportional to exact MB (`costPerMbMinor * exactFileSizeMb`) without integer-MB ceiling. When intermediate production or distribution costs yield fractional minor units, they are rounded using the Rule Pack's declared rounding mode at the designated rounding point.
4. **All four approved rounding modes & ties:** Tests verify `round_half_up` (nearest integer, exact ties away from zero), `round_half_even` (Banker's rounding to nearest even integer), `round_down` (truncation toward zero), and `round_up` (away from zero) on positive and negative values as well as exact half-cent mathematical ties (+2.5, -2.5, +3.5, -3.5).
5. **Rounding points & aggregation handoff:**
   - Under `per_unit`: exact gross royalty and exact costs are rounded to integer minor units per unit; contribution is derived by subtraction (`grossRoyaltyMoney - productionCostMoney`).
   - Under `per_total`: per-unit gross royalty and per-unit production cost are preserved as unrounded exact `Rational` values without premature rounding (per-unit Money fields governed by deferred rounding remain null); STEP-006 aggregates exact components by quantity and rounds aggregate components once.
6. **Boundary conditions:** zero units; one unit; list price at rule thresholds (just below, at, just above); zero/negative contribution (e.g. valid $5.00 paperback at 300 pages yields USD -3.52) while rejecting out-of-bounds list prices (e.g. $4.00 paperback rejected with `PRICE_OUT_OF_BOUNDS`); maximum supported magnitudes; empty fixed-cost list; exact-integer break-even; break-even requiring ceiling.
7. **Determinism:** run twice, compare byte-equal canonical JSON trace; run across Node versions in CI matrix; assert zero nondeterministic keys (timestamps, random IDs, filesystem paths).
8. **Properties:** raising units never lowers total net contribution when per-unit contribution ≥ 0; scenario ordering low ≤ base ≤ high holds when parameters are ordered; sensitivity sign matches analytic direction; currency mismatch rejected; addition associativity in integer minor units.
9. **Trace completeness:** every output number has an audited trace entry whose inputs resolve bit-for-bit.
10. **Mutation testing** on `calc-engine` (target score OPEN) to catch weak assertions.
11. **Cross-check:** an independent reference implementation of core formulas compared against the engine on random inputs (differential test).

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
