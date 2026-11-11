# 13 — Deployment and Infrastructure Architecture

Related: [04](04-system-architecture.md), [11](11-security-and-privacy-architecture.md), [15](15-scaling-and-reliability.md), [16](16-cost-model.md). No hosting decision is established. Vendor features and limits named below are **unverified** and must be checked against current vendor documentation.

## 1. Topology

One web application deployable, one managed PostgreSQL, optional object storage, third-party APIs. See doc 04 §9. Scheduled work runs via the host's scheduler invoking protected endpoints or scripts (mechanism **OPEN**): the **webhook sweeper** (minute-scale, doc 08 §5.7), reconciliation and order expiry (doc 08 §8), the deletion purge sweeper (doc 06 §8), and idempotency-key purge. These are the only background processes; none is an always-on worker.

## 2. Environments

| Env | Purpose | PayPal | Database | Deploy trigger |
|---|---|---|---|---|
| local | development | sandbox (or fake) | local Postgres | manual |
| preview | per-PR review | sandbox | shared staging DB schema or branch DB (**OPEN**) | PR |
| staging | pre-release verification | sandbox | dedicated | merge to `main` |
| production | real users | **live** | dedicated | tagged release, manual approval |

Production PayPal live credentials exist only in production secrets. Live mode stays disabled until doc 22 §Release criteria are met.

## 3. Hosting options (evaluation; decision = ADR-010, Proposed/OPEN)

| Option | Pros | Cons / unknowns |
|---|---|---|
| A. Serverless platform for Next.js + managed Postgres | Lowest ops, fast previews, scale-to-zero | Function time/size limits may constrain PDF rendering and AI calls; cold starts; vendor coupling |
| B. Single container on a small VM/PaaS + managed Postgres | Long-running work allowed; portable | More ops; always-on cost |
| C. Fully self-hosted | Max control | Highest ops burden; not appropriate pre-validation |

**Recommendation (Proposed):** A for MVP, with PDF rendering chosen to fit its limits (ADR-012), and Option B as the documented fallback if limits bite. Rationale: minimise ops and fixed cost while validation is unproven. Revisit when function limits, cost, or reliability triggers in doc 15 §9 fire.

## 4. CI/CD

- CI: gates in doc 12 §12 on every PR.
- CD: merge to `main` ⇒ staging deploy + migrations + smoke tests; production release by tag with manual approval.
- Migrations run as a separate, explicit step before the new app version is activated; forward-compatible (expand/contract) so rollback of app code does not require rollback of schema.

## 5. Build and release process

Reproducible build from lockfile; embed `engine_version` (git SHA) at build; release notes list rule-pack and prompt-version changes; `docs/DESIGN.md` updated per step (doc 22).

## 6. Database deployment

Managed Postgres with automated backups (verify tier features); separate app role with minimal privileges (no DDL, no UPDATE/DELETE on append-only tables); migration role used only by CI/deploy; connection pooling appropriate to serverless (**verify**); TLS required.

## 7. Secrets

Held in the host's secret manager; named per environment; rotated on suspicion or staff change; PayPal client id/secret, PayPal webhook id, AI key, DB URL, session secret, operator credential. Never committed; CI uses scoped, short-lived credentials where available.

## 8. Observability

| Concern | Approach |
|---|---|
| Logging | Structured JSON with correlation id, user id (hashed or id only), route, status, duration; no secrets, no prompts, no raw webhook bodies in application logs |
| Error tracking | Hosted error tracker (**OPEN**) with PII scrubbing |
| Metrics | Minimal: request rate/latency/error, webhook outcomes, AI cost and failure rate, orders by state |
| Alerts | Signature-failure spike; **oldest unprocessed webhook event age**; `FAILED_RETRYABLE` with high attempt count; **any `FAILED_TERMINAL` or `REJECTED` event**; orders stuck in `CAPTURE_REQUESTED`; orders past TTL not expired; the two entitlement invariants (completed order without active entitlement; active entitlement without completed order); amount mismatch; `pending_deletion` rows older than threshold; failed purge attempts; AI failure rate; DB errors (definitions and proposed thresholds: doc 08 §5.11, doc 06 §8.3) |
| Runbooks | `FAILED_TERMINAL` event (doc 08 §5.10); stuck `CAPTURE_REQUESTED`; mismatch/refund decision; failed purge; restore with deletion-ledger replay |
| Audit | `audit_log` table (doc 06) |

## 9. Rollbacks

App: redeploy previous build (host feature). Schema: avoid destructive migrations in the same release; for emergencies restore from backup (documented, drilled). Rule Packs: never edited; retire and publish a new version. Prompts: version-pinned; revert by config. Feature flags for AI memo generation and checkout enable/disable (kill switches). **The checkout kill switch blocks only new orders (EP-016); it must never block EP-023, webhook intake, the sweeper or reconciliation**, so payments already approved can still be settled.

## 10. Backups

Provider automated backups/PITR if available (**verify**); periodic logical export of critical tables (`orders`, `payment_events`, `entitlements`, `rule_packs`) to separate storage; restore drill before launch; retention OPEN. Deleted data remains in backups until they expire; therefore the **deletion ledger** (ids only, no PII, kept outside the primary database) is replayed before a restored database serves traffic, and a restore without ledger replay is a defect (doc 06 §8.2 row 11).

## 11. Infrastructure costs

See doc 16. Principle: near-zero fixed cost pre-validation using free tiers where acceptable; any paid tier chosen only when a free-tier limit blocks a requirement.

## 12. Development vs production differences

| Aspect | Dev | Prod |
|---|---|---|
| PayPal | sandbox/fake | live |
| AI | fake or capped real | real with budgets |
| Data | synthetic | real |
| Logging | verbose | structured, scrubbed |
| Webhooks | tunnel to local (**OPEN** tool) or fake/replay | public HTTPS endpoint |
| Security headers | relaxed where needed | strict |
