import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapDatabase,
  createDatabasePool,
  runMigrations,
} from '../../packages/persistence/src/index';
import { getBaseDatabaseUrl, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Role Model, Non-Superuser Migrations & Runtime Login Audit', () => {
  const baseDbUrl = getBaseDatabaseUrl();
  const testDbName = `nimphy_test_role_audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let adminPool: Pool;
  let migratorLoginPool: Pool;
  let appLoginPool: Pool;
  let purgeLoginPool: Pool;
  let unauthPool: Pool;

  const migratorUsername = `nimphy_migrator_login_${Date.now()}`;
  const migratorPassword = 'test_migrator_secret_password';

  const appUsername = `nimphy_app_login_${Date.now()}`;
  const appPassword = 'test_app_secret_password';

  const purgeUsername = `nimphy_purge_login_${Date.now()}`;
  const purgePassword = 'test_purge_secret_password';

  const unauthorizedUsername = `nimphy_unauth_login_${Date.now()}`;
  const unauthorizedPassword = 'test_unauth_secret_password';

  let testDbMigratorUrl: string;
  let testDbAppUrl: string;
  let testDbPurgeUrl: string;
  let testDbUnauthUrl: string;

  beforeAll(async () => {
    // 1. Administrative setup on default 'postgres' database
    const adminUrl = new URL(baseDbUrl);
    adminUrl.pathname = '/postgres';
    adminPool = new Pool({ connectionString: adminUrl.toString() });

    const adminClient = await adminPool.connect();
    try {
      // Create isolated test database
      await adminClient.query(`CREATE DATABASE "${testDbName}";`);

      // Ensure NOLOGIN service roles exist at cluster level
      await adminClient.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_migrator') THEN
            CREATE ROLE nimphy_migrator WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_app') THEN
            CREATE ROLE nimphy_app WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_purge') THEN
            CREATE ROLE nimphy_purge WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;

          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_migrator_login') THEN
            CREATE ROLE nimphy_migrator_login WITH LOGIN PASSWORD 'migrator_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_app_login') THEN
            CREATE ROLE nimphy_app_login WITH LOGIN PASSWORD 'app_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nimphy_purge_login') THEN
            CREATE ROLE nimphy_purge_login WITH LOGIN PASSWORD 'purge_pwd' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
          END IF;

          GRANT nimphy_migrator TO nimphy_migrator_login WITH INHERIT FALSE, SET TRUE;
          GRANT nimphy_app TO nimphy_app_login WITH INHERIT FALSE, SET TRUE;
          GRANT nimphy_purge TO nimphy_purge_login WITH INHERIT FALSE, SET TRUE;
        END $$;
      `);

      // Create dedicated non-superuser login roles
      await adminClient.query(`
        CREATE ROLE "${migratorUsername}" WITH LOGIN PASSWORD '${migratorPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        CREATE ROLE "${appUsername}" WITH LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        CREATE ROLE "${purgeUsername}" WITH LOGIN PASSWORD '${purgePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        CREATE ROLE "${unauthorizedUsername}" WITH LOGIN PASSWORD '${unauthorizedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE;

        -- Grant controlled membership prior to running bootstrap verification
        GRANT nimphy_migrator TO "${migratorUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO "${purgeUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      adminClient.release();
    }

    // 2. Target database bootstrap as admin
    const targetDbAdminUrl = new URL(baseDbUrl);
    targetDbAdminUrl.pathname = `/${testDbName}`;
    const targetAdminPool = new Pool({ connectionString: targetDbAdminUrl.toString() });
    const targetAdminClient = await targetAdminPool.connect();

    try {
      // Run standard bootstrap on target database with exact generated login allow-list
      await bootstrapDatabase(targetAdminClient, {
        dbName: testDbName,
        allowedMembers: {
          nimphy_migrator: ['nimphy_migrator_login', migratorUsername],
          nimphy_app: ['nimphy_app_login', appUsername],
          nimphy_purge: ['nimphy_purge_login', purgeUsername],
        },
      });

      // Grant CONNECT on the target database to all service logins
      await targetAdminClient.query(`
        GRANT CONNECT ON DATABASE "${testDbName}" TO "${migratorUsername}";
        GRANT CONNECT ON DATABASE "${testDbName}" TO "${appUsername}";
        GRANT CONNECT ON DATABASE "${testDbName}" TO "${purgeUsername}";
        GRANT CONNECT ON DATABASE "${testDbName}" TO "${unauthorizedUsername}";

        -- Controlled membership: INHERIT FALSE prevents ambient privilege inheritance;
        -- SET TRUE allows explicit assumption of functional service role via SET ROLE.
        GRANT nimphy_migrator TO "${migratorUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_app TO "${appUsername}" WITH INHERIT FALSE, SET TRUE;
        GRANT nimphy_purge TO "${purgeUsername}" WITH INHERIT FALSE, SET TRUE;
      `);
    } finally {
      targetAdminClient.release();
      await targetAdminPool.end();
    }

    // 3. Construct connection URLs for dedicated login roles
    const migratorUrlObj = new URL(targetDbAdminUrl.toString());
    migratorUrlObj.username = migratorUsername;
    migratorUrlObj.password = migratorPassword;
    testDbMigratorUrl = migratorUrlObj.toString();
    migratorLoginPool = createDatabasePool({ connectionString: testDbMigratorUrl });

    const appUrlObj = new URL(targetDbAdminUrl.toString());
    appUrlObj.username = appUsername;
    appUrlObj.password = appPassword;
    testDbAppUrl = appUrlObj.toString();
    appLoginPool = createDatabasePool({ connectionString: testDbAppUrl });

    const purgeUrlObj = new URL(targetDbAdminUrl.toString());
    purgeUrlObj.username = purgeUsername;
    purgeUrlObj.password = purgePassword;
    testDbPurgeUrl = purgeUrlObj.toString();
    purgeLoginPool = createDatabasePool({ connectionString: testDbPurgeUrl });

    const unauthUrlObj = new URL(targetDbAdminUrl.toString());
    unauthUrlObj.username = unauthorizedUsername;
    unauthUrlObj.password = unauthorizedPassword;
    testDbUnauthUrl = unauthUrlObj.toString();
    unauthPool = createDatabasePool({ connectionString: testDbUnauthUrl });
  });

  afterAll(async () => {
    if (migratorLoginPool) await migratorLoginPool.end().catch(() => {});
    if (appLoginPool) await appLoginPool.end().catch(() => {});
    if (purgeLoginPool) await purgeLoginPool.end().catch(() => {});
    if (unauthPool) await unauthPool.end().catch(() => {});

    // Cleanup roles and test database
    if (adminPool) {
      const adminClient = await adminPool.connect();
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE);`);
        await adminClient.query(`DROP ROLE IF EXISTS "${migratorUsername}";`);
        await adminClient.query(`DROP ROLE IF EXISTS "${appUsername}";`);
        await adminClient.query(`DROP ROLE IF EXISTS "${purgeUsername}";`);
        await adminClient.query(`DROP ROLE IF EXISTS "${unauthorizedUsername}";`);
      } catch {
        // Best-effort cleanup
      } finally {
        adminClient.release();
        await adminPool.end().catch(() => {});
      }
    }
  });

  it('proves all three service logins and NOLOGIN functional roles have no administrative privileges', async () => {
    const client = await migratorLoginPool.connect();
    try {
      const rolesRes = await client.query<{
        rolname: string;
        rolsuper: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolcanlogin: boolean;
      }>(
        `
        SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
        FROM pg_roles
        WHERE rolname IN ($1, $2, $3, 'nimphy_migrator', 'nimphy_app', 'nimphy_purge')
        ORDER BY rolname;
      `,
        [migratorUsername, appUsername, purgeUsername],
      );

      const roleMap = new Map(rolesRes.rows.map((r) => [r.rolname, r]));

      // 1. Functional privilege roles must be NOLOGIN, non-superuser, no CREATEROLE, no CREATEDB
      for (const roleName of ['nimphy_migrator', 'nimphy_app', 'nimphy_purge']) {
        const role = roleMap.get(roleName);
        expect(role).toBeDefined();
        expect(role?.rolcanlogin).toBe(false);
        expect(role?.rolsuper).toBe(false);
        expect(role?.rolcreaterole).toBe(false);
        expect(role?.rolcreatedb).toBe(false);
      }

      // 2. Dedicated service login principals must have LOGIN, but NO superuser, NO CREATEROLE, NO CREATEDB
      for (const loginName of [migratorUsername, appUsername, purgeUsername]) {
        const login = roleMap.get(loginName);
        expect(login).toBeDefined();
        expect(login?.rolcanlogin).toBe(true);
        expect(login?.rolsuper).toBe(false);
        expect(login?.rolcreaterole).toBe(false);
        expect(login?.rolcreatedb).toBe(false);
      }
    } finally {
      client.release();
    }
  });

  it('proves service logins cannot perform administrative role provisioning (CREATE ROLE)', async () => {
    const clients = [
      await migratorLoginPool.connect(),
      await appLoginPool.connect(),
      await purgeLoginPool.connect(),
    ];

    try {
      // Direct CREATE ROLE attempt as each login
      for (const client of clients) {
        await expect(client.query('CREATE ROLE test_hacker_role;')).rejects.toThrowError(
          /permission denied to create role/i,
        );
      }

      // Even under SET ROLE nimphy_migrator / nimphy_app / nimphy_purge, CREATE ROLE is prohibited
      await clients[0]!.query('SET ROLE nimphy_migrator;');
      await expect(clients[0]!.query('CREATE ROLE test_hacker_role;')).rejects.toThrowError(
        /permission denied to create role/i,
      );
      await clients[0]!.query('RESET ROLE;');

      await clients[1]!.query('SET ROLE nimphy_app;');
      await expect(clients[1]!.query('CREATE ROLE test_hacker_role;')).rejects.toThrowError(
        /permission denied to create role/i,
      );
      await clients[1]!.query('RESET ROLE;');

      await clients[2]!.query('SET ROLE nimphy_purge;');
      await expect(clients[2]!.query('CREATE ROLE test_hacker_role;')).rejects.toThrowError(
        /permission denied to create role/i,
      );
      await clients[2]!.query('RESET ROLE;');
    } finally {
      for (const c of clients) c.release();
    }
  });

  it('proves controlled role assumption: logins can assume ONLY their intended functional role', async () => {
    const migClient = await migratorLoginPool.connect();
    const appClient = await appLoginPool.connect();
    const purgeClient = await purgeLoginPool.connect();
    const unauthClient = await unauthPool.connect();

    try {
      // 1. Initial connection: current_user matches the login principal
      const migInit = await migClient.query<{ current_user: string }>('SELECT current_user;');
      expect(migInit.rows[0]?.current_user).toBe(migratorUsername);

      const appInit = await appClient.query<{ current_user: string }>('SELECT current_user;');
      expect(appInit.rows[0]?.current_user).toBe(appUsername);

      const purgeInit = await purgeClient.query<{ current_user: string }>('SELECT current_user;');
      expect(purgeInit.rows[0]?.current_user).toBe(purgeUsername);

      // 2. Each login can assume its intended role, and current_user matches the functional role
      await migClient.query('SET ROLE nimphy_migrator;');
      const migSwitched = await migClient.query<{ current_user: string }>('SELECT current_user;');
      expect(migSwitched.rows[0]?.current_user).toBe('nimphy_migrator');

      await appClient.query('SET ROLE nimphy_app;');
      const appSwitched = await appClient.query<{ current_user: string }>('SELECT current_user;');
      expect(appSwitched.rows[0]?.current_user).toBe('nimphy_app');

      await purgeClient.query('SET ROLE nimphy_purge;');
      const purgeSwitched = await purgeClient.query<{ current_user: string }>(
        'SELECT current_user;',
      );
      expect(purgeSwitched.rows[0]?.current_user).toBe('nimphy_purge');

      // 3. Prohibited cross-role assumptions:
      // The app login cannot assume nimphy_migrator or nimphy_purge
      await expect(appClient.query('SET ROLE nimphy_migrator;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
      await expect(appClient.query('SET ROLE nimphy_purge;')).rejects.toThrowError(
        /permission denied to set role/i,
      );

      // The purge login cannot assume nimphy_migrator or nimphy_app
      await expect(purgeClient.query('SET ROLE nimphy_migrator;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
      await expect(purgeClient.query('SET ROLE nimphy_app;')).rejects.toThrowError(
        /permission denied to set role/i,
      );

      // The migration login cannot assume nimphy_app or nimphy_purge
      await expect(migClient.query('SET ROLE nimphy_app;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
      await expect(migClient.query('SET ROLE nimphy_purge;')).rejects.toThrowError(
        /permission denied to set role/i,
      );

      // The unauthorized login cannot assume any role
      await expect(unauthClient.query('SET ROLE nimphy_migrator;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
      await expect(unauthClient.query('SET ROLE nimphy_app;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
      await expect(unauthClient.query('SET ROLE nimphy_purge;')).rejects.toThrowError(
        /permission denied to set role/i,
      );
    } finally {
      await migClient.query('RESET ROLE;').catch(() => {});
      await appClient.query('RESET ROLE;').catch(() => {});
      await purgeClient.query('RESET ROLE;').catch(() => {});
      migClient.release();
      appClient.release();
      purgeClient.release();
      unauthClient.release();
    }
  });

  it('successfully applies migrations using non-superuser migration login via SET ROLE nimphy_migrator', async () => {
    // Migration runner connects using migratorLoginPool, switches to nimphy_migrator, applies Migration 001
    const report = await runMigrations(migratorLoginPool, { migrationsDir: MIGRATIONS_DIR });

    expect(report.totalMigrations).toBe(1);
    expect(report.appliedCount).toBe(1);
    expect(report.skippedCount).toBe(0);
    expect(report.migrations[0]?.name).toBe('initial_schema');
    expect(report.migrations[0]?.status).toBe('applied');

    // Confirm metadata was recorded in nimphy_meta.schema_migrations
    const client = await migratorLoginPool.connect();
    try {
      await client.query('SET ROLE nimphy_migrator;');
      const res = await client.query('SELECT version, name FROM nimphy_meta.schema_migrations;');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].version).toBe(1);
      expect(res.rows[0].name).toBe('initial_schema');
    } finally {
      await client.query('RESET ROLE;').catch(() => {});
      client.release();
    }
  });

  it('verifies that intended schemas, tables, sequences, and functions are owned by nimphy_migrator', async () => {
    const client = await migratorLoginPool.connect();
    try {
      await client.query('SET ROLE nimphy_migrator;');

      // 1. Schemas ownership
      const schemaRes = await client.query<{ schema_name: string; schema_owner: string }>(`
        SELECT schema_name, schema_owner
        FROM information_schema.schemata
        WHERE schema_name IN ('public', 'nimphy_meta')
        ORDER BY schema_name;
      `);
      expect(schemaRes.rows).toEqual([
        { schema_name: 'nimphy_meta', schema_owner: 'nimphy_migrator' },
        { schema_name: 'public', schema_owner: 'nimphy_migrator' },
      ]);

      // 2. Tables ownership (7 domain tables + 1 metadata table)
      const tablesRes = await client.query<{ tablename: string; tableowner: string }>(`
        SELECT tablename, tableowner
        FROM pg_tables
        WHERE schemaname IN ('public', 'nimphy_meta')
        ORDER BY tablename;
      `);
      const tableNames = tablesRes.rows.map((r) => r.tablename);
      expect(tableNames).toEqual([
        'app_users',
        'audit_log',
        'business_cases',
        'calculation_runs',
        'case_revisions',
        'evidence_items',
        'rule_packs',
        'schema_migrations',
      ]);
      for (const row of tablesRes.rows) {
        expect(row.tableowner).toBe('nimphy_migrator');
      }

      // 3. Sequences ownership
      const seqRes = await client.query<{ sequencename: string; sequenceowner: string }>(`
        SELECT sequencename, sequenceowner
        FROM pg_sequences
        WHERE schemaname = 'public';
      `);
      expect(seqRes.rows.length).toBeGreaterThan(0);
      for (const row of seqRes.rows) {
        expect(row.sequenceowner).toBe('nimphy_migrator');
      }

      // 4. Privileged functions ownership
      const procRes = await client.query<{ proname: string; owner: string }>(`
        SELECT proname, pg_get_userbyid(proowner) as owner
        FROM pg_proc
        WHERE proname IN (
          'nimphy_purge_business_case',
          'nimphy_purge_app_user',
          'nimphy_write_audit_log',
          'nimphy_enforce_case_revision_immutability',
          'nimphy_enforce_calculation_run_immutability',
          'nimphy_enforce_audit_log_immutability',
          'nimphy_enforce_rule_pack_immutability'
        )
        ORDER BY proname;
      `);
      expect(procRes.rows).toHaveLength(7);
      for (const row of procRes.rows) {
        expect(row.owner).toBe('nimphy_migrator');
      }

      // 5. Verify nimphy_app and nimphy_purge own 0 tables and 0 functions
      const nonOwnerTables = await client.query(`
        SELECT count(*)::int as count
        FROM pg_tables
        WHERE tableowner IN ('nimphy_app', 'nimphy_purge');
      `);
      expect(nonOwnerTables.rows[0].count).toBe(0);

      const nonOwnerProcs = await client.query(`
        SELECT count(*)::int as count
        FROM pg_proc
        WHERE pg_get_userbyid(proowner) IN ('nimphy_app', 'nimphy_purge');
      `);
      expect(nonOwnerProcs.rows[0].count).toBe(0);
    } finally {
      await client.query('RESET ROLE;').catch(() => {});
      client.release();
    }
  });

  it('verifies real effective permissions: schema privileges for non-superuser connections', async () => {
    const migClient = await migratorLoginPool.connect();
    const appClient = await appLoginPool.connect();
    const purgeClient = await purgeLoginPool.connect();

    try {
      // 1. nimphy_migrator CAN create objects in public and nimphy_meta schemas
      await migClient.query('SET ROLE nimphy_migrator;');
      await migClient.query('CREATE TABLE public.mig_schema_test (id int);');
      await migClient.query('DROP TABLE public.mig_schema_test;');
      await migClient.query('RESET ROLE;');

      // 2. nimphy_app CANNOT create tables in schema public
      await appClient.query('SET ROLE nimphy_app;');
      await expect(
        appClient.query('CREATE TABLE public.app_illegal_table (id int);'),
      ).rejects.toThrowError(/permission denied for schema public/i);
      await expect(
        appClient.query('CREATE TABLE nimphy_meta.app_illegal_table (id int);'),
      ).rejects.toThrowError(/permission denied for schema nimphy_meta/i);
      await appClient.query('RESET ROLE;');

      // 3. nimphy_purge CANNOT create tables in schema public
      await purgeClient.query('SET ROLE nimphy_purge;');
      await expect(
        purgeClient.query('CREATE TABLE public.purge_illegal_table (id int);'),
      ).rejects.toThrowError(/permission denied for schema public/i);
      await expect(
        purgeClient.query('CREATE TABLE nimphy_meta.purge_illegal_table (id int);'),
      ).rejects.toThrowError(/permission denied for schema nimphy_meta/i);
      await purgeClient.query('RESET ROLE;');
    } finally {
      await migClient.query('RESET ROLE;').catch(() => {});
      await appClient.query('RESET ROLE;').catch(() => {});
      await purgeClient.query('RESET ROLE;').catch(() => {});
      migClient.release();
      appClient.release();
      purgeClient.release();
    }
  });

  it('verifies real effective permissions: table access boundaries for app and purge logins', async () => {
    const appClient = await appLoginPool.connect();
    const purgeClient = await purgeLoginPool.connect();

    try {
      // --- APP LOGIN (SET ROLE nimphy_app) ---
      await appClient.query('SET ROLE nimphy_app;');

      // 1. App can insert and update business_cases
      const userRes = await appClient.query<{ id: string }>(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|app_test_sub', 'app_test@example.com') RETURNING id;
      `);
      const userId = userRes.rows[0]!.id;

      const caseRes = await appClient.query<{ id: string }>(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Test App Case') RETURNING id;
      `,
        [userId],
      );
      const caseId = caseRes.rows[0]!.id;

      await appClient.query('UPDATE business_cases SET title = $1 WHERE id = $2;', [
        'Updated Title',
        caseId,
      ]);

      // 2. App CANNOT delete from business_cases
      await expect(
        appClient.query('DELETE FROM business_cases WHERE id = $1;', [caseId]),
      ).rejects.toThrowError(/permission denied for table business_cases/i);

      // 3. App CANNOT direct INSERT, UPDATE, or DELETE on audit_log
      await expect(
        appClient.query(
          "INSERT INTO audit_log (actor_kind, action, entity_type, entity_id) VALUES ('user', 'case.created', 'business_case', 'id1');",
        ),
      ).rejects.toThrowError(/permission denied for table audit_log/i);
      await expect(
        appClient.query("UPDATE audit_log SET action = 'tampered' WHERE id = 1;"),
      ).rejects.toThrowError(/permission denied for table audit_log/i);
      await expect(appClient.query('DELETE FROM audit_log WHERE id = 1;')).rejects.toThrowError(
        /permission denied for table audit_log/i,
      );

      // 4. App can INSERT case_revisions, but CANNOT UPDATE or DELETE
      const revRes = await appClient.query<{ id: string }>(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{"val": 10}', 1, 'hash_rev_1') RETURNING id;
      `,
        [caseId],
      );
      const revId = revRes.rows[0]!.id;

      await expect(
        appClient.query('UPDATE case_revisions SET inputs = \'{"val": 20}\' WHERE id = $1;', [
          revId,
        ]),
      ).rejects.toThrowError(/permission denied for table case_revisions/i);
      await expect(
        appClient.query('DELETE FROM case_revisions WHERE id = $1;', [revId]),
      ).rejects.toThrowError(/permission denied for table case_revisions/i);

      await appClient.query('RESET ROLE;');

      // --- PURGE LOGIN (SET ROLE nimphy_purge) ---
      await purgeClient.query('SET ROLE nimphy_purge;');

      // 5. Purge login CANNOT SELECT directly from business_cases (no table-level grant)
      await expect(
        purgeClient.query('SELECT id, title FROM business_cases WHERE id = $1;', [caseId]),
      ).rejects.toThrowError(/permission denied for table business_cases/i);

      // 6. Purge login CANNOT direct DELETE on tables
      await expect(
        purgeClient.query('DELETE FROM business_cases WHERE id = $1;', [caseId]),
      ).rejects.toThrowError(/permission denied for table business_cases/i);

      // 7. Purge login CANNOT direct INSERT or UPDATE
      await expect(
        purgeClient.query(
          `INSERT INTO business_cases (user_id, title) VALUES ($1, 'Illegal Purge Insert');`,
          [userId],
        ),
      ).rejects.toThrowError(/permission denied for table business_cases/i);

      await purgeClient.query('RESET ROLE;');
    } finally {
      await appClient.query('RESET ROLE;').catch(() => {});
      await purgeClient.query('RESET ROLE;').catch(() => {});
      appClient.release();
      purgeClient.release();
    }
  });

  it('verifies real effective permissions: purge function execution boundaries', async () => {
    const appClient = await appLoginPool.connect();
    const purgeClient = await purgeLoginPool.connect();
    const unauthClient = await unauthPool.connect();

    try {
      // 1. Setup a pending_deletion case using app login
      await appClient.query('SET ROLE nimphy_app;');
      const userRes = await appClient.query<{ id: string }>(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|purge_func_user', 'purge_func@example.com') RETURNING id;
      `);
      const userId = userRes.rows[0]!.id;

      const caseRes = await appClient.query<{ id: string }>(
        `
        INSERT INTO business_cases (user_id, title, status, deletion_requested_at)
        VALUES ($1, 'Purge Target Case', 'pending_deletion', now()) RETURNING id;
      `,
        [userId],
      );
      const caseId = caseRes.rows[0]!.id;

      // 2. App login CANNOT execute nimphy_purge_business_case or nimphy_purge_app_user
      await expect(
        appClient.query('SELECT nimphy_purge_business_case($1);', [caseId]),
      ).rejects.toThrowError(/permission denied for function nimphy_purge_business_case/i);
      await expect(
        appClient.query('SELECT nimphy_purge_app_user($1);', [userId]),
      ).rejects.toThrowError(/permission denied for function nimphy_purge_app_user/i);
      await appClient.query('RESET ROLE;');

      // 3. Unauthorized login CANNOT execute purge functions
      await expect(
        unauthClient.query('SELECT nimphy_purge_business_case($1);', [caseId]),
      ).rejects.toThrowError(/permission denied for function nimphy_purge_business_case/i);

      // 4. Purge login (SET ROLE nimphy_purge) CAN execute purge procedures
      await purgeClient.query('SET ROLE nimphy_purge;');
      await expect(
        purgeClient.query('SELECT nimphy_purge_business_case($1);', [caseId]),
      ).resolves.not.toThrow();
      await purgeClient.query('RESET ROLE;');

      // Verify business case was purged via app login (which has SELECT)
      await appClient.query('SET ROLE nimphy_app;');
      const verifyCase = await appClient.query(
        'SELECT count(*)::int as cnt FROM business_cases WHERE id = $1;',
        [caseId],
      );
      expect(verifyCase.rows[0].cnt).toBe(0);
      await appClient.query('RESET ROLE;');
    } finally {
      await appClient.query('RESET ROLE;').catch(() => {});
      await purgeClient.query('RESET ROLE;').catch(() => {});
      appClient.release();
      purgeClient.release();
      unauthClient.release();
    }
  });

  it('verifies real effective permissions: audit function execution boundaries', async () => {
    const appClient = await appLoginPool.connect();
    const purgeClient = await purgeLoginPool.connect();
    const unauthClient = await unauthPool.connect();

    try {
      // 1. App login CAN execute nimphy_write_audit_log
      await appClient.query('SET ROLE nimphy_app;');
      const auditRes = await appClient.query(
        `SELECT nimphy_write_audit_log(
          NULL,
          'system',
          'admin.action',
          'system',
          'sys_instance_1',
          'corr_1',
          '{"action_type": "maintenance", "target_id": "sys_1", "reason_code": "routine"}'::jsonb
        );`,
      );
      expect(auditRes.rows).toHaveLength(1);
      await appClient.query('RESET ROLE;');

      // 2. Purge login CANNOT execute nimphy_write_audit_log
      await purgeClient.query('SET ROLE nimphy_purge;');
      await expect(
        purgeClient.query(
          `SELECT nimphy_write_audit_log(
            NULL,
            'system',
            'admin.action',
            'system',
            'sys_instance_1',
            'corr_2',
            '{"action_type": "maintenance", "target_id": "sys_1", "reason_code": "routine"}'::jsonb
          );`,
        ),
      ).rejects.toThrowError(/permission denied for function nimphy_write_audit_log/i);
      await purgeClient.query('RESET ROLE;');

      // 3. Unauthorized login CANNOT execute nimphy_write_audit_log
      await expect(
        unauthClient.query(
          `SELECT nimphy_write_audit_log(
            NULL,
            'system',
            'admin.action',
            'system',
            'sys_instance_1',
            'corr_3',
            '{"action_type": "maintenance", "target_id": "sys_1", "reason_code": "routine"}'::jsonb
          );`,
        ),
      ).rejects.toThrowError(/permission denied for function nimphy_write_audit_log/i);
    } finally {
      await appClient.query('RESET ROLE;').catch(() => {});
      await purgeClient.query('RESET ROLE;').catch(() => {});
      appClient.release();
      purgeClient.release();
      unauthClient.release();
    }
  });

  it('verifies default ACLs for future functions created by non-superuser migration login (Section 4)', async () => {
    const client = await migratorLoginPool.connect();
    const appClient = await appLoginPool.connect();

    try {
      // 1. Switch to nimphy_migrator on migration connection
      await client.query('SET ROLE nimphy_migrator;');

      // 2. Create a temporary test function under nimphy_migrator
      await client.query(`
        CREATE FUNCTION public.nimphy_test_future_secure_func()
        RETURNS text
        LANGUAGE sql
        AS $$ SELECT 'confidential_result'; $$;
      `);

      // 3. Verify function owner is nimphy_migrator
      const ownerCheck = await client.query<{ owner: string }>(`
        SELECT pg_get_userbyid(proowner) as owner
        FROM pg_proc
        WHERE proname = 'nimphy_test_future_secure_func';
      `);
      expect(ownerCheck.rows[0].owner).toBe('nimphy_migrator');

      // 4. Verify that PUBLIC cannot execute it
      const publicCheck = await client.query<{ can_exec: boolean }>(`
        SELECT has_function_privilege('public', 'public.nimphy_test_future_secure_func()', 'execute') as can_exec;
      `);
      expect(publicCheck.rows[0].can_exec).toBe(false);

      // 5. Verify that nimphy_app cannot execute it
      const appPrivCheck = await client.query<{ can_exec: boolean }>(`
        SELECT has_function_privilege('nimphy_app', 'public.nimphy_test_future_secure_func()', 'execute') as can_exec;
      `);
      expect(appPrivCheck.rows[0].can_exec).toBe(false);

      // 6. Test actual execution attempt under nimphy_app session
      await appClient.query('SET ROLE nimphy_app;');
      await expect(
        appClient.query('SELECT public.nimphy_test_future_secure_func();'),
      ).rejects.toThrowError(/permission denied for function nimphy_test_future_secure_func/i);
    } finally {
      // Cleanup test function
      try {
        await client.query('DROP FUNCTION IF EXISTS public.nimphy_test_future_secure_func();');
      } catch {
        // ignore
      }
      await client.query('RESET ROLE;').catch(() => {});
      await appClient.query('RESET ROLE;').catch(() => {});
      client.release();
      appClient.release();
    }
  });

  it('fails closed when target role is non-existent or login is not a member', async () => {
    // 1. Non-existent role fails closed before applying migrations
    await expect(
      runMigrations(migratorLoginPool, {
        migrationsDir: MIGRATIONS_DIR,
        targetRole: 'non_existent_role_xyz',
      }),
    ).rejects.toThrowError(/role "non_existent_role_xyz" does not exist/i);

    // 2. Unauthorized login (not a member of nimphy_migrator) fails closed
    await expect(
      runMigrations(unauthPool, {
        migrationsDir: MIGRATIONS_DIR,
        targetRole: 'nimphy_migrator',
      }),
    ).rejects.toThrowError(/permission denied to set role "nimphy_migrator"/i);
  });

  it('verifies bootstrap script execution, idempotency, and unrelated database isolation (Section 1)', async () => {
    // Connect as administrative user to create two fresh databases
    const adminUrl = new URL(baseDbUrl);
    adminUrl.pathname = '/postgres';
    const adminClient = await adminPool.connect();

    const bootTargetDb = `nimphy_boot_target_${Date.now()}`;
    const bootUnrelatedDb = `nimphy_boot_unrelated_${Date.now()}`;

    try {
      await adminClient.query(`CREATE DATABASE "${bootTargetDb}";`);
      await adminClient.query(`CREATE DATABASE "${bootUnrelatedDb}";`);

      // Bootstrap target database
      const targetUrl = new URL(baseDbUrl);
      targetUrl.pathname = `/${bootTargetDb}`;
      const targetPool = new Pool({ connectionString: targetUrl.toString() });
      const targetClient = await targetPool.connect();

      try {
        // 1. First execution of bootstrap on target DB with exact generated login allow-list
        await bootstrapDatabase(targetClient, {
          dbName: bootTargetDb,
          allowedMembers: {
            nimphy_migrator: ['nimphy_migrator_login', migratorUsername],
            nimphy_app: ['nimphy_app_login', appUsername],
            nimphy_purge: ['nimphy_purge_login', purgeUsername],
          },
        });

        // Verify target database schema ownership
        const schemaRes = await targetClient.query<{ schema_owner: string }>(`
          SELECT schema_owner FROM information_schema.schemata WHERE schema_name = 'public';
        `);
        expect(schemaRes.rows[0]?.schema_owner).toBe('nimphy_migrator');

        // Verify nimphy_migrator has CREATE privilege on target database
        const privTargetRes = await targetClient.query<{ has_create: boolean }>(`
          SELECT has_database_privilege('nimphy_migrator', current_database(), 'CREATE') as has_create;
        `);
        expect(privTargetRes.rows[0]?.has_create).toBe(true);

        // 2. Rerun bootstrap on target DB to prove idempotency
        await expect(
          bootstrapDatabase(targetClient, {
            dbName: bootTargetDb,
            allowedMembers: {
              nimphy_migrator: ['nimphy_migrator_login', migratorUsername],
              nimphy_app: ['nimphy_app_login', appUsername],
              nimphy_purge: ['nimphy_purge_login', purgeUsername],
            },
          }),
        ).resolves.not.toThrow();

        // 3. Connect as non-superuser migrator login to bootTargetDb and run migrations
        await adminClient.query(`
          GRANT CONNECT ON DATABASE "${bootTargetDb}" TO "${migratorUsername}";
          GRANT nimphy_migrator TO "${migratorUsername}" WITH INHERIT FALSE, SET TRUE;
        `);

        const migTargetUrl = new URL(targetUrl.toString());
        migTargetUrl.username = migratorUsername;
        migTargetUrl.password = migratorPassword;
        const migTargetPool = createDatabasePool({ connectionString: migTargetUrl.toString() });

        try {
          const rep = await runMigrations(migTargetPool, { migrationsDir: MIGRATIONS_DIR });
          expect(rep.appliedCount).toBe(1);
          expect(rep.totalMigrations).toBe(1);
        } finally {
          await migTargetPool.end();
        }
      } finally {
        targetClient.release();
        await targetPool.end();
      }

      // 4. Verify unrelated database: public schema owner is NOT nimphy_migrator and has NO create privilege
      const unrelatedUrl = new URL(baseDbUrl);
      unrelatedUrl.pathname = `/${bootUnrelatedDb}`;
      const unrelatedPool = new Pool({ connectionString: unrelatedUrl.toString() });
      const unrelatedClient = await unrelatedPool.connect();

      try {
        const unrelSchemaRes = await unrelatedClient.query<{ schema_owner: string }>(`
          SELECT schema_owner FROM information_schema.schemata WHERE schema_name = 'public';
        `);
        expect(unrelSchemaRes.rows[0]?.schema_owner).not.toBe('nimphy_migrator');

        const unrelPrivRes = await unrelatedClient.query<{ has_create: boolean }>(`
          SELECT has_database_privilege('nimphy_migrator', current_database(), 'CREATE') as has_create;
        `);
        expect(unrelPrivRes.rows[0]?.has_create).toBe(false);
      } finally {
        unrelatedClient.release();
        await unrelatedPool.end();
      }
    } finally {
      // Cleanup both test databases
      await adminClient.query(`DROP DATABASE IF EXISTS "${bootTargetDb}" WITH (FORCE);`);
      await adminClient.query(`DROP DATABASE IF EXISTS "${bootUnrelatedDb}" WITH (FORCE);`);
      adminClient.release();
    }
  });
});
