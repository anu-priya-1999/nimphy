# Engineering Notes — STEP-010: Database Foundation

- **Author:** Nimphy Infrastructure Agent
- **Date:** 2026-11-22
- **Milestone:** STEP-010 (Database Foundation)
- **Status:** Implementation complete & hardened; 85 database integration tests green on local PostgreSQL 18.6 across 7 test files; PostgreSQL 16 compatibility explicitly UNVERIFIED pending remote CI execution of uncommitted changes; awaiting formal repository-owner review

---

## 1. Architectural Scope & Core Invariants

STEP-010 establishes the foundational relational schema, migration runner, database privileges, immutability triggers, and audit logging infrastructure for `@nimphy/persistence` (Module M-09) per `docs/architecture/17-implementation-roadmap.md`, `docs/architecture/06-database-architecture-and-schema.md`, and `AGENTS.md`.

### Delivered Capabilities

1. **Approved Migration Infrastructure (ADR-015 Option A):**

   - Plain SQL numbered migration: `packages/persistence/migrations/001_initial_schema.sql`.
   - Migration runner: `packages/persistence/src/migrations/runner.ts` using `pg@8.23.1`.
   - Dedicated metadata schema and table: `nimphy_meta.schema_migrations` storing `version`, `name`, `checksum`, `applied_at`.
   - PostgreSQL advisory lock: `pg_advisory_lock(481927, 391823)` preventing concurrent migration attempts on a dedicated single client.
   - Normalized CRLF-to-LF SHA-256 checksums to guarantee consistent hashing across Windows and Linux environments.
   - Fail-closed validation: Fails immediately if any previously applied migration's checksum differs from disk or if the database contains unexpected future versions.
   - Transactional execution: Each migration runs in an isolated transaction with automatic rollback and error credential sanitization.
   - CLI script: `scripts/db-migrate.mjs` executed via `pnpm db:migrate`.

2. **Exactly Seven Domain Tables:**

   - `app_users`: UUID PK, `idp_subject`, `email`, status enum (`active`, `pending_deletion`, `deleted`), timestamps, purge tracking, tombstone check, partial unique index.
   - `business_cases`: UUID PK, `user_id` FK, title length check (1–200 chars), status enum, user/update composite index, pending-deletion index.
   - `case_revisions`: UUID PK, `case_id` FK, positive `revision_no`, `inputs jsonb`, schema version, `inputs_hash`, unique `(case_id, revision_no)`.
   - `evidence_items`: UUID PK, `revision_id` FK, provenance enum, kind enum, summary limit ($\le 2000$), `source_ref` text only.
   - `rule_packs`: UUID PK, `pack_key`, SemVer `version`, dates, `content jsonb`, `content_hash`, status enum, unique `(pack_key, version)`.
   - `calculation_runs`: UUID PK, `revision_id` FK, `rule_pack_id` FK (`NO ACTION`), `engine_version`, `scenario_params jsonb`, `results jsonb`, `trace jsonb`, `results_hash`, unique constraint.
   - `audit_log`: BigInt identity PK, UTC timestamp, nullable `actor_user_id` (no FK), actor kind, action, entity type, entity id, correlation id, details jsonb.

3. **Database Security, Hardened Role Model, Purge Concurrency & Role-Drift Audit:**

   - Separation of cluster bootstrap from schema migrations:
     - Bootstrap (`packages/persistence/scripts/bootstrap.sql`): Provisions `nimphy_migrator`, `nimphy_app`, and `nimphy_purge` as `NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOBYPASSRLS`, `NOREPLICATION` privilege roles; transfers schema `public` ownership to `nimphy_migrator`; revokes `CREATE ON SCHEMA public FROM PUBLIC`; and safely grants `CONNECT, CREATE ON DATABASE` to `nimphy_migrator` using identifier-safe dynamic SQL (`EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO nimphy_migrator', current_database());` or safely quoted identifier). Provisions dedicated service logins (`nimphy_migrator_login`, `nimphy_app_login`, `nimphy_purge_login`) with separate secrets and assigns controlled membership: `GRANT <role> TO <login> WITH INHERIT FALSE, SET TRUE;`.
     - Role-drift audit & safe behavior: Enforces an explicit fail-closed default policy if any functional role possesses unexpected insecure attributes (`LOGIN`, `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, `REPLICATION`), unexpected parent roles (outward membership), unauthorized member principals (inward membership), `admin_option = true`, or `inherit_option = true`. Strictly enforces exact login allow-lists without prefix matching (`LIKE` pattern matching removed completely). Audits service logins' own attributes (requiring `rolcanlogin = true` and rejecting `CREATEROLE`, `CREATEDB`, `SUPERUSER`, `BYPASSRLS`, `REPLICATION`) and inspects the complete direct and transitive membership graph via recursive CTE (`pg_auth_members`), ensuring service logins are members only of their designated functional role with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`. Prohibits intermediate group roles, privilege acquisition paths, and cross-role assumptions. Supports active normalization via `onRoleDrift: 'normalize'` (`nimphy.bootstrap_policy = 'normalize'`). Does not modify or audit unrelated database roles. Test environments pass exact generated logins through `allowedMembers` options.
     - Schema migrations (`001_initial_schema.sql`): Contain no `CREATE ROLE` or role-membership statements.
     - Runtime login and migration flow: Three dedicated service logins (`LOGIN`, but `NOSUPERUSER NOCREATEDB NOCREATEROLE`) connect with zero ambient functional permissions (`INHERIT FALSE`). Each connection executes `SET ROLE <functional_role>` (`SET TRUE`), verifying `current_user` matches the intended functional role, and failing closed if the switch or membership check fails. Cross-role assumption is strictly denied (e.g. `nimphy_app_login` cannot assume `nimphy_migrator` or `nimphy_purge`). Logins and functional roles possess no `CREATEROLE` or administrative privileges.
     - Schema object ownership: `nimphy_migrator` owns all 7 domain tables, sequences, functions, and metadata table. `nimphy_app` and `nimphy_purge` own 0 schema objects.
   - Role privileges:
     - `nimphy_app`: Has SELECT, INSERT, UPDATE on `app_users` and `business_cases`; SELECT, INSERT on `case_revisions`, `calculation_runs`; SELECT on `rule_packs` and `audit_log`. Cannot DELETE any rows. Cannot INSERT into `audit_log` directly. Cannot assume `nimphy_migrator` or `nimphy_purge`.
     - `nimphy_purge`: Dedicated lifecycle purge role. Executable privileges on `nimphy_purge_business_case` and `nimphy_purge_app_user`. Direct table modification revoked.
   - Immutability triggers on `case_revisions`, `calculation_runs`, `audit_log`, and `rule_packs`, with `SET search_path = public, pg_temp` and execution revoked from `PUBLIC`.
   - Security-definer purge functions with fixed `search_path = public, pg_temp` validating `status = 'pending_deletion'` and active-record cascade guards.
   - Concurrency row locking & lock ordering: `nimphy_purge_business_case` locks `business_cases WHERE id = p_case_id FOR UPDATE`. `nimphy_purge_app_user` locks parent `app_users WHERE id = p_user_id FOR UPDATE`, then locks child `business_cases WHERE user_id = p_user_id ORDER BY id FOR UPDATE` in strict parent-to-child ascending primary key order, preventing race conditions against concurrent insertions and restorations. Deadlocks are eliminated against standard hierarchical and single-row mutations; deadlocks are not universally claimed as "mathematically prevented" against arbitrary unconstrained application transactions.

4. **Database-Enforced Audit Log Writer & Default Routine Privileges:**

   - `nimphy_write_audit_log` function: Validates actor kind, action registry, entity type, identifier lengths, scalar detail values, and per-action detail keys at the database level.
   - Rejects prohibited PII key patterns, raw payloads, nested objects, and unauthorized detail keys.
   - `packages/persistence/src/audit/audit-writer.ts`: Validates input and calls `nimphy_write_audit_log`.
   - Sensitive free-text values under permitted detail keys (e.g., emails/tokens in `reason`) are accepted by schema, establishing that value content sanitization is strictly an application-layer responsibility.
   - Default routine privileges revoked from `PUBLIC` (`ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;`) for `nimphy_migrator`. Objects created by `nimphy_migrator` do not grant `EXECUTE` to `PUBLIC` or `nimphy_app`.

5. **Testing & CI Infrastructure:**
   - `vitest.db.config.ts`: Dedicated database test suite with 85 tests across 7 test files (`role-drift` [31], `role-model` [12], `immutability` [12], `audit-writer` [11], `schema` [7], `foreign-keys` [5], `migration` [7]).
   - Includes 31 tests in `role-drift.db.test.ts` verifying all 4 insecure attribute configurations (`LOGIN`, `SUPERUSER`, `CREATEROLE`, `BYPASSRLS`), unexpected parent role memberships (outward), unauthorized member principals (inward), `admin_option = true`, `inherit_option = true`, normalization behavior, safe rerun idempotency, unrelated role preservation, service login administrative attribute rejection (`CREATEROLE`, `CREATEDB`, `SUPERUSER`, `BYPASSRLS`), direct/transitive unauthorized role assumption rejection, expected functional membership `SET FALSE` rejection, prohibited cross-role assumption, exact allow-list rejection of prefix-matching roles (`nimphy_app_login_attacker`, `nimphy_migrator_login_extra`, `nimphy_purge_login_test`), rejection of designated logins with `NOLOGIN`, missing designated login rejection (for `migrator`, `app`, `purge`), revoked direct functional-role membership rejection, wrong-functional-role connection rejection, duplicate allow-list principal rejection, overlapping allow-list principal rejection, and valid complete membership graph verification.
   - Includes 12 tests in `role-model.db.test.ts` verifying dedicated non-superuser logins, controlled role switching (`WITH INHERIT FALSE, SET TRUE`), cross-role assumption prohibitions, non-superuser migration execution, object ownership, privilege isolation, default ACLs, and bootstrap idempotency and database isolation with exact configured logins.
   - Includes 12 tests in `immutability.db.test.ts` (4 immutability triggers, 4 purge/cascade guards, and 4 deterministic two-connection concurrency race tests).
   - Includes 11 tests in `audit-writer.db.test.ts` (persisting audit events, rejecting invalid actor kinds, unknown action codes, invalid entity types, disallowed detail keys, PII keys, non-primitive detail values, verifying app writer permissions, blocking direct INSERT, rejecting unauthorized actions at DB level, and demonstrating value sanitization responsibility).
   - Includes 7 tests in `schema.db.test.ts` (seven domain tables, app_users constraints, business_cases length bounds, case_revisions uniqueness, evidence_items checks, least-privilege matrix, future function default ACLs).
   - Includes 5 tests in `foreign-keys.db.test.ts` and 7 tests in `migration.db.test.ts` (including transactional rollback, modified checksum, unexpected version, advisory lock release on failure, and credential sanitization).
   - `scripts/run-db-tests.mjs`: Automated local runner that provisions an ephemeral PostgreSQL cluster on port 5433 when `DATABASE_URL` is omitted, running tests and cleaning up.
   - Isolated unit test suite (`pnpm test` and `pnpm test:coverage`): 45 test files, 697 unit tests passing with zero database calls. Total test inventory: 782 tests (697 unit + 85 database integration).
   - CI pipeline: `.github/workflows/ci.yml` with dedicated PostgreSQL 16 service container.

---

## 2. Test Inventory & Count Reconciliation

- **Active Unit Tests:** Exactly 697 tests across 45 test files.
- **Active Database Tests:** Exactly 85 tests across 7 test files.
- **Total Active Tests:** Exactly 782 passing tests.

### Database Test Count Reconciliation (Previous 71 -> 75 -> 83 -> Current 85 & File Count Breakdown)

A detailed reconciliation of the physical `it()` test blocks across all 7 database test files explains the inventory counts:

| Test File                 | Previous Documented Count | Baseline `it()` Count | Step-10 Initial Correction `it()` Count | Final Required-Membership `it()` Count | Current Audit-Verified `it()` Count | Difference / Explanation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| :------------------------ | :-----------------------: | :-------------------: | :-------------------------------------: | :------------------------------------: | :---------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role-drift.db.test.ts`   |            19             |          19           |                   23                    |                   31                   |                 31                  | **+12 tests added total** (+4 earlier for exact-name prefix rejection & NOLOGIN rejection; **+8 added in final verification**: missing `migrator_login`, missing `app_login`, missing `purge_login`, revoked direct membership, wrong functional role, duplicate login in allow-list, overlapping login across allow-lists, and intact valid membership graph).                                                                                                                                                                   |
| `role-model.db.test.ts`   |            12             |          12           |                   12                    |                   12                   |                 12                  | **Unchanged**: 12 tests verifying non-superuser migration execution, controlled role assumption, object ownership, privilege limits, default ACLs, and database isolation.                                                                                                                                                                                                                                                                                                                                                        |
| `immutability.db.test.ts` |             4             |          12           |                   12                    |                   12                   |                 12                  | **Count reconciliation (+8)**: Earlier documentation cited "4 tests" by referencing only the 4 core immutability triggers (case revisions, calculation runs, audit log, rule packs). The file has always contained 12 `it()` blocks: 4 trigger tests + 4 purge/cascade guard tests (app DELETE guards, purge execution, role switch denial, active-case user cascade guard) + 4 deterministic two-connection concurrency race tests. Zero tests were added or removed.                                                            |
| `audit-writer.db.test.ts` |             2             |          11           |                   11                    |                   11                   |                 11                  | **Count reconciliation (+9)**: Earlier documentation summarized the file into 2 functional bullet points ("valid writes & validation" and "direct INSERT block & value sanitization boundary"). The file has always contained 11 discrete `it()` blocks covering actor kinds, action registry, entity types, detail key allow-lists, PII key patterns, scalar types, application writer permissions, direct INSERT revoking, database write function checks, and value sanitization boundaries. Zero tests were added or removed. |
| `schema.db.test.ts`       |            24             |           7           |                    7                    |                   7                    |                  7                  | **Count reconciliation (-17)**: The earlier count of 24 reflected the total sub-assertions / checks across the 7 table and privilege matrix tests (including the $7 \text{ tables} \times 3 \text{ roles} = 21$ privilege assertions in the least-privilege matrix). The physical `it()` block count is 7. Notably, $(12 - 4) + (11 - 2) = 17$, exactly balancing the $-17$ difference, with the combined sum of these three files remaining invariant at $12 + 11 + 7 = 30$ tests. Zero assertions were lost.                    |
| `foreign-keys.db.test.ts` |             5             |           5           |                    5                    |                   5                    |                  5                  | **Unchanged**: exactly 5 foreign-key and integrity tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `migration.db.test.ts`    |             5             |           5           |                    5                    |                   5                    |                  7                  | **+2 tests added during security audit**: verified advisory lock release on migration transaction failure, and verified comprehensive credential sanitization across URIs, quoted pairs, unquoted pairs, and JSON payloads.                                                                                                                                                                                                                                                                                                       |
| **Total**                 |          **71**           |        **71**         |                 **75**                  |                 **83**                 |               **85**                | **Exact match**: 71 baseline + 12 role-drift regression/membership tests + 2 migration audit tests = **85 tests**.                                                                                                                                                                                                                                                                                                                                                                                                                |

### Unit Test Count Reconciliation (694 vs 697 vs 701)

- STEP-008 baseline (`9c80b7b`): 655 unit tests across 42 test files.
- STEP-009 differential reference tests added 39 tests across 3 files ($655 + 39 = 694$ tests across 45 test files), documented as 694 in `step-09-differential-reference-check.md`.
- STEP-009 mutation testing hardening added 3 post-baseline regression tests in `packages/calc-engine` (2 in `scenario-calc.test.ts` and 1 in `sensitivity-calc.test.ts`), resulting in $694 + 3 = 697$ active unit tests.
- The number 701 recorded in `docs/DESIGN.md` was an inaccurate transcription calculation ($697 + 4 = 701$).
- Exactly 697 unit tests pass with zero database calls; zero tests have been removed, bypassed, or skipped.

---

## 3. Environment & Compatibility Matrix

- **PostgreSQL 18.6 (Local):** Verified passing (83/83 database tests green on local ephemeral cluster).
- **PostgreSQL 16 (CI / Remote):** **UNVERIFIED**. The implementation remains uncommitted and untracked in the local working directory. Remote CI has not run with these changes, and no remote workflow run exists for this commit. Compatibility with PostgreSQL 16 is explicitly unverified until a remote CI run is executed.

---

## 4. Manifest of Files Created & Modified

- **Untracked Created Files (25):**

  1. `learning/implementation/step-10-database-foundation.md`
  2. `learning/interviews/step-10-database-foundation.md`
  3. `learning/notes/step-10-database-foundation.md`
  4. `packages/persistence/migrations/001_initial_schema.sql`
  5. `packages/persistence/scripts/bootstrap.sql`
  6. `packages/persistence/src/audit/audit-writer.ts`
  7. `packages/persistence/src/audit/types.ts`
  8. `packages/persistence/src/db/pool.ts`
  9. `packages/persistence/src/db/types.ts`
  10. `packages/persistence/src/migrations/bootstrap.ts`
  11. `packages/persistence/src/migrations/cli.ts`
  12. `packages/persistence/src/migrations/runner.ts`
  13. `packages/persistence/src/migrations/types.ts`
  14. `prompts/step-10.md`
  15. `scripts/db-migrate.mjs`
  16. `scripts/run-db-tests.mjs`
  17. `tests/db/audit-writer.db.test.ts`
  18. `tests/db/foreign-keys.db.test.ts`
  19. `tests/db/immutability.db.test.ts`
  20. `tests/db/migration.db.test.ts`
  21. `tests/db/role-drift.db.test.ts`
  22. `tests/db/role-model.db.test.ts`
  23. `tests/db/schema.db.test.ts`
  24. `tests/db/test-helper.ts`
  25. `vitest.db.config.ts`

- **Tracked Modified Files (11):**
  1. `.github/workflows/ci.yml`
  2. `docs/DESIGN.md`
  3. `docs/architecture/05-component-responsibilities.md`
  4. `docs/architecture/06-database-architecture-and-schema.md`
  5. `docs/architecture/14-local-development.md`
  6. `docs/architecture/18-architecture-decision-records.md`
  7. `package.json`
  8. `packages/persistence/package.json`
  9. `packages/persistence/src/index.ts`
  10. `pnpm-lock.yaml`
  11. `vitest.config.ts`
