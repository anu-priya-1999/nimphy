import crypto from 'crypto';
import path from 'path';
import { Pool } from 'pg';
import {
  BOOTSTRAP_ROLES_SQL,
  bootstrapDatabase,
  createDatabasePool,
  sanitizeErrorMessage,
  type DatabaseConfig,
  type SqlQueryClient,
} from '../../packages/persistence/src/index';

export function getBaseDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required for database tests.');
  }
  return url;
}

export function parseDatabaseUrl(urlStr: string): {
  baseUri: string;
  dbName: string;
} {
  const url = new URL(urlStr);
  const dbName = url.pathname.replace(/^\//, '') || 'postgres';
  url.pathname = '/postgres';
  return {
    baseUri: url.toString(),
    dbName,
  };
}

export interface ActiveSessionInfo {
  pid: number;
  usename: string;
  application_name: string;
  state: string;
}

export async function getActiveDatabaseSessions(
  adminClient: SqlQueryClient,
  dbName: string,
): Promise<ActiveSessionInfo[]> {
  const res = await adminClient.query<ActiveSessionInfo>(
    `SELECT pid, usename, application_name, state
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid();`,
    [dbName],
  );
  return res.rows;
}

export async function waitForZeroDatabaseSessions(
  adminClient: SqlQueryClient,
  dbName: string,
  timeoutMs: number = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let sessions = await getActiveDatabaseSessions(adminClient, dbName);
  while (sessions.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    sessions = await getActiveDatabaseSessions(adminClient, dbName);
  }

  if (sessions.length > 0) {
    const sessionDetails = sessions
      .map(
        (s) =>
          `PID ${s.pid} (role: ${s.usename ?? 'unknown'}, app: ${s.application_name ?? 'unknown'}, state: ${s.state ?? 'unknown'})`,
      )
      .join(', ');
    throw new Error(
      `Database cleanup failed: ${sessions.length} active session(s) remain on database "${dbName}": [${sessionDetails}]`,
    );
  }
}

export async function dropDatabaseCleanly(
  adminClient: SqlQueryClient,
  dbName: string,
  timeoutMs: number = 5000,
): Promise<void> {
  await waitForZeroDatabaseSessions(adminClient, dbName, timeoutMs);
  const safeDbName = dbName.replace(/"/g, '""');
  await adminClient.query(`DROP DATABASE IF EXISTS "${safeDbName}";`);
}

export interface SanitizedPoolError {
  code?: string;
  message: string;
}

export interface ManagedTestPool {
  pool: Pool;
  errors: SanitizedPoolError[];
  assertZeroErrors: () => void;
  close: () => Promise<void>;
}

export function createManagedTestPool(
  config: DatabaseConfig | { connectionString: string },
): ManagedTestPool {
  const pool = createDatabasePool(config);
  const recordedErrors: SanitizedPoolError[] = [];

  pool.on('error', (err: unknown) => {
    // Record only sanitized { code, message }, never the Client object or connectionParameters
    const pgErr = err as { code?: string; message?: string } | null;
    recordedErrors.push({
      code: pgErr?.code ? String(pgErr.code) : undefined,
      message: sanitizeErrorMessage(pgErr?.message ? String(pgErr.message) : String(err)),
    });
  });

  let ended = false;
  const close = async () => {
    if (!ended) {
      ended = true;
      await pool.end();
    }
  };

  const assertZeroErrors = () => {
    if (recordedErrors.length > 0) {
      const details = recordedErrors.map((e) => `[${e.code ?? 'NO_CODE'}] ${e.message}`).join('; ');
      throw new Error(`Unexpected pool error(s) detected: ${details}`);
    }
  };

  return {
    pool,
    errors: recordedErrors,
    assertZeroErrors,
    close,
  };
}

export async function createIsolatedTestDb(testPrefix: string): Promise<{
  testDbUrl: string;
  testDbName: string;
  dropTestDb: () => Promise<void>;
}> {
  const baseDbUrl = getBaseDatabaseUrl();
  const sanitizedPrefix = testPrefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 16);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const testDbName = `nimphy_test_${sanitizedPrefix}_${Date.now()}_${randomSuffix}`.slice(0, 63);

  // Connect to administrative 'postgres' db to manage test databases
  const adminUrl = new URL(baseDbUrl);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  const adminClient = await adminPool.connect();

  try {
    // Create fresh test database cleanly
    await adminClient.query(`CREATE DATABASE "${testDbName}";`);

    // Ensure baseline functional roles and default service logins exist with proper grants
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

    // Ensure cluster roles exist and adhere to secure configuration
    await adminClient.query(BOOTSTRAP_ROLES_SQL);
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  const testDbUrlObj = new URL(baseDbUrl);
  testDbUrlObj.pathname = `/${testDbName}`;
  const testDbUrl = testDbUrlObj.toString();

  // Run database bootstrap on the new database using an administrative connection
  const bootstrapPool = new Pool({ connectionString: testDbUrl });
  const bootstrapClient = await bootstrapPool.connect();
  try {
    await bootstrapDatabase(bootstrapClient, { dbName: testDbName, grantToCurrentUser: true });
  } finally {
    bootstrapClient.release();
    await bootstrapPool.end();
  }

  const dropTestDb = async () => {
    const cleanupAdminPool = new Pool({ connectionString: adminUrl.toString() });
    const cleanupClient = await cleanupAdminPool.connect();
    try {
      await dropDatabaseCleanly(cleanupClient, testDbName);
    } finally {
      cleanupClient.release();
      await cleanupAdminPool.end();
    }
  };

  return {
    testDbUrl,
    testDbName,
    dropTestDb,
  };
}

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../packages/persistence/migrations');
