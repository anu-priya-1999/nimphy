import crypto from 'node:crypto';
import type { UserId } from '@nimphy/domain';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import {
  CSRF_SAFE_METHODS,
  CsrfValidationError,
  resolveCsrfConfig,
  verifyCsrfRequest,
  type CsrfConfig,
  type CsrfRequestLike,
} from '../security/csrf';
import {
  ForbiddenResourceError,
  IdentityInfrastructureError,
  InactiveAccountError,
  requireCurrentUser,
  UnauthenticatedError,
  type AuthenticatedUser,
} from './index';

export interface PageGuardOptions {
  readonly redirectTo?: string;
  readonly resolveUser?: () => Promise<AuthenticatedUser>;
  readonly redirectFn?: (url: string) => never;
}

/**
 * Server Component / Page authentication guard.
 * Unauthenticated or inactive users are redirected to sign-in.
 * Infrastructure errors propagate so failures fail closed.
 */
export async function requirePageUser(options: PageGuardOptions = {}): Promise<AuthenticatedUser> {
  const resolveUser = options.resolveUser ?? requireCurrentUser;
  const redirectFn = options.redirectFn ?? redirect;

  try {
    return await resolveUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof InactiveAccountError) {
      const target = options.redirectTo
        ? `/sign-in?redirect_url=${encodeURIComponent(options.redirectTo)}`
        : '/sign-in';
      return redirectFn(target);
    }
    throw error;
  }
}

/**
 * Enforces resource ownership for a pre-loaded resource owner `UserId`.
 * Throws `ForbiddenResourceError` (404 ERR-RES-001) on mismatch to avoid existence leaks.
 */
export function assertResourceOwner(actorUserId: UserId, ownerUserId: UserId): void {
  if (actorUserId !== ownerUserId) {
    throw new ForbiddenResourceError('Resource not found');
  }
}

export interface ProblemDetailBody {
  readonly type: string;
  readonly code: string;
  readonly title: string;
  readonly status: number;
  readonly correlationId: string;
}

export function createErrorResponse(
  code: string,
  title: string,
  status: number,
  correlationId: string = crypto.randomUUID(),
): NextResponse<ProblemDetailBody> {
  return NextResponse.json(
    {
      type: `https://nimphy.example/errors/${code}`,
      code,
      title,
      status,
      correlationId,
    },
    {
      status,
      headers: {
        'x-correlation-id': correlationId,
      },
    },
  );
}

/**
 * Maps authentication, authorization, CSRF, and infrastructure errors
 * to RFC 7807 JSON responses without leaking internal details.
 */
export function mapAuthErrorToResponse(
  error: unknown,
  correlationId: string = crypto.randomUUID(),
): NextResponse<ProblemDetailBody> {
  if (error instanceof UnauthenticatedError || error instanceof InactiveAccountError) {
    return createErrorResponse('ERR-AUTH-001', 'Authentication required', 401, correlationId);
  }
  if (error instanceof CsrfValidationError) {
    return createErrorResponse(
      error.code,
      'CSRF or origin check failed',
      error.status,
      correlationId,
    );
  }
  if (error instanceof ForbiddenResourceError) {
    return createErrorResponse('ERR-RES-001', 'Resource not found', 404, correlationId);
  }
  if (error instanceof IdentityInfrastructureError) {
    return createErrorResponse(
      'ERR-SYS-001',
      'Authentication service unavailable',
      503,
      correlationId,
    );
  }
  return createErrorResponse('ERR-SYS-001', 'Unexpected error', 500, correlationId);
}

export interface ApiGuardOptions {
  readonly enforceCsrf?: boolean;
  readonly resolveUser?: () => Promise<AuthenticatedUser>;
  readonly getCsrfConfig?: () => CsrfConfig;
}

export type ApiGuardResult =
  | { readonly ok: true; readonly user: AuthenticatedUser; readonly correlationId: string }
  | { readonly ok: false; readonly response: NextResponse<ProblemDetailBody> };

/**
 * Route Handler authentication + CSRF guard.
 * Enforces CSRF on mutating HTTP methods (POST, PUT, PATCH, DELETE) unless explicitly disabled,
 * and resolves/requires an active local Nimphy user.
 */
export async function requireApiUser(
  request: CsrfRequestLike,
  options: ApiGuardOptions = {},
): Promise<ApiGuardResult> {
  const correlationId: string = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const method = request.method.toUpperCase();
  const shouldCheckCsrf = options.enforceCsrf ?? !CSRF_SAFE_METHODS.has(method);

  try {
    if (shouldCheckCsrf) {
      const csrfConfig = (options.getCsrfConfig ?? resolveCsrfConfig)();
      verifyCsrfRequest(request, csrfConfig);
    }

    const resolveUser = options.resolveUser ?? requireCurrentUser;
    const user = await resolveUser();
    return { ok: true, user, correlationId };
  } catch (error) {
    return { ok: false, response: mapAuthErrorToResponse(error, correlationId) };
  }
}
