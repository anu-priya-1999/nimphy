# 15 — Scaling and Reliability Strategy

Related: [04](04-system-architecture.md), [08](08-event-schema-and-payment-lifecycle.md), [13](13-deployment-and-infrastructure.md). All load numbers are **Assumption — not yet validated**; no usage data exists.

## 1. Early-stage workload assumptions

| Metric | Assumption |
|---|---|
| Registered users (first 6 months) | tens to low hundreds |
| Concurrent users | single digits |
| Business cases per user | a few |
| Calculations per case | tens (iteration) |
| Memos per case | 1–5 |
| Orders | handfuls per week |
| Webhooks | a few per order (create/approve/capture) |

Design target: comfortable operation at **~100× these assumptions** without architectural change; beyond that, follow §9 triggers. No attempt is made to design for massive traffic.

## 2. Performance goals (NFR-002/003)

Calculation p95 < 500 ms server time; page loads reasonable on mid-range mobile (budgets OPEN); memo p95 < 60 s; webhook acknowledgement < 5 s. Goals are verified by measurement before launch (not asserted).

## 3. Database scaling

Single primary Postgres; indexes per doc 06; pagination everywhere; large JSON (`trace`) fetched only with `?include=trace`; connection pooling configured for serverless; vertical scaling first; read replicas **not** planned. Archival of old runs is a later option, not MVP.

## 4. Caching

None initially. Candidates when measured need arises: Rule Pack lookup (immutable ⇒ trivially cacheable in-process), price points (short TTL), generated dossier files (storage already acts as cache). Never cache entitlement decisions beyond a few seconds without invalidation on revoke.

## 5. Background jobs

MVP: none always-on. Scheduled invocations only: the webhook sweeper (minute-scale; it is the retry guarantee once a delivery has been acknowledged with `2xx`), reconciliation and order expiry, the deletion purge sweeper, idempotency-key purge. If memo/PDF generation exceeds request limits: introduce a `jobs` table (status, attempts, run_after, payload) processed by a scheduled/triggered worker route with `FOR UPDATE SKIP LOCKED` (ADR-009 Proposed, **not** adopted until triggered). No external broker until a trigger in §9.

## 6. Concurrency

- Webhooks: persisted inbox; atomic claim with lease; `FOR UPDATE SKIP LOCKED` sweeper; row-lock the order inside the processing transaction; global lock order `case → order → payment_event` (doc 06 §7); unique event ids; idempotent transitions (doc 08 §5).
- Capture: compare-and-set on the order under its row lock so only one request calls PayPal; the loser reads state and returns `202`/current status (doc 08 §3.4).
- Revisions: `unique(case_id, revision_no)` with retry on conflict (assign next number in transaction).
- Memo generation: idempotency key + single in-flight generation per run (advisory lock or status check).
- Entitlement: unique per order.

## 7. Failure isolation, timeouts, retries

| Dependency | Timeout (start) | Retry | Isolation |
|---|---|---|---|
| PayPal API (create, read) | 10 s | idempotent calls ×2 w/ backoff + jitter | Only checkout affected |
| PayPal capture | 10 s (configurable) | up to 2 immediate retries of the **same** call (same deterministic `PayPal-Request-Id`); afterwards no blind re-capture: resolve by reading PayPal (retention of request ids is undocumented, doc 08 §0) | Only that order; stays `CAPTURE_REQUESTED` |
| AI provider | 60 s (configurable) | 1 retry on transient | Memo only; numbers unaffected |
| Database | statement timeout | none automatic for writes outside idempotent paths | — |
| PDF renderer | 30 s | none; user can retry | Export only |

PayPal retries a failed delivery up to 25 times over 3 days (doc 08 §0), but Nimphy does not depend on that: once an event is stored, the sweeper owns retries. Nimphy responds `5xx` when it could not store the event (or processing failed) and `2xx` only once the event row is durable. Circuit-breaking for AI (open after consecutive failures, auto half-open) is a simple in-memory/flag mechanism (**OPEN**).

## 8. Rate limits and graceful degradation

Limits per doc 07 §9. Degradation ladder: AI down → show numbers, queue/disable memo; PDF down → offer Markdown; PayPal down → disable buy button with message; DB down → maintenance page. Kill switches in config.

## 9. Scaling triggers (any one ⇒ write an ADR)

| Trigger | Response options |
|---|---|
| p95 API latency > 2× goal for a week | profile; indexes; caching |
| Memo/PDF work hits platform time limits | `jobs` table + worker (ADR-009); or move to container host (Option B) |
| DB CPU/connection saturation | pooler tuning; vertical scale |
| AI cost/dossier exceeds unit-economics ceiling (doc 16) | smaller model, tighter context, caps |
| Webhook backlog (oldest unprocessed event age above threshold) or reconciliation finds repeated misses; sweeper cadence too coarse on the chosen host | dedicated receiver/queue (ADR-009); more frequent scheduler; paid scheduler tier |
| Team grows beyond module-ownership comfort | consider extracting document renderer first |
| Compliance/uptime commitments to customers | review SLA, multi-region, backups |

## 10. Recovery

Restore procedures and drills (doc 13 §10); reconciliation heals payment gaps; rule packs and runs are immutable ⇒ reproducible; dossiers regenerable from stored run + memo (NFR-014). Incident basics: kill switches, status note, post-incident record in `docs/DESIGN.md` or an incidents log (**OPEN** location).
