import { Pool, type PoolClient } from 'pg';
import type { DatabaseConfig, DatabasePool } from './types';

export function sanitizeErrorMessage(message: string): string {
  // Redact PostgreSQL connection URIs containing passwords and key-value credentials
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

/**
 * Wraps `pool.connect` (used by both `pool.connect()` and `pool.query()`) so that
 * every physical connection activates the configured PostgreSQL role via `SET ROLE`
 * before any caller query can execute. On failure, the physical connection is
 * destroyed (`client.release(error)`) so it cannot leak back into the pool.
 */
function activateRoleOnPool(pool: Pool, role: string): void {
  const safeRole = role.replace(/"/g, '""');
  const setRoleSql = `SET ROLE "${safeRole}";`;
  const rawConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;

  const connectWithRole = (
    callback?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: unknown) => void,
    ) => void,
  ): Promise<PoolClient> | void => {
    const initPromise = rawConnect().then(async (client) => {
      try {
        await client.query(setRoleSql);
        return client;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        client.release(error);
        throw error;
      }
    });

    if (typeof callback === 'function') {
      initPromise.then(
        (client) => {
          callback(undefined, client, (releaseArg?: unknown) => {
            client.release(releaseArg as boolean | Error | undefined);
          });
        },
        (err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          callback(error, undefined, () => {});
        },
      );
      return;
    }

    return initPromise;
  };

  pool.connect = connectWithRole as Pool['connect'];
}

export function createDatabasePool(config: DatabaseConfig): DatabasePool {
  const normalizedRole = config.role?.trim();
  if (config.role !== undefined && (!normalizedRole || normalizedRole.length === 0)) {
    throw new Error('Database role must be a non-empty string when specified');
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
  });

  if (normalizedRole) {
    activateRoleOnPool(pool, normalizedRole);
  }

  return pool;
}

export async function closeDatabasePool(pool: DatabasePool): Promise<void> {
  await pool.end();
}
