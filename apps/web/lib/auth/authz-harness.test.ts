import { parseUserId } from '@nimphy/domain';
import { describe, expect, it } from 'vitest';
import {
  createCsrfToken,
  CSRF_COOKIE_NAME_DEV,
  CSRF_HEADER_NAME,
  type CsrfConfig,
} from '../security/csrf';
import {
  assertResourceOwner,
  mapAuthErrorToResponse,
  requireApiUser,
  requirePageUser,
} from './guards';
import {
  IdentityInfrastructureError,
  InactiveAccountError,
  UnauthenticatedError,
  type AuthenticatedUser,
} from './identity';

const USER_A: AuthenticatedUser = {
  id: parseUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  idpSubject: 'user_clerk_a',
  email: 'a@example.com',
};

const USER_B: AuthenticatedUser = {
  id: parseUserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  idpSubject: 'user_clerk_b',
  email: 'b@example.com',
};

const CSRF_CONFIG: CsrfConfig = {
  secret: 'test-csrf-secret-value-at-least-32-chars-long',
  allowedOrigin: 'http://localhost:3000',
  isProduction: false,
};

describe('Authentication guards & authorization test harness (STEP-011)', () => {
  it('redirects unauthenticated or inactive page requests to /sign-in with return path', async () => {
    const redirectedTo: string[] = [];
    const mockRedirect = (url: string): never => {
      redirectedTo.push(url);
      throw new Error(`NEXT_REDIRECT:${url}`);
    };

    await expect(
      requirePageUser({
        redirectTo: '/cases/new',
        resolveUser: async () => {
          throw new UnauthenticatedError();
        },
        redirectFn: mockRedirect,
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/sign-in?redirect_url=%2Fcases%2Fnew');

    await expect(
      requirePageUser({
        resolveUser: async () => {
          throw new InactiveAccountError('pending_deletion');
        },
        redirectFn: mockRedirect,
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/sign-in');

    expect(redirectedTo).toEqual(['/sign-in?redirect_url=%2Fcases%2Fnew', '/sign-in']);
  });

  it('propagates infrastructure errors in page guards instead of redirecting as anonymous', async () => {
    await expect(
      requirePageUser({
        resolveUser: async () => {
          throw new IdentityInfrastructureError('persistence', 'DB down');
        },
        redirectFn: () => {
          throw new Error('Should not redirect');
        },
      }),
    ).rejects.toBeInstanceOf(IdentityInfrastructureError);
  });

  it('rejects unauthenticated API requests with 401 ERR-AUTH-001', async () => {
    const result = await requireApiUser(
      {
        method: 'GET',
        headers: new Headers({ 'x-correlation-id': 'corr-unauth-1' }),
      },
      {
        resolveUser: async () => {
          throw new UnauthenticatedError();
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get('x-correlation-id')).toBe('corr-unauth-1');
      const body = await result.response.json();
      expect(body.code).toBe('ERR-AUTH-001');
    }
  });

  it('rejects mutating API requests without valid CSRF even if user would authenticate', async () => {
    const result = await requireApiUser(
      {
        method: 'POST',
        headers: new Headers({ origin: 'http://localhost:3000' }),
      },
      {
        getCsrfConfig: () => CSRF_CONFIG,
        resolveUser: async () => USER_A,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.code).toBe('ERR-AUTH-002');
    }
  });

  it('allows authenticated mutating API requests with valid CSRF and enforces cross-user ownership denial (404 ERR-RES-001)', async () => {
    const token = createCsrfToken(CSRF_CONFIG.secret);
    const result = await requireApiUser(
      {
        method: 'POST',
        headers: new Headers({
          origin: 'http://localhost:3000',
          [CSRF_HEADER_NAME]: token,
          cookie: `${CSRF_COOKIE_NAME_DEV}=${encodeURIComponent(token)}`,
        }),
      },
      {
        getCsrfConfig: () => CSRF_CONFIG,
        resolveUser: async () => USER_A,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(USER_A.id);
      // Same-user access succeeds
      expect(() => assertResourceOwner(result.user.id, USER_A.id)).not.toThrow();

      // Cross-user access fails with 404 ERR-RES-001 (no existence leak)
      try {
        assertResourceOwner(result.user.id, USER_B.id);
        expect.unreachable('Expected ForbiddenResourceError');
      } catch (err) {
        const res = mapAuthErrorToResponse(err, result.correlationId);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.code).toBe('ERR-RES-001');
      }
    }
  });
});
