import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized?: boolean };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface SqlQueryClient {
  query<R extends QueryResultRow = QueryResultRow, I extends unknown[] = unknown[]>(
    queryText: string,
    values?: I,
  ): Promise<QueryResult<R>>;
}

export type DatabasePool = Pool;
export type DatabaseClient = PoolClient;
