import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabasePool, runMigrations } from '../../packages/persistence/src/index';
import { createIsolatedTestDb, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Foreign Key & Integrity Tests', () => {
  let testDbUrl: string;
  let dropTestDb: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDb('foreign_keys');
    testDbUrl = isolated.testDbUrl;
    dropTestDb = isolated.dropTestDb;
    pool = createDatabasePool({ connectionString: testDbUrl });
    await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (dropTestDb) await dropTestDb();
  });

  it('rejects business_cases with non-existent user_id foreign key', async () => {
    const client = await pool.connect();
    try {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
      await expect(
        client.query(
          `
          INSERT INTO business_cases (user_id, title)
          VALUES ($1, 'Orphan Case');
        `,
          [nonExistentUserId],
        ),
      ).rejects.toThrow(/foreign key/i);
    } finally {
      client.release();
    }
  });

  it('rejects case_revisions with non-existent case_id foreign key', async () => {
    const client = await pool.connect();
    try {
      const nonExistentCaseId = '00000000-0000-0000-0000-000000000000';
      await expect(
        client.query(
          `
          INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
          VALUES ($1, 1, '{}', 1, 'hash1');
        `,
          [nonExistentCaseId],
        ),
      ).rejects.toThrow(/foreign key/i);
    } finally {
      client.release();
    }
  });

  it('enforces rule_packs date range check and unique (pack_key, version)', async () => {
    const client = await pool.connect();
    try {
      // effective_to <= effective_from fails
      await expect(
        client.query(`
          INSERT INTO rule_packs (pack_key, version, effective_from, effective_to, content, content_hash, source_ref, source_retrieved_at, status)
          VALUES ('kdp_us', '1.0.0', '2026-01-01', '2025-12-31', '{}', 'hash_rp', 'Official KDP', '2026-01-01', 'draft');
        `),
      ).rejects.toThrow(/check/i);

      // Same effective_from and effective_to fails (must be > effective_from)
      await expect(
        client.query(`
          INSERT INTO rule_packs (pack_key, version, effective_from, effective_to, content, content_hash, source_ref, source_retrieved_at, status)
          VALUES ('kdp_us', '1.0.0', '2026-01-01', '2026-01-01', '{}', 'hash_rp', 'Official KDP', '2026-01-01', 'draft');
        `),
      ).rejects.toThrow(/check/i);

      // Valid rule pack insert
      await client.query(`
        INSERT INTO rule_packs (pack_key, version, effective_from, effective_to, content, content_hash, source_ref, source_retrieved_at, status)
        VALUES ('kdp_us', '1.0.0', '2026-01-01', '2026-12-31', '{"royalty": 0.7}', 'hash_rp_valid', 'Official KDP', '2026-01-01', 'published');
      `);

      // Duplicate (pack_key, version) fails
      await expect(
        client.query(`
          INSERT INTO rule_packs (pack_key, version, effective_from, effective_to, content, content_hash, source_ref, source_retrieved_at, status)
          VALUES ('kdp_us', '1.0.0', '2027-01-01', null, '{"royalty": 0.7}', 'hash_rp_valid_2', 'Official KDP', '2027-01-01', 'published');
        `),
      ).rejects.toThrow(/unique/i);
    } finally {
      client.release();
    }
  });

  it('prevents deletion of rule_packs referenced by calculation_runs (ON DELETE NO ACTION)', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query(`
        INSERT INTO app_users (idp_subject, email) VALUES ('auth0|calc_user', 'calc@example.com') RETURNING id;
      `);
      const caseRes = await client.query(
        `
        INSERT INTO business_cases (user_id, title) VALUES ($1, 'Calc Case') RETURNING id;
      `,
        [userRes.rows[0].id],
      );
      const revRes = await client.query(
        `
        INSERT INTO case_revisions (case_id, revision_no, inputs, inputs_schema_version, inputs_hash)
        VALUES ($1, 1, '{}', 1, 'hash_rev') RETURNING id;
      `,
        [caseRes.rows[0].id],
      );
      const rpRes = await client.query(`
        INSERT INTO rule_packs (pack_key, version, effective_from, content, content_hash, source_ref, source_retrieved_at, status)
        VALUES ('kdp_no_action', '1.0.0', '2026-01-01', '{}', 'hash_na', 'KDP Doc', '2026-01-01', 'draft') RETURNING id;
      `);

      const rpId = rpRes.rows[0].id;

      await client.query(
        `
        INSERT INTO calculation_runs (revision_id, rule_pack_id, engine_version, scenario_params, results, trace, results_hash)
        VALUES ($1, $2, '1.0.0', '{}', '{"profit": 500}', '[]', 'hash_run');
      `,
        [revRes.rows[0].id, rpId],
      );

      // Attempting to delete rule_pack must fail because calculation_runs references it
      await expect(client.query('DELETE FROM rule_packs WHERE id = $1;', [rpId])).rejects.toThrow(
        /foreign key/i,
      );
    } finally {
      client.release();
    }
  });

  it('verifies audit_log has no foreign keys', async () => {
    const client = await pool.connect();
    try {
      // Can insert with non-existent random actor_user_id
      const fakeUserId = '99999999-9999-9999-9999-999999999999';
      const res = await client.query(
        `
        INSERT INTO audit_log (actor_user_id, actor_kind, action, entity_type, entity_id)
        VALUES ($1, 'system', 'system.startup', 'system', 'sys_1')
        RETURNING id, actor_user_id;
      `,
        [fakeUserId],
      );

      expect(res.rows[0].actor_user_id).toBe(fakeUserId);

      // Query foreign keys on audit_log from information_schema
      const fkCheck = await client.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'audit_log' AND constraint_type = 'FOREIGN KEY';
      `);
      expect(fkCheck.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
