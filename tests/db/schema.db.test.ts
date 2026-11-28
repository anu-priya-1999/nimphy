import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabasePool, runMigrations } from '../../packages/persistence/src/index';
import { createIsolatedTestDb, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Schema & Constraint Tests', () => {
  let testDbUrl: string;
  let dropTestDb: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDb('schema');
    testDbUrl = isolated.testDbUrl;
    dropTestDb = isolated.dropTestDb;
    pool = createDatabasePool({ connectionString: testDbUrl });
    await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (dropTestDb) await dropTestDb();
  });

  it('creates the eight domain/web tables in the public schema (STEP-010 + STEP-012)', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);
      const tableNames = res.rows.map((r) => r.table_name);
      expect(tableNames).toEqual([
        'app_users',
        'audit_log',
        'business_cases',
        'calculation_runs',
        'case_revisions',
        'evidence_items',
        'idempotency_keys',
        'rule_packs',
      ]);

      // Confirm no future-step tables exist
      const futureTables = [
        'memos',
        'ai_invocations',
        'dossiers',
        'price_points',
        'orders',
        'payment_events',
        'entitlements',
      ];
      for (const ft of futureTables) {
        expect(tableNames).not.toContain(ft);
      }
    } finally {
      client.release();
    }
  });

  it('verifies app_users columns, defaults, and tombstone constraints', async () => {
    const client = await pool.connect();
    try {
      // UUID default works
      const insertRes = await client.query(`
        INSERT INTO app_users (idp_subject, email)
        VALUES ('auth0|12345', 'author@example.com')
        RETURNING id, status, purge_attempts, created_at;
      `);
      const user = insertRes.rows[0];
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(user.status).toBe('active');
      expect(user.purge_attempts).toBe(0);
      expect(user.created_at).toBeInstanceOf(Date);

      // Unique constraint on idp_subject
      await expect(
        client.query(`
          INSERT INTO app_users (idp_subject, email)
          VALUES ('auth0|12345', 'other@example.com');
        `),
      ).rejects.toThrow(/unique/i);

      // Tombstone check: deleted status requires null email, null idp_subject, and non-null deleted_at
      await expect(
        client.query(
          `
          UPDATE app_users
          SET status = 'deleted'
          WHERE id = $1;
        `,
          [user.id],
        ),
      ).rejects.toThrow(/check/i);

      // Valid tombstone update succeeds
      await client.query(
        `
        UPDATE app_users
        SET status = 'deleted',
            idp_subject = NULL,
            email = NULL,
            deleted_at = now()
        WHERE id = $1;
      `,
        [user.id],
      );

      const tombstoned = await client.query('SELECT * FROM app_users WHERE id = $1;', [user.id]);
      expect(tombstoned.rows[0].status).toBe('deleted');
      expect(tombstoned.rows[0].email).toBeNull();
      expect(tombstoned.rows[0].idp_subject).toBeNull();
      expect(tombstoned.rows[0].deleted_at).toBeInstanceOf(Date);
    } finally {
      client.release();
    }
  });

  it('verifies business_cases title length constraint (1 to 200 chars)', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email)
        VALUES ('auth0|case_test', 'case_owner@example.com')
        RETURNING id;
      `);
      const userId = userRes.rows[0].id;

      // Empty title fails
      await expect(
        client.query(
          `
          INSERT INTO business_cases (user_id, title)
          VALUES ($1, '');
        `,
          [userId],
        ),
      ).rejects.toThrow(/check/i);

      // 201-char title fails
      const longTitle = 'a'.repeat(201);
      await expect(
        client.query(
          `
          INSERT INTO business_cases (user_id, title)
          VALUES ($1, $2);
        `,
          [userId, longTitle],
        ),
      ).rejects.toThrow(/check/i);

      // 1-char title succeeds
      const validCase = await client.query(
        `
        INSERT INTO business_cases (user_id, title)
        VALUES ($1, 'A')
        RETURNING id, title, status;
      `,
        [userId],
      );
      expect(validCase.rows[0].title).toBe('A');
      expect(validCase.rows[0].status).toBe('active');
    } finally {
      client.release();
    }
  });

  it('verifies case_revisions revision_no > 0 check and uniqueness per case', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|rev_user', 'rev@example.com') RETURNING id;
      `);
      const userId = userRes.rows[0].id;

      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Test Case') RETURNING id;
      `,
        [userId],
      );
      const caseId = caseRes.rows[0].id;

      // revision_no = 0 fails
      await expect(
        client.query(
          `
          INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
          VALUES ($1, 0, '{}', 1, 'hash0');
        `,
          [caseId],
        ),
      ).rejects.toThrow(/check/i);

      // revision_no = 1 succeeds
      await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{"price": 1000}', 1, 'hash1');
      `,
        [caseId],
      );

      // duplicate revision_no = 1 on same case fails
      await expect(
        client.query(
          `
          INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
          VALUES ($1, 1, '{"price": 2000}', 1, 'hash2');
        `,
          [caseId],
        ),
      ).rejects.toThrow(/unique/i);
    } finally {
      client.release();
    }
  });

  it('verifies evidence_items provenance and kind check constraints', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|ev_user', 'ev@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Ev Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const revRes = await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{}', 1, 'hash1') RETURNING id;
      `,
        [caseRes.rows[0].id],
      );
      const revId = revRes.rows[0].id;

      // Invalid provenance fails
      await expect(
        client.query(
          `
          INSERT INTO evidence_items (revision_id, provenance, kind, summary)
          VALUES ($1, 'invalid_prov', 'note', 'Summary');
        `,
          [revId],
        ),
      ).rejects.toThrow(/check/i);

      // Invalid kind fails
      await expect(
        client.query(
          `
          INSERT INTO evidence_items (revision_id, provenance, kind, summary)
          VALUES ($1, 'user_input', 'invalid_kind', 'Summary');
        `,
          [revId],
        ),
      ).rejects.toThrow(/check/i);

      // Valid evidence succeeds
      const evRes = await client.query(
        `
        INSERT INTO evidence_items (revision_id, provenance, kind, summary, source_ref)
        VALUES ($1, 'official_fact', 'quote', 'Verified quote', 'https://example.com/source')
        RETURNING id, provenance, kind, summary;
      `,
        [revId],
      );
      expect(evRes.rows[0].provenance).toBe('official_fact');
      expect(evRes.rows[0].kind).toBe('quote');
    } finally {
      client.release();
    }
  });

  it('verifies effective least-privilege matrix for PUBLIC, nimphy_app, and nimphy_purge roles', async () => {
    const client = await pool.connect();
    try {
      // 1. PUBLIC must NOT have CREATE privilege on schema public
      const publicCreate = await client.query<{ has_create: boolean }>(
        "SELECT has_schema_privilege('public', 'public', 'CREATE') as has_create;",
      );
      expect(publicCreate.rows[0].has_create).toBe(false);

      // 2. nimphy_app and nimphy_purge must NOT have CREATE privilege on schema public
      const appCreate = await client.query<{ has_create: boolean }>(
        "SELECT has_schema_privilege('nimphy_app', 'public', 'CREATE') as has_create;",
      );
      expect(appCreate.rows[0].has_create).toBe(false);

      const purgeCreate = await client.query<{ has_create: boolean }>(
        "SELECT has_schema_privilege('nimphy_purge', 'public', 'CREATE') as has_create;",
      );
      expect(purgeCreate.rows[0].has_create).toBe(false);

      // 3. nimphy_app must NOT have direct INSERT, UPDATE, or DELETE on audit_log
      const appAuditInsert = await client.query<{ has_insert: boolean }>(
        "SELECT has_table_privilege('nimphy_app', 'audit_log', 'INSERT') as has_insert;",
      );
      expect(appAuditInsert.rows[0].has_insert).toBe(false);

      const appAuditUpdate = await client.query<{ has_update: boolean }>(
        "SELECT has_table_privilege('nimphy_app', 'audit_log', 'UPDATE') as has_update;",
      );
      expect(appAuditUpdate.rows[0].has_update).toBe(false);

      const appAuditDelete = await client.query<{ has_delete: boolean }>(
        "SELECT has_table_privilege('nimphy_app', 'audit_log', 'DELETE') as has_delete;",
      );
      expect(appAuditDelete.rows[0].has_delete).toBe(false);

      // 4. Function execution privileges
      // Purge functions: only nimphy_purge (and owner), never PUBLIC or nimphy_app
      const publicPurgeExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('public', 'nimphy_purge_business_case(uuid)', 'EXECUTE') as has_exec;",
      );
      expect(publicPurgeExec.rows[0].has_exec).toBe(false);

      const appPurgeExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('nimphy_app', 'nimphy_purge_business_case(uuid)', 'EXECUTE') as has_exec;",
      );
      expect(appPurgeExec.rows[0].has_exec).toBe(false);

      const purgeExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('nimphy_purge', 'nimphy_purge_business_case(uuid)', 'EXECUTE') as has_exec;",
      );
      expect(purgeExec.rows[0].has_exec).toBe(true);

      // Audit writer function: nimphy_app has EXECUTE, PUBLIC does not
      const publicAuditExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('public', 'nimphy_write_audit_log(uuid, text, text, text, text, text, jsonb)', 'EXECUTE') as has_exec;",
      );
      expect(publicAuditExec.rows[0].has_exec).toBe(false);

      const appAuditExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('nimphy_app', 'nimphy_write_audit_log(uuid, text, text, text, text, text, jsonb)', 'EXECUTE') as has_exec;",
      );
      expect(appAuditExec.rows[0].has_exec).toBe(true);
    } finally {
      client.release();
    }
  });

  it('verifies that future functions created in the public schema do not grant default EXECUTE to PUBLIC', async () => {
    const client = await pool.connect();
    try {
      // 1. Verify default ACL entry was established by migration 001
      const dacl = await client.query('SELECT defaclobjtype, defaclacl FROM pg_default_acl;');
      expect(dacl.rows.length).toBeGreaterThan(0);
      expect(dacl.rows.some((r) => r.defaclobjtype === 'f')).toBe(true);

      // 2. Create a test function under the production migration role context (nimphy_migrator)
      await client.query('SET ROLE nimphy_migrator;');
      await client.query(`
        CREATE OR REPLACE FUNCTION test_future_routine()
        RETURNS text
        LANGUAGE sql
        AS $$ SELECT 'future_protected'::text $$;
      `);
      await client.query('RESET ROLE;');

      // 3. Verify function owner is nimphy_migrator
      const ownerRes = await client.query<{ owner: string }>(
        "SELECT pg_get_userbyid(proowner) as owner FROM pg_proc WHERE proname = 'test_future_routine';",
      );
      expect(ownerRes.rows[0].owner).toBe('nimphy_migrator');

      // 4. PUBLIC must NOT have EXECUTE on newly created functions by default
      const publicExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('public', 'test_future_routine()', 'EXECUTE') as has_exec;",
      );
      expect(publicExec.rows[0].has_exec).toBe(false);

      // 5. nimphy_app must NOT have EXECUTE on newly created functions by default
      const appExec = await client.query<{ has_exec: boolean }>(
        "SELECT has_function_privilege('nimphy_app', 'test_future_routine()', 'EXECUTE') as has_exec;",
      );
      expect(appExec.rows[0].has_exec).toBe(false);

      // Clean up
      await client.query('DROP FUNCTION test_future_routine();');
    } finally {
      client.release();
    }
  });
});
