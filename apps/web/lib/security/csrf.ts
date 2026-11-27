import crypto from 'node:crypto';

export const CSRF_COOKIE_NAME_DEV = 'nimphy_csrf';
export const CSRF_COOKIE_NAME_PROD = '__Host-nimphy_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type CsrfErrorCode = 'ERR-AUTH-002' | 'ERR-SYS-001';

export class CsrfValidationError extends Error {
  readonly code: CsrfErrorCode;
  readonly status: number;

  constructor(message: string, code: CsrfErrorCode = 'ERR-AUTH-002', status = 403) {
    super(message);
    this.name = 'CsrfValidationError';
    this.code = code;
    this.status = status;
  }
}

export interface CsrfConfig {
  readonly secret: string;
  readonly allowedOrigin: string;
  readonly isProduction: boolean;
}

export interface CsrfCookieAttributes {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly secure: boolean;
}

const MIN_SECRET_LENGTH = 32;

/**
 * Resolves CSRF configuration from environment variables and fails closed
 * when required secret or origin configuration is missing or weak.
 */
export function resolveCsrfConfig(env: NodeJS.ProcessEnv = process.env): CsrfConfig {
  const isProduction = env.NODE_ENV === 'production';
  const rawSecret = env.CSRF_SECRET?.trim() ?? '';
  const rawBaseUrl = env.APP_BASE_URL?.trim() ?? '';

  if (rawSecret.length < MIN_SECRET_LENGTH) {
    throw new CsrfValidationError(
      'CSRF_SECRET is missing or shorter than 32 characters',
      'ERR-SYS-001',
      500,
    );
  }

  if (!rawBaseUrl) {
    throw new CsrfValidationError('APP_BASE_URL is missing', 'ERR-SYS-001', 500);
  }

  let parsedOrigin: string;
  try {
    const url = new URL(rawBaseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
    if (isProduction && url.protocol !== 'https:') {
      throw new Error('Production APP_BASE_URL must use https');
    }
    parsedOrigin = url.origin;
  } catch {
    throw new CsrfValidationError('APP_BASE_URL is not a valid origin URL', 'ERR-SYS-001', 500);
  }

  return {
    secret: rawSecret,
    allowedOrigin: parsedOrigin,
    isProduction,
  };
}

export function getCsrfCookieName(isProduction: boolean): string {
  return isProduction ? CSRF_COOKIE_NAME_PROD : CSRF_COOKIE_NAME_DEV;
}

function signNonce(nonce: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(nonce, 'utf8').digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure signed double-submit CSRF token.
 */
export function createCsrfToken(secret: string): string {
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new CsrfValidationError(
      'CSRF secret is missing or shorter than 32 characters',
      'ERR-SYS-001',
      500,
    );
  }

  const nonce = crypto.randomBytes(32).toString('base64url');
  const signature = signNonce(nonce, secret);
  return `${nonce}.${signature}`;
}

export function buildCsrfCookie(token: string, isProduction: boolean): CsrfCookieAttributes {
  return {
    name: getCsrfCookieName(isProduction),
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
  };
}

export function verifySignedCsrfToken(token: string, secret: string): boolean {
  if (!token || !secret || secret.trim().length < MIN_SECRET_LENGTH) {
    return false;
  }

  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex !== token.lastIndexOf('.')) {
    return false;
  }

  const nonce = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!nonce || !signature) {
    return false;
  }

  const expectedSignature = signNonce(nonce, secret);
  return constantTimeEquals(signature, expectedSignature);
}

export interface CsrfRequestLike {
  readonly method: string;
  readonly headers: {
    get(name: string): string | null;
  };
  readonly cookies?: {
    get(name: string): { value: string } | undefined;
  };
}

/**
 * Parses Cookie header as a fallback when request.cookies is unavailable.
 */
function readCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eqIndex + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Validates Origin and signed double-submit CSRF token for mutating requests.
 * Safe HTTP methods (GET, HEAD, OPTIONS) bypass mutation checks.
 */
export function verifyCsrfRequest(request: CsrfRequestLike, config: CsrfConfig): void {
  const method = request.method.toUpperCase();
  if (CSRF_SAFE_METHODS.has(method)) {
    return;
  }

  const originHeader = request.headers.get('origin');
  if (!originHeader) {
    throw new CsrfValidationError('Missing Origin header on mutating request');
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(originHeader).origin;
  } catch {
    throw new CsrfValidationError('Malformed Origin header on mutating request');
  }

  if (!constantTimeEquals(normalizedOrigin, config.allowedOrigin)) {
    throw new CsrfValidationError('Origin mismatch on mutating request');
  }

  const cookieName = getCsrfCookieName(config.isProduction);
  const cookieToken =
    request.cookies?.get(cookieName)?.value ??
    readCookieFromHeader(request.headers.get('cookie'), cookieName);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    throw new CsrfValidationError('Missing CSRF token');
  }

  if (!constantTimeEquals(cookieToken, headerToken)) {
    throw new CsrfValidationError('CSRF token mismatch');
  }

  if (!verifySignedCsrfToken(headerToken, config.secret)) {
    throw new CsrfValidationError('Invalid CSRF token signature');
  }
}
