import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ForbiddenResourceError,
  IdentityInfrastructureError,
  InactiveAccountError,
  UnauthenticatedError,
} from '../auth/identity';
import { CsrfValidationError } from '../security/csrf';

export const ERROR_CATALOG = {
  'ERR-AUTH-001': { status: 401, title: 'Authentication required' },
  'ERR-AUTH-002': { status: 403, title: 'CSRF or origin check failed' },
  'ERR-RES-001': { status: 404, title: 'Resource not found' },
  'ERR-VAL-001': { status: 422, title: 'Validation failed' },
  'ERR-VAL-002': { status: 422, title: 'Field validation failed' },
  'ERR-IDEM-001': { status: 409, title: 'Idempotency key conflict' },
  'ERR-IDEM-002': { status: 400, title: 'Idempotency key missing or invalid' },
  'ERR-CALC-001': { status: 422, title: 'No applicable Rule Pack' },
  'ERR-CALC-002': { status: 422, title: 'Inputs out of supported range' },
  'ERR-AI-001': { status: 503, title: 'AI service unavailable' },
  'ERR-AI-002': { status: 502, title: 'AI output rejected by validator' },
  'ERR-AI-003': { status: 429, title: 'AI budget or regeneration limit reached' },
  'ERR-PAY-001': { status: 402, title: 'Entitlement required' },
  'ERR-PAY-002': { status: 502, title: 'PayPal unavailable' },
  'ERR-PAY-003': { status: 409, title: 'Order in non-actionable state' },
  'ERR-PAY-004': { status: 409, title: 'Order failed server-side validation' },
  'ERR-PAY-005': { status: 409, title: 'Buyer approval not completed' },
  'ERR-LIFE-001': { status: 409, title: 'Deletion refused while payment is in flight' },
  'ERR-LIFE-002': { status: 409, title: 'Deletion requires paid access loss acknowledgement' },
  'ERR-HOOK-001': { status: 400, title: 'Webhook signature verification failed' },
  'ERR-HOOK-002': { status: 400, title: 'Webhook payload malformed' },
  'ERR-RATE-001': { status: 429, title: 'Rate limit exceeded' },
  'ERR-SYS-001': { status: 500, title: 'Unexpected error' },
} as const;

export type ApiErrorCode = keyof typeof ERROR_CATALOG;

export interface FieldValidationIssue {
  readonly path: string;
  readonly code: 'ERR-VAL-002';
  readonly message: string;
}

export interface ApiProblemBody {
  readonly type: string;
  readonly code: ApiErrorCode;
  readonly title: string;
  readonly status: number;
  readonly correlationId: string;
  readonly errors?: readonly FieldValidationIssue[];
}

export class ApiProblemError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly title: string;
  readonly errors?: readonly FieldValidationIssue[];

  constructor(
    code: ApiErrorCode,
    message?: string,
    options?: {
      readonly status?: number;
      readonly title?: string;
      readonly errors?: readonly FieldValidationIssue[];
    },
  ) {
    const spec = ERROR_CATALOG[code];
    super(message ?? spec.title);
    this.name = 'ApiProblemError';
    this.code = code;
    this.status = options?.status ?? spec.status;
    this.title = options?.title ?? spec.title;
    this.errors = options?.errors;
  }
}

export function createProblemResponse(
  code: ApiErrorCode,
  correlationId: string = crypto.randomUUID(),
  options?: {
    readonly status?: number;
    readonly title?: string;
    readonly errors?: readonly FieldValidationIssue[];
  },
): NextResponse<ApiProblemBody> {
  const spec = ERROR_CATALOG[code];
  const status = options?.status ?? spec.status;
  const title = options?.title ?? spec.title;

  const body: ApiProblemBody = {
    type: `https://nimphy.example/errors/${code}`,
    code,
    title,
    status,
    correlationId,
    ...(options?.errors && options.errors.length > 0 ? { errors: options.errors } : {}),
  };

  return NextResponse.json(body, {
    status,
    headers: {
      'x-correlation-id': correlationId,
    },
  });
}

export function mapErrorToResponse(
  error: unknown,
  correlationId: string = crypto.randomUUID(),
): NextResponse<ApiProblemBody> {
  if (error instanceof ApiProblemError) {
    return createProblemResponse(error.code, correlationId, {
      status: error.status,
      title: error.title,
      errors: error.errors,
    });
  }

  if (error instanceof UnauthenticatedError || error instanceof InactiveAccountError) {
    return createProblemResponse('ERR-AUTH-001', correlationId);
  }

  if (error instanceof CsrfValidationError) {
    return createProblemResponse(error.code, correlationId, {
      status: error.status,
      title: error.code === 'ERR-AUTH-002' ? 'CSRF or origin check failed' : 'Unexpected error',
    });
  }

  if (error instanceof ForbiddenResourceError) {
    return createProblemResponse('ERR-RES-001', correlationId);
  }

  if (error instanceof IdentityInfrastructureError) {
    return createProblemResponse('ERR-SYS-001', correlationId, {
      status: 503,
      title: 'Authentication service unavailable',
    });
  }

  return createProblemResponse('ERR-SYS-001', correlationId);
}
