import {
  parseCaseId,
  parseEvidenceId,
  parseProvenance,
  parseRevisionId,
  parseUserId,
} from '@nimphy/domain';
import { writeAuditEvent } from '../audit/audit-writer';
import { withTransaction } from '../db/transaction';
import type { DatabasePool, SqlQueryClient } from '../db/types';
import type {
  AttachEvidenceInput,
  BusinessCaseRecord,
  BusinessCaseStatus,
  CaseRepository,
  CaseRevisionRecord,
  CaseRevisionSummary,
  CreateCaseInput,
  EvidenceItemRecord,
  EvidenceKind,
  GetCaseInput,
  GetCaseResult,
  GetRevisionInput,
  GetRevisionResult,
  ListCasesInput,
  ListCasesResult,
  RequestCaseDeletionInput,
  SaveRevisionInput,
  UpdateCaseInput,
} from './types';

interface BusinessCaseRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CaseRevisionSummaryRow {
  id: string;
  revision_no: number;
  inputs_schema_version: number;
  inputs_hash: string;
  created_at: Date | string;
}

interface CaseRevisionRow extends CaseRevisionSummaryRow {
  case_id: string;
  inputs: Record<string, unknown>;
}

interface EvidenceItemRow {
  id: string;
  revision_id: string;
  field_path: string | null;
  provenance: string;
  kind: string;
  summary: string;
  source_ref: string | null;
  captured_at: Date | string | null;
  created_at: Date | string;
}

const VALID_CASE_STATUSES = new Set<BusinessCaseStatus>(['active', 'archived', 'pending_deletion']);
const VALID_EVIDENCE_KINDS = new Set<EvidenceKind>(['quote', 'url', 'note', 'document_ref']);

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toIsoDateOnly(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function mapBusinessCaseRow(row: BusinessCaseRow): BusinessCaseRecord {
  if (!VALID_CASE_STATUSES.has(row.status as BusinessCaseStatus)) {
    throw new Error(`Unexpected business_cases.status value: ${row.status}`);
  }
  return {
    id: parseCaseId(row.id),
    userId: parseUserId(row.user_id),
    title: row.title,
    status: row.status as BusinessCaseStatus,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapRevisionSummaryRow(row: CaseRevisionSummaryRow): CaseRevisionSummary {
  return {
    id: parseRevisionId(row.id),
    revisionNo: Number(row.revision_no),
    inputsSchemaVersion: Number(row.inputs_schema_version),
    inputsHash: row.inputs_hash,
    createdAt: toDate(row.created_at),
  };
}

function mapRevisionRow(row: CaseRevisionRow): CaseRevisionRecord {
  return {
    ...mapRevisionSummaryRow(row),
    caseId: parseCaseId(row.case_id),
    inputs: row.inputs,
  };
}

function mapEvidenceRow(row: EvidenceItemRow): EvidenceItemRecord {
  if (!VALID_EVIDENCE_KINDS.has(row.kind as EvidenceKind)) {
    throw new Error(`Unexpected evidence_items.kind value: ${row.kind}`);
  }
  return {
    id: parseEvidenceId(row.id),
    revisionId: parseRevisionId(row.revision_id),
    fieldPath: row.field_path,
    provenance: parseProvenance(row.provenance),
    kind: row.kind as EvidenceKind,
    summary: row.summary,
    sourceRef: row.source_ref,
    capturedAt: toIsoDateOnly(row.captured_at),
    createdAt: toDate(row.created_at),
  };
}

export class PgCaseRepository implements CaseRepository {
  private readonly queryClient: SqlQueryClient;
  private readonly pool: DatabasePool | null;

  constructor(clientOrPool: DatabasePool | SqlQueryClient, inTransaction: boolean = false) {
    this.queryClient = clientOrPool;
    this.pool = inTransaction ? null : (clientOrPool as DatabasePool);
  }

  private async runInTransaction<T>(fn: (client: SqlQueryClient) => Promise<T>): Promise<T> {
    if (this.pool) {
      return withTransaction(this.pool, fn);
    }
    return fn(this.queryClient);
  }

  async createCase(input: CreateCaseInput): Promise<BusinessCaseRecord> {
    return this.runInTransaction(async (client: SqlQueryClient) => {
      const inserted = await client.query<BusinessCaseRow>(
        `INSERT INTO business_cases (user_id, title, status)
         VALUES ($1, $2, 'active')
         RETURNING id, user_id, title, status, created_at, updated_at`,
        [input.userId, input.title],
      );

      const row = inserted.rows[0];
      if (!row) {
        throw new Error('Failed to insert business_cases row');
      }

      const record = mapBusinessCaseRow(row);

      await writeAuditEvent(client, {
        actorUserId: input.userId,
        actorKind: 'user',
        action: 'case.created',
        entityType: 'business_case',
        entityId: record.id,
        correlationId: input.correlationId,
        details: { case_id: record.id },
      });

      return record;
    });
  }

  async listCases(input: ListCasesInput): Promise<ListCasesResult> {
    const params: unknown[] = [input.userId];
    const conditions: string[] = [`user_id = $1`, `status <> 'pending_deletion'`];

    if (input.status) {
      params.push(input.status);
      conditions.push(`status = $${params.length}`);
    }

    if (input.cursor) {
      params.push(input.cursor.updatedAt.toISOString(), input.cursor.id);
      const tsIdx = params.length - 1;
      const idIdx = params.length;
      conditions.push(`(updated_at, id) < ($${tsIdx}::timestamptz, $${idIdx}::uuid)`);
    }

    params.push(input.limit + 1);
    const limitIdx = params.length;

    const result = await this.queryClient.query<BusinessCaseRow>(
      `SELECT id, user_id, title, status, created_at, updated_at
       FROM business_cases
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC, id DESC
       LIMIT $${limitIdx}`,
      params,
    );

    const hasMore = result.rows.length > input.limit;
    const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
    return {
      items: rows.map(mapBusinessCaseRow),
      hasMore,
    };
  }

  async getCaseWithLatestRevision(input: GetCaseInput): Promise<GetCaseResult | null> {
    const caseRes = await this.queryClient.query<BusinessCaseRow>(
      `SELECT id, user_id, title, status, created_at, updated_at
       FROM business_cases
       WHERE id = $1 AND user_id = $2 AND status <> 'pending_deletion'
       LIMIT 1`,
      [input.caseId, input.userId],
    );

    const caseRow = caseRes.rows[0];
    if (!caseRow) {
      return null;
    }

    const revRes = await this.queryClient.query<CaseRevisionSummaryRow>(
      `SELECT id, revision_no, inputs_schema_version, inputs_hash, created_at
       FROM case_revisions
       WHERE case_id = $1
       ORDER BY revision_no DESC
       LIMIT 1`,
      [input.caseId],
    );

    const latestRow = revRes.rows[0];
    return {
      businessCase: mapBusinessCaseRow(caseRow),
      latestRevision: latestRow ? mapRevisionSummaryRow(latestRow) : null,
    };
  }

  async updateCase(input: UpdateCaseInput): Promise<BusinessCaseRecord | null> {
    return this.runInTransaction(async (client: SqlQueryClient) => {
      const existingRes = await client.query<BusinessCaseRow>(
        `SELECT id, user_id, title, status, created_at, updated_at
         FROM business_cases
         WHERE id = $1 AND user_id = $2 AND status <> 'pending_deletion'
         FOR UPDATE`,
        [input.caseId, input.userId],
      );

      const existingRow = existingRes.rows[0];
      if (!existingRow) {
        return null;
      }

      const nextTitle = input.title ?? existingRow.title;
      const nextStatus = input.status ?? (existingRow.status as 'active' | 'archived');

      const updatedRes = await client.query<BusinessCaseRow>(
        `UPDATE business_cases
         SET title = $1, status = $2, updated_at = now()
         WHERE id = $3 AND user_id = $4 AND status <> 'pending_deletion'
         RETURNING id, user_id, title, status, created_at, updated_at`,
        [nextTitle, nextStatus, input.caseId, input.userId],
      );

      const updatedRow = updatedRes.rows[0];
      if (!updatedRow) {
        return null;
      }

      if (existingRow.status !== nextStatus) {
        await writeAuditEvent(client, {
          actorUserId: input.userId,
          actorKind: 'user',
          action: nextStatus === 'archived' ? 'case.archived' : 'case.restored',
          entityType: 'business_case',
          entityId: input.caseId,
          correlationId: input.correlationId,
          details: { case_id: input.caseId },
        });
      }

      return mapBusinessCaseRow(updatedRow);
    });
  }

  async requestCaseDeletion(input: RequestCaseDeletionInput): Promise<{ requested: boolean }> {
    return this.runInTransaction(async (client: SqlQueryClient) => {
      const existingRes = await client.query<{ id: string }>(
        `SELECT id
         FROM business_cases
         WHERE id = $1 AND user_id = $2 AND status <> 'pending_deletion'
         FOR UPDATE`,
        [input.caseId, input.userId],
      );

      if (!existingRes.rows[0]) {
        return { requested: false };
      }

      await client.query(
        `UPDATE business_cases
         SET status = 'pending_deletion',
             deletion_requested_at = now(),
             updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [input.caseId, input.userId],
      );

      await writeAuditEvent(client, {
        actorUserId: input.userId,
        actorKind: 'user',
        action: 'case.deletion_requested',
        entityType: 'business_case',
        entityId: input.caseId,
        correlationId: input.correlationId,
        details: { case_id: input.caseId, phase: 'phase_1' },
      });

      return { requested: true };
    });
  }

  async saveRevision(input: SaveRevisionInput): Promise<CaseRevisionRecord | null> {
    return this.runInTransaction(async (client: SqlQueryClient) => {
      const caseRes = await client.query<{ id: string }>(
        `SELECT id
         FROM business_cases
         WHERE id = $1 AND user_id = $2 AND status <> 'pending_deletion'
         FOR UPDATE`,
        [input.caseId, input.userId],
      );

      if (!caseRes.rows[0]) {
        return null;
      }

      const maxRes = await client.query<{ next_no: number }>(
        `SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no
         FROM case_revisions
         WHERE case_id = $1`,
        [input.caseId],
      );

      const nextNo = Number(maxRes.rows[0]?.next_no ?? 1);

      const inserted = await client.query<CaseRevisionRow>(
        `INSERT INTO case_revisions (
           case_id,
           revision_no,
           inputs,
           inputs_schema_version,
           inputs_hash
         )
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id, case_id, revision_no, inputs, inputs_schema_version, inputs_hash, created_at`,
        [
          input.caseId,
          nextNo,
          JSON.stringify(input.inputs),
          input.inputsSchemaVersion,
          input.inputsHash,
        ],
      );

      const revRow = inserted.rows[0];
      if (!revRow) {
        throw new Error('Failed to insert case_revisions row');
      }

      await client.query(`UPDATE business_cases SET updated_at = now() WHERE id = $1`, [
        input.caseId,
      ]);

      await writeAuditEvent(client, {
        actorUserId: input.userId,
        actorKind: 'user',
        action: 'revision.saved',
        entityType: 'case_revision',
        entityId: revRow.id,
        correlationId: input.correlationId,
        details: {
          case_id: input.caseId,
          revision_no: nextNo,
          inputs_hash: input.inputsHash,
        },
      });

      return mapRevisionRow(revRow);
    });
  }

  async getRevision(input: GetRevisionInput): Promise<GetRevisionResult | null> {
    const revRes = await this.queryClient.query<CaseRevisionRow>(
      `SELECT r.id, r.case_id, r.revision_no, r.inputs, r.inputs_schema_version, r.inputs_hash, r.created_at
       FROM case_revisions r
       INNER JOIN business_cases c ON c.id = r.case_id
       WHERE c.id = $1 AND c.user_id = $2 AND c.status <> 'pending_deletion' AND r.revision_no = $3
       LIMIT 1`,
      [input.caseId, input.userId, input.revisionNo],
    );

    const revRow = revRes.rows[0];
    if (!revRow) {
      return null;
    }

    const evRes = await this.queryClient.query<EvidenceItemRow>(
      `SELECT id, revision_id, field_path, provenance, kind, summary, source_ref, captured_at, created_at
       FROM evidence_items
       WHERE revision_id = $1
       ORDER BY created_at ASC, id ASC`,
      [revRow.id],
    );

    return {
      revision: mapRevisionRow(revRow),
      evidenceItems: evRes.rows.map(mapEvidenceRow),
    };
  }

  async attachEvidence(input: AttachEvidenceInput): Promise<EvidenceItemRecord | null> {
    return this.runInTransaction(async (client: SqlQueryClient) => {
      const revRes = await client.query<{ id: string }>(
        `SELECT r.id
         FROM case_revisions r
         INNER JOIN business_cases c ON c.id = r.case_id
         WHERE c.id = $1 AND c.user_id = $2 AND c.status <> 'pending_deletion' AND r.revision_no = $3
         FOR UPDATE OF c`,
        [input.caseId, input.userId, input.revisionNo],
      );

      const revRow = revRes.rows[0];
      if (!revRow) {
        return null;
      }

      const inserted = await client.query<EvidenceItemRow>(
        `INSERT INTO evidence_items (
           revision_id,
           field_path,
           provenance,
           kind,
           summary,
           source_ref,
           captured_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::date)
         RETURNING id, revision_id, field_path, provenance, kind, summary, source_ref, captured_at, created_at`,
        [
          revRow.id,
          input.fieldPath,
          input.provenance,
          input.kind,
          input.summary,
          input.sourceRef,
          input.capturedAt,
        ],
      );

      const evRow = inserted.rows[0];
      if (!evRow) {
        throw new Error('Failed to insert evidence_items row');
      }

      await client.query(`UPDATE business_cases SET updated_at = now() WHERE id = $1`, [
        input.caseId,
      ]);

      return mapEvidenceRow(evRow);
    });
  }
}

export function createPgCaseRepository(pool: DatabasePool): CaseRepository {
  return new PgCaseRepository(pool, false);
}

export function createPgCaseRepositoryForTransaction(client: SqlQueryClient): CaseRepository {
  return new PgCaseRepository(client, true);
}
