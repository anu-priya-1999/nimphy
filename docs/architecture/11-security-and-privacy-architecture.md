# 11 — Security and Privacy Architecture

Related: [04](04-system-architecture.md) (trust boundaries), [07](07-api-architecture.md), [08](08-event-schema-and-payment-lifecycle.md), [09](09-ai-architecture.md). **No legal or compliance assessment has been performed.** Nothing here claims compliance with any regulation (GDPR, CCPA, PCI, etc.). Legal review is an open prerequisite (RISK-025).

## 1. Assets

Payment/entitlement integrity; users' unpublished book plans and cost data; account identity; Rule Pack integrity; secrets (PayPal, AI, DB, session); reputation of calculations.

## 2. Threat model (STRIDE-oriented)

| ID | Threat | Mitigation |
|---|---|---|
| TH-01 | Forged webhook grants free entitlement | Raw-body signature verification via PayPal before anything is stored; certificate-host allow-list; unverified requests never persisted; amount/currency/payee/order validation in `settleCapture` |
| TH-02 | Replay or duplicate delivery of a valid webhook | Unique `paypal_event_id` plus `processing_status` (a duplicate id is never proof of success); monotonic state machines; unique `entitlements.order_id`; row locks |
| TH-03 | Client spoofs "payment success" or tampers with the return URL | The redirect and any browser-supplied value have no authority; EP-023 uses only the locally stored PayPal order id, owner-only; entitlement only from server-side evidence (own capture response, verified webhook, own authenticated read) |
| TH-04 | Price tampering | Price from server `price_points`; request carries no amount; order snapshot compared on capture and on webhook |
| TH-05 | IDOR on cases/runs/dossiers | Ownership predicate in every query; 404 on non-owned; authorization tests |
| TH-06 | Export without entitlement | Entitlement checked per download; paid content never in preview payload |
| TH-07 | Prompt injection via evidence text | Delimited data; output validator; no tools/write access for AI |
| TH-08 | AI cost abuse | Auth required; rate and budget caps; kill switch |
| TH-09 | Account takeover | Managed IdP, secure cookies, session expiry; MFA availability via IdP (**OPEN**) |
| TH-10 | XSS via user text in UI/dossier | Output encoding; no `dangerouslySetInnerHTML` on user content; Markdown sanitiser; CSP |
| TH-11 | CSRF | SameSite cookies + origin check + token on mutations |
| TH-12 | SQL injection | Parameterised queries only; ORM/query builder; no string-built SQL |
| TH-13 | SSRF | Server never fetches user-supplied URLs; `source_ref` is stored text; PDF renderer blocks network; webhook cert URL restricted to PayPal hosts |
| TH-14 | Rule Pack tampering | Immutable published packs + content hash; operator-only publish; audit |
| TH-15 | Secrets leakage | Env-managed secrets, never in repo/client bundle; log scrubbing; secret scanning in CI |
| TH-16 | Denial of service / scraping | Rate limits, body limits, timeouts, cost caps |
| TH-17 | Data loss | Backups and restore drills (§12) |
| TH-18 | Malicious file/PDF injection | Renderer given sanitised content only; no remote resources; no user-uploaded files at MVP |
| TH-19 | Supply-chain compromise | Lockfile, dependency audit in CI, minimal dependencies, pinned versions |
| TH-20 | Double capture / double charge | Single capture initiator (EP-023) enforced structurally; compare-and-set under the order row lock; deterministic `PayPal-Request-Id` (≤ 38 chars); read-before-retry after ambiguous outcomes (doc 08 §3) |
| TH-21 | Valid payment event silently lost or stuck | Persisted inbox with explicit status, lease and attempt budget; sweeper independent of PayPal retries; terminal failures alert; unmappable capture events never ignored; invariant queries (doc 08 §5.11) |
| TH-22 | PII retained in payment payloads or deletion leaves orphans | Allow-listed `summary` is all processing needs; `raw_body` redacted at account deletion and after a legally reviewed window; two-phase deletion; backups handled by deletion-ledger replay (doc 06 §8) |

## 3. Authentication

Delegated to an identity provider (ADR-011 OPEN). Requirements: verified email or OAuth identity, secure session cookies (HttpOnly, Secure, SameSite=Lax), rotation on sign-in, idle and absolute expiry (values OPEN), no password handling in Nimphy if avoidable.

## 4. Authorization

Single role (`user`) plus non-public operator capability. Policy: *a user may access only rows reachable from their `user_id`*. Implemented in use-cases (not only handlers). Optional Postgres row-level security as defence-in-depth (ADR-014 OPEN). Operator functions are not exposed on public routes and require separate credentials.

## 5. Session management

Server-validated sessions; logout invalidates; sensitive actions (account deletion) require recent authentication (**OPEN**).

## 6. Secrets management

Per-environment secrets in the host's secret store; separate PayPal sandbox and live credentials and webhook ids; rotation procedure documented in operations notes (doc 13); no secrets in `NEXT_PUBLIC_*`-style client-exposed variables.

## 7. Input validation and output encoding

Schema-validate every input at the edge (type, range, length, enum); reject unknown fields; canonicalise before hashing; encode on output by context (HTML, Markdown, PDF text); strict Content-Security-Policy (details OPEN until UI exists); Markdown rendering via a sanitising renderer with raw HTML disabled.

## 8. Payment security

Card data is handled entirely by PayPal; Nimphy stores no card numbers, only order/capture ids and amounts. Server-side order creation; **one** server-side capture operation (EP-023) that reads PayPal's state first and is guarded by a compare-and-set; payment facts accepted only from server-side authenticated sources (own capture response, signature-verified webhook, own authenticated read), all funnelled through one `settleCapture`; amount/currency/payee checks; reconciliation that reads but never captures; least-privilege PayPal app credentials (OAuth client credentials, server-only, tokens never logged); alerting on mismatches, stuck events and the two entitlement invariants. Detail in doc 08.

## 9. Webhook security

Dedicated endpoint; raw-body capture; max body size; signature verification (PayPal verification API with the event posted back exactly as received, or self-verification) **before** parse and before any write; only verified events are persisted; certificate URLs restricted to PayPal hosts (SSRF); no secrets in responses; retry-safe and idempotent through the persisted inbox (doc 08 §5); `5xx` on transient failure so PayPal retries, `2xx` only after the event is durable; separate sandbox/live webhook ids; operator `requeue`/`dismiss` of events is authenticated, audited and not exposed publicly.

## 10. Data protection and privacy boundaries

- Minimise: no collection beyond identity, case data, payment references.
- Encryption in transit (TLS) and at rest (managed DB/storage defaults — verify with chosen host).
- AI boundary: only grounded run data and evidence summaries leave the system (doc 09 §9). Provider retention/training terms must be reviewed before launch.
- No selling or sharing of user case data; no use of user data to train anything without explicit, separate consent (**OPEN** policy).
- Explicit exclusion: KDP sales-report ingestion is out of MVP partly because of unresolved data-rights questions.
- Privacy notice, cookie notice, DPA/subprocessor list: **OPEN — requires legal input**.
- Deletion: two-phase, resumable; user content is purged, the user row is tombstoned only when orders exist, payment records are retained in minimised, PII-free form, payer data in raw webhook bodies is redacted (doc 06 §8). Payment, audit and event retention periods are **OPEN — requires legal/tax review (OQ-011)**; none is asserted here.

## 11. Audit logs

Append-only `audit_log` (doc 06); records who/what/when/outcome for auth-sensitive and money actions; no secrets/PII beyond ids; access restricted to operators; retention OPEN.

## 12. Data retention, backup, recovery

Retention table in doc 06 §8.4 (periods OPEN, legal review required). Backups: use managed point-in-time recovery if the chosen tier offers it (**verify**); deleted data persists in backups until they expire (provider-specific, not asserted), which the privacy notice must state honestly; a **deletion ledger** (ids only, no PII) is kept outside the primary database and **replayed on every restore before the restored database serves traffic**, so deleted users and cases do not reappear (doc 06 §8.2 row 11). Documented restore procedure and a restore drill (including ledger replay) before real-money launch. RPO/RTO targets: *Assumption — not yet validated* (e.g., RPO ≤ 24 h, RTO ≤ 1 business day) — decide explicitly (OPEN).

## 13. Abuse prevention

Rate limits (doc 07 §9, including EP-023), per-user AI quotas, signup friction proportional to cost (email verification), monitoring for repeated failed webhooks or order creation spikes, ability to suspend an account (operator), bot protection on public endpoints if abuse appears (trigger-based, not preemptive).

## 14. Security testing (see doc 12 §8)

Authorization matrix tests, forged-webhook tests, dependency and secret scanning, SAST in CI, manual pre-launch review against this document, optional external review before scaling spend.
