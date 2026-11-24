import { Pool } from 'pg';
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

export function createDatabasePool(config: DatabaseConfig): DatabasePool {
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

  return pool;
}

export async function closeDatabasePool(pool: DatabasePool): Promise<void> {
  await pool.end();
}
