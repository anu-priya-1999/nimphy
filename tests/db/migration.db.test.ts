import fs from 'fs';
import os from 'os';
import path from 'path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeSha256Checksum,
  createDatabasePool,
  runMigrations,
  sanitizeErrorMessage,
} from '../../packages/persistence/src/index';
import { createIsolatedTestDb, MIGRATIONS_DIR } from './test-helper';

describe('Database Foundation — Migration Runner Tests', () => {
  let testDbUrl: string;
  let dropTestDb: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const isolated = await createIsolatedTestDb('migrations');
    testDbUrl = isolated.testDbUrl;
    dropTestDb = isolated.dropTestDb;
    pool = createDatabasePool({ connectionString: testDbUrl });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
    if (dropTestDb) {
      await dropTestDb();
    }
  });

  it('runs migration 001 on an empty database successfully', async () => {
    const report = await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });

    expect(report.totalMigrations).toBe(1);
    expect(report.appliedCount).toBe(1);
    expect(report.skippedCount).toBe(0);
    expect(report.migrations).toHaveLength(1);
    expect(report.migrations[0]?.version).toBe(1);
    expect(report.migrations[0]?.status).toBe('applied');

    // Verify metadata table was created in nimphy_meta
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT version, name, checksum, applied_at FROM nimphy_meta.schema_migrations;',
      );
      expect(res.rows).toHaveLength(1);
      const row = res.rows[0];
      expect(row.version).toBe(1);
      expect(row.name).toBe('initial_schema');
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(row.applied_at).toBeInstanceOf(Date);
    } finally {
      client.release();
    }
  });

  it('is idempotent when re-run on an already migrated database', async () => {
    const report = await runMigrations(pool, { migrationsDir: MIGRATIONS_DIR });

    expect(report.appliedCount).toBe(0);
    expect(report.skippedCount).toBe(1);
    expect(report.totalMigrations).toBe(1);
    expect(report.migrations[0]?.status).toBe('skipped');

    // Confirm schema_migrations table still has exactly 1 row
    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT COUNT(*)::int as count FROM nimphy_meta.schema_migrations;',
      );
      expect(res.rows[0].count).toBe(1);
    } finally {
      client.release();
    }
  });

  it('fails closed when a previously applied migration checksum has changed', async () => {
    const client = await pool.connect();
    try {
      // Tamper with the recorded checksum in the metadata table
      await client.query(
        "UPDATE nimphy_meta.schema_migrations SET checksum = 'tampered_checksum_value_00000000000000000000000000000000' WHERE version = 1;",
      );

      await expect(runMigrations(pool, { migrationsDir: MIGRATIONS_DIR })).rejects.toThrow(
        /Migration checksum mismatch for version 1/,
      );
    } finally {
      // Restore valid checksum
      const migrationFiles = fs.readdirSync(MIGRATIONS_DIR);
      const sqlFile = migrationFiles.find((f) => f.startsWith('001_'));
      if (sqlFile) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, sqlFile), 'utf8');
        const validChecksum = computeSha256Checksum(content);
        await client.query(
          'UPDATE nimphy_meta.schema_migrations SET checksum = $1 WHERE version = 1;',
          [validChecksum],
        );
      }
      client.release();
    }
  });

  it('rolls back transaction on SQL failure and does not record migration in metadata', async () => {
    // Create another isolated DB to test rollback
    const rollbackDb = await createIsolatedTestDb('rollback');
    const rollbackPool = createDatabasePool({ connectionString: rollbackDb.testDbUrl });

    // Create a temporary migrations directory with a failing migration
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-bad-migration-'));
    try {
      fs.writeFileSync(
        path.join(tempDir, '001_bad.sql'),
        'CREATE TABLE test_good (id int);\nINVALID SQL SYNTAX HERE;',
        'utf8',
      );

      await expect(runMigrations(rollbackPool, { migrationsDir: tempDir })).rejects.toThrow(
        /Migration 001_bad\.sql failed/,
      );

      // Verify test_good was rolled back
      const client = await rollbackPool.connect();
      try {
        const tableCheck = await client.query("SELECT to_regclass('public.test_good') as tbl;");
        expect(tableCheck.rows[0].tbl).toBeNull();

        // Metadata table should not have recorded version 1
        const metaCheck = await client.query(
          'SELECT COUNT(*)::int as count FROM nimphy_meta.schema_migrations;',
        );
        expect(metaCheck.rows[0].count).toBe(0);
      } finally {
        client.release();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      await rollbackPool.end();
      await rollbackDb.dropTestDb();
    }
  });

  it('fails closed when database contains unexpected migration versions not present in local files', async () => {
    const client = await pool.connect();
    try {
      // Artificially inject an unexpected future migration record into the metadata table
      await client.query(`
        INSERT INTO nimphy_meta.schema_migrations (version, name, checksum, applied_at)
        VALUES (999, 'unexpected_future_migration', '0000000000000000000000000000000000000000000000000000000000000000', now());
      `);

      await expect(runMigrations(pool, { migrationsDir: MIGRATIONS_DIR })).rejects.toThrow(
        /Unexpected database migration version 999/,
      );
    } finally {
      await client.query('DELETE FROM nimphy_meta.schema_migrations WHERE version = 999;');
      client.release();
    }
  });

  it('reliably releases advisory lock on failure, allowing immediate lock acquisition by another connection', async () => {
    const failDb = await createIsolatedTestDb('lock_release');
    const failPool = createDatabasePool({ connectionString: failDb.testDbUrl });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-fail-lock-'));
    try {
      fs.writeFileSync(
        path.join(tempDir, '001_fail.sql'),
        'INVALID DDL SYNTAX TO TRIGGER FAILURE;',
        'utf8',
      );

      await expect(runMigrations(failPool, { migrationsDir: tempDir })).rejects.toThrow();

      // Verify another connection can acquire the advisory lock immediately (not held)
      const client = await failPool.connect();
      try {
        const lockRes = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock(481927, 391823) AS acquired;',
        );
        expect(lockRes.rows[0]?.acquired).toBe(true);

        // Unlock after verification
        await client.query('SELECT pg_advisory_unlock(481927, 391823);');
      } finally {
        client.release();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      await failPool.end();
      await failDb.dropTestDb();
    }
  });

  it('sanitizes error messages containing connection strings, passwords, or credentials', () => {
    // 1. PostgreSQL URIs with user & password
    expect(
      sanitizeErrorMessage(
        'Connection error: postgresql://admin_user:secret_pwd_123@db.prod.internal:5432/nimphy',
      ),
    ).toBe('Connection error: postgresql://[REDACTED]:[REDACTED]@db.prod.internal:5432/nimphy');

    expect(
      sanitizeErrorMessage(
        'Connection error: postgres://admin_user:secret_pwd_123@db.prod.internal:5432/nimphy',
      ),
    ).toBe('Connection error: postgresql://[REDACTED]:[REDACTED]@db.prod.internal:5432/nimphy');

    // 2. Key-value connection strings with single or double quotes
    expect(
      sanitizeErrorMessage("host=localhost port=5432 password='my_secret_pass' user=nimphy_app"),
    ).toBe("host=localhost port=5432 password='[REDACTED]' user=nimphy_app");

    expect(
      sanitizeErrorMessage('host=localhost port=5432 password="my_secret_pass" user=nimphy_app'),
    ).toBe('host=localhost port=5432 password="[REDACTED]" user=nimphy_app');

    // 3. Unquoted key-value connection strings
    expect(
      sanitizeErrorMessage('host=localhost port=5432 password=my_unquoted_pass dbname=nimphy'),
    ).toBe('host=localhost port=5432 password=[REDACTED] dbname=nimphy');

    // 4. JSON credential structures
    expect(
      sanitizeErrorMessage(
        'Failed config payload: {"user": "app", "password": "super_secret_token"}',
      ),
    ).toBe('Failed config payload: {"user": "app", "password": "[REDACTED]"}');

    // 5. Escaped quotes and delimiter-containing values
    expect(sanitizeErrorMessage('password="sec\\"ret" host=localhost')).toBe(
      'password="[REDACTED]" host=localhost',
    );

    expect(sanitizeErrorMessage("password='sec\\'ret' host=localhost")).toBe(
      "password='[REDACTED]' host=localhost",
    );

    expect(sanitizeErrorMessage('password = "my;secret=value;with spaces" host=localhost')).toBe(
      'password = "[REDACTED]" host=localhost',
    );

    expect(
      sanitizeErrorMessage('{"password": "nested \\"quoted\\" secret with ; delimiters"}'),
    ).toBe('{"password": "[REDACTED]"}');

    expect(sanitizeErrorMessage("{'password': 'single_quoted_json'}")).toBe(
      "{'password': '[REDACTED]'}",
    );

    expect(sanitizeErrorMessage('{"password": 12345}')).toBe('{"password": [REDACTED]}');
  });
});
