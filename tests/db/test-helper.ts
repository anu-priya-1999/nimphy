import path from 'path';
import { Pool } from 'pg';
import { BOOTSTRAP_ROLES_SQL, bootstrapDatabase } from '../../packages/persistence/src/index';

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

export async function createIsolatedTestDb(testPrefix: string): Promise<{
  testDbUrl: string;
  testDbName: string;
  dropTestDb: () => Promise<void>;
}> {
  const baseDbUrl = getBaseDatabaseUrl();
  const sanitizedPrefix = testPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const testDbName = `nimphy_test_${sanitizedPrefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Connect to administrative 'postgres' db to manage test databases
  const adminUrl = new URL(baseDbUrl);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  const adminClient = await adminPool.connect();

  try {
    // Drop existing if any, then create fresh
    await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE);`);
    await adminClient.query(`CREATE DATABASE ${testDbName};`);

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
      await cleanupClient.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE);`);
    } catch {
      // Best-effort cleanup
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
