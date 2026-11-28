# STEP-012 Implementation Record — Case and Revision Use-Cases + API

## 1. Summary

STEP-012 implements Nimphy's authenticated business case, immutable revision, evidence item, two-phase deletion, idempotency, and RFC 7807 error-handling layers across `@nimphy/persistence` and `@nimphy/web` (`EP-001` through `EP-008`).

## 2. Database & Persistence (`packages/persistence`)

- **`migrations/002_idempotency_keys.sql`**: Adds `idempotency_keys (key, user_id, endpoint, request_hash, response_status, response_body, created_at)` with composite primary key `(user_id, endpoint, key)`, index on `created_at`, `GRANT SELECT, INSERT, UPDATE, DELETE` to `nimphy_app`, and `REVOKE` from `nimphy_purge`.
- **`src/db/transaction.ts`**: `withTransaction(pool, fn)` helper executing `BEGIN ... COMMIT / ROLLBACK` with guaranteed client release.
- **`src/cases/case-repository.ts`**: `PgCaseRepository` accepts either a `DatabasePool` or a transaction-bound `SqlQueryClient` (so idempotent handlers share a single transaction without nested transactions) and implements `createCase`, `listCases` (keyset cursor pagination `(updated_at DESC, id DESC)`), `getCaseWithLatestRevision`, `updateCase`, `requestCaseDeletion` (Phase 1 `pending_deletion`), `saveRevision` (parent `FOR UPDATE` lock + `COALESCE(MAX(revision_no), 0) + 1`), `getRevision`, and `attachEvidence`. All mutations write to `audit_log` via `nimphy_write_audit_log`.
- **`src/cases/case-purge.ts`**: `purgePendingBusinessCase(purgeClient, caseId)` invoking `nimphy_purge_business_case($1)` under `nimphy_purge`.
- **`src/idempotency/idempotency-repository.ts`**: `PgIdempotencyRepository` implementing atomic `claim` (`INSERT ... ON CONFLICT DO NOTHING`), `complete`, and `release`.

## 3. API Edge, Validation & Use-Cases (`apps/web/lib/`)

- **`api/errors.ts`**: Complete `ERROR_CATALOG` matching doc 07 §5 (`ERR-AUTH-001`..`ERR-SYS-001`), `ApiProblemError`, `createProblemResponse`, and `mapErrorToResponse` with `x-correlation-id`.
- **`api/request.ts`**: `parseJsonObjectBody` enforcing `application/json` and 1 MiB body limit.
- **`api/idempotency.ts`**: `extractIdempotencyKey` (`ERR-IDEM-002` on invalid key) and `withIdempotency` using `hashCanonicalJson` (`ERR-IDEM-001` on payload mismatch or in-flight conflict). When `Idempotency-Key` is supplied, `claim`, the business mutation + audit write, and `complete` execute atomically inside a single PostgreSQL transaction on the same transaction-bound client so any pre-commit or completion failure rolls back both the mutation and the key.
- **`cases/validation.ts`**: Pure TypeScript strict validators rejecting unknown keys and enforcing `BookFormat` (`ebook` vs `paperback`/`hardcover`), `CurrencyCode` consistency, `Provenance`, `ScenarioInput`, and calendar-valid `capturedAt`.
- **`cases/use-cases.ts`**: Decoupled use-cases (`createCaseUseCase`, `listCasesUseCase`, `getCaseUseCase`, `updateCaseUseCase`, `requestCaseDeletionUseCase`, `saveRevisionUseCase`, `getRevisionUseCase`, `attachEvidenceUseCase`) computing `inputsHash` and `WARN-MISSING-EVIDENCE` warnings.
- **`cases/handlers.ts`** & **`app/api/v1/cases/**`**: Thin route handlers for `EP-001`through`EP-008`enforcing`requireApiUser` (Clerk auth + CSRF on mutations).
