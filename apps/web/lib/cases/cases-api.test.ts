import crypto from 'node:crypto';
import {
  parseCaseId,
  parseEvidenceId,
  parseRevisionId,
  parseUserId,
  type CaseId,
  type EvidenceId,
  type RevisionId,
  type UserId,
} from '@nimphy/domain';
import type {
  AttachEvidenceInput,
  BusinessCaseRecord,
  CaseRepository,
  CaseRevisionRecord,
  CreateCaseInput,
  EvidenceItemRecord,
  GetCaseInput,
  GetCaseResult,
  GetRevisionInput,
  GetRevisionResult,
  IdempotencyClaimInput,
  IdempotencyClaimResult,
  IdempotencyCompleteInput,
  IdempotencyReleaseInput,
  IdempotencyRepository,
  ListCasesInput,
  ListCasesResult,
  RequestCaseDeletionInput,
  SaveRevisionInput,
  UpdateCaseInput,
} from '@nimphy/persistence';
import { beforeEach, describe, expect, it } from 'vitest';
import { requireApiUser, type ApiGuardResult } from '../auth/guards';
import { UnauthenticatedError, type AuthenticatedUser } from '../auth/identity';
import {
  createCsrfToken,
  CSRF_COOKIE_NAME_DEV,
  CSRF_HEADER_NAME,
  type CsrfConfig,
} from '../security/csrf';
import {
  handleAttachEvidence,
  handleCreateCase,
  handleDeleteCase,
  handleGetCase,
  handleGetRevision,
  handleListCases,
  handleSaveRevision,
  handleUpdateCase,
  type CaseRouteDeps,
} from './handlers';

const USER_A: AuthenticatedUser = {
  id: parseUserId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  idpSubject: 'user_a',
  email: 'a@example.com',
};

const USER_B: AuthenticatedUser = {
  id: parseUserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  idpSubject: 'user_b',
  email: 'b@example.com',
};

const CSRF_CONFIG: CsrfConfig = {
  secret: 'test-csrf-secret-value-at-least-32-chars-long',
  allowedOrigin: 'http://localhost:3000',
  isProduction: false,
};

class InMemoryCaseRepository implements CaseRepository {
  cases = new Map<CaseId, BusinessCaseRecord>();
  revisions = new Map<RevisionId, CaseRevisionRecord>();
  evidence = new Map<EvidenceId, EvidenceItemRecord>();
  createCount = 0;
  shouldFailNext = false;

  async createCase(input: CreateCaseInput): Promise<BusinessCaseRecord> {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error('Simulated DB failure');
    }
    this.createCount++;
    const now = new Date(Date.UTC(2026, 10, 27, 12, 0, this.createCount));
    const record: BusinessCaseRecord = {
      id: parseCaseId(crypto.randomUUID()),
      userId: input.userId,
      title: input.title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(record.id, record);
    return record;
  }

  async listCases(input: ListCasesInput): Promise<ListCasesResult> {
    let items = Array.from(this.cases.values()).filter(
      (c) => c.userId === input.userId && c.status !== 'pending_deletion',
    );
    if (input.status) {
      items = items.filter((c) => c.status === input.status);
    }
    items.sort((a, b) => {
      const diff = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (diff !== 0) return diff;
      return b.id.localeCompare(a.id);
    });
    if (input.cursor) {
      const cu = input.cursor.updatedAt.getTime();
      const ci = input.cursor.id;
      items = items.filter((c) => {
        const t = c.updatedAt.getTime();
        return t < cu || (t === cu && c.id < ci);
      });
    }
    const hasMore = items.length > input.limit;
    return {
      items: hasMore ? items.slice(0, input.limit) : items,
      hasMore,
    };
  }

  async getCaseWithLatestRevision(input: GetCaseInput): Promise<GetCaseResult | null> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return null;
    }
    const revs = Array.from(this.revisions.values())
      .filter((r) => r.caseId === c.id)
      .sort((a, b) => b.revisionNo - a.revisionNo);
    const latest = revs[0] ?? null;
    return {
      businessCase: c,
      latestRevision: latest
        ? {
            id: latest.id,
            revisionNo: latest.revisionNo,
            inputsSchemaVersion: latest.inputsSchemaVersion,
            inputsHash: latest.inputsHash,
            createdAt: latest.createdAt,
          }
        : null,
    };
  }

  async updateCase(input: UpdateCaseInput): Promise<BusinessCaseRecord | null> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return null;
    }
    const updated: BusinessCaseRecord = {
      ...c,
      title: input.title ?? c.title,
      status: input.status ?? c.status,
      updatedAt: new Date(c.updatedAt.getTime() + 1000),
    };
    this.cases.set(updated.id, updated);
    return updated;
  }

  async requestCaseDeletion(input: RequestCaseDeletionInput): Promise<{ requested: boolean }> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return { requested: false };
    }
    this.cases.set(c.id, { ...c, status: 'pending_deletion' });
    return { requested: true };
  }

  async saveRevision(input: SaveRevisionInput): Promise<CaseRevisionRecord | null> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return null;
    }
    const existing = Array.from(this.revisions.values()).filter((r) => r.caseId === c.id);
    const nextNo = existing.reduce((max, r) => Math.max(max, r.revisionNo), 0) + 1;
    const rev: CaseRevisionRecord = {
      id: parseRevisionId(crypto.randomUUID()),
      caseId: c.id,
      revisionNo: nextNo,
      inputs: input.inputs,
      inputsSchemaVersion: input.inputsSchemaVersion,
      inputsHash: input.inputsHash,
      createdAt: new Date(),
    };
    this.revisions.set(rev.id, rev);
    return rev;
  }

  async getRevision(input: GetRevisionInput): Promise<GetRevisionResult | null> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return null;
    }
    const rev = Array.from(this.revisions.values()).find(
      (r) => r.caseId === c.id && r.revisionNo === input.revisionNo,
    );
    if (!rev) return null;
    const evidenceItems = Array.from(this.evidence.values()).filter((e) => e.revisionId === rev.id);
    return { revision: rev, evidenceItems };
  }

  async attachEvidence(input: AttachEvidenceInput): Promise<EvidenceItemRecord | null> {
    const c = this.cases.get(input.caseId);
    if (!c || c.userId !== input.userId || c.status === 'pending_deletion') {
      return null;
    }
    const rev = Array.from(this.revisions.values()).find(
      (r) => r.caseId === c.id && r.revisionNo === input.revisionNo,
    );
    if (!rev) return null;
    const ev: EvidenceItemRecord = {
      id: parseEvidenceId(crypto.randomUUID()),
      revisionId: rev.id,
      fieldPath: input.fieldPath,
      provenance: input.provenance,
      kind: input.kind,
      summary: input.summary,
      sourceRef: input.sourceRef,
      capturedAt: input.capturedAt,
      createdAt: new Date(),
    };
    this.evidence.set(ev.id, ev);
    return ev;
  }
}

class InMemoryIdempotencyRepository implements IdempotencyRepository {
  records = new Map<
    string,
    { requestHash: string; responseStatus: number | null; responseBody: unknown }
  >();
  shouldFailCompleteNext = false;

  private keyFor(userId: UserId, endpoint: string, key: string): string {
    return `${userId}::${endpoint}::${key}`;
  }

  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult> {
    const k = this.keyFor(input.userId, input.endpoint, input.key);
    const existing = this.records.get(k);
    if (!existing) {
      this.records.set(k, {
        requestHash: input.requestHash,
        responseStatus: null,
        responseBody: null,
      });
      return { status: 'claimed' };
    }
    if (existing.requestHash !== input.requestHash) {
      return { status: 'conflict', reason: 'payload_mismatch' };
    }
    if (existing.responseStatus !== null) {
      return {
        status: 'replay',
        responseStatus: existing.responseStatus,
        responseBody: existing.responseBody,
      };
    }
    return { status: 'conflict', reason: 'in_progress' };
  }

  async complete(input: IdempotencyCompleteInput): Promise<void> {
    if (this.shouldFailCompleteNext) {
      this.shouldFailCompleteNext = false;
      throw new Error('Simulated idempotency completion failure');
    }
    const k = this.keyFor(input.userId, input.endpoint, input.key);
    const existing = this.records.get(k);
    if (existing) {
      existing.responseStatus = input.responseStatus;
      existing.responseBody = input.responseBody;
    }
  }

  async release(input: IdempotencyReleaseInput): Promise<void> {
    const k = this.keyFor(input.userId, input.endpoint, input.key);
    const existing = this.records.get(k);
    if (existing && existing.responseStatus === null) {
      this.records.delete(k);
    }
  }
}

function makeRequest(
  method: string,
  url: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    withCsrf?: boolean;
  },
): Request {
  const headers = new Headers(options?.headers);
  if (options?.withCsrf !== false && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = createCsrfToken(CSRF_CONFIG.secret);
    headers.set('origin', CSRF_CONFIG.allowedOrigin);
    headers.set(CSRF_HEADER_NAME, token);
    headers.set('cookie', `${CSRF_COOKIE_NAME_DEV}=${encodeURIComponent(token)}`);
  }
  if (options?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Request(url, {
    method,
    headers,
    body:
      options?.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
  });
}

function validPaperbackRevisionBody() {
  return {
    inputsSchemaVersion: 1,
    inputs: {
      marketplace: 'TEST_MARKETPLACE',
      format: 'paperback',
      pageCount: 240,
      listPrice: {
        value: { amountMinor: 1499, currency: 'USD' },
        provenance: 'user_input',
      },
      unitProductionCost: {
        value: { amountMinor: 450, currency: 'USD' },
        provenance: 'estimate',
        evidenceRefs: ['ev_1'],
      },
      fixedCosts: [
        {
          label: 'Editing',
          value: { amountMinor: 90000, currency: 'USD' },
          provenance: 'user_input',
        },
      ],
      scenarios: {
        low: { units: 100, listPriceMinor: 1299, costVariancePercent: '10' },
        base: { units: 400, listPriceMinor: 1499, costVariancePercent: '0' },
        high: { units: 1200, listPriceMinor: 1799, costVariancePercent: '-10' },
      },
    },
  };
}

describe('STEP-012 Case and Revision Use-Cases + API', () => {
  let caseRepo: InMemoryCaseRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;
  let activeUser: AuthenticatedUser | null;

  const deps: CaseRouteDeps = {
    requireUser: async (req): Promise<ApiGuardResult> =>
      requireApiUser(req, {
        getCsrfConfig: () => CSRF_CONFIG,
        resolveUser: async () => {
          if (!activeUser) {
            throw new UnauthenticatedError();
          }
          return activeUser;
        },
      }),
    getCaseRepo: () => caseRepo,
    getIdempotencyRepo: () => idempotencyRepo,
    runInIdempotentTransaction: async (fn) => {
      const casesSnap = new Map(caseRepo.cases);
      const revisionsSnap = new Map(caseRepo.revisions);
      const evidenceSnap = new Map(caseRepo.evidence);
      const createCountSnap = caseRepo.createCount;
      const idemSnap = new Map(
        Array.from(idempotencyRepo.records.entries(), ([k, v]) => [k, { ...v }]),
      );
      try {
        return await fn(caseRepo, idempotencyRepo);
      } catch (error) {
        caseRepo.cases = casesSnap;
        caseRepo.revisions = revisionsSnap;
        caseRepo.evidence = evidenceSnap;
        caseRepo.createCount = createCountSnap;
        idempotencyRepo.records = idemSnap;
        throw error;
      }
    },
  };

  beforeEach(() => {
    caseRepo = new InMemoryCaseRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    activeUser = USER_A;
  });

  it('rejects unauthenticated requests across EP-001..EP-008 with 401 ERR-AUTH-001', async () => {
    activeUser = null;
    const caseId = '11111111-1111-4111-8111-111111111111';

    const responses = await Promise.all([
      handleCreateCase(
        makeRequest('POST', 'http://localhost:3000/api/v1/cases', { body: { title: 'Test' } }),
        deps,
      ),
      handleListCases(makeRequest('GET', 'http://localhost:3000/api/v1/cases'), deps),
      handleGetCase(
        makeRequest('GET', `http://localhost:3000/api/v1/cases/${caseId}`),
        caseId,
        deps,
      ),
      handleUpdateCase(
        makeRequest('PATCH', `http://localhost:3000/api/v1/cases/${caseId}`, {
          body: { title: 'X' },
        }),
        caseId,
        deps,
      ),
      handleDeleteCase(
        makeRequest('DELETE', `http://localhost:3000/api/v1/cases/${caseId}`),
        caseId,
        deps,
      ),
      handleSaveRevision(
        makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions`, {
          body: validPaperbackRevisionBody(),
        }),
        caseId,
        deps,
      ),
      handleGetRevision(
        makeRequest('GET', `http://localhost:3000/api/v1/cases/${caseId}/revisions/1`),
        caseId,
        '1',
        deps,
      ),
      handleAttachEvidence(
        makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions/1/evidence`, {
          body: { provenance: 'user_input', kind: 'note', summary: 'x' },
        }),
        caseId,
        '1',
        deps,
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.headers.get('x-correlation-id')).toBeTruthy();
      const body = await res.json();
      expect(body.code).toBe('ERR-AUTH-001');
    }
  });

  it('enforces CSRF on mutating endpoints (403 ERR-AUTH-002)', async () => {
    const res = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'No CSRF' },
        withCsrf: false,
      }),
      deps,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ERR-AUTH-002');
  });

  it('executes full lifecycle for owner (EP-001..EP-008) and enforces 404 after delete', async () => {
    // EP-001 Create
    const createRes = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: '  My Debut Novel  ' },
        headers: { 'x-correlation-id': 'corr-1' },
      }),
      deps,
    );
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get('x-correlation-id')).toBe('corr-1');
    const created = await createRes.json();
    expect(created.title).toBe('My Debut Novel');
    expect(created.status).toBe('active');

    // EP-002 List
    const listRes = await handleListCases(
      makeRequest('GET', 'http://localhost:3000/api/v1/cases?limit=10'),
      deps,
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.items).toHaveLength(1);
    expect(listBody.nextCursor).toBeNull();

    // EP-003 Get
    const getRes = await handleGetCase(
      makeRequest('GET', `http://localhost:3000/api/v1/cases/${created.id}`),
      created.id,
      deps,
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.latestRevision).toBeNull();

    // EP-004 Patch (title + archive)
    const patchRes = await handleUpdateCase(
      makeRequest('PATCH', `http://localhost:3000/api/v1/cases/${created.id}`, {
        body: { title: 'Updated Novel', status: 'archived' },
      }),
      created.id,
      deps,
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.title).toBe('Updated Novel');
    expect(patched.status).toBe('archived');

    // EP-006 Save revision
    const revRes = await handleSaveRevision(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${created.id}/revisions`, {
        body: validPaperbackRevisionBody(),
      }),
      created.id,
      deps,
    );
    expect(revRes.status).toBe(201);
    const revBody = await revRes.json();
    expect(revBody.revisionNo).toBe(1);
    expect(revBody.inputsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(revBody.warnings.map((w: { fieldPath: string }) => w.fieldPath)).toEqual([
      'listPrice',
      'fixedCosts[0]',
    ]);

    // EP-008 Attach evidence
    const evRes = await handleAttachEvidence(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${created.id}/revisions/1/evidence`, {
        body: {
          fieldPath: 'listPrice',
          provenance: 'official_fact',
          kind: 'url',
          summary: 'Storefront list price verification',
          sourceRef: 'https://example.com/pricing',
          capturedAt: '2026-11-27',
        },
      }),
      created.id,
      '1',
      deps,
    );
    expect(evRes.status).toBe(201);
    const evBody = await evRes.json();
    expect(evBody.kind).toBe('url');

    // EP-007 Get revision
    const getRevRes = await handleGetRevision(
      makeRequest('GET', `http://localhost:3000/api/v1/cases/${created.id}/revisions/1`),
      created.id,
      '1',
      deps,
    );
    expect(getRevRes.status).toBe(200);
    const getRevBody = await getRevRes.json();
    expect(getRevBody.evidenceItems).toHaveLength(1);

    // EP-005 Delete (phase 1 -> 202)
    const delRes = await handleDeleteCase(
      makeRequest('DELETE', `http://localhost:3000/api/v1/cases/${created.id}`),
      created.id,
      deps,
    );
    expect(delRes.status).toBe(202);
    expect(await delRes.json()).toEqual({ status: 'deletion_requested' });

    // Repeat delete & get -> 404 ERR-RES-001
    const repeatDel = await handleDeleteCase(
      makeRequest('DELETE', `http://localhost:3000/api/v1/cases/${created.id}`),
      created.id,
      deps,
    );
    expect(repeatDel.status).toBe(404);
    expect((await repeatDel.json()).code).toBe('ERR-RES-001');

    const getAfterDel = await handleGetCase(
      makeRequest('GET', `http://localhost:3000/api/v1/cases/${created.id}`),
      created.id,
      deps,
    );
    expect(getAfterDel.status).toBe(404);
  });

  it('enforces cross-user ownership isolation with 404 ERR-RES-001 across all endpoints', async () => {
    // User A creates a case + revision
    const createRes = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', { body: { title: 'Secret A' } }),
      deps,
    );
    const { id: caseId } = await createRes.json();
    await handleSaveRevision(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions`, {
        body: validPaperbackRevisionBody(),
      }),
      caseId,
      deps,
    );

    // Switch to User B
    activeUser = USER_B;

    const listB = await handleListCases(
      makeRequest('GET', 'http://localhost:3000/api/v1/cases'),
      deps,
    );
    expect((await listB.json()).items).toHaveLength(0);

    const attempts = await Promise.all([
      handleGetCase(
        makeRequest('GET', `http://localhost:3000/api/v1/cases/${caseId}`),
        caseId,
        deps,
      ),
      handleUpdateCase(
        makeRequest('PATCH', `http://localhost:3000/api/v1/cases/${caseId}`, {
          body: { title: 'Hacked' },
        }),
        caseId,
        deps,
      ),
      handleDeleteCase(
        makeRequest('DELETE', `http://localhost:3000/api/v1/cases/${caseId}`),
        caseId,
        deps,
      ),
      handleSaveRevision(
        makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions`, {
          body: validPaperbackRevisionBody(),
        }),
        caseId,
        deps,
      ),
      handleGetRevision(
        makeRequest('GET', `http://localhost:3000/api/v1/cases/${caseId}/revisions/1`),
        caseId,
        '1',
        deps,
      ),
      handleAttachEvidence(
        makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions/1/evidence`, {
          body: {
            provenance: 'note' === 'note' ? 'user_input' : 'user_input',
            kind: 'note',
            summary: 'x',
          },
        }),
        caseId,
        '1',
        deps,
      ),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('ERR-RES-001');
    }
  });

  it('enforces Idempotency-Key replay, mismatch conflict (409), invalid key (400), and failure release', async () => {
    const key = 'idem-key-1';
    const first = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Idempotent Case' },
        headers: { 'idempotency-key': key },
      }),
      deps,
    );
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    // Replay with identical body returns stored response without creating a 2nd case
    const replay = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Idempotent Case' },
        headers: { 'idempotency-key': key },
      }),
      deps,
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstBody);
    expect(caseRepo.createCount).toBe(1);

    // Same key with different payload => 409 ERR-IDEM-001
    const conflict = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Different Title' },
        headers: { 'idempotency-key': key },
      }),
      deps,
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('ERR-IDEM-001');

    // Empty Idempotency-Key => 400 ERR-IDEM-002
    const invalidKey = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Bad Key' },
        headers: { 'idempotency-key': '   ' },
      }),
      deps,
    );
    expect(invalidKey.status).toBe(400);
    expect((await invalidKey.json()).code).toBe('ERR-IDEM-002');

    // Failure releases key so retry succeeds
    caseRepo.shouldFailNext = true;
    const failed = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Retryable Case' },
        headers: { 'idempotency-key': 'idem-key-retry' },
      }),
      deps,
    );
    expect(failed.status).toBe(500);
    expect((await failed.json()).code).toBe('ERR-SYS-001');

    const retried = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Retryable Case' },
        headers: { 'idempotency-key': 'idem-key-retry' },
      }),
      deps,
    );
    expect(retried.status).toBe(201);

    // Idempotency completion failure rolls back mutation + key so retry creates case once
    const countBefore = caseRepo.createCount;
    idempotencyRepo.shouldFailCompleteNext = true;
    const failedComplete = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Complete Fail Case' },
        headers: { 'idempotency-key': 'idem-key-complete-fail' },
      }),
      deps,
    );
    expect(failedComplete.status).toBe(500);
    expect((await failedComplete.json()).code).toBe('ERR-SYS-001');
    expect(caseRepo.createCount).toBe(countBefore);

    const retriedAfterCompleteFail = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Complete Fail Case' },
        headers: { 'idempotency-key': 'idem-key-complete-fail' },
      }),
      deps,
    );
    expect(retriedAfterCompleteFail.status).toBe(201);
    expect(caseRepo.createCount).toBe(countBefore + 1);
  });

  it('rejects listCases limit=0, limit=101, malformed cursor, and empty PATCH body with 422 ERR-VAL-001 / ERR-VAL-002', async () => {
    const createRes = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Boundary Target' },
      }),
      deps,
    );
    const { id: caseId } = await createRes.json();

    const limitZero = await handleListCases(
      makeRequest('GET', 'http://localhost:3000/api/v1/cases?limit=0'),
      deps,
    );
    expect(limitZero.status).toBe(422);
    const limitZeroBody = await limitZero.json();
    expect(limitZeroBody.code).toBe('ERR-VAL-001');
    expect(limitZeroBody.errors[0].code).toBe('ERR-VAL-002');
    expect(limitZeroBody.errors[0].path).toBe('query.limit');

    const limitOver = await handleListCases(
      makeRequest('GET', 'http://localhost:3000/api/v1/cases?limit=101'),
      deps,
    );
    expect(limitOver.status).toBe(422);
    const limitOverBody = await limitOver.json();
    expect(limitOverBody.code).toBe('ERR-VAL-001');
    expect(limitOverBody.errors[0].code).toBe('ERR-VAL-002');
    expect(limitOverBody.errors[0].path).toBe('query.limit');

    const malformedCursor = await handleListCases(
      makeRequest('GET', 'http://localhost:3000/api/v1/cases?cursor=not-a-valid-cursor'),
      deps,
    );
    expect(malformedCursor.status).toBe(422);
    const malformedCursorBody = await malformedCursor.json();
    expect(malformedCursorBody.code).toBe('ERR-VAL-001');
    expect(malformedCursorBody.errors[0].code).toBe('ERR-VAL-002');
    expect(malformedCursorBody.errors[0].path).toBe('query.cursor');

    const emptyPatch = await handleUpdateCase(
      makeRequest('PATCH', `http://localhost:3000/api/v1/cases/${caseId}`, {
        body: {},
      }),
      caseId,
      deps,
    );
    expect(emptyPatch.status).toBe(422);
    const emptyPatchBody = await emptyPatch.json();
    expect(emptyPatchBody.code).toBe('ERR-VAL-001');
    expect(emptyPatchBody.errors[0].code).toBe('ERR-VAL-002');
    expect(emptyPatchBody.errors[0].path).toBe('body');
  });

  it('rejects unknown fields, invalid inputs, and invalid formats with 422 ERR-VAL-001 / ERR-VAL-002', async () => {
    const createRes = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Valid' },
      }),
      deps,
    );
    const { id: caseId } = await createRes.json();

    // Unknown field on createCase
    const unknownField = await handleCreateCase(
      makeRequest('POST', 'http://localhost:3000/api/v1/cases', {
        body: { title: 'Valid', extraField: true },
      }),
      deps,
    );
    expect(unknownField.status).toBe(422);
    const unknownBody = await unknownField.json();
    expect(unknownBody.code).toBe('ERR-VAL-001');
    expect(unknownBody.errors[0].code).toBe('ERR-VAL-002');

    // PATCH cannot set pending_deletion
    const badStatus = await handleUpdateCase(
      makeRequest('PATCH', `http://localhost:3000/api/v1/cases/${caseId}`, {
        body: { status: 'pending_deletion' },
      }),
      caseId,
      deps,
    );
    expect(badStatus.status).toBe(422);

    // Ebook with pageCount or malformed fileSizeMb rejected
    const badEbook = validPaperbackRevisionBody();
    (badEbook.inputs as Record<string, unknown>).format = 'ebook';
    (badEbook.inputs as Record<string, unknown>).fileSizeMb = '1e5';
    const badRev = await handleSaveRevision(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions`, {
        body: badEbook,
      }),
      caseId,
      deps,
    );
    expect(badRev.status).toBe(422);
    const badRevBody = await badRev.json();
    expect(badRevBody.errors.some((e: { path: string }) => e.path === 'inputs.pageCount')).toBe(
      true,
    );
    expect(badRevBody.errors.some((e: { path: string }) => e.path === 'inputs.fileSizeMb')).toBe(
      true,
    );

    // Invalid calendar date on evidence
    await handleSaveRevision(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions`, {
        body: validPaperbackRevisionBody(),
      }),
      caseId,
      deps,
    );
    const badEv = await handleAttachEvidence(
      makeRequest('POST', `http://localhost:3000/api/v1/cases/${caseId}/revisions/1/evidence`, {
        body: {
          provenance: 'user_input',
          kind: 'note',
          summary: 'test',
          capturedAt: '2026-02-29',
        },
      }),
      caseId,
      '1',
      deps,
    );
    expect(badEv.status).toBe(422);
  });
});
