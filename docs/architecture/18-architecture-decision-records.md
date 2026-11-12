# 18 — Architecture Decision Records

Status vocabulary: **Accepted** (owner approved), **Proposed** (recommended, awaiting approval), **Superseded** (replaced by a later ADR), **OPEN** (no recommendation yet; `Status: OPEN — requires explicit decision.`). The architecture package remains a living proposal unless separately approved. Individual ADR decisions can be Accepted independently. **ADR-005 is Accepted** (repository owner approved 2026-11-12). Other ADR statuses remain unchanged unless separately authorized. Detailed separate ADR files under `docs/adr/` are ADR-016.

**Template.** Every ADR carries: Context · Problem · Options considered · Decision · Rationale · Consequences · Security and operational implications · Status · Revisit when. ADR-019 to ADR-022 (added in 0.3.0) use the full template; earlier ADRs keep their compact form and gain the missing fields when they are next amended.

## Index

| ADR | Title | Status |
|---|---|---|
| 001 | Modular monolith | Proposed |
| 002 | TypeScript, pnpm workspace, Next.js/React, Tailwind | Proposed |
| 003 | PostgreSQL as system of record | Proposed |
| 004 | Pure, I/O-free calculation engine | Proposed |
| 005 | Money as integer minor units; rounding in Rule Packs | Accepted |
| 006 | Immutable, versioned Rule Packs | Proposed |
| 007 | Provider-agnostic AI port; numbers by token, validated | Proposed |
| 008 | Payment proof via verified webhooks + reconciliation | **Superseded** by 019 and 020 |
| 009 | No queue at MVP; DB-backed jobs on trigger | Proposed |
| 010 | Hosting platform | OPEN (leaning A: serverless + managed Postgres) |
| 011 | Authentication provider | OPEN |
| 012 | PDF rendering approach | OPEN |
| 013 | Store generated dossiers vs regenerate | OPEN |
| 014 | Postgres row-level security | OPEN |
| 015 | Migration tool | OPEN |
| 016 | ADR file layout; reconciliation with any pre-existing repository decisions | OPEN |
| 017 | AI provider and model | OPEN |
| 018 | Entitlement scope and refund policy | OPEN |
| 019 | Webhook inbox: persist verified events, process in a separate atomic transaction, explicit status/lease/retry/terminal states | Proposed |
| 020 | Canonical PayPal capture: one authenticated owner-only endpoint (EP-023), one `settleCapture`, three server-side evidence sources | Proposed |
| 021 | Data lifecycle: two-phase deletion, tombstoned user, purge, minimised retained payment records | Proposed |
| 022 | Evidence governance: source-conflict rules and validation-gated scope | Proposed |

Template for each: Context · Problem · Alternatives · Decision · Rationale · Consequences · Status · Revisit when.

---

## ADR-001 Modular monolith — Proposed
- **Context:** early-stage, unvalidated product, small team, brief says prefer a modular monolith.
- **Problem:** how to structure deployables.
- **Alternatives:** (a) microservices; (b) separate frontend SPA + API service; (c) modular monolith.
- **Decision:** (c) one deployable with enforced module boundaries (doc 03).
- **Rationale:** lowest operational cost and complexity; boundaries preserve extraction options.
- **Consequences:** shared failure domain; PDF/AI work shares runtime limits.
- **Revisit when:** a scaling trigger in doc 15 §9 fires or team size forces independent deploys.

## ADR-002 TypeScript stack — Proposed
- **Context:** no repository stack found. (Author-side note: the requester's profile suggests familiarity with this stack; that is a convenience factor, not evidence of an established decision.)
- **Problem:** choose language/framework.
- **Alternatives:** (a) TypeScript + Next.js + pnpm workspace; (b) Python backend + React SPA; (c) Rails/Django-style full-stack.
- **Decision:** (a).
- **Rationale:** one language for UI, API, shared validation schemas and the engine; strong typing for money logic; broad hosting support; easy testing of pure packages.
- **Consequences:** JS number pitfalls ⇒ money must use integers (ADR-005); framework upgrade churn.
- **Revisit when:** repository evidence shows a different established stack, or PDF/AI needs favour another runtime.

## ADR-003 PostgreSQL — Proposed
- **Alternatives:** SQLite/libSQL, document DB, Postgres.
- **Decision:** Postgres. **Rationale:** transactions, unique constraints for idempotency, jsonb snapshots, trigger-enforced immutability, portable. **Consequences:** managed hosting cost/limits to verify. **Revisit:** free-tier or cost blockers.

## ADR-004 Pure calculation engine — Proposed
- **Decision:** `calc-engine` is a dependency-free pure package; all I/O outside; engine version recorded per run. **Rationale:** INV-01/02/06, testability. **Consequences:** adapters must supply fully-resolved inputs. **Revisit:** never for purity; only for performance if proven.

## ADR-005 Money representation and rounding — Accepted
- **Context:** Financial calculations require exact determinism (P-01), zero floating-point representation, and verifiable precision across varying marketplace royalty policies and production costs.
- **Problem:** How to represent monetary amounts, model fractional intermediary calculations (rates, pages, delivery sizes), and execute rounding consistently across per-unit and aggregate scenario boundaries.
- **Alternatives considered:** (a) IEEE-754 floating-point numbers (rejected: non-deterministic rounding and catastrophic cancellation); (b) Generic decimal library across all domain packages (rejected: adds external dependency surface and runtime overhead); (c) Integer minor units paired with ISO currency codes, backed by exact arbitrary-precision rational arithmetic (`Rational` BigInt) within the calculation engine (chosen).
- **Decision:**
  - **A. Money representation:** Money is represented as an integer number of minor units (e.g. cents, pence) paired with an ISO-4217 currency code in storage, domain interfaces, and public APIs. Floating-point calculations for financial amounts are strictly prohibited. Where fractional intermediate values occur, they must be computed using exact rational arithmetic (`Rational` with canonical numerator/denominator BigInts) inside `packages/calc-engine`.
  - **B. Approved rounding modes (Rule Pack declared):**
    1. `round_half_up`: Nearest integer minor unit; exact ties round away from zero (+2.5 -> +3, -2.5 -> -3).
    2. `round_half_even`: Nearest integer minor unit; exact ties round to the nearest even integer (Banker's rounding: +2.5 -> +2, +3.5 -> +4, -2.5 -> -2, -3.5 -> -4).
    3. `round_down`: Truncation toward zero (+2.7 -> +2, -2.7 -> -2).
    4. `round_up`: Rounding away from zero (+2.1 -> +3, -2.1 -> -3).
    Default mode when a Rule Pack is silent: not allowed — each pack must explicitly declare its rounding policy.
  - **C. Rounding points and sequence:**
    - `per_unit`:
      1. Calculate exact gross royalty as Rational.
      2. Round gross royalty to an integer minor unit using the Rule Pack's declared rounding mode.
      3. Calculate exact production/distribution cost as Rational.
      4. Round any fractional monetary cost using the same Rule Pack rounding mode (already-integer costs remain unchanged).
      5. Subtract rounded cost from rounded royalty to yield net contribution: `grossRoyaltyMoney - productionCostMoney = netContributionMoney`.
      6. Return Money values in integer minor units.
    - `per_total`:
      1. Calculate exact per-unit gross royalty as Rational.
      2. Calculate exact per-unit production/distribution cost as Rational.
      3. Preserve both exact Rational amounts without premature rounding.
      4. Per-unit Money fields governed by deferred rounding remain null.
      5. STEP-006 aggregates both exact components by quantity Q (`exactTotalRoyalty = exactPerUnitRoyalty * Q`, `exactTotalCost = exactPerUnitCost * Q`).
      6. STEP-006 rounds aggregate royalty and aggregate cost separately, exactly once, using the Rule Pack's declared rounding mode.
      7. Aggregate contribution is derived by subtraction: `totalContribution = roundedTotalRoyalty - roundedTotalCost`.
  - **D. Proportional ebook delivery cost:** Digital delivery fees are calculated strictly proportionally to the exact supplied file size in MB: `deliveryCostMinorExact = costPerMbMinor * exactFileSizeMb`. The file size input is an exact decimal string (e.g. `"0.1"`, `"0.5"`, `"1"`, `"2.1"`, `"10.25"`) parsed into exact Rational. No ceiling-to-whole-megabyte policy is applied.
  - **E. Cost rounding:** When an exact production or distribution cost contains fractional minor units, apply the Rule Pack's declared rounding mode at its designated rounding point (once per unit under `per_unit`; once after quantity aggregation under `per_total`).
  - **F. Contribution derivation:** Contribution is always derived by subtraction after the applicable components have been rounded at their declared boundary. Ebook and physical book costs and contributions must always preserve the currency of the Rule Pack.
- **Rationale:** Guarantees 100% bit-for-bit reproducible financial calculations; prevents fractional minor-unit drift across unit and aggregate scenarios; respects exact marketplace commercial rules.
- **Consequences:** Formats and currency symbols are handled at the display edge only; multi-currency conversion is excluded from MVP; callers must supply valid Rule Packs with declared rounding policies.
- **Status:** Accepted — repository owner approved 2026-11-12.
- **Revisit when:** Currencies with non-2 minor-unit exponents or cross-currency exchange rate conversions are introduced.

## ADR-006 Rule Packs — Proposed
- **Context:** Declarative royalty, printing, and digital distribution economics require exact, versioned, and immutable publishing rules to satisfy determinism (P-01), traceability (P-03), and immutability (P-04).
- **Problem:** How to define, validate, hash, and select publishing rules so financial calculations are permanently reproducible while preventing unverified or fabricated commercial facts from entering production (OQ-006).
- **Alternatives considered:** (a) Embed rules directly in application code (rejected: requires redeployment for rule changes and lacks database-level immutability/auditability); (b) Dynamic script-based calculation rules (rejected: violates deterministic purity and opens security risks); (c) Declarative JSON Rule Packs with cryptographic content hashing and SemVer date selection (chosen).
- **Decision:** Freeze v1 Rule Pack schema (`RulePack` entity with nominal UUID `id`, `pack_key`, SemVer `version`, `status` in `['draft', 'published', 'retired']`, `marketplace`, `format`, `currency`, `effective_from`, `effective_to` with `check (effective_to is null or effective_to > effective_from)`, `source_ref`, `source_retrieved_at`, declarative `content`, and SHA-256 `content_hash`). Selection resolves via `selectRulePack(marketplace, format, asOf)` matching inclusive date boundaries with SemVer descending precedence. Synthetic packs are strictly quarantined with `TEST_*` prefix and prohibited from production publication.
- **Consequences:** Rule updates require publishing new SemVer rows; old runs remain bit-for-bit reproducible by Rule Pack ID and content hash; calculations depend on pure data without dynamic code execution.
- **Status:** Proposed (v1 schema frozen and verified in STEP-004).
- **Revisit when:** Rule calculation requirements exceed declarative tier and formula parameters.

## ADR-007 AI port and number-token grounding — Proposed
- **Decision:** `LlmPort` abstraction; context carries number tokens; validator enforces grounding; render substitutes canonical values; fail closed. **Alternatives:** let model write numbers and diff afterwards (rejected: weaker guarantee). **Consequences:** slightly constrained prose; more validator work. **Revisit:** when evaluation shows excessive rejection.

## ADR-008 Payment verification — **Superseded** (by ADR-019 and ADR-020, 2026-11-04)
- **Original decision (0.1.0):** entitlement granted only inside the webhook (or reconciliation) transaction after signature verification, with idempotency by event id; client redirect informational.
- **Why superseded:** (1) "idempotency by event id" was implemented as "a duplicate id means already processed", which loses a payment when the first processing attempt failed after the event row was stored (ADR-019 fixes this); (2) the capture trigger was left undefined, and refusing our own authenticated capture response as evidence made the UX wait for webhooks needlessly while leaving no controlled capture path (ADR-020 fixes this). The security intent is unchanged: nothing browser-supplied is ever evidence of payment (INV-13).

## ADR-009 Background processing — Proposed
- **Decision:** no queue/worker at MVP; scheduled endpoints only; adopt `jobs` table with `SKIP LOCKED` when memo/PDF exceeds limits. **Alternatives:** managed queue now (rejected: cost/complexity). **Revisit:** doc 15 triggers.

## ADR-010 Hosting — OPEN
Status: OPEN — requires explicit decision. Leaning Option A in doc 13 §3; decision needs verified free-tier limits, function time limits for PDF/AI, and commercial-use terms. **Carry-over candidate:** the owner-stated predecessor plan named AWS (doc 01 R-3); compatible with either option; resolved by owner confirmation (OQ-014).

## ADR-011 Authentication — OPEN
Status: OPEN — requires explicit decision. Candidates: managed auth service, open-source auth library with OAuth providers, provider bundled with the database host. Criteria: cost, MFA, session security, lock-in, data residency.

## ADR-012 PDF rendering — OPEN
Status: OPEN — requires explicit decision. Candidates: React-based PDF library (pure JS, runtime-light), HTML→PDF via headless browser (higher fidelity, heavier, SSRF surface), Markdown→HTML→PDF toolchain. Criteria: host limits, fidelity, security, cost.

## ADR-013 Dossier storage — OPEN
Status: OPEN — requires explicit decision. Store files in object storage (simple downloads, cost) vs regenerate deterministically from run+memo (no storage, CPU per download). Both satisfy NFR-014.

## ADR-014 Row-level security — OPEN
Status: OPEN — requires explicit decision. Defence-in-depth vs added complexity with serverless pooling. **Carry-over candidate:** the predecessor plan included row-level security (doc 01 R-3). Doc 06's lock order, purge role and webhook claim queries must be re-tested under RLS if adopted.

## ADR-015 Migration tool — OPEN
Status: OPEN — requires explicit decision. Plain SQL files with a runner vs ORM-integrated migrations. **Carry-over candidate:** Drizzle (predecessor plan, doc 01 R-3). Whatever is chosen must express partial unique indexes, `CHECK` constraints, triggers and `FOR UPDATE SKIP LOCKED` queries (doc 06).

## ADR-016 ADR layout and reconciliation — OPEN
Status: OPEN — requires explicit decision. (a) Keep ADRs in this file; (b) split into `docs/adr/NNNN-*.md`. Also: if a pre-existing repository, research register, or validation report exists, reconcile this package against it and record superseded decisions here. **Re-checked 2026-11-03 and 2026-11-04: none exists in the workspace**; the only extra inputs are owner-stated predecessor plans, reconciled in doc 01 §12 (ADR-022).

## ADR-017 AI provider and model — OPEN
Status: OPEN — requires explicit decision. Select via the evaluation set (quality, grounding pass-rate, cost, latency, data-retention terms).

## ADR-018 Entitlement scope and refund policy — OPEN
Status: OPEN — requires explicit decision (OQ-003, OQ-007). Options: per case; per revision; per case with N regenerations; revoke vs flag on refund.

---

## ADR-019 Webhook inbox: persist verified events, process atomically, retry safely — Proposed

- **Context:** PayPal delivers notifications at least once, may redeliver, and may deliver out of order. PayPal treats any non-2xx response as a failed delivery and retries up to 25 times over 3 days (doc 08 §0, verified 2026-11-04). The 0.1.0 design stored each event under a unique `paypal_event_id` before processing and returned success on a duplicate id.
- **Problem:** if processing failed after the row was stored, the retry hit the unique id, was treated as an already-processed duplicate, and the order or entitlement stayed unprocessed: a valid payment event could be silently lost.
- **Options considered:**
  - **A. One atomic transaction** (insert event and apply the payment change; roll back both on failure). Correct and simple, but failures leave no record, no attempt count, no stuck-event visibility, no quarantine of poison events, and recovery depends entirely on PayPal's finite retry window.
  - **B. Inbox (chosen):** persist the verified event (`RECEIVED`), then process in a separate atomic transaction that applies the business change and sets the event's final status together; record failures in a small follow-up transaction; retry through our own sweeper.
  - **C. Queue and worker infrastructure.** Same guarantees as B plus broker cost and operations; unjustified at MVP (ADR-009).
- **Decision:** B. Signature verification happens before anything is stored; only verified events are persisted. Duplicates are judged by `processing_status`, never by row existence. A claim with lease and attempt counter (`next_retry_at`, `attempt_count`) is committed before processing, so crashed attempts still consume budget and no `PROCESSING` status exists. Statuses: `RECEIVED`, `FAILED_RETRYABLE`, `PROCESSED`, `IGNORED`, `REJECTED`, `FAILED_TERMINAL`. A scheduled sweeper retries due events with `FOR UPDATE SKIP LOCKED` and backoff (proposal: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h; `max_attempts = 8`; *Assumption — not yet validated*). Terminal failures alert; operators `requeue` or `dismiss` with an audit entry. Unmappable `PAYMENT.CAPTURE.*` events are never ignored. Full design: doc 08 §5; schema: doc 06 §4.
- **Rationale:** durable record of every verified event; our own retry loop independent of PayPal's window; visible, monitorable states; safe under duplicates and concurrency (unique ids, lease, order row lock, unique entitlement per order); at most one entitlement per order under any interleaving.
- **Consequences:** one extra state machine and a scheduler dependency (minute-scale cadence on the chosen host); more tests (doc 08 §10); a `200 deferred` response stops PayPal's retries, so the sweeper is the retry guarantee and must be monitored.
- **Security and operational implications:** unverified requests never reach the database; raw bodies hold payer PII, so processing reads only the allow-listed `summary` and `raw_body` is redactable; alerts for oldest unprocessed event age, terminal and rejected events, and the two entitlement invariants; runbook for terminal failures (doc 08 §5.10); operator actions are authenticated, audited and not public.
- **Status:** Proposed. **Revisit when:** sweeper cadence cannot meet recovery goals, event volume makes polling inefficient (then a queue, ADR-009), or PayPal changes delivery or verification behaviour.

## ADR-020 Canonical PayPal capture — Proposed

- **Context:** the Orders v2 flow requires the merchant server to capture an approved order (PayPal's recommended server flow, doc 08 §0). The 0.1.0 text said the server captures but left the trigger OPEN.
- **Problem:** choose exactly one capture initiator so a buyer is charged at most once, no uncontrolled second path can capture, and the browser redirect is never evidence of payment.
- **Options considered:** **O1** the server captures on the return request (single initiator, immediate UX, but the redirect itself must not be trusted); **O2** a verified approval webhook triggers capture (works without a browser, but capture becomes a side effect of notification retries and duplicates, and may charge a buyer who has left); **O3** an explicit authenticated, owner-only server endpoint `POST /orders/{id}/capture` (EP-023) called by the return page, with webhooks and reconciliation never capturing; **O4** PayPal-side auto-capture (support unverified, weaker control).
- **Decision:** O3. EP-023 is the only code path that calls PayPal's capture; the port method is referenced by one use-case, enforced by an import rule and a test. EP-023 reads the order from PayPal with server credentials, validates approval, amount, currency and payee, moves the order to `CAPTURE_REQUESTED` by compare-and-set under the order row lock (lock order `case → order → event`), then makes one capture call with a deterministic `PayPal-Request-Id` (UUIDv5 of call type and order id, at most 38 characters). Ambiguous outcomes are resolved by reading PayPal, never by blind re-capture. Payment facts then flow into **one** `settleCapture` from three server-side authenticated sources: our own capture response, a signature-verified webhook, our own authenticated read; the entitlement is granted in the same transaction that sets the order `COMPLETED`. Reconciliation never captures; a read-only path expires `CAPTURE_REQUESTED` orders that have no PayPal capture after TTL plus grace. Flow, the twelve answers, sequence diagrams and failure cases: doc 08 §3–4, §6, §8.
- **Rationale:** a single, user-bound, synchronous initiator is easy to make idempotent and to test; using our own authenticated capture response as evidence removes needless waiting while staying server-side; webhooks remain the independent confirmation channel and the only source for refunds and reversals.
- **Consequences:** a buyer who approves at PayPal and closes the tab is not charged and must return or reorder (conversion cost, RISK-037); the brief's wording "payment verified through authenticated webhooks" is widened to include the other two server-side sources (**owner decision required**); PayPal's request-id retention is undocumented, so correctness never relies on it alone.
- **Security and operational implications:** no amount, token or payer id is accepted from the browser; redirect parameters are ignored; OAuth client credentials are server-only and never logged; duplicate-capture and mismatch cases alert; unexpected captures are `REJECTED` and flagged for an operator refund decision; the checkout kill switch never blocks EP-023 or settlement.
- **Status:** Proposed (supersedes ADR-008 in part). **Revisit when:** PayPal documents order validity and auto-capture behaviour in a way that changes the trade-off, conversion loss from abandoned approvals is material, or a JS-SDK flow is adopted (it must still call EP-016 and EP-023).

## ADR-021 Data lifecycle: two-phase deletion with tombstone and minimised financial records — Proposed

- **Context:** users must be able to delete cases and accounts, while some payment records may need to be retained. The 0.1.0 design combined cascade deletion with non-null foreign keys from `orders` and `entitlements`, which would either block deletion or destroy payment records. No legal retention period has been established (OQ-011).
- **Problem:** define deletion so content is erased, financial and audit facts survive in minimal form, every foreign key stays valid, and no retention period is invented.
- **Options considered:** hard delete with `CASCADE` (destroys payment records or is blocked); soft delete only (keeps personal content indefinitely); anonymise orders and drop the user row (needs nullable owner keys and loses a stable key for reconciliation); **two-phase deletion with a tombstoned user row, content purge and `RESTRICT`/`SET NULL` financial links (chosen)**.
- **Decision:** phase 1 (one transaction, immediate): hide the case or account (`pending_deletion`, 404 everywhere), revoke active entitlements, expire unpaid open orders; refused with `ERR-LIFE-001` while a payment is in flight and with `ERR-LIFE-002` unless loss of paid access is acknowledged. Phase 2 (resumable purge): delete stored files, then content rows by cascade, redact payer data in `payment_events.raw_body` for final events, delete the identity at the identity provider, remove the user row only if the user has no orders, otherwise tombstone it (no PII, `CHECK`-enforced). `orders.case_id` and `entitlements.case_id` become null; `orders.user_id` and `entitlements.user_id` are `RESTRICT` against the retained tombstone; `ai_invocations` are content-free and anonymised; `audit_log` has no foreign keys and holds ids and codes only. Backups: deleted data persists until backups expire; a deletion ledger (ids only) outside the primary database is replayed on every restore. Answers to the eleven required questions: doc 06 §8.2; ER diagram: doc 06 §2; state machines: doc 06 §8.3.
- **Rationale:** erases what users own while preserving the minimum needed for disputes, reconciliation and audit; schema constraints rather than application discipline prevent orphaned or active-but-caseless entitlements; the purge is idempotent and observable.
- **Consequences:** a tombstone row remains for users with orders; deleting a paid case revokes access without refund (policy OPEN, OQ-007); no undo or cooling-off (OQ-012); retention periods remain OPEN, so the safe default is to keep only the minimised records and run no age-based deletion; the privacy notice must disclose backup persistence (legal text OPEN).
- **Security and operational implications:** no deletion code runs in the webhook path; the purge role is the only role allowed to delete immutable content tables; pending-deletion age and failed purge attempts alert; no legal compliance is claimed; whether pseudonymous ids count as personal data is a legal question (RISK-036).
- **Status:** Proposed. **Revisit when:** legal review sets retention periods, the identity provider is chosen (ADR-011), dossier storage is decided (ADR-013), or row-level security is adopted (ADR-014).

## ADR-022 Evidence governance and validation-gated scope — Proposed

- **Context:** the market-validation verdict is VALIDATE FURTHER; the research register, report and decisions register were unavailable; earlier owner-stated predecessor plans (subscriptions, agency tier, free tools, a 24-document set) conflict with the current brief (doc 01 §12).
- **Problem:** stop commercial hypotheses and superseded plans drifting into requirements, and give a deterministic rule for which source wins.
- **Options considered:** ignore the predecessor plans (loses carry-over candidates and hides conflicts); merge them silently (violates scope); register conflicts explicitly with a precedence rule (chosen).
- **Decision:** adopt the precedence rule in doc 00 §5 (the owner's current instruction; then research documents for market facts; then this package for architecture; then `DESIGN.md` for implementation state; unresolved conflicts become OPEN items). Keep the evidence register (doc 01 §12.1) as the only place that states what is validated. Scope exclusions (doc 02 §6) carry an evidence status; adding any excluded item requires new evidence plus an ADR. Predecessor technical choices are carry-over *candidates* only (ADR-010/014/015, OQ-014); the owner-approved one-time dossier purchase (no subscriptions, no credits) is the pricing model; billing automation is deferrable behind the concierge gate (OQ-008).
- **Rationale:** keeps the architecture honest about uncertainty and prevents scope creep without discarding useful prior thinking.
- **Consequences:** more reconciliation work when the real research documents are found (OQ-001); some decisions stay OPEN until the owner confirms carry-overs.
- **Security and operational implications:** none directly; reduces the risk of building unneeded, legally unreviewed features such as KDP report ingestion.
- **Status:** Proposed. **Revisit when:** the research register or validation report is located, validation produces evidence for or against H-1 to H-5, or the owner confirms or rejects the carry-over candidates.
