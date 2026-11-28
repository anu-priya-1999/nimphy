import {
  createPgCaseRepository,
  createPgCaseRepositoryForTransaction,
  createPgIdempotencyRepository,
  withTransaction,
  type CaseRepository,
  type IdempotencyRepository,
} from '@nimphy/persistence';
import { NextResponse } from 'next/server';
import { mapErrorToResponse } from '../api/errors';
import { extractIdempotencyKey, withIdempotency } from '../api/idempotency';
import { parseJsonObjectBody } from '../api/request';
import { requireApiUser, type ApiGuardOptions, type ApiGuardResult } from '../auth/guards';
import { getServerDatabasePool } from '../db/server-db';
import {
  attachEvidenceUseCase,
  createCaseUseCase,
  getCaseUseCase,
  getRevisionUseCase,
  listCasesUseCase,
  requestCaseDeletionUseCase,
  saveRevisionUseCase,
  updateCaseUseCase,
} from './use-cases';
import {
  parseCaseIdParam,
  parseRevisionNoParam,
  validateAcknowledgePaidLossParam,
  validateAttachEvidenceBody,
  validateCreateCaseBody,
  validateListCasesQuery,
  validateSaveRevisionBody,
  validateUpdateCaseBody,
} from './validation';

export interface CaseRouteDeps {
  readonly requireUser?: (request: Request, options?: ApiGuardOptions) => Promise<ApiGuardResult>;
  readonly getCaseRepo?: () => CaseRepository;
  readonly getIdempotencyRepo?: () => IdempotencyRepository;
  readonly runInIdempotentTransaction?: <R>(
    fn: (caseRepo: CaseRepository, idempotencyRepo: IdempotencyRepository) => Promise<R>,
  ) => Promise<R>;
}

function resolveCaseRepo(deps?: CaseRouteDeps): CaseRepository {
  return deps?.getCaseRepo ? deps.getCaseRepo() : createPgCaseRepository(getServerDatabasePool());
}

function runIdempotentTx<R>(
  deps: CaseRouteDeps | undefined,
  fn: (caseRepo: CaseRepository, idempotencyRepo: IdempotencyRepository) => Promise<R>,
): Promise<R> {
  if (deps?.runInIdempotentTransaction) {
    return deps.runInIdempotentTransaction(fn);
  }
  if (deps?.getCaseRepo || deps?.getIdempotencyRepo) {
    throw new Error(
      'CaseRouteDeps with custom repositories must provide runInIdempotentTransaction',
    );
  }
  return withTransaction(getServerDatabasePool(), async (client) =>
    fn(createPgCaseRepositoryForTransaction(client), createPgIdempotencyRepository(client)),
  );
}

function jsonWithCorrelation(body: unknown, status: number, correlationId: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'x-correlation-id': correlationId,
    },
  });
}

/**
 * EP-001: POST /api/v1/cases
 */
export async function handleCreateCase(
  request: Request,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const idempotencyKey = extractIdempotencyKey(request, false);
    const rawBody = await parseJsonObjectBody(request);
    const input = validateCreateCaseBody(rawBody);

    const execute = async (caseRepo: CaseRepository) => {
      const created = await createCaseUseCase(
        { caseRepo },
        { userId: user.id, title: input.title, correlationId },
      );
      return { status: 201, body: created };
    };

    const result = await withIdempotency(
      {
        userId: user.id,
        endpoint: 'POST /api/v1/cases',
        key: idempotencyKey,
        requestPayload: rawBody,
        runInTransaction: (fn) => runIdempotentTx(deps, fn),
        runDirect: () => execute(resolveCaseRepo(deps)),
      },
      execute,
    );

    return jsonWithCorrelation(result.body, result.status, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-002: GET /api/v1/cases
 */
export async function handleListCases(
  request: Request,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const url = new URL(request.url);
    const query = validateListCasesQuery(url.searchParams);
    const caseRepo = resolveCaseRepo(deps);

    const page = await listCasesUseCase(
      { caseRepo },
      {
        userId: user.id,
        limit: query.limit,
        cursor: query.cursor,
        status: query.status,
      },
    );

    return jsonWithCorrelation(page, 200, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-003: GET /api/v1/cases/{caseId}
 */
export async function handleGetCase(
  request: Request,
  rawCaseId: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const caseRepo = resolveCaseRepo(deps);
    const found = await getCaseUseCase({ caseRepo }, { userId: user.id, caseId });
    return jsonWithCorrelation(found, 200, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-004: PATCH /api/v1/cases/{caseId}
 */
export async function handleUpdateCase(
  request: Request,
  rawCaseId: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const rawBody = await parseJsonObjectBody(request);
    const input = validateUpdateCaseBody(rawBody);
    const caseRepo = resolveCaseRepo(deps);

    const updated = await updateCaseUseCase(
      { caseRepo },
      {
        userId: user.id,
        caseId,
        title: input.title,
        status: input.status,
        correlationId,
      },
    );
    return jsonWithCorrelation(updated, 200, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-005: DELETE /api/v1/cases/{caseId}?acknowledgePaidLoss=true|false
 */
export async function handleDeleteCase(
  request: Request,
  rawCaseId: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const url = new URL(request.url);
    const acknowledgePaidLoss = validateAcknowledgePaidLossParam(
      url.searchParams.get('acknowledgePaidLoss'),
    );
    const caseRepo = resolveCaseRepo(deps);

    const result = await requestCaseDeletionUseCase(
      { caseRepo },
      {
        userId: user.id,
        caseId,
        acknowledgePaidLoss,
        correlationId,
      },
    );

    return jsonWithCorrelation(result, 202, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-006: POST /api/v1/cases/{caseId}/revisions
 */
export async function handleSaveRevision(
  request: Request,
  rawCaseId: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const idempotencyKey = extractIdempotencyKey(request, false);
    const rawBody = await parseJsonObjectBody(request);
    const input = validateSaveRevisionBody(rawBody);

    const execute = async (caseRepo: CaseRepository) => {
      const saved = await saveRevisionUseCase(
        { caseRepo },
        {
          userId: user.id,
          caseId,
          inputsSchemaVersion: input.inputsSchemaVersion,
          inputs: input.inputs,
          correlationId,
        },
      );
      return { status: 201, body: saved };
    };

    const result = await withIdempotency(
      {
        userId: user.id,
        endpoint: `POST /api/v1/cases/${caseId}/revisions`,
        key: idempotencyKey,
        requestPayload: rawBody,
        runInTransaction: (fn) => runIdempotentTx(deps, fn),
        runDirect: () => execute(resolveCaseRepo(deps)),
      },
      execute,
    );

    return jsonWithCorrelation(result.body, result.status, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-007: GET /api/v1/cases/{caseId}/revisions/{n}
 */
export async function handleGetRevision(
  request: Request,
  rawCaseId: string,
  rawRevisionNo: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const revisionNo = parseRevisionNoParam(rawRevisionNo);
    const caseRepo = resolveCaseRepo(deps);

    const found = await getRevisionUseCase({ caseRepo }, { userId: user.id, caseId, revisionNo });

    return jsonWithCorrelation(found, 200, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}

/**
 * EP-008: POST /api/v1/cases/{caseId}/revisions/{n}/evidence
 */
export async function handleAttachEvidence(
  request: Request,
  rawCaseId: string,
  rawRevisionNo: string,
  deps?: CaseRouteDeps,
): Promise<NextResponse> {
  const authResult = await (deps?.requireUser ?? requireApiUser)(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { user, correlationId } = authResult;
  try {
    const caseId = parseCaseIdParam(rawCaseId);
    const revisionNo = parseRevisionNoParam(rawRevisionNo);
    const idempotencyKey = extractIdempotencyKey(request, false);
    const rawBody = await parseJsonObjectBody(request);
    const input = validateAttachEvidenceBody(rawBody);

    const execute = async (caseRepo: CaseRepository) => {
      const created = await attachEvidenceUseCase(
        { caseRepo },
        {
          userId: user.id,
          caseId,
          revisionNo,
          fieldPath: input.fieldPath,
          provenance: input.provenance,
          kind: input.kind,
          summary: input.summary,
          sourceRef: input.sourceRef,
          capturedAt: input.capturedAt,
        },
      );
      return { status: 201, body: created };
    };

    const result = await withIdempotency(
      {
        userId: user.id,
        endpoint: `POST /api/v1/cases/${caseId}/revisions/${revisionNo}/evidence`,
        key: idempotencyKey,
        requestPayload: rawBody,
        runInTransaction: (fn) => runIdempotentTx(deps, fn),
        runDirect: () => execute(resolveCaseRepo(deps)),
      },
      execute,
    );

    return jsonWithCorrelation(result.body, result.status, correlationId);
  } catch (error) {
    return mapErrorToResponse(error, correlationId);
  }
}
