import type { DatabasePool, SqlQueryClient } from './types';

/**
 * Executes `fn` inside a PostgreSQL transaction (`BEGIN ... COMMIT / ROLLBACK`).
 * Always releases the acquired client back to the pool.
 */
export async function withTransaction<T>(
  pool: DatabasePool,
  fn: (client: SqlQueryClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error if ROLLBACK also fails
    }
    throw error;
  } finally {
    client.release();
  }
}
