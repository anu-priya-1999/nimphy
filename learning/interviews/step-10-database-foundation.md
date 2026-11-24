# Technical Interview Preparation — STEP-010: Database Foundation

This document provides senior-level engineering, database architecture, and security explanations of the design, privilege model, and migration infrastructure implemented in Nimphy STEP-010.

---

## 1. Plain SQL Migrations vs. ORM-Integrated Migration Tools

### Q: Why did Nimphy choose numbered plain-SQL migration files with a custom runner over an ORM migration tool like Drizzle or Prisma for ADR-015?

**A:** At this stage of the system lifecycle (Phase 2), plain SQL was chosen based on three foundational architectural principles:

1. **One Authoritative Database Schema:**
   The database schema is the system of record and the ultimate source of truth for constraints, financial auditability, and referential integrity. In ORMs that generate migrations from TypeScript schema definitions (such as Drizzle or Prisma), developers maintain two parallel representations: the TypeScript DSL and the generated SQL. In complex schemas involving PostgreSQL-specific features—such as `SECURITY DEFINER` procedures with fixed `search_path`, fine-grained `GRANT`/`REVOKE` role privileges, custom PL/pgSQL triggers, and partial unique indexes—the ORM schema DSL either requires awkward raw SQL escape hatches or fails to represent the full database state. Plain SQL ensures that the committed SQL file is the single, unambiguous authority.

2. **Avoiding Premature Coupling (P-02 Simplicity First, P-10 Reversibility):**
   In STEP-010, the repository implements database infrastructure, not business use-cases or repositories (which arrive in STEP-012/013). Adopting an ORM migration tool would force premature architectural decisions on query models, relation abstractions, and client connections before repository access patterns are understood. By decoupling the migration runner from data-access libraries, Nimphy preserves total freedom to use plain `pg`, a query builder, or an ORM later without migrating schema tooling.

3. **Dependency Minimization:**
   A custom migration runner requires only a ~150-line TypeScript module and the standard, mature `pg` driver (`pg@8.23.1`), with zero external CLI dependencies, zero code-generation steps, and zero build toolchain churn.

---

## 2. Immutability for Evidence: Defense-in-Depth

### Q: How does Nimphy enforce immutability for case revisions, calculation runs, and audit logs, and why are triggers needed in addition to role privileges?

**A:** In financial and publishing business cases, immutability is an essential requirement (Principle **P-04: Immutability for evidence**). Once an author saves a revision or executes a calculation run, that record must never be altered or surreptitiously deleted.

Nimphy implements **defense-in-depth** across two distinct database layers:

1. **Database Role Privileges (Least Privilege P-06):**

   - The application runtime role (`nimphy_app`) is granted only `SELECT` and `INSERT` on `case_revisions` and `calculation_runs`.
   - On `audit_log`, `nimphy_app` is granted only `SELECT`; direct `INSERT`, `UPDATE`, and `DELETE` are revoked, requiring all writes to route through the privileged `nimphy_write_audit_log` function.
   - `UPDATE` and `DELETE` privileges on all immutable tables are strictly revoked.
   - Any query attempting an update or delete is blocked by PostgreSQL's permission system before query execution starts.

2. **Immutability Triggers (Row-Level Safety Net):**
   - Even if an operator or future migration inadvertently grants `UPDATE` or `DELETE` to an application role, or if a database superuser executes an ad-hoc command, `BEFORE UPDATE OR DELETE` triggers intercept the operation:
     - `trg_audit_log_immutability`: Unconditionally raises an exception on any UPDATE or DELETE attempt.
     - `trg_case_revisions_immutability` & `trg_calculation_runs_immutability`: Unconditionally raise an exception on UPDATE, and raise an exception on DELETE unless a session-local purge flag (`nimphy.allow_purge = 'on'`) is set by an authorized security-definer purge function.
     - `trg_rule_packs_immutability`: Blocks modifications to `content`, `content_hash`, `pack_key`, or `version` once a Rule Pack reaches `published` or `retired` status.
   - All trigger functions explicitly specify `SET search_path = public, pg_temp` and have default `EXECUTE` privileges revoked from `PUBLIC`.

---

## 3. The Parent Cascade Bypass Vulnerability & Purge Safety

### Q: What is the "Parent Cascade Bypass" vulnerability, and how does STEP-010 prevent both direct bypass and accidental cascade deletion of active records?

**A:** In PostgreSQL, foreign keys defined with `ON DELETE CASCADE` allow child rows to be deleted automatically when the parent row is deleted.

**The Vulnerability:**
Suppose `case_revisions` references `business_cases` with `ON DELETE CASCADE`. If the application role (`nimphy_app`) has `DELETE` privilege on `business_cases`, it cannot execute `DELETE FROM case_revisions`, but it _could_ execute `DELETE FROM business_cases WHERE id = $1`. In PostgreSQL, foreign key cascade operations are executed by the database engine with the privileges of the table owner, **not** the querying user. Consequently, if `business_cases` could be deleted by the application role, it would cascade and delete immutable `case_revisions` and `calculation_runs`, bypassing the child table's privilege restrictions!

**Nimphy's Mitigation:**

1. **Revoke DELETE on Parent Tables:** `REVOKE DELETE ON business_cases FROM nimphy_app;` and `REVOKE DELETE ON app_users FROM nimphy_app;`. The application role cannot delete parent rows directly.
2. **Dedicated Purge Path:** Deletion can only occur through the dedicated lifecycle purge procedures (`nimphy_purge_business_case` and `nimphy_purge_app_user`), which are executable only by the dedicated `nimphy_purge` role.
3. **Target Status Validation:** `nimphy_purge_business_case` verifies that `status = 'pending_deletion'` before proceeding.
4. **Active Record Cascade Protection:** In `nimphy_purge_app_user`, before purging an `app_users` record whose status is `pending_deletion`, the procedure explicitly asserts:
   ```sql
   IF EXISTS (SELECT 1 FROM public.business_cases WHERE user_id = p_user_id AND status <> 'pending_deletion') THEN
       RAISE EXCEPTION 'Cannot purge user %: active business cases exist', p_user_id;
   END IF;
   ```
   This prevents an operator or automated purge script from accidentally wiping out active business cases via foreign key cascade when purging a user record.

---

## 4. The Database-Enforced Audit Log Architecture

### Q: Why does `audit_log` have no foreign keys, and why must writes route through a database-enforced function rather than direct application `INSERT`?

**A:**

1. **No Foreign Keys:**
   Audit logs must be append-only and must survive the deletion or anonymization of referenced entities. If `audit_log.actor_user_id` or `audit_log.entity_id` had foreign keys to `app_users` or `business_cases`, deleting or purging a user or case would either be blocked by `ON DELETE RESTRICT` or would destroy audit history with `ON DELETE CASCADE`. Removing foreign keys ensures audit records remain permanent historical facts.

2. **Database-Enforced Write Path (`nimphy_write_audit_log`):**
   If the application role has direct `INSERT` privilege on `audit_log`, a compromised application server or ad-hoc query could insert arbitrary action codes, fabricated timestamps, unvalidated keys, or sensitive PII (emails, passwords, prompts) directly via SQL, bypassing TypeScript allow-lists.

   To provide true defense-in-depth:

   - Direct `INSERT` on `audit_log` is revoked from `nimphy_app`.
   - All audit events must be written via `nimphy_write_audit_log(...)` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`).
   - The database function enforces:
     - Finite actor kinds (`user`, `system`, `operator`, `webhook`).
     - Exactly 15 registered action codes.
     - Allowed entity types (`user`, `business_case`, `case_revision`, `calculation_run`, `rule_pack`, `system`).
     - Length constraints on identifiers (`entity_id` $\le 200$, `correlation_id` $\le 200$).
     - Primitive scalar detail values ($\le 2000$ characters).
     - Action-specific detail key allow-lists.
     - Prohibited key and pattern checks for PII and secrets (`email`, `name`, `password`, `secret`, `prompt`, `raw_payload`, etc.).

---

## 5. Securing `SECURITY DEFINER` Functions in PostgreSQL

### Q: What security risks do `SECURITY DEFINER` functions introduce in PostgreSQL, and how are they hardened in Nimphy?

**A:** A `SECURITY DEFINER` function executes with the privileges of the user that owns the function (typically the superuser or schema owner `nimphy_migrator`), rather than the calling user (`nimphy_app`).

**Risks:**

1. **Search Path Trojan Attack:** If `search_path` is not explicitly pinned, an attacker with `CREATE` privilege on any schema earlier in `search_path` (including `public`) can create trojan tables, functions, or operators that hijack the execution of the privileged function.
2. **Default `PUBLIC` Execution:** By default in PostgreSQL, newly created functions have `EXECUTE` privilege granted to `PUBLIC`. Any authenticated role can call them unless explicitly revoked.
3. **Temporary Schema Hijacking:** If `search_path` does not specify `pg_temp` or places it first, temporary objects created by an untrusted session can override persistent objects.

**Nimphy Hardening:**

1. **Revoke Create from Public:** `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`. Untrusted roles cannot create arbitrary objects in `public`.
2. **Fixed `search_path`:** Every `SECURITY DEFINER` and trigger function is created with `SET search_path = public, pg_temp`. `pg_temp` is explicitly placed last so temporary objects cannot shadow persistent tables.
3. **Explicit Privilege Revocation:** Default `EXECUTE` on all privileged functions is revoked from `PUBLIC` (`REVOKE ALL ON FUNCTION ... FROM PUBLIC;`).
4. **Least-Privilege Role Grant:** Only the dedicated role (`nimphy_purge` for purge functions, `nimphy_app` for `nimphy_write_audit_log`) is granted `EXECUTE`.

---

## 6. Migration Runner Security & Integrity Checks

### Q: How does Nimphy's migration runner guarantee transactional safety, prevent concurrency races, and detect database tampering?

**A:**

1. **Single Connection Advisory Locking:** The runner checks out a dedicated client from the pool and acquires `pg_advisory_lock(481927, 391823)` _before_ inspecting schema state. The lock is held on the exact same client across all migrations and released in a `finally` block on both success and failure.
2. **Transactional DDL:** PostgreSQL supports transactional DDL. Each migration file is wrapped in an explicit `BEGIN ... COMMIT` block. If any statement fails, PostgreSQL rolls back all changes cleanly and records nothing in `nimphy_meta.schema_migrations`.
3. **CRLF-to-LF Checksum Validation:** Migration files are hashed using SHA-256 after normalizing CRLF line endings to LF. If an already-applied migration file is modified on disk, the runner fails closed before executing any new migrations.
4. **Unexpected Database Version Check:** The runner validates that every version recorded in `nimphy_meta.schema_migrations` corresponds to a recognized local migration file. If the database contains an unexpected or future migration version, the runner fails closed immediately.
5. **Credential Sanitization:** All error messages produced during migration or connection establishment are sanitized with regex scrapers to prevent leaking database passwords (both URI credentials and key-value connection parameters) into logs.

---

## 7. Purge Concurrency, Row-Level Locking & Race Condition Prevention

### Q: How does Nimphy prevent race conditions where an active business case could be purged by a concurrent transaction, and are deadlocks prevented?

**A:** In PostgreSQL's default Read Committed isolation level, ordinary `SELECT` statements read snapshots without row locks. Without explicit locking:

1. **Race 1 (Concurrent Case Insertion):** If an account purge checks for active cases, finds none, and a concurrent transaction commits a new active case before the purge issues `DELETE FROM app_users`, the parent cascade delete would silently destroy the newly inserted active case.
2. **Race 2 (Concurrent Case Restoration to Active during Account Purge):** If an account purge verifies that an existing case is in `pending_deletion` and a concurrent transaction updates it to `active`, the subsequent `DELETE FROM app_users` cascades and removes the active case.
3. **Race 3 (Concurrent Case Restoration during Individual Case Purge):** If `nimphy_purge_business_case` reads status as `pending_deletion` and a concurrent transaction updates the case to `active`, a simple `DELETE FROM business_cases WHERE id = $1` would delete the updated active case.

**Nimphy Hardening:**

1. **Deterministic Row Locking Order:**
   - In `nimphy_purge_app_user`: The procedure locks the parent user row first:
     ```sql
     SELECT status INTO v_status FROM public.app_users WHERE id = p_user_id FOR UPDATE;
     ```
     Next, it locks all existing business cases of that user in deterministic primary key order:
     ```sql
     PERFORM 1 FROM public.business_cases WHERE user_id = p_user_id ORDER BY id FOR UPDATE;
     ```
   - In `nimphy_purge_business_case`: The procedure locks the target case row:
     ```sql
     SELECT status INTO v_status FROM public.business_cases WHERE id = p_case_id FOR UPDATE;
     ```
2. **Post-Lock Status Inspection:**
   Under Read Committed isolation, if another transaction is currently modifying a row, `FOR UPDATE` blocks until that transaction commits or rolls back. Once unblocked, `FOR UPDATE` re-fetches the committed post-lock row state. The procedure's subsequent lifecycle checks (`status = 'pending_deletion'` and `NOT EXISTS (... status <> 'pending_deletion')`) inspect the fresh committed data, raising an exception (`P0001`) if any case was restored to `active` or `archived`.
3. **Foreign Key Lock Conflict on Insert:**
   When a concurrent transaction attempts to insert a case for a user, PostgreSQL's foreign key check requests a `FOR KEY SHARE` lock on the referenced `app_users` row. Because `nimphy_purge_app_user` holds `FOR UPDATE` on that row, the `INSERT` blocks until the purge transaction commits. When the purge commits (deleting the user), the `INSERT` unblocks and immediately fails with a `foreign_key_violation` (`23503`), preventing any active case from ever being created or purged under a deleted user.
4. **Defensive Deletes:** Both procedures append `AND status = 'pending_deletion'` to their final `DELETE` statements as an extra defense-in-depth guarantee.
5. **Deadlock Assessment:**
   - Are deadlocks "mathematically prevented"? No; claiming mathematical prevention across all possible scenarios is an overstatement.
   - The tested guarantee is that purge procedures follow a strict hierarchical lock protocol (parent `app_users` before child `business_cases`, and child cases sorted by `id ASC`). This eliminates circular wait conditions between purge transactions and standard single-row application mutations (such as single-case insertion or single-case status update).
   - However, deadlocks could still occur if an unconstrained application transaction locks multiple cases in descending order or acquires locks on child rows before locking the parent user row. Application use-case design must adhere to the same lock ordering principles established in Doc 06 §7.

---

## 8. Migration-Role Provisioning & Privilege Separation

### Q: How are PostgreSQL cluster-level roles provisioned, and how does the migration runner execute without superuser privileges?

**A:**

1. **Separation of Cluster Bootstrap from Schema Migrations:**
   - In production, cluster-level roles (`nimphy_migrator`, `nimphy_app`, `nimphy_purge`) are provisioned once by an administrative user (DBA or infrastructure automation script) using `packages/persistence/scripts/bootstrap.sql`.
   - All three service roles are configured with `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`.
   - Schema `public` ownership is transferred to `nimphy_migrator`, and `CREATE ON SCHEMA public` is revoked from `PUBLIC`.
   - `nimphy_migrator` is granted `CONNECT, CREATE ON DATABASE` to allow creating metadata schemas (`nimphy_meta`).
   - A dedicated migration login role (e.g. `nimphy_migrator_login`) is created with `LOGIN` (and password in production) and granted membership in `nimphy_migrator`. It does NOT have `SUPERUSER` or `CREATEROLE` privileges.
2. **Actual Migration Login Flow:**
   - Versioned migrations (`001_initial_schema.sql`) contain zero `CREATE ROLE` statements and zero role-membership assignments (`GRANT ... TO CURRENT_USER`).
   - The migration runner connects using the dedicated migration login credentials.
   - On that same checked-out connection, the runner executes `SET ROLE nimphy_migrator;`.
   - The runner executes `SELECT current_user;` and verifies it equals `'nimphy_migrator'`. If role assumption or verification fails, it fails closed immediately before executing advisory locks or migrations.
   - The runner acquires `pg_advisory_lock` on the connection and applies pending migrations inside individual transactional blocks (`BEGIN ... COMMIT / ROLLBACK`).
   - On completion or failure, the advisory lock is unlocked, `RESET ROLE;` is executed, and the client connection is released.
3. **Privilege Matrix & Ownership:**
   - `nimphy_migrator`: Owns all schema objects (tables, sequences, functions, schemas). Cannot create or alter cluster roles.
   - `nimphy_app`: Application runtime role. Has `USAGE` on schema `public`, selective DML (`SELECT`, `INSERT`, `UPDATE` on cases/users, `SELECT` on rule packs/audits), `DELETE` strictly revoked on all tables, direct `INSERT` on `audit_log` revoked, and cannot execute purge procedures or assume `nimphy_migrator` or `nimphy_purge`.
   - `nimphy_purge`: Dedicated lifecycle background worker. Has `USAGE` on schema `public`, `EXECUTE` on the security-definer purge functions, and direct DML revoked on all tables.
   - Application and purge roles own zero schema objects.

---

## 9. Audit Log Value Validation vs. Key Allow-Lists

### Q: Does the database audit log writer guarantee zero PII in audit records, and what is the boundary of responsibility?

**A:**

1. **Structural Enforcement (Database Layer):**
   - The database function `nimphy_write_audit_log` strictly enforces registered action codes, permitted actor kinds, entity types, identifier length limits ($\le 200$), primitive scalar values ($\le 2000$), action-specific detail key allow-lists, and prohibited key name regex patterns (`email`, `password`, `prompt`, etc.).
2. **Content Semantics (Application Layer):**
   - If an application passes sensitive free-text content inside an allowed key—such as an email address, session token, or LLM prompt inside `reason` for `auth.signed_out` or `user_agent` for `auth.signed_in`—the database schema accepts the value.
   - A finite regex pattern list cannot reliably detect arbitrary PII or credentials in free-text fields without catastrophic false-positive rates.
   - Therefore, value sanitization (masking emails, hashing IPs via `ip_hash`, using enum reason codes like `reason_code` rather than raw user input) is strictly an **application-layer responsibility** prior to invoking the audit writer.

---

## 10. Default Function Privileges in Future Migrations

### Q: Why is `ALTER DEFAULT PRIVILEGES` required in Migration 001, and how does creator context affect default privileges?

**A:**

1. **Default System Behavior in PostgreSQL:**
   By default in PostgreSQL, newly created functions and procedures grant `EXECUTE` privilege to `PUBLIC`. If a project relies solely on revoking privileges from existing functions (`REVOKE ALL ON FUNCTION ... FROM PUBLIC`), any function created in a future migration (e.g. Migration 002) would automatically be executable by `PUBLIC` and `nimphy_app` unless the author explicitly remembers to revoke it.

2. **Default Privileges vs. Creator Context (`defaclrole`):**
   In PostgreSQL, entries in `pg_default_acl` specify default privileges applied to objects created **by a specific role**.

   - If an administrator (e.g. `postgres`) executes `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` while connected as `postgres`, PostgreSQL records an entry in `pg_default_acl` with `defaclrole = (Oid of postgres)`.
   - When a migration runner executes with `SET ROLE nimphy_migrator`, objects created by that session have `current_user = 'nimphy_migrator'`. PostgreSQL consults `pg_default_acl` for rules where `defaclrole = (Oid of nimphy_migrator)`.
   - If default privileges were only configured for `postgres`, PostgreSQL will NOT apply them to objects created by `nimphy_migrator`, falling back to standard system defaults (granting `EXECUTE` to `PUBLIC`).
   - Therefore, to ensure that future functions created by `nimphy_migrator` withhold `EXECUTE` from `PUBLIC` and `nimphy_app`, `ALTER DEFAULT PRIVILEGES` must be executed **under `SET ROLE nimphy_migrator`** (or specify `FOR ROLE nimphy_migrator`).

3. **Nimphy Hardening:**
   Migration 001 executes under `SET ROLE nimphy_migrator`:
   ```sql
   ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
   ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
   ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
   ALTER DEFAULT PRIVILEGES FOR ROLE nimphy_migrator REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
   ```
   This guarantees that any function created in future migrations under `SET ROLE nimphy_migrator` automatically has `EXECUTE` withheld from `PUBLIC` and `nimphy_app`.

---

## 11. Dedicated Runtime Login Principals & Controlled Role Membership (`WITH INHERIT FALSE, SET TRUE`)

### Q: Why does Nimphy separate runtime login principals from functional privilege roles, and why is `WITH INHERIT FALSE, SET TRUE` required?

**A:** In PostgreSQL security architecture, combining login credentials with direct object privileges creates privilege-leakage and auditing risks.

1. **Separation of Authentication from Authorization:**

   - **Login Principals:** (`nimphy_migrator_login`, `nimphy_app_login`, `nimphy_purge_login`) are provisioned with `LOGIN` and distinct, rotated secrets stored in external secrets management. They possess zero object grants directly.
   - **Functional Roles:** (`nimphy_migrator`, `nimphy_app`, `nimphy_purge`) are `NOLOGIN` roles that own or hold specific object privileges.

2. **The Risk of Ambient Privilege Inheritance:**
   By default in PostgreSQL (prior to v16 or with default role membership), when role `A` is granted to user `U`, user `U` automatically inherits all privileges of `A`. A developer connecting as `nimphy_app_login` could execute queries with `nimphy_app` privileges without explicitly declaring intent, making session-level auditing and role boundary enforcement fragile.

3. **Controlled Membership (`WITH INHERIT FALSE, SET TRUE`):**
   PostgreSQL 16 introduced SQL-standard role inheritance control:
   ```sql
   GRANT nimphy_app TO nimphy_app_login WITH INHERIT FALSE, SET TRUE;
   ```
   - `INHERIT FALSE`: Prevents ambient inheritance. Upon initial connection, `current_user` is `nimphy_app_login`, which has zero table or schema privileges.
   - `SET TRUE`: Grants permission to execute `SET ROLE nimphy_app`.
   - The application connection pool or migration runner must deliberately execute `SET ROLE <role>` to activate functional privileges.
   - Cross-role assumption is strictly blocked by PostgreSQL's role system: `nimphy_app_login` cannot `SET ROLE nimphy_migrator` or `SET ROLE nimphy_purge` (throws `permission denied to set role`).

---

## 12. Dynamic SQL in Database Grants (`format('%I', current_database())`)

### Q: Why does `GRANT ... ON DATABASE CURRENT_DATABASE ...` fail in PostgreSQL, and how does dynamic SQL safely resolve it?

**A:**

1. **The Syntax Pitfall:**
   In PostgreSQL DDL, `GRANT ... ON DATABASE <name>` expects an identifier, not a function call. Unlike `CURRENT_USER` or `CURRENT_TIMESTAMP` (which are SQL standard keywords in certain contexts), `current_database()` is a built-in function returning `name`/`text`. Writing `GRANT CONNECT ON DATABASE CURRENT_DATABASE TO ...` causes PostgreSQL to look for a literal database whose identifier is `"current_database"`, throwing `ERROR: database "current_database" does not exist`.

2. **Identifier-Safe Dynamic Resolution:**
   To make bootstrap scripts reusable across arbitrary database names without requiring string interpolation before execution or editing SQL files:
   ```sql
   DO $$
   BEGIN
     EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO nimphy_migrator', current_database());
   END $$;
   ```
   - `current_database()` evaluates dynamically to the exact database name of the active connection session.
   - `format('%I', ...)` treats the result as a SQL identifier, escaping any internal quotes and applying double quotes if the database name contains uppercase letters, hyphens, or numbers.
   - `EXECUTE` runs the statement safely against only the target database, guaranteeing that no unrelated database in the PostgreSQL cluster is modified.

---

## 13. Role-Drift Auditing, Safe Fail-Closed vs Normalization Behavior & `pg_auth_members` Verification

### Q: Why must bootstrap audit pre-existing roles for drift rather than silently skipping them, and how are both fail-closed and normalization policies implemented?

**A:**

1. **The Insecurity of Silent Skipping (`IF NOT EXISTS`):**
   A traditional `CREATE ROLE ... IF NOT EXISTS` statement only acts when the role is entirely absent. If an environment or operator previously created `nimphy_migrator` with `LOGIN` or `SUPERUSER`, `nimphy_app` with `CREATEROLE`, or `nimphy_purge` with `BYPASSRLS`, `IF NOT EXISTS` silently skips the role and leaves the dangerous attributes intact.

2. **The Defined Safe Behavior Policies:**

   - **Fail-Closed Policy (Default):**
     In accordance with core principles P-05 (Verify at the boundary) and P-06 (Least privilege and default deny), bootstrap queries `pg_roles` for each functional role (`rolcanlogin`, `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolbypassrls`, `rolreplication`). If any insecure attribute is detected, bootstrap immediately aborts with a diagnostic identifying the role and exact offending attributes (e.g. `Bootstrap failed: functional role "nimphy_migrator" has unexpected insecure attribute(s): LOGIN, SUPERUSER`).
   - **Normalization Policy (`onRoleDrift: 'normalize'`):**
     When explicitly authorized by configuration or setting `nimphy.bootstrap_policy = 'normalize'`, bootstrap normalizes the attributes to `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION` via administrative `ALTER ROLE`.

3. **Auditing the `pg_auth_members` Graph in Both Directions:**
   - **Direction 1 (Outward / Parent Memberships):**
     Functional roles must never inherit external or privileged memberships (e.g., `pg_read_all_data`, `pg_write_all_data`, `pg_database_owner`, or DBA groups). Bootstrap queries `pg_auth_members` where `member = functional_role.oid` and raises an exception if any parent role is attached.
   - **Direction 2 (Inward / Assumed Principals):**
     Functional roles must only be assumable by their designated service logins (or the administrative deployment session `current_user`). Any unauthorized principal attached as a member is immediately rejected.
   - **Administrative Option Delegation:**
     Members must have `admin_option = false`, ensuring that service logins cannot grant functional roles to other database users.
   - **Inherit Option Enforcement (PG 16+):**
     Members must have `inherit_option = false`, guaranteeing that functional privileges are never ambiently active upon connection without an explicit `SET ROLE`.

---

## 14. Service Login Membership Graph Audit, Transitive Privilege Paths & PL/pgSQL Variable Shadowing

### Q: Why must bootstrap inspect the service logins' own memberships and transitive paths, and what PL/pgSQL variable collision hazard was resolved?

**A:**

1. **Transitive Privilege Escalation Hazard:**
   If a service login (`nimphy_app_login`) is inadvertently or maliciously granted membership in an external role (e.g. `test_intermediate_group`), and that group possesses broader database permissions or is granted memberships in privileged roles, the application login could inherit or switch into unauthorized roles.

2. **Recursive CTE Membership Audit:**
   Bootstrap executes a recursive CTE querying `pg_auth_members` seeded with each service login principal and traversing outward across all role memberships:

   ```sql
   WITH RECURSIVE login_memberships AS (
     SELECT
       l_role.rolname AS login_name,
       g_role.rolname AS granted_role,
       pam.roleid AS granted_role_oid,
       ARRAY[l_role.rolname, g_role.rolname]::text[] AS path,
       1 AS depth
     FROM pg_roles l_role
     JOIN pg_auth_members pam ON pam.member = l_role.oid
     JOIN pg_roles g_role ON g_role.oid = pam.roleid
     WHERE l_role.rolname = ANY(allowed_logins) ...
     UNION ALL
     SELECT
       lm.login_name,
       parent_role.rolname AS granted_role,
       pam2.roleid AS granted_role_oid,
       lm.path || parent_role.rolname,
       lm.depth + 1
     FROM login_memberships lm
     JOIN pg_auth_members pam2 ON pam2.member = lm.granted_role_oid
     JOIN pg_roles parent_role ON parent_role.oid = pam2.roleid
     WHERE NOT (parent_role.rolname = ANY(lm.path))
   )
   ```

   The audit strictly enforces:

   - `nimphy_migrator_login` is a member only of `nimphy_migrator`.
   - `nimphy_app_login` is a member only of `nimphy_app`.
   - `nimphy_purge_login` is a member only of `nimphy_purge`.
   - Service logins' own attributes must be `NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION`.
   - Membership in functional roles must have `set_option = true` and `inherit_option = false`.

3. **PL/pgSQL Variable Shadowing Hazard (`record "r" has no field "oid"`):**
   In PL/pgSQL, any variable declared in the `DECLARE` block (e.g. `r RECORD;`) takes precedence over table aliases within embedded SQL statements in that block. When the recursive CTE used `FROM pg_roles l JOIN ... JOIN pg_roles r ON r.oid = pam.roleid`, PL/pgSQL interpreted `r.oid` as the field `oid` of the local variable `r` (which contained columns from an earlier `SELECT rolname, rolsuper...`), throwing `ERROR: record "r" has no field "oid"`.
   Resolving this required renaming all table aliases in SQL queries within the block to distinct names (`l_role`, `g_role`, `parent_role`, `f_role`, `mem_role`) that do not collide with declared loop variables (`r`, `m`).

---

## 15. Exact Login Allow-Lists vs. Prefix Matching & Mandatory Login Attribute Verification

### Q: Why is prefix matching (`LIKE 'nimphy_app_login%'`) an authorization hazard in database bootstrap scripts, and how does Nimphy enforce exact login allow-lists without weakening testability?

**A:**

1. **The Authorization Leak in Prefix Matching:**
   When bootstrap SQL uses pattern matching such as `m.member_name LIKE 'nimphy_app_login%'`, any database user or attacker with permission to create roles (or an unvetted script) could provision a role named `nimphy_app_login_attacker` or `nimphy_app_login_backdoor` and assume the privileged application role `nimphy_app`. Pattern matching on principal names violates Principle P-06 (Least privilege and default deny) and Principle P-05 (Verify at the boundary) by turning an identity verification check into a loose naming convention.

2. **Exact Allow-Lists with Configurable Test Overrides:**
   Production bootstrap relies on an exact allow-list:

   - `nimphy_migrator` can only be assumed by `nimphy_migrator_login` (or `current_user` in administrative sessions).
   - `nimphy_app` can only be assumed by `nimphy_app_login`.
   - `nimphy_purge` can only be assumed by `nimphy_purge_login`.

   To support ephemeral test environments that generate timestamped role names (e.g., `nimphy_app_login_1795456...`) for test concurrency and isolation, the bootstrap procedure accepts exact configured role names via `allowedMembers` in `bootstrapDatabase(client, options)` (or session settings `nimphy.migrator_logins`, `nimphy.app_logins`, `nimphy.purge_logins`). Production deployments omit overrides and strictly enforce the production role names, preventing prefix authorization leaks.

3. **Mandatory Login Attribute Verification (`rolcanlogin = true`):**
   Service logins are connection principals. If a designated login has `NOLOGIN` (`rolcanlogin = false`), it cannot establish a session. Conversely, service logins must possess zero administrative privileges (`NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION`).
   Bootstrap audits each designated login directly:

   - Rejects `NOLOGIN` if `rolcanlogin = false`.
   - Rejects `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, or `REPLICATION`.
   - Rejects any direct or transitive membership outside its single intended functional role.
   - Verifies `admin_option = false`, `inherit_option = false`, and `set_option = true`.

4. **Administrative Session Exception:**
   The bootstrap session itself executes under `current_user` (e.g. `postgres` or administrative DBA). In local test harnesses, `grantToCurrentUser: true` attaches `current_user` to the functional roles so the test session can test `SET ROLE`. The check `(m.member_name = ANY(app_logins) OR m.member_name = current_user)` strictly preserves this approved administrative exception without permitting unauthorized third-party principals.

---

## 16. Required-Membership Verification & Fail-Closed Bootstrap Auditing

### Q: Why must a database bootstrap process explicitly assert the existence and direct membership of all designated service logins rather than merely auditing roles that are found?

**A:**

1. **The Silent Omission Vulnerability:**
   If a bootstrap script queries catalog tables using `WHERE rolname = ANY(allowed_logins)` and loops over the result set, it only inspects roles that _already exist_. If a designated service login (such as `nimphy_migrator_login` or `nimphy_purge_login`) was never provisioned, accidentally dropped, or misspelled in environment configuration, the loop over matching rows executes zero times and the bootstrap script reports 100% success.
   Similarly, if the audit only checks that "existing members of `nimphy_app` belong to the allow-list" without checking that "every designated login in the allow-list is an active member of `nimphy_app`", a missing grant will go unnoticed until runtime failures occur.

2. **Fail-Closed Direct Membership Contract:**
   To uphold Principle P-05 (Verify at the boundary) and Principle P-06 (Least privilege and default deny), Nimphy enforces:
   - **Pre-flight allow-list validation:** Rejects empty arrays, duplicate names within a list, and overlapping role names across `migrator`, `app`, and `purge` allow-lists at both TypeScript and PL/pgSQL boundaries.
   - **Mandatory existence & attribute check:** Loops over every element of `allowed_logins` with `FOREACH ... SELECT ... WHERE rolname = role_item; IF NOT FOUND THEN RAISE EXCEPTION ...`. Asserts `rolcanlogin = true` and `rolsuper = false, rolcreatedb = false, rolcreaterole = false, rolbypassrls = false, rolreplication = false`.
   - **Explicit direct membership assertion:** Directly queries `pg_auth_members` for `f_role.rolname = '<target>' AND mem.rolname = role_item`. If no row is returned, bootstrap aborts with a descriptive exception indicating the missing direct membership.
   - **Option enforcement:** Asserts `admin_option = false`, `inherit_option = false`, and `set_option = true` on the direct membership. Indirect memberships through intermediate group roles are strictly rejected.
   - **Transitive graph isolation:** Recursively walks `pg_auth_members` via CTE to prove that service logins possess zero direct or transitive memberships outside their single designated functional role.
