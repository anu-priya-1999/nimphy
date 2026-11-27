import { createDatabasePool, type DatabasePool } from '@nimphy/persistence';

let cachedPool: DatabasePool | null = null;

/**
 * Lazily initializes and returns the singleton PostgreSQL pool for `@nimphy/web`.
 * Throws explicitly if `DATABASE_URL` is not configured.
 */
export function getServerDatabasePool(): DatabasePool {
  if (cachedPool) {
    return cachedPool;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not configured');
  }

  cachedPool = createDatabasePool({ connectionString, role: 'nimphy_app' });
  return cachedPool;
}
