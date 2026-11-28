import { ApiProblemError } from './errors';

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

/**
 * Parses a JSON object body from an incoming HTTP request while enforcing
 * content-type and maximum payload size limits (doc 07 §10, doc 11 TH-16).
 */
export async function parseJsonObjectBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== 'application/json') {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        {
          path: 'headers.content-type',
          code: 'ERR-VAL-002',
          message: 'Content-Type must be application/json',
        },
      ],
    });
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
        errors: [
          {
            path: 'body',
            code: 'ERR-VAL-002',
            message: `Request body exceeds maximum size of ${maxBytes} bytes`,
          },
        ],
      });
    }
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [{ path: 'body', code: 'ERR-VAL-002', message: 'Unable to read request body' }],
    });
  }

  if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        {
          path: 'body',
          code: 'ERR-VAL-002',
          message: `Request body exceeds maximum size of ${maxBytes} bytes`,
        },
      ],
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [{ path: 'body', code: 'ERR-VAL-002', message: 'Malformed JSON body' }],
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        { path: 'body', code: 'ERR-VAL-002', message: 'Request body must be a JSON object' },
      ],
    });
  }

  return parsed as Record<string, unknown>;
}
