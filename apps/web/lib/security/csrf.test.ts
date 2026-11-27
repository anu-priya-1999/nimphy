import { describe, expect, it } from 'vitest';
import { mapAuthErrorToResponse } from '../auth/guards';
import {
  buildCsrfCookie,
  createCsrfToken,
  CSRF_COOKIE_NAME_DEV,
  CSRF_COOKIE_NAME_PROD,
  CSRF_HEADER_NAME,
  CsrfValidationError,
  resolveCsrfConfig,
  verifyCsrfRequest,
  verifySignedCsrfToken,
  type CsrfConfig,
  type CsrfRequestLike,
} from './csrf';

const TEST_SECRET = 'test-csrf-secret-value-at-least-32-chars-long';
const TEST_ORIGIN = 'http://localhost:3000';

function makeConfig(overrides: Partial<CsrfConfig> = {}): CsrfConfig {
  return {
    secret: TEST_SECRET,
    allowedOrigin: TEST_ORIGIN,
    isProduction: false,
    ...overrides,
  };
}

function makeRequest(options: {
  method?: string;
  origin?: string | null;
  cookieToken?: string | null;
  headerToken?: string | null;
  isProduction?: boolean;
}): CsrfRequestLike {
  const cookieName = options.isProduction ? CSRF_COOKIE_NAME_PROD : CSRF_COOKIE_NAME_DEV;
  const headers = new Map<string, string>();
  if (options.origin !== null && options.origin !== undefined) {
    headers.set('origin', options.origin);
  }
  if (options.headerToken !== null && options.headerToken !== undefined) {
    headers.set(CSRF_HEADER_NAME, options.headerToken);
  }
  if (options.cookieToken !== null && options.cookieToken !== undefined) {
    headers.set('cookie', `${cookieName}=${encodeURIComponent(options.cookieToken)}`);
  }

  return {
    method: options.method ?? 'POST',
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
  };
}

describe('CSRF protection infrastructure', () => {
  it('accepts a valid signed double-submit token and matching Origin', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);
    const req = makeRequest({
      method: 'POST',
      origin: TEST_ORIGIN,
      cookieToken: token,
      headerToken: token,
    });

    expect(() => verifyCsrfRequest(req, config)).not.toThrow();
    expect(verifySignedCsrfToken(token, config.secret)).toBe(true);
  });

  it('bypasses mutation checks for safe HTTP methods', () => {
    const config = makeConfig();
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = makeRequest({ method });
      expect(() => verifyCsrfRequest(req, config)).not.toThrow();
    }
  });

  it('rejects missing Origin header on mutating requests', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);
    const req = makeRequest({
      method: 'POST',
      origin: null,
      cookieToken: token,
      headerToken: token,
    });

    expect(() => verifyCsrfRequest(req, config)).toThrowError(CsrfValidationError);
    expect(() => verifyCsrfRequest(req, config)).toThrow(/Missing Origin/);
  });

  it('rejects mismatched or malformed Origin header', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);

    const mismatched = makeRequest({
      method: 'DELETE',
      origin: 'https://evil.example',
      cookieToken: token,
      headerToken: token,
    });
    expect(() => verifyCsrfRequest(mismatched, config)).toThrow(/Origin mismatch/);

    const malformed = makeRequest({
      method: 'PATCH',
      origin: 'not-a-valid-url',
      cookieToken: token,
      headerToken: token,
    });
    expect(() => verifyCsrfRequest(malformed, config)).toThrow(/Malformed Origin/);
  });

  it('rejects missing CSRF cookie or header token', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);

    const missingHeader = makeRequest({
      origin: TEST_ORIGIN,
      cookieToken: token,
      headerToken: null,
    });
    expect(() => verifyCsrfRequest(missingHeader, config)).toThrow(/Missing CSRF token/);

    const missingCookie = makeRequest({
      origin: TEST_ORIGIN,
      cookieToken: null,
      headerToken: token,
    });
    expect(() => verifyCsrfRequest(missingCookie, config)).toThrow(/Missing CSRF token/);
  });

  it('rejects mismatched cookie and header tokens', () => {
    const config = makeConfig();
    const tokenA = createCsrfToken(config.secret);
    const tokenB = createCsrfToken(config.secret);

    const req = makeRequest({
      origin: TEST_ORIGIN,
      cookieToken: tokenA,
      headerToken: tokenB,
    });

    expect(() => verifyCsrfRequest(req, config)).toThrow(/CSRF token mismatch/);
  });

  it('rejects tampered token signatures', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);
    const [nonce = '', sig = ''] = token.split('.');
    const tamperedSig = `${sig.slice(0, -1)}${sig.endsWith('a') ? 'b' : 'a'}`;
    const tamperedToken = `${nonce}.${tamperedSig}`;

    const req = makeRequest({
      origin: TEST_ORIGIN,
      cookieToken: tamperedToken,
      headerToken: tamperedToken,
    });

    expect(() => verifyCsrfRequest(req, config)).toThrow(/Invalid CSRF token signature/);
    expect(verifySignedCsrfToken(tamperedToken, config.secret)).toBe(false);
    expect(verifySignedCsrfToken('malformed-no-dot', config.secret)).toBe(false);
  });

  it('fails closed when CSRF_SECRET or APP_BASE_URL are missing or invalid', () => {
    expect(() =>
      resolveCsrfConfig({ NODE_ENV: 'production', APP_BASE_URL: 'https://nimphy.app' }),
    ).toThrow(/CSRF_SECRET/);

    expect(() =>
      resolveCsrfConfig({
        NODE_ENV: 'production',
        CSRF_SECRET: 'short',
        APP_BASE_URL: 'https://nimphy.app',
      }),
    ).toThrow(/CSRF_SECRET/);

    expect(() =>
      resolveCsrfConfig({
        NODE_ENV: 'production',
        CSRF_SECRET: TEST_SECRET,
      }),
    ).toThrow(/APP_BASE_URL/);

    expect(() =>
      resolveCsrfConfig({
        NODE_ENV: 'production',
        CSRF_SECRET: TEST_SECRET,
        APP_BASE_URL: 'http://insecure.example.com',
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it('builds secure __Host- cookie attributes in production', () => {
    const token = createCsrfToken(TEST_SECRET);
    const prodCookie = buildCsrfCookie(token, true);
    expect(prodCookie).toEqual({
      name: '__Host-nimphy_csrf',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    });

    const devCookie = buildCsrfCookie(token, false);
    expect(devCookie.name).toBe('nimphy_csrf');
    expect(devCookie.secure).toBe(false);
  });

  it('treats malformed percent-encoded CSRF cookie values as invalid input (403 ERR-AUTH-002, no URIError)', async () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);

    for (const badCookieValue of ['%E0%A4%A', '%ZZ', 'abc%2']) {
      const req: CsrfRequestLike = {
        method: 'POST',
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'origin') return TEST_ORIGIN;
            if (lower === CSRF_HEADER_NAME) return token;
            if (lower === 'cookie') return `${CSRF_COOKIE_NAME_DEV}=${badCookieValue}`;
            return null;
          },
        },
      };

      let caught: unknown;
      try {
        verifyCsrfRequest(req, config);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(CsrfValidationError);
      expect(caught).not.toBeInstanceOf(URIError);
      expect((caught as CsrfValidationError).code).toBe('ERR-AUTH-002');
      expect((caught as CsrfValidationError).status).toBe(403);

      const response = mapAuthErrorToResponse(caught, 'corr-malformed-cookie');
      expect(response.status).toBe(403);
      const body = (await response.json()) as { code: string; status: number };
      expect(body.code).toBe('ERR-AUTH-002');
    }
  });

  it('ignores malformed percent-encoding on unrelated cookies when the CSRF cookie is valid', () => {
    const config = makeConfig();
    const token = createCsrfToken(config.secret);

    const req: CsrfRequestLike = {
      method: 'POST',
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === 'origin') return TEST_ORIGIN;
          if (lower === CSRF_HEADER_NAME) return token;
          if (lower === 'cookie') {
            return `unrelated=%E0%A4%A; ${CSRF_COOKIE_NAME_DEV}=${encodeURIComponent(token)}`;
          }
          return null;
        },
      },
    };

    expect(() => verifyCsrfRequest(req, config)).not.toThrow();
  });
});
