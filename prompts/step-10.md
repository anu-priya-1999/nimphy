# Nimphy STEP-010 — Database Foundation

## Role

Senior PostgreSQL and TypeScript infrastructure engineer implementing STEP-010 in the Nimphy monorepo.

Following `AGENTS.md`, the authoritative roadmap, database architecture, security requirements, and Definition of Done.

The repository owner has authorized preparation and execution of STEP-010. Implement STEP-010 only. Do not anticipate STEP-011 or later steps.

---

## Authoritative Scope

`docs/architecture/17-implementation-roadmap.md` — STEP-010 Database Foundation.

1. Local PostgreSQL setup.
2. Migration tool chosen through ADR-015: Option A (Numbered plain-SQL migration files with lightweight Node.js runner using `pg`).
3. Migration 001.
4. Exactly seven domain tables:
   - `app_users`
   - `business_cases`
   - `case_revisions`
   - `evidence_items`
   - `rule_packs`
   - `calculation_runs`
   - `audit_log`
5. Immutability triggers and database privileges (`nimphy_app`, `nimphy_purge`).
6. A dedicated purge role/path via security-definer procedures.
7. The `audit_log` allow-list writer.
8. Real PostgreSQL migration, constraint, and immutability tests.
9. CI database-test execution.
10. Updates to documents 05, 06, 14, 18, and `DESIGN.md`.

---

## Owner Decisions & Adjustments

1. **ADR-015 Approved:** Option A (numbered, forward-only plain-SQL migrations with a lightweight Node.js migration runner using the `pg` driver). Drizzle comparison corrected: Drizzle supports partial indexes and migrations; plain SQL selected because it provides one authoritative schema, explicit PostgreSQL-specific DDL, and fewer unnecessary dependencies.
2. **Reconciliation:** Document 05 M-09 aligned with Document 06 §10 forward-only strategy. Transactional rollback on migration failure; disposable databases for test cleanup.
3. **Driver Version Verification:** Verified Node.js 24 compatibility; pinned `pg@8.23.1` and `@types/pg@8.23.1`.
4. **Credential Separation:** Database role provisioning separated from application runtime credentials. No passwords in migrations or Git.
5. **Exact Table Count:** Exactly seven domain tables. No future tables (`memos`, `orders`, etc.) or use-cases.
6. **No Scope Creep:** STEP-011 (Identity and Sessions) strictly unauthorized.

---

## Residual Acceptance Checks (STEP-010 Residuals)

The security audit reports SEC-010-01 through SEC-010-06 resolved. Perform only the following remaining verification. Inspect actual files and SQL; do not rely on the previous report.

### 1. Purge concurrency — highest priority

Inspect both `nimphy_purge_app_user` and `nimphy_purge_business_case`.
Determine whether the eligibility checks and subsequent deletes are safe against concurrent transactions.
Specifically test:

- A new active case being inserted while an account purge is running.
- A pending-deletion case being changed to active while an account purge is running.
- A pending-deletion case being changed to active while an individual case purge is running.
  If necessary, lock the parent row and relevant child rows before checking lifecycle status. Use a consistent lock order and ensure the checks see the post-lock row state.
  Add deterministic, real PostgreSQL two-connection integration tests. Verify that no active or archived case can be removed through a concurrent purge race.

### 2. Migration-role provisioning

Inspect the actual role creation statements, role memberships, migration runner, and local/CI setup.
Document:

- Which login role executes migrations.
- How it obtains the `nimphy_migrator` privileges.
- Which actor provisions cluster-level roles.
- Whether the migration process requires `CREATEROLE` or superuser privileges.
- How schema ownership remains separate from application and purge privileges.
  Do not embed credentials or silently rely on a superuser in production. If role provisioning must be separated from migration execution, document the bootstrap procedure and test the effective permissions.

### 3. Audit writer value validation

Inspect the database function and TypeScript writer.
Test sensitive-looking values placed under otherwise allowed detail keys, including email addresses, passwords, tokens, and prompt-like content.
Do not claim complete PII detection from a finite pattern list. Clearly document which values are rejected and which protection remains an application responsibility.
Also verify whether future functions created by subsequent migrations will have appropriate default `EXECUTE` privileges, rather than relying only on revoking privileges from functions already created.

### 4. PostgreSQL 16 evidence

The current implementation is reported as uncommitted and untracked. Do not claim that an ordinary remote GitHub Actions run validated these local changes.
Provide a PostgreSQL 16 result only if the tested run demonstrably included the exact current implementation. Record the workflow run ID, commit SHA, and database test result. Otherwise explicitly leave PostgreSQL 16 compatibility unverified.

### 5. Unit-test count

Reconcile the 694, 697, and previously reported 701 counts.
Use the same test command and equivalent test configuration at the STEP-009 baseline and current working tree. Identify added, removed, excluded, or differently counted tests. Do not edit historical results without evidence.

### 6. Final response

Return:

- Findings and severity.
- Exact source locations and evidence.
- Concurrency test results.
- Migration-role provisioning and effective privilege results.
- PostgreSQL versions actually tested.
- Unit-test count reconciliation.
- Validation commands and results.
- Final Git status.

Make only necessary STEP-010 corrections. Preserve STEP-009. Do not implement STEP-011, stage files, commit, or push.

---

## Final Role-Provisioning Correction and Verification (STEP-010 Acceptance)

The latest residual audit improved purge concurrency and documented audit-log limitations. However, the migration-role design still contains contradictory claims. Resolve this before STEP-010 acceptance.

### 1. Separate cluster bootstrap from schema migrations

- Production design separates cluster bootstrap (DBA provisioning `nimphy_migrator`, `nimphy_app`, `nimphy_purge`, and dedicated migration login) from schema migrations.
- Normal versioned migrations must not require `CREATEROLE` or superuser privileges.
- Removed `CREATE ROLE` and `GRANT ... TO CURRENT_USER` from `001_initial_schema.sql`.
- Put role creation and membership in an explicitly documented bootstrap process (`packages/persistence/scripts/bootstrap.sql`).

### 2. Define the actual migration login flow

- Keep `nimphy_migrator` as `NOLOGIN`.
- Use a dedicated migration login granted membership in `nimphy_migrator`.
- Migration runner connects using migration login, executes `SET ROLE nimphy_migrator`, verifies `current_user = 'nimphy_migrator'`, fails closed if switch or verification fails, applies migrations in transactions with advisory locks.

### 3. Prove the role model without superuser migration execution

- Disposable PostgreSQL test setup with administrative bootstrap, non-superuser migration login, `nimphy_migrator` as `NOLOGIN` owner role, separate application and purge roles.
- Prove migration login has neither superuser nor `CREATEROLE`, switches to `nimphy_migrator`, and executes all migrations.
- Verify ownership of schemas, tables, sequences, functions by `nimphy_migrator`. Verify application and purge roles own no objects. Verify privilege limits and fail-closed behavior.

### 4. Default privilege verification

- Test default ACL under `SET ROLE nimphy_migrator`. Verify `PUBLIC` and `nimphy_app` cannot execute future functions.
- Explain the difference between default privileges configured for a role vs applied when a different `current_user` creates an object.

### 5. Concurrency and documentation accuracy

- Retain the four two-connection purge tests.
- Review lock ordering across mutation and purge paths; narrow the claim that deadlocks are "mathematically prevented".
- Update implementation report, `docs/DESIGN.md`, local development documentation, and learning documents.

### 6. Final verification and restrictions

- Run database integration suite and all standard checks.
- PostgreSQL 16 remains explicitly UNVERIFIED pending remote CI run of uncommitted changes.
- Return required verification evidence. No STEP-011. Do not stage, commit, or push.

---

## Final Bootstrap and Runtime Login Audit (STEP-010 Final Readiness)

### 1. Correct bootstrap database grants

Inspect `packages/persistence/scripts/bootstrap.sql` and `packages/persistence/src/migrations/bootstrap.ts`.
Replace `GRANT CONNECT, CREATE ON DATABASE CURRENT_DATABASE TO nimphy_migrator;` with identifier-safe dynamic SQL using `format('%I', current_database())`.
Execute bootstrap from fresh disposable cluster/database and verify:

- Successful execution.
- `nimphy_migrator` can create required schema and migration metadata.
- Safe idempotency on rerun.
- Isolation: unrelated databases remain untouched.

### 2. Complete the runtime login model

Define and document authentication model for all three services:

- Migration runner: `nimphy_migrator_login` -> `nimphy_migrator` (NOLOGIN).
- Application connection pool: `nimphy_app_login` -> `nimphy_app` (NOLOGIN).
- Purge/lifecycle worker: `nimphy_purge_login` -> `nimphy_purge` (NOLOGIN).
  Explicit membership: `WITH INHERIT FALSE, SET TRUE`.
  Verify each login connects, assumes only its intended role, `current_user` matches, cross-role assumptions are rejected, service roles cannot create/administer other roles, and zero credentials in repository. Document external provisioning contract.

### 3. Test using non-superuser connections

Extend disposable PostgreSQL role-model test connecting independently as each login. Verify table access, purge-function execution, audit-function execution, schema privileges, and prohibited role assumptions.

### 4. Validate default privileges

Confirm routines created under `SET ROLE nimphy_migrator` by the actual non-superuser migration login do not grant execution to PUBLIC or `nimphy_app`.

### 5. Validate complete setup

Run bootstrap on fresh cluster, migration execution using restricted login, all database integration tests, standard unit tests, typecheck, lint, format, documentation, architecture-boundary, and whitespace checks.
Record PostgreSQL versions tested (PostgreSQL 18.6 local; PostgreSQL 16 UNVERIFIED).

---

## Close Bootstrap Role-Drift Verification (STEP-010 Closeout)

### 1. Test pre-existing insecure roles

Before executing bootstrap, deliberately provision the following roles with insecure attributes in disposable PostgreSQL test clusters:

- `nimphy_migrator` with LOGIN.
- `nimphy_migrator` with SUPERUSER.
- `nimphy_app` with CREATEROLE.
- `nimphy_purge` with BYPASSRLS.

Run bootstrap against each configuration.

### 2. Define safe behavior

For existing functional roles, choose one explicit policy:

- Normalize their attributes to the required secure configuration using administrative bootstrap privileges; or
- Fail closed with a clear diagnostic, identifying the role and unexpected attributes.

Do not silently skip existing roles.
Expected functional-role attributes include: NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION.
Do not modify unrelated database roles.

### 3. Audit role memberships

Inspect both membership directions using `pg_auth_members`:

- Functional roles must not inherit unexpected privileged memberships.
- Only the designated service login may assume its corresponding functional role.
- Application and purge roles must not be assumable by unrelated principals.
- Do not silently revoke unrelated memberships. Reject unexpected configurations with a useful diagnostic unless an explicitly authorized normalization policy is defined.

### 4. Add focused integration tests

Test:

- All four insecure attribute cases.
- Unexpected membership cases.
- Successful rerun with correctly provisioned roles.
- Fail-closed or normalization behavior.
- Final `pg_roles` attributes and `pg_auth_members` membership graph.

Use disposable databases only.

### 5. Final response

Provide exact test names and results, final role attributes, membership verification, changed files, and Git status.
Run focused tests first. Run the full suite only after the focused tests pass.
Preserve all existing STEP-009 and STEP-010 work. Do not implement STEP-011, stage, commit, push, or discard changes.

---

## Final Service-Login Membership Audit (STEP-010 Closeout Extension)

Perform one final focused verification of the service login membership graph.
Inspect the bootstrap role-drift audit and `tests/db/role-drift.db.test.ts`.

### 1. Audit the login principals' own memberships

Verify that:

- `nimphy_migrator_login` is a member only of `nimphy_migrator`.
- `nimphy_app_login` is a member only of `nimphy_app`.
- `nimphy_purge_login` is a member only of `nimphy_purge`.
  Reject unexpected direct role memberships, including memberships in intermediate group roles.
  Consider transitive membership paths as well. The strict policy should not allow a service login to acquire additional privileges through another role.

### 2. Test malicious or incorrect configurations

Add disposable-database tests for:

- `nimphy_app_login` granted an unrelated role with `INHERIT TRUE`.
- `nimphy_app_login` granted an unrelated role with `SET TRUE`.
- An intermediate role that provides a transitive membership path.
- An expected functional membership with `SET FALSE`.
- A service login with `CREATEROLE`, `CREATEDB`, `SUPERUSER`, or `BYPASSRLS`.
  Bootstrap should fail closed with useful diagnostics. Do not silently modify unrelated roles or memberships.

### 3. Verify the exact legitimate membership graph

Verify that the three designated login principals retain only their intended functional membership, with:

- `ADMIN FALSE`
- `INHERIT FALSE`
- `SET TRUE`
  Do not permit the migration login to assume the app or purge role, or vice versa.

### 4. Validation and output

Run the focused role-drift and role-model tests first. Run the full suite if corrections are made.
Return exact test results, final role attributes, membership graph, changed files, and Git status.
Keep PostgreSQL 16 marked UNVERIFIED unless tested against this exact implementation.
Preserve STEP-009 and STEP-010. Do not implement STEP-011, stage, commit, or push.

---

## Final Exact Login Allow-List Correction (STEP-010 Acceptance)

The latest membership audit is substantially improved, but the actual bootstrap SQL still uses prefix-based login matching.
Resolve this before STEP-010 acceptance.

### 1. Remove prefix-based login authorization

Inspect `packages/persistence/scripts/bootstrap.sql` and `packages/persistence/src/migrations/bootstrap.ts`.
Remove all authorization conditions using:

- `LIKE 'nimphy_migrator_login%'`
- `LIKE 'nimphy_app_login%'`
- `LIKE 'nimphy_purge_login%'`
  Use an exact, explicit allow-list of login principals.
  If test environments need generated role names, pass their exact login names through bootstrap configuration. Do not weaken production authorization with name-prefix matching.
  Apply the exact allow-list consistently to:
- Functional-role membership validation.
- Service-login attribute validation.
- Recursive direct and transitive membership auditing.
- `SET` and `INHERIT` option verification.
  Retain the explicitly approved administrative bootstrap-session exception where required.

### 2. Verify actual login attributes

For every designated service login, require:

- `rolcanlogin = true`
- `rolsuper = false`
- `rolcreatedb = false`
- `rolcreaterole = false`
- `rolbypassrls = false`
- `rolreplication = false`
  Reject violations with clear diagnostics.
  Retain the exact intended functional membership:
- `nimphy_migrator_login` → `nimphy_migrator`
- `nimphy_app_login` → `nimphy_app`
- `nimphy_purge_login` → `nimphy_purge`
  Require `admin_option = false`, `inherit_option = false`, and `set_option = true`.

### 3. Add regression tests

Use disposable PostgreSQL databases to prove:

- A role named `nimphy_app_login_attacker` cannot assume `nimphy_app`.
- A role named `nimphy_migrator_login_extra` cannot assume `nimphy_migrator`.
- A role named `nimphy_purge_login_test` cannot assume `nimphy_purge`.
- A designated login with `NOLOGIN` is rejected.
- Each exact authorized login can still assume its intended functional role.
- Existing transitive-membership tests continue to pass.
  Do not silently grant, revoke, or modify unrelated roles.

### 4. Reconcile test inventory

Compare the current database test inventory with the previous 71-test inventory.
Explain why the counts changed between:

- `immutability.db.test.ts`
- `schema.db.test.ts`
- `foreign-keys.db.test.ts`
- `audit-writer.db.test.ts`
  Identify tests that were moved, renamed, combined, or removed. Confirm that no meaningful assertions were lost.

### 5. Final validation

Run the focused role-drift and role-model tests first.
Then run the complete database and standard suites, together with:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm docs:check`
- `pnpm boundaries:check`
- `git diff --check`
  Report exact commands and final successful output. PostgreSQL 16 remains UNVERIFIED until actually tested against this implementation.
  Preserve STEP-009 and all STEP-010 work. Do not implement STEP-011, stage, commit, push, or discard changes.

---

## Final Required-Membership Verification (STEP-010 Final Acceptance)

The exact login allow-list and recursive membership audit are now implemented. Perform one final focused correction: ensure required service login memberships cannot be missing while bootstrap still succeeds.

### 1. Explicitly require all designated logins to exist

For every configured login in the exact allow-lists:

- Confirm the role exists in `pg_roles`.
- Confirm `rolcanlogin = true`.
- Confirm all prohibited administrative attributes are false.
- Reject empty, duplicate, or overlapping login allow-lists.
- Do not silently omit a configured login.

### 2. Explicitly require the intended direct membership

For every configured login, assert that exactly its intended direct membership exists in `pg_auth_members`:

- `nimphy_migrator_login` → `nimphy_migrator`
- `nimphy_app_login` → `nimphy_app`
- `nimphy_purge_login` → `nimphy_purge`

For generated test principals, use their exact configured names.

Do not accept an indirect membership through an intermediate role.

Require:

- `admin_option = false`
- `inherit_option = false`
- `set_option = true`

The existing unauthorized and transitive membership checks must remain.

### 3. Add regression tests

Using disposable PostgreSQL databases, test:

1. Missing `nimphy_migrator_login`.
2. Missing `nimphy_app_login`.
3. Missing `nimphy_purge_login`.
4. Existing login with its required functional-role membership revoked.
5. Existing login connected to the wrong functional role.
6. Duplicate or overlapping configured login names.
7. Correct complete membership graph still passes.
8. All current exact-name, administrative-attribute, and transitive-membership tests still pass.

Each invalid configuration must fail closed with a useful diagnostic.

### 4. Final verification

Run focused role-drift and role-model tests, then the full database and unit test suites and all standard quality checks.

Reconcile the test inventory with the documented 75 database tests and 697 unit tests.

Keep PostgreSQL 16 UNVERIFIED unless an actual run against the exact implementation exists.

Return changed files, exact test results, final role and membership verification, and Git status.

Preserve all STEP-009 and STEP-010 work. Do not implement STEP-011, stage, commit, push, or discard changes.
