import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const pg = require(path.resolve(__dirname, '../packages/persistence/node_modules/pg'));
const { Pool } = pg;

const ADVISORY_LOCK_KEY_1 = 481927;
const ADVISORY_LOCK_KEY_2 = 391823;

function sanitizeErrorMessage(message) {
  return message
    .replace(/postgres(ql)?:\/\/[^:]+:([^@]+)@/gi, 'postgresql://[REDACTED]:[REDACTED]@')
    .replace(
      /(password\s*=\s*)(?:(")(?:[^"\\]|\\.)*(")|(')(?:[^'\\]|\\.)*(')|([^\s;,]+))/gi,
      (_match, p1, q1_open, _q1_close, q2_open) => {
        const quote = q1_open || q2_open || '';
        return `${p1}${quote}[REDACTED]${quote}`;
      },
    )
    .replace(
      /(["']password["']\s*:\s*)(?:(["'])((?:(?!\2)[^\\]|\\.)*)\2|([^\s,}]+))/gi,
      (_match, p1, q_open) => {
        const quote = q_open || '';
        return `${p1}${quote}[REDACTED]${quote}`;
      },
    );
}

function computeSha256(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function loadMigrations(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir);
  const migrations = [];

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;

    const match = entry.match(/^(\d+)_(.+)\.sql$/);
    if (!match || !match[1] || !match[2]) {
      throw new Error(
        `Invalid migration filename format: "${entry}". Must match "<version>_<name>.sql"`,
      );
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const fullPath = path.join(migrationsDir, entry);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeSha256(content);

    migrations.push({
      version,
      name,
      filename: entry,
      fullPath,
      checksum,
      content,
    });
  }

  migrations.sort((a, b) => a.version - b.version);

  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`Duplicate migration version detected: ${m.version} in file "${m.filename}"`);
    }
    seen.add(m.version);
  }

  return migrations;
}

export async function migrate(connectionString, migrationsDir, options = {}) {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const targetRole =
    options.targetRole !== undefined
      ? options.targetRole
      : process.env.MIGRATION_ROLE !== undefined
        ? process.env.MIGRATION_ROLE
        : 'nimphy_migrator';

  try {
    if (targetRole && targetRole !== 'none') {
      const safeRole = targetRole.replace(/"/g, '""');
      await client.query(`SET ROLE "${safeRole}";`);
      const checkRes = await client.query('SELECT current_user;');
      if (checkRes.rows[0]?.current_user !== targetRole) {
        throw new Error(
          `Role switch verification failed: expected current_user "${targetRole}", got "${checkRes.rows[0]?.current_user}"`,
        );
      }
    }

    // Acquire PostgreSQL advisory lock
    await client.query('SELECT pg_advisory_lock($1, $2);', [
      ADVISORY_LOCK_KEY_1,
      ADVISORY_LOCK_KEY_2,
    ]);

    try {
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS nimphy_meta;
        CREATE TABLE IF NOT EXISTS nimphy_meta.schema_migrations (
          version integer PRIMARY KEY,
          name text NOT NULL,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      const appliedRes = await client.query(`
        SELECT version, name, checksum, applied_at
        FROM nimphy_meta.schema_migrations
        ORDER BY version ASC;
      `);
      const appliedMap = new Map();
      for (const row of appliedRes.rows) {
        appliedMap.set(row.version, row);
      }

      const migrations = loadMigrations(migrationsDir);

      // Verify that all previously applied migrations exist in local files and match checksums
      for (const [version, record] of appliedMap.entries()) {
        const m = migrations.find((f) => f.version === version);
        if (!m) {
          throw new Error(
            `Unexpected database migration version ${version} ("${record.name}"). ` +
              `This migration has been applied to the database but does not exist in the local migrations directory.`,
          );
        }
      }

      for (const m of migrations) {
        const applied = appliedMap.get(m.version);
        if (applied && applied.checksum !== m.checksum) {
          throw new Error(
            `Migration checksum mismatch for version ${m.version} ("${m.filename}"). ` +
              `Recorded checksum: ${applied.checksum}, current file checksum: ${m.checksum}. ` +
              `Previously applied migrations must not be modified.`,
          );
        }
      }

      let appliedCount = 0;
      let skippedCount = 0;
      const report = [];

      for (const m of migrations) {
        if (appliedMap.has(m.version)) {
          skippedCount++;
          report.push({
            version: m.version,
            name: m.name,
            status: 'skipped',
            checksum: m.checksum,
          });
          continue;
        }

        await client.query('BEGIN;');
        try {
          await client.query(m.content);
          await client.query(
            `INSERT INTO nimphy_meta.schema_migrations (version, name, checksum, applied_at)
             VALUES ($1, $2, $3, now());`,
            [m.version, m.name, m.checksum],
          );
          await client.query('COMMIT;');
          appliedCount++;
          report.push({
            version: m.version,
            name: m.name,
            status: 'applied',
            checksum: m.checksum,
          });
        } catch (err) {
          await client.query('ROLLBACK;');
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Migration ${m.filename} failed: ${sanitizeErrorMessage(msg)}`);
        }
      }

      return { appliedCount, skippedCount, total: migrations.length, migrations: report };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2);', [
        ADVISORY_LOCK_KEY_1,
        ADVISORY_LOCK_KEY_2,
      ]);
    }
  } finally {
    if (targetRole && targetRole !== 'none') {
      try {
        await client.query('RESET ROLE;');
      } catch {
        // Best-effort role reset
      }
    }
    client.release();
    await pool.end();
  }
}

async function runCli() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required to run migrations.');
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, '../packages/persistence/migrations');
  console.log(`Starting database migrations from: ${migrationsDir}`);

  try {
    const report = await migrate(databaseUrl, migrationsDir);
    console.log(
      `Migrations finished. Applied: ${report.appliedCount}, Skipped: ${report.skippedCount}, Total: ${report.total}`,
    );
    for (const m of report.migrations) {
      console.log(` - [${m.status.toUpperCase()}] ${m.version}: ${m.name}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Migration failed:`, sanitizeErrorMessage(msg));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli();
}
