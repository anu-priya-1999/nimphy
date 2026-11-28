# STEP-012 Technical Interview Preparation — Case and Revision Use-Cases + API

1. **Why does `saveRevision` lock the parent `business_cases` row `FOR UPDATE` before computing `MAX(revision_no) + 1`?**
   Because two concurrent `POST /revisions` requests on the same case would otherwise read the same `MAX(revision_no)` and collide on `UNIQUE (case_id, revision_no)`. Locking the parent case row serializes revision numbering per case without locking the entire `case_revisions` table.

2. **Why do cross-user accesses and `pending_deletion` cases both return `404 ERR-RES-001` instead of `403` or `410`?**
   Returning `403` leaks that a resource UUID exists and belongs to another user (IDOR existence oracle, TH-05). Returning `404 ERR-RES-001` for non-existent, non-owned, and `pending_deletion` resources prevents existence leaks and guarantees immediate invisibility after Phase 1 deletion.

3. **How does `withIdempotency` prevent key poisoning and duplicate mutations when a request fails or arrives concurrently?**
   `claim`, the business mutation + `audit_log` write (`PgCaseRepository` via `createPgCaseRepositoryForTransaction`), and `complete` all execute inside a single PostgreSQL transaction (`withTransaction`) using the same transaction-bound `SqlQueryClient`. If any step fails before commit or during `complete`, the transaction rolls back atomically—including the `idempotency_keys` insert—so no incomplete key or orphaned mutation remains and the client can safely retry. Concurrent same-key, same-payload requests block on the `INSERT ... ON CONFLICT DO NOTHING` row lock until the first transaction finishes and then coalesce by replaying the committed response, while reusing the key with a different payload returns `409 ERR-IDEM-001`.

4. **Why is `EP-005` (`DELETE /cases/{caseId}`) implemented in two phases rather than a direct `DELETE FROM business_cases`?**
   `nimphy_app` has `DELETE` revoked on `business_cases`, `case_revisions`, and `calculation_runs`. Phase 1 atomically hides the case (`status = 'pending_deletion'`) and writes the audit record; Phase 2 executes `nimphy_purge_business_case` under the dedicated `nimphy_purge` role. This staging lets STEP-024 add payment-aware guards (`ERR-LIFE-001`/`002`) without rewriting the deletion architecture.

5. **How does keyset cursor pagination on `GET /api/v1/cases` avoid offset drift?**
   It orders by `(updated_at DESC, id DESC)` and filters `(updated_at, id) < ($cursorUpdatedAt, $cursorId)` with `LIMIT limit + 1`. Even when cases are created or updated between page fetches, rows are never skipped or duplicated due to shifting offsets.
