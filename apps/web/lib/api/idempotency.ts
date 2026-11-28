import { hashCanonicalJson, type UserId } from '@nimphy/domain';
import type { IdempotencyRepository } from '@nimphy/persistence';
import { ApiProblemError } from './errors';

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export function extractIdempotencyKey(request: Request, required: boolean = false): string | null {
  const raw = request.headers.get('idempotency-key');
  if (raw === null) {
    if (required) {
      throw new ApiProblemError('ERR-IDEM-002', 'Idempotency-Key header is required');
    }
    return null;
  }

  const trimmed = raw.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    /[\x00-\x1f\x7f]/.test(trimmed)
  ) {
    throw new ApiProblemError('ERR-IDEM-002', 'Idempotency-Key header is invalid');
  }

  return trimmed;
}

export interface WithIdempotencyParams<T, TTx> {
  readonly userId: UserId;
  readonly endpoint: string;
  readonly key: string | null;
  readonly requestPayload: unknown;
  readonly runInTransaction: <R>(
    fn: (tx: TTx, idempotencyRepo: IdempotencyRepository) => Promise<R>,
  ) => Promise<R>;
  readonly runDirect: () => Promise<{ status: number; body: T }>;
}

export interface IdempotentExecutionResult<T> {
  readonly status: number;
  readonly body: T;
  readonly replayed: boolean;
}

/**
 * Executes an endpoint operation with optional or required idempotency protection.
 * Uses RFC 8785 canonical JSON SHA-256 hashing (`hashCanonicalJson`) for request comparison,
 * and executes claim, business mutation, and response completion atomically in a single
 * transaction so a committed mutation can never be orphaned without its idempotency record.
 */
export async function withIdempotency<T, TTx>(
  params: WithIdempotencyParams<T, TTx>,
  executeInTx: (tx: TTx) => Promise<{ status: number; body: T }>,
): Promise<IdempotentExecutionResult<T>> {
  if (params.key === null) {
    const result = await params.runDirect();
    return { ...result, replayed: false };
  }

  const key = params.key;
  let requestHash: string;
  try {
    requestHash = hashCanonicalJson(params.requestPayload);
  } catch {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        { path: 'body', code: 'ERR-VAL-002', message: 'Request payload is not serializable' },
      ],
    });
  }

  return params.runInTransaction(async (tx, idempotencyRepo) => {
    const claim = await idempotencyRepo.claim({
      userId: params.userId,
      endpoint: params.endpoint,
      key,
      requestHash,
    });

    if (claim.status === 'conflict') {
      throw new ApiProblemError(
        'ERR-IDEM-001',
        claim.reason === 'payload_mismatch'
          ? 'Idempotency-Key reused with different request payload'
          : 'A request with this Idempotency-Key is already in progress',
      );
    }

    if (claim.status === 'replay') {
      return {
        status: claim.responseStatus,
        body: claim.responseBody as T,
        replayed: true,
      };
    }

    const result = await executeInTx(tx);
    await idempotencyRepo.complete({
      userId: params.userId,
      endpoint: params.endpoint,
      key,
      responseStatus: result.status,
      responseBody: result.body,
    });
    return { ...result, replayed: false };
  });
}
