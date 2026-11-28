# STEP-012: Case and Revision Use-Cases + API

## Objective

Implement **only STEP-012** from the authoritative Nimphy implementation roadmap (`docs/architecture/17-implementation-roadmap.md`):

**Case and Revision Use-Cases + API**

Build on STEP-010 (Database Foundation) and STEP-011 (Clerk Identity and Sessions) without introducing a second authentication mechanism, future payment/AI/dossier features, or hard deletes outside the purge path.

## Scope Implemented

- Migration `002_idempotency_keys.sql` adding `idempotency_keys` with least-privilege grants for `nimphy_app` and explicit revocations from `nimphy_purge`.
- Persistence repositories (`PgCaseRepository`, `PgIdempotencyRepository`, `withTransaction`, `purgePendingBusinessCase`) enforcing ownership predicates (`user_id = $userId`) and `status <> 'pending_deletion'`.
- RFC 7807 error contract (`ERROR_CATALOG` for `ERR-*` codes in doc 07), JSON body/size parsing, and `Idempotency-Key` middleware using `hashCanonicalJson`.
- Strict TypeScript validation schemas rejecting unknown fields (`ERR-VAL-001` / `ERR-VAL-002`).
- Independent use-cases and thin Next.js App Router handlers for `EP-001` through `EP-008`, including two-phase case deletion (`EP-005` phase 1 hide to `pending_deletion` + phase 2 purge via `nimphy_purge_business_case`).
- API contract, ownership matrix, validation, and PostgreSQL integration tests.
