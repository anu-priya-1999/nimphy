import type { SqlQueryClient } from '../db/types';
import type {
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IdempotencyCompleteInput,
  IdempotencyReleaseInput,
  IdempotencyRepository,
} from './types';

interface IdempotencyRow {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

export class PgIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly client: SqlQueryClient) {}

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const inserted = await this.client.query<{ key: string }>(
      `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint, key) DO NOTHING
       RETURNING key`,
      [input.key, input.userId, input.endpoint, input.requestHash],
    );

    if (inserted.rows[0]) {
      return { status: 'claimed' };
    }

    const existing = await this.client.query<IdempotencyRow>(
      `SELECT request_hash, response_status, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND endpoint = $2 AND key = $3
       LIMIT 1`,
      [input.userId, input.endpoint, input.key],
    );

    const row = existing.rows[0];
    if (!row) {
      // Concurrent release between conflict and select; retry claim once
      const retried = await this.client.query<{ key: string }>(
        `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, endpoint, key) DO NOTHING
         RETURNING key`,
        [input.key, input.userId, input.endpoint, input.requestHash],
      );
      if (retried.rows[0]) {
        return { status: 'claimed' };
      }
      return { status: 'conflict', reason: 'in_progress' };
    }

    if (row.request_hash !== input.requestHash) {
      return { status: 'conflict', reason: 'payload_mismatch' };
    }

    if (row.response_status !== null) {
      return {
        status: 'replay',
        responseStatus: Number(row.response_status),
        responseBody: row.response_body,
      };
    }

    return { status: 'conflict', reason: 'in_progress' };
  }

  async complete(input: IdempotencyCompleteInput): Promise<void> {
    await this.client.query(
      `UPDATE idempotency_keys
       SET response_status = $1, response_body = $2::jsonb
       WHERE user_id = $3 AND endpoint = $4 AND key = $5`,
      [
        input.responseStatus,
        JSON.stringify(input.responseBody),
        input.userId,
        input.endpoint,
        input.key,
      ],
    );
  }

  async release(input: IdempotencyReleaseInput): Promise<void> {
    await this.client.query(
      `DELETE FROM idempotency_keys
       WHERE user_id = $1 AND endpoint = $2 AND key = $3 AND response_status IS NULL`,
      [input.userId, input.endpoint, input.key],
    );
  }
}

export function createPgIdempotencyRepository(client: SqlQueryClient): IdempotencyRepository {
  return new PgIdempotencyRepository(client);
}
