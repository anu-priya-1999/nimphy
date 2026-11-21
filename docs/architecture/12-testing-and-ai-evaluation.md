# 12 — Testing and AI Evaluation

Related: [05](05-component-responsibilities.md), [08](08-event-schema-and-payment-lifecycle.md), [09](09-ai-architecture.md), [22](22-definition-of-done.md). Tools for unit, property, differential, and mutation testing are implemented and active (Vitest, fast-check, StrykerJS); database container, Playwright, and AI eval harnesses are proposed for subsequent steps.

## 1. Test pyramid

| Layer | Scope | Target tooling |
|---|---|---|
| Unit | `domain`, `calc-engine`, `rules`, validators, renderers | Vitest (Active) |
| Property | engine invariants | fast-check / custom PRNG (Active) |
| Differential | independent reference cross-check against `calc-engine` | Custom BigInt Rational Oracle + Mulberry32 PRNG (Active) |
| Mutation | assertion strength on `calc-engine` | StrykerJS + Vitest runner (Active) |
| Integration | use-cases + real Postgres | Vitest + ephemeral Postgres (Proposed) |
| API | route handlers, auth, errors, idempotency | Vitest + HTTP harness (Proposed) |
| E2E | critical user journeys | Playwright (Proposed) |
| Security | authz matrix, webhook forgery, scanning | scripted + CI tools (Proposed) |
| AI eval | memo quality and grounding | custom harness, fake + real provider (Proposed) |

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
10. **Mutation testing** on `calc-engine` (target score OPEN per §3.10) to catch weak assertions and expose test gaps using StrykerJS (`@stryker-mutator/core@10.1.1`, `@stryker-mutator/vitest-runner@10.1.1`) configured in `stryker.calc-engine.config.mjs` and executed via `pnpm test:mutation:calc-engine`. Uses focused runner `vitest.calc-engine.config.ts` targeting the 5 core calculation source files (`packages/calc-engine/src/**/*.ts` excluding tests, types, errors, index, and golden fixtures) across unit, boundary, error, golden, and differential reference suites; property tests are excluded only from the focused mutation runner due to multi-iteration generative loop overhead while remaining fully active in normal test suites and CI. The executed full baseline evaluated 1,728 generated mutants across the 5 calculation source files (including 1 ignored static mutant in `per-unit-calc.ts`, yielding 1,727 score-eligible mutants): 1,204 killed, 72 timed out (intentional non-terminating mutations in GCD, factorization, and long division loops alongside test runner duration timeouts under high test volumes), 443 survived, 8 no coverage (defensive overflow blocks), achieving an overall mutation score of 73.89% (74.23% covered; `math/rational.ts` 91.67%, `per-unit-calc.ts` 75.18% [420 generated, 1 ignored static, 419 score-eligible], `sensitivity-calc.ts` 74.31%, `scenario-calc.ts` 69.71%, `break-even-calc.ts` 57.14%). The completed baseline historically executed with `incremental: false` in 114m54s (reported); for future runs, `stryker.calc-engine.config.mjs` is configured with `incremental: true` and `incrementalFile: 'reports/stryker-step-09-completion.json'`. All 443 surviving mutants were audited, reclassified into the six canonical categories, and itemized in the untracked, non-ignored working-tree inventory `learning/notes/step-09-survivor-inventory.md` (and mirrored in `reports/mutation/survivor-inventory.md`): genuine assertion gaps (17 mutants: 11 triad ordering [1383, 1385, 1386, 1389, 1394, 1395, 1398, 1418, 1426, 1427, 1430], 2 sensitivity tie metadata [1815, 1817], 4 rational equality [411, 413, 414, 416]; all 17 remain recorded as Survived in historical JSON and were confirmed eliminated via post-baseline regression verification rather than a new Stryker run), behaviorally equivalent mutations (12 mutants: 7 rational identities, 1 duplicate-free driver sorting invariant, 4 zero-variance fast paths), unreachable under accepted input contracts (67 mutants: defensive safe-integer bounds mathematically verified across individual module reachable ranges for per-unit, single scenario, triad scenarios, break-even, and sensitivity, distinguishing exact-boundary acceptance, overflow rejection, and near-boundary coverage), trace or metadata-only behavior (31 mutants), validation/defensive boundary behavior (316 mutants), and potentially meaningful financial or public-result behavior (0 mutants). Focused regression tests were added for all genuine gaps (triad ordering, single-driver tie-breaking, rational equality); the archived historical mutation baseline strictly predates these new tests and its 73.89% score is preserved without modification. Reports are archived in `reports/mutation/` (`mutation.json`, `mutation.html`, `survivor-inventory.md`) and working-tree documentation `learning/notes/step-09-survivor-inventory.md`. Target score policy remains OPEN (`thresholds.break: null`).
11. **Differential reference cross-check:** an independent test-only reference implementation (`tests/differential/reference-oracle/`) using native arbitrary-precision `BigInt` exact rational arithmetic (`RefRational`) and an independent reference oracle (`ref-oracle.ts`) with zero dependencies on or imports from `@nimphy/calc-engine`. Directly cross-checks all public calculation contracts:
    - **Per-unit economics:** Exact rational numerators and denominators for gross royalty, applicable cost, and unit net contribution, alongside rounded Money values under `per_unit` and deferred null values under `per_total`.
    - **Single-scenario totals:** Exact rational totals (`exactTotalRoyalty`, `exactTotalCost`, `exactTotalContribution`) compared numerator-by-numerator and denominator-by-denominator without floating-point conversion, alongside rounded Money amounts.
    - **Break-even:** Reachability determination, exact unit contribution rational components, integer break-even units (exact and ceiling), break-even revenue, and unreachable reason codes (`ZERO_CONTRIBUTION`, `NEGATIVE_CONTRIBUTION`).
    - **Sensitivity analysis:** Baseline revenue and contribution, lower/upper perturbed revenue and contribution, revenue deltas, contribution deltas, impact scores, and driver rank ordering with deterministic UTF-16 code-point tie-breaking.
    - **Triad scenarios (`refCalculateTriadScenarios`):** Low, base, and high revenue, gross royalty, applicable cost, and net contribution; exact total royalty, total cost, and total contribution; input-ordering, revenue-ordering, and net-contribution-ordering evaluations.
    - **Coverage & Execution:** Verified against 14 independently hand-calculated reference checkpoints (`fixtures/calc-engine/reference-checkpoints.json`), 1,024 deterministic pseudo-random vectors (Mulberry32 PRNG, seed `0x57e9009` / `92180489`) in normal runs exercising 5,120 calculation comparisons across all 5 calculation operations (and 32 vectors in focused Stryker runs) testing all 32 configuration permutations (4 synthetic Rule Packs $\times$ 4 rounding modes $\times$ 2 aggregation points), and an edge-case matrix (positive, zero, and negative contribution; safe-integer boundaries near `Number.MAX_SAFE_INTEGER`; sensitivity ranking ties; perturbation limits). Executed via `pnpm test:differential`, discovered automatically in CI test and coverage runs, and verified across Node versions in CI (`determinism-compatibility` matrix job on Node `24.18.0` and `24.x`).

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
