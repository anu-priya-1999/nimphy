import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { mapAuthErrorToResponse } from '../../../../lib/auth/guards';
import { buildCsrfCookie, createCsrfToken, resolveCsrfConfig } from '../../../../lib/security/csrf';

export const dynamic = 'force-dynamic';

/**
 * Issues a signed double-submit CSRF token and sets its HttpOnly cookie.
 * Fails closed (500 ERR-SYS-001) when CSRF_SECRET or APP_BASE_URL is not configured.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const correlationId: string = request.headers.get('x-correlation-id') ?? crypto.randomUUID();

  try {
    const config = resolveCsrfConfig();
    const token = createCsrfToken(config.secret);
    const cookie = buildCsrfCookie(token, config.isProduction);

    const response = NextResponse.json(
      { csrfToken: token },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store',
          'x-correlation-id': correlationId,
        },
      },
    );

    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
      secure: cookie.secure,
    });

    return response;
  } catch (error) {
    return mapAuthErrorToResponse(error, correlationId);
  }
}
