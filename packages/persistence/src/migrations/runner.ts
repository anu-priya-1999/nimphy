import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { sanitizeErrorMessage } from '../db/pool';
import type {
  AppliedMigrationRecord,
  MigrationFile,
  MigrationReport,
  RunMigrationsOptions,
} from './types';

// PostgreSQL advisory lock keys for schema migrations
const ADVISORY_LOCK_KEY_1 = 481927;
const ADVISORY_LOCK_KEY_2 = 391823;

export function computeSha256Checksum(content: string): string {
  // Normalize CRLF to LF so line-ending variations across OS don't affect migration checksums
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir);
  const files: MigrationFile[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;

    const match = entry.match(/^(\d+)_(.+)\.sql$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(
        `Invalid migration filename format: "${entry}". Must match "<version>_<name>.sql" (e.g. "001_initial_schema.sql")`,
      );
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const fullPath = path.join(migrationsDir, entry);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeSha256Checksum(content);

    files.push({
      version,
      name,
      filename: entry,
      fullPath,
      checksum,
      content,
    });
  }

  // Deterministic ascending version order
  files.sort((a, b) => a.version - b.version);

  // Check for duplicate version numbers
  const seenVersions = new Set<number>();
  for (const file of files) {
    if (seenVersions.has(file.version)) {
      throw new Error(
        `Duplicate migration version detected: ${file.version} in file "${file.filename}"`,
      );
    }
    seenVersions.add(file.version);
  }

  return files;
}

export async function runMigrations(
  poolOrClient: Pool | PoolClient,
  options: RunMigrationsOptions = {},
): Promise<MigrationReport> {
  const migrationsDir = options.migrationsDir || path.resolve(__dirname, '../../migrations');
  const targetRole = options.targetRole !== undefined ? options.targetRole : 'nimphy_migrator';

  const migrationFiles = loadMigrationFiles(migrationsDir);

  const client = 'connect' in poolOrClient ? await poolOrClient.connect() : poolOrClient;
  const isDedicatedClient = 'connect' in poolOrClient;
  let roleSwitched = false;

  try {
    // 1. If targetRole is specified, switch to it and verify current_user before running migrations
    if (targetRole) {
      const safeRole = targetRole.replace(/"/g, '""');
      await client.query(`SET ROLE "${safeRole}";`);
      roleSwitched = true;
      const checkRes = await client.query<{ current_user: string }>('SELECT current_user;');
      const effectiveUser = checkRes.rows[0]?.current_user;
      if (effectiveUser !== targetRole) {
        throw new Error(
          `Role switch verification failed: expected current_user "${targetRole}", got "${effectiveUser}"`,
        );
      }
    }

    // 2. Acquire PostgreSQL advisory lock to ensure single-runner execution
    await client.query('SELECT pg_advisory_lock($1, $2);', [
      ADVISORY_LOCK_KEY_1,
      ADVISORY_LOCK_KEY_2,
    ]);

    try {
      // 1. Ensure metadata schema and table exist
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS nimphy_meta;
        CREATE TABLE IF NOT EXISTS nimphy_meta.schema_migrations (
          version integer PRIMARY KEY,
          name text NOT NULL,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      // 2. Fetch applied migrations
      const appliedResult = await client.query<AppliedMigrationRecord>(`
        SELECT version, name, checksum, applied_at
        FROM nimphy_meta.schema_migrations
        ORDER BY version ASC;
      `);
      const appliedMap = new Map<number, AppliedMigrationRecord>();
      for (const row of appliedResult.rows) {
        appliedMap.set(row.version, row);
      }

      // 3. Verify that all previously applied migrations exist in local files and match checksums
      for (const [version, record] of appliedMap.entries()) {
        const file = migrationFiles.find((f) => f.version === version);
        if (!file) {
          throw new Error(
            `Unexpected database migration version ${version} ("${record.name}"). ` +
              `This migration has been applied to the database but does not exist in the local migrations directory.`,
          );
        }
      }

      for (const file of migrationFiles) {
        const applied = appliedMap.get(file.version);
        if (applied) {
          if (applied.checksum !== file.checksum) {
            throw new Error(
              `Migration checksum mismatch for version ${file.version} ("${file.filename}"). ` +
                `Recorded checksum: ${applied.checksum}, Current file checksum: ${file.checksum}. ` +
                `Previously applied migrations must not be modified.`,
            );
          }
        }
      }

      // 4. Apply pending migrations sequentially in individual transactions
      let appliedCount = 0;
      let skippedCount = 0;
      const reportItems = [];

      for (const file of migrationFiles) {
        if (appliedMap.has(file.version)) {
          skippedCount++;
          reportItems.push({
            version: file.version,
            name: file.name,
            checksum: file.checksum,
            status: 'skipped' as const,
          });
          continue;
        }

        // Apply within an explicit transaction
        await client.query('BEGIN;');
        try {
          await client.query(file.content);
          await client.query(
            `INSERT INTO nimphy_meta.schema_migrations (version, name, checksum, applied_at)
             VALUES ($1, $2, $3, now());`,
            [file.version, file.name, file.checksum],
          );
          await client.query('COMMIT;');
          appliedCount++;
          reportItems.push({
            version: file.version,
            name: file.name,
            checksum: file.checksum,
            status: 'applied' as const,
          });
        } catch (err) {
          await client.query('ROLLBACK;');
          const originalMsg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Migration ${file.filename} failed: ${sanitizeErrorMessage(originalMsg)}`,
          );
        }
      }

      return {
        appliedCount,
        skippedCount,
        totalMigrations: migrationFiles.length,
        migrations: reportItems,
      };
    } finally {
      // Always release advisory lock
      await client.query('SELECT pg_advisory_unlock($1, $2);', [
        ADVISORY_LOCK_KEY_1,
        ADVISORY_LOCK_KEY_2,
      ]);
    }
  } finally {
    if (roleSwitched) {
      try {
        await client.query('RESET ROLE;');
      } catch {
        // Best-effort role reset
      }
    }
    if (isDedicatedClient) {
      (client as PoolClient).release();
    }
  }
}
