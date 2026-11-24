import { DatabaseError, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabasePool, runMigrations } from '../../packages/persistence/src/index';
import { createIsolatedTestDb, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Immutability, Roles & Purge Tests', () => {
  let testDbUrl: string;
  let dropTestDb: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDb('immutability');
    testDbUrl = isolated.testDbUrl;
    dropTestDb = isolated.dropTestDb;
    pool = createDatabasePool({ connectionString: testDbUrl });
    await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (dropTestDb) await dropTestDb();
  });

  it('prevents application role (nimphy_app) from updating or deleting case_revisions', async () => {
    const client = await pool.connect();
    try {
      // Seed data as admin/migration owner
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|imm_user', 'imm@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Imm Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const revRes = await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{"val": 10}', 1, 'hash_imm_1') RETURNING id;
      `,
        [caseRes.rows[0].id],
      );
      const revId = revRes.rows[0].id;

      // Switch to application role nimphy_app
      await client.query('SET ROLE nimphy_app;');

      // UPDATE should fail
      await expect(
        client.query('UPDATE case_revisions SET inputs = \'{"val": 20}\' WHERE id = $1;', [revId]),
      ).rejects.toThrow();

      // DELETE should fail
      await expect(
        client.query('DELETE FROM case_revisions WHERE id = $1;', [revId]),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('prevents application role (nimphy_app) from updating or deleting calculation_runs', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|calc_imm', 'calc_imm@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Calc Imm Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const revRes = await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{}', 1, 'hash_rev_imm') RETURNING id;
      `,
        [caseRes.rows[0].id],
      );
      const rpRes = await client.query(`
        INSERT INTO rule_packs (pack_key, version, effective_from, content, content_hash, source_ref, source_retrieved_at, status)
        VALUES ('rp_imm', '1.0.0', '2026-01-01', '{}', 'hash_rp_imm', 'KDP', '2026-01-01', 'draft') RETURNING id;
      `);
      const runRes = await client.query(
        `
        INSERT INTO calculation_runs (revision_id, rule_pack_id, engine_version, scenario_params, results, trace, results_hash)
        VALUES ($1, $2, '1.0.0', '{}', '{"res": 1}', '[]', 'hash_run_imm') RETURNING id;
      `,
        [revRes.rows[0].id, rpRes.rows[0].id],
      );
      const runId = runRes.rows[0].id;

      await client.query('SET ROLE nimphy_app;');

      await expect(
        client.query("UPDATE calculation_runs SET engine_version = '2.0.0' WHERE id = $1;", [
          runId,
        ]),
      ).rejects.toThrow();

      await expect(
        client.query('DELETE FROM calculation_runs WHERE id = $1;', [runId]),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('prevents updating or deleting audit_log even by admin or app', async () => {
    const client = await pool.connect();
    try {
      const auditRes = await client.query(`
        INSERT INTO audit_log (actor_kind, action, entity_type, entity_id)
        VALUES ('system', 'case.created', 'business_case', 'case_123')
        RETURNING id;
      `);
      const auditId = auditRes.rows[0].id;

      // UPDATE fails via immutability trigger
      await expect(
        client.query("UPDATE audit_log SET action = 'tampered' WHERE id = $1;", [auditId]),
      ).rejects.toThrow(/append-only/i);

      // DELETE fails via immutability trigger
      await expect(client.query('DELETE FROM audit_log WHERE id = $1;', [auditId])).rejects.toThrow(
        /append-only/i,
      );

      // When role is nimphy_app, permission is denied directly
      await client.query('SET ROLE nimphy_app;');
      await expect(
        client.query("UPDATE audit_log SET action = 'tampered' WHERE id = $1;", [auditId]),
      ).rejects.toThrow();

      await expect(
        client.query('DELETE FROM audit_log WHERE id = $1;', [auditId]),
      ).rejects.toThrow();
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('allows draft rule_packs modification but rejects modifications to published rule_packs', async () => {
    const client = await pool.connect();
    try {
      const rpRes = await client.query(`
        INSERT INTO rule_packs (pack_key, version, effective_from, content, content_hash, source_ref, source_retrieved_at, status)
        VALUES ('rp_lifecycle', '1.0.0', '2026-01-01', '{"tier": 1}', 'hash_orig', 'Source 1', '2026-01-01', 'draft')
        RETURNING id;
      `);
      const rpId = rpRes.rows[0].id;

      // While draft: updating content succeeds
      await client.query(
        `
        UPDATE rule_packs
        SET content = '{"tier": 2}', content_hash = 'hash_draft_update'
        WHERE id = $1;
      `,
        [rpId],
      );

      // Publish the rule pack
      await client.query(
        `
        UPDATE rule_packs
        SET status = 'published'
        WHERE id = $1;
      `,
        [rpId],
      );

      // Now that it is published: modifying content or content_hash throws error
      await expect(
        client.query(
          `
          UPDATE rule_packs
          SET content = '{"tier": 3}', content_hash = 'hash_tamper'
          WHERE id = $1;
        `,
          [rpId],
        ),
      ).rejects.toThrow(/cannot be modified on published/i);

      // Modifying version on published pack throws error
      await expect(
        client.query(
          `
          UPDATE rule_packs
          SET version = '1.0.1'
          WHERE id = $1;
        `,
          [rpId],
        ),
      ).rejects.toThrow(/cannot be modified on published/i);

      // Deleting published rule pack throws error
      await expect(client.query('DELETE FROM rule_packs WHERE id = $1;', [rpId])).rejects.toThrow(
        /Published or retired rule packs cannot be deleted/i,
      );
    } finally {
      client.release();
    }
  });

  it('prevents application role (nimphy_app) from directly deleting business_cases (cascade bypass guard)', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|cascade_guard', 'guard@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Protected Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const caseId = caseRes.rows[0].id;

      await client.query('SET ROLE nimphy_app;');

      // nimphy_app cannot DELETE business_cases directly
      await expect(
        client.query('DELETE FROM business_cases WHERE id = $1;', [caseId]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('executes purge only through the dedicated purge role on pending_deletion cases', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|purge_user', 'purge@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Purge Target Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const caseId = caseRes.rows[0].id;

      const revRes = await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{"case": "purge"}', 1, 'hash_purge') RETURNING id;
      `,
        [caseId],
      );
      const revId = revRes.rows[0].id;

      // 1. Calling purge procedure from nimphy_app is denied
      await client.query('SET ROLE nimphy_app;');
      await expect(
        client.query('SELECT nimphy_purge_business_case($1);', [caseId]),
      ).rejects.toThrow(/permission denied/i);
      await client.query('RESET ROLE;');

      // 2. Calling purge on active case fails
      await client.query('SET ROLE nimphy_purge;');
      await expect(
        client.query('SELECT nimphy_purge_business_case($1);', [caseId]),
      ).rejects.toThrow(/is not pending deletion/i);
      await client.query('RESET ROLE;');

      // 3. Mark case as pending_deletion (application can do this via UPDATE)
      await client.query('SET ROLE nimphy_app;');
      await client.query(
        `
        UPDATE business_cases
        SET status = 'pending_deletion', deletion_requested_at = now()
        WHERE id = $1;
      `,
        [caseId],
      );
      await client.query('RESET ROLE;');

      // 4. Now purge role can execute the purge
      await client.query('SET ROLE nimphy_purge;');
      await client.query('SELECT nimphy_purge_business_case($1);', [caseId]);
      await client.query('RESET ROLE;');

      // Verify business case and cascading revision are gone
      const caseCheck = await client.query('SELECT * FROM business_cases WHERE id = $1;', [caseId]);
      expect(caseCheck.rows).toHaveLength(0);

      const revCheck = await client.query('SELECT * FROM case_revisions WHERE id = $1;', [revId]);
      expect(revCheck.rows).toHaveLength(0);
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  it('prevents application role (nimphy_app) from assuming the purge role (nimphy_purge)', async () => {
    const client = await pool.connect();
    try {
      // 1. Effective role membership verification: nimphy_app is not a member of nimphy_purge
      const roleMembership = await client.query<{ is_member: boolean }>(
        "SELECT pg_has_role('nimphy_app', 'nimphy_purge', 'MEMBER') as is_member;",
      );
      expect(roleMembership.rows[0].is_member).toBe(false);

      // 2. Behavioral verification: setting session authorization to nimphy_app blocks SET ROLE nimphy_purge
      await client.query('SET SESSION AUTHORIZATION nimphy_app;');
      await expect(client.query('SET ROLE nimphy_purge;')).rejects.toThrow(
        /permission denied to set role/i,
      );
    } finally {
      // Destroy the client on release so the modified session authorization is discarded
      client.release(true);
    }
  });

  it('prevents purging an app_user when active business cases still exist (cascade guard)', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email, status)
        VALUES ('auth0|purge_guard_u', 'guard_u@example.com', 'pending_deletion')
        RETURNING id;
      `);
      const userId = userRes.rows[0].id;

      // Create an active business case for this user
      await client.query(
        `
        INSERT INTO business_cases (user_id, title, status)
        VALUES ($1, 'Active Case Guarding User', 'active');
      `,
        [userId],
      );

      // Attempting to purge user while active case exists must fail
      await client.query('SET ROLE nimphy_purge;');
      await expect(client.query('SELECT nimphy_purge_app_user($1);', [userId])).rejects.toThrow(
        /has active business cases that are not pending deletion/i,
      );
      await client.query('RESET ROLE;');
    } finally {
      await client.query('RESET ROLE;');
      client.release();
    }
  });

  describe('Purge Concurrency & Race Condition Defense (Two-Connection Tests)', () => {
    it('prevents a concurrent active case insertion from surviving an in-flight account purge', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Setup: user in pending_deletion with no cases
        const userRes = await client1.query(`
          INSERT INTO app_users (idp_subject, email, status)
          VALUES ('auth0|concurrent_purge_u1', 'concur_u1@example.com', 'pending_deletion')
          RETURNING id;
        `);
        const userId = userRes.rows[0].id;

        // Connection 1: Account purge begins transaction and executes purge
        await client1.query('BEGIN;');
        await client1.query('SET ROLE nimphy_purge;');
        await client1.query('SELECT nimphy_purge_app_user($1);', [userId]);

        // Connection 2: Concurrent application transaction attempts to insert a new active case for this user
        await client2.query('SET ROLE nimphy_app;');
        let client2Resolved = false;
        let client2Error: DatabaseError | Error | null = null;

        const insertPromise = client2
          .query(
            `INSERT INTO business_cases (user_id, title, status) VALUES ($1, 'Concurrent Active Case', 'active');`,
            [userId],
          )
          .then(() => {
            client2Resolved = true;
          })
          .catch((err: unknown) => {
            client2Error = err as DatabaseError;
          });

        // Verify that client2 is blocked waiting for client1 to finish
        await new Promise((r) => setTimeout(r, 50));
        expect(client2Resolved).toBe(false);

        // Connection 1 commits the purge
        await client1.query('COMMIT;');

        // Client 2 unblocks; foreign key check against app_users fails
        await insertPromise;
        expect(client2Resolved).toBe(false);
        expect(client2Error).toBeDefined();
        expect((client2Error as DatabaseError).code).toBe('23503'); // foreign_key_violation

        // Verify no active case exists
        const caseCheck = await pool.query(
          `SELECT * FROM business_cases WHERE title = 'Concurrent Active Case';`,
        );
        expect(caseCheck.rows).toHaveLength(0);
      } finally {
        await client1.query('RESET ROLE;').catch(() => {});
        await client2.query('RESET ROLE;').catch(() => {});
        client1.release();
        client2.release();
      }
    });

    it('prevents account purge from removing a case that was concurrently restored to active', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Setup: user pending_deletion, case pending_deletion
        const userRes = await client1.query(`
          INSERT INTO app_users (idp_subject, email, status)
          VALUES ('auth0|concurrent_purge_u2', 'concur_u2@example.com', 'pending_deletion')
          RETURNING id;
        `);
        const userId = userRes.rows[0].id;

        const caseRes = await client1.query(
          `INSERT INTO business_cases (user_id, title, status) VALUES ($1, 'Restored Case', 'pending_deletion') RETURNING id;`,
          [userId],
        );
        const caseId = caseRes.rows[0].id;

        // Connection 2 (app): Starts transaction and updates case to active (holding row lock, not yet committed)
        await client2.query('BEGIN;');
        await client2.query('SET ROLE nimphy_app;');
        await client2.query(`UPDATE business_cases SET status = 'active' WHERE id = $1;`, [caseId]);

        // Connection 1 (purge): Begins account purge
        await client1.query('BEGIN;');
        await client1.query('SET ROLE nimphy_purge;');

        let client1Done = false;
        let client1Error: DatabaseError | Error | null = null;

        const purgePromise = client1
          .query('SELECT nimphy_purge_app_user($1);', [userId])
          .then(() => {
            client1Done = true;
          })
          .catch((err: unknown) => {
            client1Error = err as Error;
          });

        // Connection 1 blocks on business_cases row lock held by connection 2
        await new Promise((r) => setTimeout(r, 50));
        expect(client1Done).toBe(false);

        // Connection 2 commits the update to active
        await client2.query('COMMIT;');

        // Connection 1 unblocks, acquires row lock, inspects post-lock row state, and fails with active cases error
        await purgePromise;
        expect(client1Done).toBe(false);
        expect(client1Error).toBeDefined();
        expect(client1Error.message).toMatch(
          /has active business cases that are not pending deletion/i,
        );

        await client1.query('ROLLBACK;');

        // Verify active case is PRESERVED and user is NOT purged
        const caseCheck = await pool.query(`SELECT status FROM business_cases WHERE id = $1;`, [
          caseId,
        ]);
        expect(caseCheck.rows[0].status).toBe('active');

        const userCheck = await pool.query(`SELECT status FROM app_users WHERE id = $1;`, [userId]);
        expect(userCheck.rows[0].status).toBe('pending_deletion');
      } finally {
        await client1.query('RESET ROLE;').catch(() => {});
        await client2.query('RESET ROLE;').catch(() => {});
        client1.release();
        client2.release();
      }
    });

    it('prevents case purge from removing a case that was concurrently restored to active', async () => {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const userRes = await client1.query(`
          INSERT INTO app_users (idp_subject, email, status)
          VALUES ('auth0|concurrent_purge_u3', 'concur_u3@example.com', 'active')
          RETURNING id;
        `);
        const userId = userRes.rows[0].id;

        const caseRes = await client1.query(
          `INSERT INTO business_cases (user_id, title, status) VALUES ($1, 'Case Purge Target', 'pending_deletion') RETURNING id;`,
          [userId],
        );
        const caseId = caseRes.rows[0].id;

        // Connection 2 (app): Begins transaction and updates case to active (holding row lock, not yet committed)
        await client2.query('BEGIN;');
        await client2.query('SET ROLE nimphy_app;');
        await client2.query(`UPDATE business_cases SET status = 'active' WHERE id = $1;`, [caseId]);

        // Connection 1 (purge): Calls nimphy_purge_business_case
        await client1.query('BEGIN;');
        await client1.query('SET ROLE nimphy_purge;');

        let client1Done = false;
        let client1Error: DatabaseError | Error | null = null;

        const purgePromise = client1
          .query('SELECT nimphy_purge_business_case($1);', [caseId])
          .then(() => {
            client1Done = true;
          })
          .catch((err: unknown) => {
            client1Error = err as Error;
          });

        // Connection 1 blocks on business_cases row lock held by connection 2
        await new Promise((r) => setTimeout(r, 50));
        expect(client1Done).toBe(false);

        // Connection 2 commits the update to active
        await client2.query('COMMIT;');

        // Connection 1 unblocks, inspects locked row state, sees status is active, and fails
        await purgePromise;
        expect(client1Done).toBe(false);
        expect(client1Error).toBeDefined();
        expect(client1Error.message).toMatch(/is not pending deletion/i);

        await client1.query('ROLLBACK;');

        // Verify case remains active
        const caseCheck = await pool.query(`SELECT status FROM business_cases WHERE id = $1;`, [
          caseId,
        ]);
        expect(caseCheck.rows[0].status).toBe('active');
      } finally {
        await client1.query('RESET ROLE;').catch(() => {});
        await client2.query('RESET ROLE;').catch(() => {});
        client1.release();
        client2.release();
      }
    });

    it('verifies that an archived case cannot be purged via account purge or case purge', async () => {
      const client = await pool.connect();
      try {
        const userRes = await client.query(`
          INSERT INTO app_users (idp_subject, email, status)
          VALUES ('auth0|archived_guard_u', 'archived@example.com', 'pending_deletion')
          RETURNING id;
        `);
        const userId = userRes.rows[0].id;

        const caseRes = await client.query(
          `INSERT INTO business_cases (user_id, title, status) VALUES ($1, 'Archived Case', 'archived') RETURNING id;`,
          [userId],
        );
        const caseId = caseRes.rows[0].id;

        await client.query('SET ROLE nimphy_purge;');

        // 1. Account purge must fail because archived case exists
        await expect(client.query('SELECT nimphy_purge_app_user($1);', [userId])).rejects.toThrow(
          /has active business cases that are not pending deletion/i,
        );

        // 2. Individual case purge must fail because status is 'archived'
        await expect(
          client.query('SELECT nimphy_purge_business_case($1);', [caseId]),
        ).rejects.toThrow(/is not pending deletion \(status is archived\)/i);

        await client.query('RESET ROLE;');

        // Verify archived case is untouched
        const caseCheck = await client.query(`SELECT status FROM business_cases WHERE id = $1;`, [
          caseId,
        ]);
        expect(caseCheck.rows[0].status).toBe('archived');
      } finally {
        await client.query('RESET ROLE;');
        client.release();
      }
    });
  });
});
