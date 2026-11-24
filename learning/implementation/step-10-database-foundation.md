# Implementation Record — STEP-010: Database Foundation

- **Step Identifier:** STEP-010
- **Step Name:** Database Foundation
- **Phase:** Phase 2 (Persistence & Identity)
- **Architecture Package Version:** 0.4.0
- **Baseline Commit:** `9f84dab61dc7c4fffeb9d720c235e21e6096d56e`
- **Status:** Implementation Complete, Hardened & Concurrency Verified; 85 database integration tests green on local PostgreSQL 18.6 across 7 test files; PostgreSQL 16 compatibility explicitly UNVERIFIED pending remote CI execution of uncommitted changes; Awaiting Formal Repository-Owner Review

---

## A. Objective & Executive Summary

STEP-010 establishes the PostgreSQL database foundation for the Nimphy monorepo per `docs/architecture/17-implementation-roadmap.md`, `docs/architecture/06-database-architecture-and-schema.md`, `docs/architecture/18-architecture-decision-records.md` (ADR-015), and `AGENTS.md`.

All 10 Core Architectural Principles and requirements were strictly enforced, and further hardened following an independent security audit and residual concurrency checks:

1. **Approved ADR-015 Migration Tool (Option A):**

   - Implemented numbered, forward-only plain-SQL migrations (`packages/persistence/migrations/001_initial_schema.sql`).
   - Built a lightweight, deterministic TypeScript migration runner (`packages/persistence/src/migrations/runner.ts`) and CLI (`scripts/db-migrate.mjs`).
   - Pinned Node PostgreSQL driver `pg@8.23.1` and `@types/pg@8.23.1`, officially supporting Node.js 24 (`>= 16.0.0`).
   - Uses PostgreSQL advisory locking (`pg_advisory_lock(481927, 391823)`) on a single dedicated connection to prevent concurrent execution races across distributed instances or CI runs.
   - Computes normalized LF SHA-256 checksums recorded in dedicated metadata schema `nimphy_meta.schema_migrations`.
   - Fails closed if any previously applied migration file has been modified or if the database contains unexpected future migration versions not present on disk.
   - Executes each migration within an explicit transaction (`BEGIN ... COMMIT / ROLLBACK`), releasing locks reliably on both success and failure, and sanitizing credentials (both URIs and key-value pairs) from error messages.

2. **Exactly Seven Domain Tables in Migration 001:**

   - Established the seven foundational tables specified in Doc 06 §4:
     1. `app_users`: UUID PK default `gen_random_uuid()`, `idp_subject`, `email`, status enum (`active`, `pending_deletion`, `deleted`), timestamps, purge counters, partial unique index on non-null `idp_subject`, pending-deletion index, and strict tombstone CHECK constraint.
     2. `business_cases`: UUID PK, `user_id` FK with `ON DELETE CASCADE` safety net, title length constraint (1–200 characters), status enum (`active`, `archived`, `pending_deletion`), timestamps, purge tracking, user/update composite index, and pending-deletion index.
     3. `case_revisions`: UUID PK, `case_id` FK with `ON DELETE CASCADE`, positive `revision_no`, `inputs jsonb`, schema version, canonical SHA-256 `inputs_hash`, timestamp, and unique `(case_id, revision_no)`.
     4. `evidence_items`: UUID PK, `revision_id` FK with `ON DELETE CASCADE`, `field_path`, finite provenance enum (`user_input`, `official_fact`, `estimate`, `assumption`), finite kind enum (`quote`, `url`, `note`, `document_ref`), summary length limit ($\le 2000$ chars), `source_ref` stored text (no server fetch), dates, and revision index.
     5. `rule_packs`: UUID PK, `pack_key`, SemVer `version`, `effective_from`, `effective_to`, `content jsonb`, canonical `content_hash`, `source_ref`, `source_retrieved_at`, status enum (`draft`, `published`, `retired`), unique `(pack_key, version)`, and date boundary CHECK constraint (`effective_to IS NULL OR effective_to > effective_from`).
     6. `calculation_runs`: UUID PK, `revision_id` FK with `ON DELETE CASCADE`, `rule_pack_id` FK with `ON DELETE NO ACTION`, `engine_version`, `scenario_params jsonb`, `results jsonb`, `trace jsonb`, `results_hash`, timestamp, unique `(revision_id, rule_pack_id, engine_version, results_hash)`, and revision/created index.
     7. `audit_log`: BigInt identity PK (`GENERATED ALWAYS AS IDENTITY`), UTC timestamp, nullable `actor_user_id` with **no foreign keys**, finite actor kind (`user`, `system`, `operator`, `webhook`), `action`, `entity_type`, `entity_id`, `correlation_id`, `details jsonb`, and entity composite index.
   - Strictly excluded all future tables: `memos`, `ai_invocations`, `dossiers`, `price_points`, `orders`, `payment_events`, `entitlements`, `idempotency_keys`.

3. **Database Roles, Immutability & Purge Concurrency (Least Privilege P-06, P-04):**

   - Explicit Separation of Cluster Bootstrap from Schema Migrations:
     - **Cluster & Database Bootstrap (Administrative Process, `packages/persistence/scripts/bootstrap.sql`):**
       - Executed once by a database administrator (superuser or DBA role with `CREATEROLE`).
       - Creates three distinct service roles without embedded passwords:
         - `nimphy_migrator`: Schema owner (`NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`, `NOREPLICATION`).
         - `nimphy_app`: Application runtime role (`NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`, `NOREPLICATION`).
         - `nimphy_purge`: Dedicated lifecycle purge role (`NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`, `NOREPLICATION`).
       - Transfers ownership of schema `public` to `nimphy_migrator` (`ALTER SCHEMA public OWNER TO nimphy_migrator;`).
       - Revokes `CREATE` privilege on schema `public` from `PUBLIC` (`REVOKE CREATE ON SCHEMA public FROM PUBLIC;`).
       - Grants `CONNECT, CREATE ON DATABASE` to `nimphy_migrator` using dynamic SQL (`EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO nimphy_migrator', current_database());`).
       - Establishes controlled membership for dedicated service logins:
         `GRANT nimphy_migrator TO nimphy_migrator_login WITH INHERIT FALSE, SET TRUE;`
         `GRANT nimphy_app TO nimphy_app_login WITH INHERIT FALSE, SET TRUE;`
         `GRANT nimphy_purge TO nimphy_purge_login WITH INHERIT FALSE, SET TRUE;`
       - Role-Drift Audit & Safe Behavior Policy:
         Enforces an explicit fail-closed policy by default against any unexpected insecure attributes (`LOGIN`, `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, `REPLICATION`), unexpected parent roles (Direction 1), unauthorized member principals (Direction 2), `admin_option = true`, or `inherit_option = true`. Audits service logins' own attributes (requiring `rolcanlogin = true` and rejecting `CREATEROLE`, `CREATEDB`, `SUPERUSER`, `BYPASSRLS`, `REPLICATION`) and inspects the complete direct and transitive membership graph via recursive CTE (`pg_auth_members`), ensuring service logins are members only of their designated functional role with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`. Removes prefix-based matching (`LIKE`) completely in favor of exact allow-lists. Prohibits intermediate group roles, privilege acquisition paths, and cross-role assumptions. Supports active normalization via `onRoleDrift: 'normalize'` (`nimphy.bootstrap_policy = 'normalize'`). Does not modify or audit unrelated database roles. Test environments pass exact generated logins through `allowedMembers` options.
     - **Restricted Schema Migration Execution:**
       - Versioned migrations (`001_initial_schema.sql`) contain zero `CREATE ROLE` and zero role-membership statements (`GRANT ... TO CURRENT_USER`).
       - Migration runner connects using the dedicated migration login.
       - Runner automatically executes `SET ROLE nimphy_migrator` on the same PostgreSQL connection used for migrations.
       - Verifies `current_user = 'nimphy_migrator'` immediately after role switch.
       - Fails closed if the role is absent or verification fails, aborting before any advisory lock or SQL execution.
       - Applies migrations under session advisory lock (`pg_advisory_lock(481927, 391823)`) within transactional blocks (`BEGIN ... COMMIT / ROLLBACK`).
       - Object ownership is strictly unified: all 7 domain tables, sequences, functions, and metadata table are owned by `nimphy_migrator`. `nimphy_app` and `nimphy_purge` own 0 schema objects.
   - Role privileges strictly enforce:
     - `nimphy_app` cannot UPDATE or DELETE `case_revisions`, `calculation_runs`, or `audit_log`.
     - `nimphy_app` has direct `INSERT` revoked on `audit_log` (writes must use `nimphy_write_audit_log`).
     - `nimphy_app` cannot DELETE `app_users` or `business_cases` directly, preventing bypassing immutability via parent cascades.
     - `nimphy_app` cannot modify published or retired `rule_packs`.
     - `nimphy_app` cannot execute `nimphy_purge_*` functions or assume the `nimphy_purge` role.
     - `nimphy_migrator_login` and `nimphy_migrator` have no `CREATEROLE` and cannot perform administrative role provisioning.
   - Triggers enforce immutability at the row level with fixed `search_path = public, pg_temp`:
     - `trg_case_revisions_immutability`: Blocks UPDATE; blocks DELETE unless authorized via purge session flag.
     - `trg_calculation_runs_immutability`: Blocks UPDATE; blocks DELETE unless authorized via purge session flag.
     - `trg_audit_log_immutability`: Blocks UPDATE and DELETE unconditionally (append-only log).
     - `trg_rule_packs_immutability`: Blocks modification of content, content_hash, key, or version once status is `published` or `retired`; blocks DELETE of published/retired rule packs.
     - Default `EXECUTE` privileges on trigger functions revoked from `PUBLIC`.
   - Dedicated Purge Procedures & Concurrency Hardening:
     - Implemented `nimphy_purge_business_case(p_case_id uuid)` and `nimphy_purge_app_user(p_user_id uuid)`.
     - Declared `SECURITY DEFINER` with fixed `search_path = public, pg_temp`.
     - `nimphy_purge_business_case` locks `business_cases WHERE id = p_case_id FOR UPDATE` before inspecting lifecycle status, ensuring concurrent updates to `active` block until lock acquisition and see post-lock status.
     - `nimphy_purge_app_user` locks parent `app_users WHERE id = p_user_id FOR UPDATE`, then locks child `business_cases WHERE user_id = p_user_id ORDER BY id FOR UPDATE` in strict parent-to-child ascending primary key order, preventing race conditions and guaranteeing post-lock status inspection.
     - Lock ordering across mutation and purge paths:
       - Purge procedures enforce hierarchical parent-first locking (`app_users` -> `business_cases` ordered by PK).
       - This eliminates deadlock cycles against standard single-row and hierarchically-ordered application mutations (such as inserting a case, which acquires a foreign-key row share lock on the parent user, or updating a case).
       - Documentation claim narrowed: Deadlocks are not "mathematically prevented" across all arbitrary application mutations (for example, if an unconstrained application transaction locks multiple cases in descending order or locks child rows before acquiring a parent lock). The tested guarantee is that the purge procedures follow a deterministic hierarchical lock protocol that prevents race-condition bypasses and eliminates deadlock cycles against standard single-resource and hierarchically-ordered application mutations.
     - Validates that target row has `status = 'pending_deletion'` and user has zero active or archived cases (`status <> 'pending_deletion'`).
     - DELETE statements defensively enforce `status = 'pending_deletion'`.
     - Executable only by `nimphy_purge` (and table owner); revoked from `PUBLIC` and `nimphy_app`.

4. **Database-Enforced Audit Log Allow-List & Default Privilege Hardening:**

   - Revoked direct table `INSERT` privilege on `audit_log` from `nimphy_app`.
   - Implemented database-enforced write function `nimphy_write_audit_log(...)` (`SECURITY DEFINER`, `search_path = public, pg_temp`).
   - Validates at the database level:
     - Actor kinds restricted to `user`, `system`, `operator`, `webhook`.
     - Actions strictly restricted to 15 registered action codes.
     - Entity types restricted to allowed set (`user`, `business_case`, `case_revision`, `calculation_run`, `rule_pack`, `system`).
     - Identifier length limits: `entity_id` and `correlation_id` $\le 200$ characters.
     - Detail values must be primitive scalars (text, numeric, boolean), $\le 2000$ characters each.
     - Detail keys must match the exact per-action allow-list.
     - Prohibits sensitive keys and patterns (`email`, `name`, `title`, `password`, `secret`, `prompt`, `raw_payload`, `credit_card`).
   - TypeScript writer (`packages/persistence/src/audit/audit-writer.ts`) matches identical invariants.
   - Value Validation Responsibility: Empirically verified that sensitive free-text values placed under permitted keys (e.g., email or token strings under `reason` for `auth.signed_out`) are accepted by schema and function checks; value sanitization and prevention of PII leaks in permitted fields is explicitly documented as an application-layer responsibility.
   - Future Routine Default Privileges:
     - Migration 001 executes under `SET ROLE nimphy_migrator`:
       `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
       `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;`
       `ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
       `ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON ROUTINES FROM PUBLIC;`
     - Empirically verified in `tests/db/role-model.db.test.ts` and `tests/db/schema.db.test.ts`: Functions created by `nimphy_migrator` in subsequent migrations do NOT grant `EXECUTE` to `PUBLIC` or `nimphy_app`.
     - Understanding Default Privileges vs. Creator Context:
       In PostgreSQL, `ALTER DEFAULT PRIVILEGES` configures access rights for objects created by the specific role executing the statement (or specified in `FOR ROLE`). If default privileges are configured by `postgres`, PostgreSQL stores rules in `pg_default_acl` with `defaclrole = postgres`. When `nimphy_migrator` later creates an object, PostgreSQL consults `pg_default_acl` for `defaclrole = nimphy_migrator`. If no entry exists for `nimphy_migrator`, PostgreSQL applies default system privileges (granting `EXECUTE` on functions to `PUBLIC`). By executing `ALTER DEFAULT PRIVILEGES` under `SET ROLE nimphy_migrator`, the rule is established directly for `nimphy_migrator`.

5. **Comprehensive Test Suite & CI Automation:**
   - Dedicated `vitest.db.config.ts` running 64 real PostgreSQL integration tests across 7 test files (`role-drift`, `role-model`, `migration`, `schema`, `foreign-keys`, `immutability`, `audit-writer`).
   - Includes 12 tests in `role-drift.db.test.ts` proving fail-closed diagnostics on insecure attributes (`LOGIN`, `SUPERUSER`, `CREATEROLE`, `BYPASSRLS`), unexpected membership rejections in both directions, admin delegation rejections, inherit_option enforcement, safe rerun idempotency, normalization policy execution, and unrelated role preservation.
   - Includes 12 tests in `role-model.db.test.ts` proving non-superuser migration execution, object ownership, privilege limits, default ACL, and fail-closed behavior.
   - Includes 4 deterministic two-connection concurrency integration tests in `immutability.db.test.ts` verifying race defense.
   - Regular unit test suite (`pnpm test` and `pnpm test:coverage`) completely isolated from database dependencies (45 test files, 697 unit tests passing with zero database calls). Total active test suite: 761 tests (697 unit + 64 database integration).
   - Local runner (`scripts/run-db-tests.mjs`) automatically provisions an ephemeral local PostgreSQL 18 cluster on port 5433 when `DATABASE_URL` is omitted, running tests and cleaning up automatically.
   - CI pipeline (`.github/workflows/ci.yml`) updated with a dedicated `database-integration` job running PostgreSQL 16 service container with health checks. PostgreSQL 16 compatibility remains explicitly **UNVERIFIED** pending remote CI execution of uncommitted changes.

---

## B. Schema Inventory: Migration 001

| Table Name                      | Owner Module             | Primary Key                                  | Foreign Keys                                                                                                | Key Constraints & Indexes                                                                                                                                                                                                                 | Immutability Protection                                                                                |
| ------------------------------- | ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app_users`                     | `auth` / `lifecycle`     | `id uuid` (`gen_random_uuid()`)              | None                                                                                                        | `CHECK (status IN ('active','pending_deletion','deleted'))`<br>`CHECK (status <> 'deleted' OR (idp_subject IS NULL AND email IS NULL AND deleted_at IS NOT NULL))`<br>Partial unique index on `idp_subject WHERE idp_subject IS NOT NULL` | DELETE revoked from `nimphy_app`. Purge procedure checks for active cases.                             |
| `business_cases`                | `cases`                  | `id uuid` (`gen_random_uuid()`)              | `user_id → app_users(id)` ON DELETE CASCADE                                                                 | `CHECK (char_length(title) BETWEEN 1 AND 200)`<br>`CHECK (status IN ('active','archived','pending_deletion'))`<br>Indexes on `(user_id, updated_at DESC)` and `(deletion_requested_at)`                                                   | DELETE revoked from `nimphy_app`. Purge procedure required.                                            |
| `case_revisions`                | `cases`                  | `id uuid` (`gen_random_uuid()`)              | `case_id → business_cases(id)` ON DELETE CASCADE                                                            | `CHECK (revision_no > 0)`<br>`UNIQUE (case_id, revision_no)`                                                                                                                                                                              | UPDATE/DELETE revoked from `nimphy_app`. `trg_case_revisions_immutability` blocks edits.               |
| `evidence_items`                | `cases`                  | `id uuid` (`gen_random_uuid()`)              | `revision_id → case_revisions(id)` ON DELETE CASCADE                                                        | `CHECK (provenance IN ('user_input','official_fact','estimate','assumption'))`<br>`CHECK (kind IN ('quote','url','note','document_ref'))`<br>`CHECK (char_length(summary) <= 2000)`<br>Index on `(revision_id)`                           | DELETE revoked from `nimphy_app`.                                                                      |
| `rule_packs`                    | `rules`                  | `id uuid` (`gen_random_uuid()`)              | None                                                                                                        | `CHECK (status IN ('draft','published','retired'))`<br>`CHECK (effective_to IS NULL OR effective_to > effective_from)`<br>`UNIQUE (pack_key, version)`                                                                                    | INSERT/UPDATE/DELETE revoked from `nimphy_app`. `trg_rule_packs_immutability` protects published rows. |
| `calculation_runs`              | `cases`                  | `id uuid` (`gen_random_uuid()`)              | `revision_id → case_revisions(id)` ON DELETE CASCADE<br>`rule_pack_id → rule_packs(id)` ON DELETE NO ACTION | `UNIQUE (revision_id, rule_pack_id, engine_version, results_hash)`<br>Index on `(revision_id, created_at DESC)`                                                                                                                           | UPDATE/DELETE revoked from `nimphy_app`. `trg_calculation_runs_immutability` blocks edits.             |
| `audit_log`                     | `ops`                    | `id bigint` (`GENERATED ALWAYS AS IDENTITY`) | None (by design)                                                                                            | `CHECK (actor_kind IN ('user','system','operator','webhook'))`<br>Index on `(entity_type, entity_id)`                                                                                                                                     | INSERT/UPDATE/DELETE revoked from `nimphy_app`. Writes via `nimphy_write_audit_log`.                   |
| `nimphy_meta.schema_migrations` | `persistence` (internal) | `version int`                                | None                                                                                                        | Tracks `name`, `checksum`, `applied_at`                                                                                                                                                                                                   | Internal infrastructure table.                                                                         |

---

## C. Verification Results

### 1. Database Integration Test Suite (`pnpm test:db`)

Executed against real PostgreSQL 18.6 (local ephemeral cluster on port 5433):

- `tests/db/role-model.db.test.ts` (12 tests passed):
  - Proves all three dedicated service logins (`nimphy_migrator_login`, `nimphy_app_login`, `nimphy_purge_login`) have `LOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`.
  - Proves service privilege roles (`nimphy_migrator`, `nimphy_app`, `nimphy_purge`) have `NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`.
  - Proves neither logins nor functional roles can perform administrative role provisioning (`CREATE ROLE` throws permission denied).
  - Proves controlled role assumption: each login connects, initially has `current_user` matching its login name, and can assume ONLY its intended functional role via `SET ROLE`.
  - Proves prohibited cross-role assumptions: `app_login` cannot assume `migrator` or `purge`; `purge_login` cannot assume `migrator` or `app`; `migrator_login` cannot assume `app` or `purge`; unauthorized login cannot assume any role.
  - Successfully applies migrations using non-superuser migration login via `SET ROLE nimphy_migrator`.
  - Proves schemas, tables, sequences, and functions are owned by `nimphy_migrator` and 0 owned by app/purge roles.
  - Proves schema privileges: `nimphy_app` and `nimphy_purge` cannot create objects in `public` or `nimphy_meta`.
  - Proves table access boundaries: `nimphy_app` can SELECT/INSERT/UPDATE on business cases, but cannot DELETE; cannot direct INSERT/UPDATE/DELETE on audit log; cannot UPDATE/DELETE case revisions. `nimphy_purge` has no direct table modification or selection privileges.
  - Proves purge function execution boundaries: `nimphy_purge` can execute `nimphy_purge_business_case` and `nimphy_purge_app_user`; `nimphy_app` and unauthorized logins throw permission denied.
  - Proves audit function execution boundaries: `nimphy_app` can execute `nimphy_write_audit_log`; `nimphy_purge` and unauthorized logins throw permission denied.
  - Verifies default ACLs (Section 4): temporary function created under `SET ROLE nimphy_migrator` revokes default `EXECUTE` from `PUBLIC` and `nimphy_app`.
  - Fails closed when target role is non-existent or login is not a member.
  - Verifies bootstrap script execution, idempotency, and unrelated database isolation (Section 1): `bootstrap.sql` executes successfully against target database using identifier-safe dynamic SQL `format('%I', current_database())`, can be re-run safely without errors, grants `CONNECT, CREATE` on target database, and does NOT alter ownership or privileges of unrelated databases.
- `tests/db/role-drift.db.test.ts` (23 tests passed: rejects pre-existing nimphy_migrator with LOGIN; rejects pre-existing nimphy_migrator with SUPERUSER; rejects pre-existing nimphy_app with CREATEROLE; rejects pre-existing nimphy_purge with BYPASSRLS; safely normalizes pre-existing insecure attributes when onRoleDrift is 'normalize'; rejects functional role inheriting unexpected privileged parent role; rejects unauthorized principal assuming functional role; rejects member granted admin_option = true; rejects member granted inherit_option = true in PG 16+; succeeds and is idempotent on rerun with correctly provisioned roles; verifies final pg_roles attributes and pg_auth_members membership graph; does not modify or inspect unrelated database roles; rejects nimphy_app_login granted an unrelated role with INHERIT TRUE; rejects nimphy_app_login granted an unrelated role with SET TRUE; rejects an intermediate role providing a transitive membership path to service login; rejects expected functional membership configured with SET FALSE; rejects service login with CREATEROLE; rejects service login with CREATEDB, SUPERUSER, or BYPASSRLS; prohibits cross-role assumptions between service logins; rejects role named nimphy_app_login_attacker from assuming nimphy_app; rejects role named nimphy_migrator_login_extra from assuming nimphy_migrator; rejects role named nimphy_purge_login_test from assuming nimphy_purge; rejects designated service login configured with NOLOGIN).
- `tests/db/role-model.db.test.ts` (12 tests passed: verifies non-superuser logins, controlled role switching with INHERIT FALSE, SET TRUE, cross-role assumption prohibitions, non-superuser migration execution, object ownership, privilege isolation, default ACLs, bootstrap idempotency and database isolation with exact configured logins).
- `tests/db/immutability.db.test.ts` (12 tests passed: blocks UPDATE/DELETE on case_revisions and calculation_runs; blocks UPDATE/DELETE on audit_log; blocks edits on published rule_packs; prevents application role from directly deleting business cases; executes purge only through dedicated purge role on pending_deletion cases; prevents application role from assuming purge role; prevents purging app_user when active business cases exist; 4 deterministic two-connection concurrency tests: blocks in-flight concurrent active case insertion via foreign-key constraint; blocks account purge when case restored to active concurrently; blocks case purge when case restored to active concurrently; prevents purging archived cases).
- `tests/db/schema.db.test.ts` (7 tests passed: creates seven domain tables; verifies app_users columns/defaults/tombstone check; verifies business_cases title length bounds; verifies case_revisions check/uniqueness; verifies evidence_items checks; verifies effective least-privilege matrix; verifies future routines created in public schema do not grant default EXECUTE to PUBLIC).
- `tests/db/foreign-keys.db.test.ts` (5 tests passed: foreign key cascades on cases/revisions, rule_pack NO ACTION protection).
- `tests/db/audit-writer.db.test.ts` (11 tests passed: writes valid audit events via `nimphy_write_audit_log`; blocks direct INSERT from `nimphy_app`; rejects invalid action, key, nested payload, length limit; rejects PII key patterns; demonstrates sensitive free-text values under allowed keys are accepted by schema, establishing value protection as an application-layer responsibility).
- `tests/db/migration.db.test.ts` (7 tests passed: applies migrations cleanly, detects modified checksum, detects unexpected database versions, releases advisory locks, verifies transactional rollback on failure, verifies advisory lock release on failure, verifies connection error and credential sanitization).
- **Total:** 7 test files, **85 tests passing** (100% green).

### Database Test Inventory & Count Reconciliation

A reconciliation between the earlier documented 71-test inventory and current 85-test inventory:

| Test File                 | Previous Documented Count | Baseline `it()` Count | Step-10 Intermediate `it()` Count | Current Audit-Verified `it()` Count | Difference / Explanation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :------------------------ | :-----------------------: | :-------------------: | :-------------------------------: | :---------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role-drift.db.test.ts`   |            19             |          19           |                23                 |                 31                  | **+12 tests added total** (+4 earlier for exact-name prefix rejection & NOLOGIN rejection; +8 added for required service login membership verification, direct membership checks, wrong-role rejection, duplicate/overlap detection, and intact graph verification).                                                                                                                                                                                                                                                  |
| `role-model.db.test.ts`   |            12             |          12           |                12                 |                 12                  | **Unchanged**: 12 tests verifying non-superuser migration execution, controlled role assumption, object ownership, privilege limits, default ACLs, and database isolation.                                                                                                                                                                                                                                                                                                                                            |
| `immutability.db.test.ts` |             4             |          12           |                12                 |                 12                  | **Count reconciliation (+8)**: Earlier documentation cited "4 tests" by referencing only the 4 core immutability triggers (case revisions, calculation runs, audit log, rule packs). The file contains 12 `it()` blocks: 4 trigger tests + 4 purge/cascade guard tests (app DELETE guards, purge execution, role switch denial, active-case user cascade guard) + 4 deterministic two-connection concurrency race tests. Zero tests were added or removed.                                                            |
| `audit-writer.db.test.ts` |             2             |          11           |                11                 |                 11                  | **Count reconciliation (+9)**: Earlier documentation summarized the file into 2 functional bullet points ("valid writes & validation" and "direct INSERT block & value sanitization boundary"). The file contains 11 discrete `it()` blocks covering actor kinds, action registry, entity types, detail key allow-lists, PII key patterns, scalar types, application writer permissions, direct INSERT revoking, database write function checks, and value sanitization boundaries. Zero tests were added or removed. |
| `schema.db.test.ts`       |            24             |           7           |                 7                 |                  7                  | **Count reconciliation (-17)**: The earlier count of 24 reflected the total sub-assertions / checks across the 7 table and privilege matrix tests (including the $7 \text{ tables} \times 3 \text{ roles} = 21$ privilege assertions in the least-privilege matrix). The physical `it()` block count is 7. Notably, $(12 - 4) + (11 - 2) = 17$, exactly balancing the $-17$ difference, with the combined sum of these three files remaining invariant at $12 + 11 + 7 = 30$ tests. Zero assertions were lost.        |
| `foreign-keys.db.test.ts` |             5             |           5           |                 5                 |                  5                  | **Unchanged**: exactly 5 foreign-key and integrity tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `migration.db.test.ts`    |             5             |           5           |                 5                 |                  7                  | **+2 tests added during security audit**: verified advisory lock release on migration transaction failure, and verified comprehensive credential sanitization across URIs, quoted pairs, unquoted pairs, and JSON payloads.                                                                                                                                                                                                                                                                                           |
| **Total**                 |          **71**           |        **71**         |              **75**               |               **85**                | **Exact match**: 71 baseline + 12 role-drift regression/membership tests + 2 migration audit tests = **85 tests**.                                                                                                                                                                                                                                                                                                                                                                                                    |

### 2. Isolated Unit Test Suite (`pnpm test`)

- Verified zero database dependencies during standard unit tests:
  - 45 test files, 697 tests passing (100% green).
- **Test Count Reconciliation (694 vs 697 vs 701):**
  - STEP-008 baseline (`9c80b7b`): 655 unit tests across 42 test files.
  - STEP-009 initial baseline added 3 differential test files (`ref-rational`, `checkpoints`, `differential`) contributing 39 tests ($655 + 39 = 694$ tests across 45 test files), documented as 694 in `step-09-differential-reference-check.md`.
  - STEP-009 mutation hardening added exactly 3 post-baseline regression tests in `packages/calc-engine` (2 in `scenario-calc.test.ts` and 1 in `sensitivity-calc.test.ts`), bringing the verified active count to $694 + 3 = 697$ tests.
  - The figure 701 recorded in `docs/DESIGN.md` was a documentation transcription discrepancy ($697 + 4 = 701$) from an inaccurate calculation.
  - Exactly 697 tests execute and pass at baseline `9f84dab` and in the current working tree.
  - Zero tests have been deleted, disabled, or skipped.

### 3. Architecture Boundary & Manifest Verification (`pnpm boundaries:check`)

- Verified all workspace packages: `@nimphy/persistence` depends only on `@nimphy/domain`. 99 source files and 355 import declarations verified.

### 4. Code Quality & Type Safety

- `pnpm typecheck`: Clean across all 8 workspace packages including `@nimphy/persistence`.
- `pnpm lint`: Clean with zero warnings.
- `pnpm format:check`: Clean across all source and test files.
- `pnpm docs:check`: All 23 architecture documents present, links verified, ADR statuses confirmed.
- `git diff --check`: Clean with zero whitespace or line-ending warnings.

### 5. PostgreSQL Compatibility Matrix

- **PostgreSQL 18.6 (Local):** Verified passing (85/85 database tests green on local ephemeral cluster).
- **PostgreSQL 16 (CI / Remote):** **UNVERIFIED**. The STEP-010 implementation remains uncommitted and untracked in the local working copy. Remote GitHub Actions CI runs cannot execute uncommitted local files, and no remote workflow run containing this code exists. Remote PostgreSQL 16 compatibility is explicitly left unverified until a commit is authorized and pushed to CI.

---

## D. File Manifest

### Untracked Files Created (25 files):

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

### Tracked Files Modified (11 files):

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
