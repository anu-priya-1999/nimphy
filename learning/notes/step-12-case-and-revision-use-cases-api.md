# STEP-012 Engineering Notes — Case and Revision Use-Cases + API

- **Endpoints Implemented (`EP-001`..`EP-008`):**
  - `POST /api/v1/cases` (`201`, optional `Idempotency-Key`)
  - `GET /api/v1/cases` (`200`, keyset cursor `?limit=20&cursor=...&status=active|archived`)
  - `GET /api/v1/cases/{caseId}` (`200`, includes `latestRevision` summary)
  - `PATCH /api/v1/cases/{caseId}` (`200`, updates `title` and/or `status` in `{active, archived}`; never sets `pending_deletion`)
  - `DELETE /api/v1/cases/{caseId}` (`202`, `{ status: "deletion_requested" }`, repeat returns `404 ERR-RES-001`)
  - `POST /api/v1/cases/{caseId}/revisions` (`201`, returns `revisionId`, `revisionNo`, `inputsHash`, `warnings`)
  - `GET /api/v1/cases/{caseId}/revisions/{n}` (`200`, returns revision + `evidenceItems`)
  - `POST /api/v1/cases/{caseId}/revisions/{n}/evidence` (`201`, stores `sourceRef` as text only; no SSRF fetch)
- **Boundary & Security Invariants:**
  - `apps/web/app/api/v1/**` route handlers remain thin, delegating to `apps/web/lib/cases/handlers.ts` -> `use-cases.ts` -> `@nimphy/persistence`.
  - Every query scopes to `user_id = $userId` and `status <> 'pending_deletion'`.
  - `nimphy_app` never executes `DELETE` on `business_cases` or `case_revisions`; Phase 2 purge runs exclusively via `nimphy_purge_business_case` under `nimphy_purge`.
- **Single-Transaction Idempotency Atomicity:**
  - When `Idempotency-Key` is supplied on `EP-001`, `EP-006`, or `EP-008`, `withIdempotency` executes `claim`, the business mutation + `audit_log` write (`PgCaseRepository` on the transaction-bound `SqlQueryClient`), and `complete` inside one PostgreSQL transaction (`withTransaction`).
  - A failure before commit or during `complete()` rolls back both the mutation and the `idempotency_keys` row, preventing orphaned mutations or duplicate execution on retry.
  - Concurrent same-key requests block on the `INSERT ... ON CONFLICT DO NOTHING` row lock until the first transaction commits or rolls back, then either replay the committed response or claim and execute if the first rolled back.
