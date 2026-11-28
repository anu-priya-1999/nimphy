import type { CaseId, EvidenceId, Provenance, RevisionId, UserId } from '@nimphy/domain';

export type BusinessCaseStatus = 'active' | 'archived' | 'pending_deletion';
export type UpdatableCaseStatus = 'active' | 'archived';
export type EvidenceKind = 'quote' | 'url' | 'note' | 'document_ref';

export interface BusinessCaseRecord {
  readonly id: CaseId;
  readonly userId: UserId;
  readonly title: string;
  readonly status: BusinessCaseStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CaseRevisionSummary {
  readonly id: RevisionId;
  readonly revisionNo: number;
  readonly inputsSchemaVersion: number;
  readonly inputsHash: string;
  readonly createdAt: Date;
}

export interface CaseRevisionRecord extends CaseRevisionSummary {
  readonly caseId: CaseId;
  readonly inputs: Record<string, unknown>;
}

export interface EvidenceItemRecord {
  readonly id: EvidenceId;
  readonly revisionId: RevisionId;
  readonly fieldPath: string | null;
  readonly provenance: Provenance;
  readonly kind: EvidenceKind;
  readonly summary: string;
  readonly sourceRef: string | null;
  readonly capturedAt: string | null;
  readonly createdAt: Date;
}

export interface ListCasesCursor {
  readonly updatedAt: Date;
  readonly id: CaseId;
}

export interface CreateCaseInput {
  readonly userId: UserId;
  readonly title: string;
  readonly correlationId: string;
}

export interface ListCasesInput {
  readonly userId: UserId;
  readonly limit: number;
  readonly cursor?: ListCasesCursor | null;
  readonly status?: UpdatableCaseStatus;
}

export interface ListCasesResult {
  readonly items: readonly BusinessCaseRecord[];
  readonly hasMore: boolean;
}

export interface GetCaseInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
}

export interface GetCaseResult {
  readonly businessCase: BusinessCaseRecord;
  readonly latestRevision: CaseRevisionSummary | null;
}

export interface UpdateCaseInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
  readonly title?: string;
  readonly status?: UpdatableCaseStatus;
  readonly correlationId: string;
}

export interface RequestCaseDeletionInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
  readonly correlationId: string;
}

export interface SaveRevisionInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
  readonly inputs: Record<string, unknown>;
  readonly inputsSchemaVersion: number;
  readonly inputsHash: string;
  readonly correlationId: string;
}

export interface GetRevisionInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
  readonly revisionNo: number;
}

export interface GetRevisionResult {
  readonly revision: CaseRevisionRecord;
  readonly evidenceItems: readonly EvidenceItemRecord[];
}

export interface AttachEvidenceInput {
  readonly userId: UserId;
  readonly caseId: CaseId;
  readonly revisionNo: number;
  readonly fieldPath: string | null;
  readonly provenance: Provenance;
  readonly kind: EvidenceKind;
  readonly summary: string;
  readonly sourceRef: string | null;
  readonly capturedAt: string | null;
}

export interface CaseRepository {
  createCase(input: CreateCaseInput): Promise<BusinessCaseRecord>;
  listCases(input: ListCasesInput): Promise<ListCasesResult>;
  getCaseWithLatestRevision(input: GetCaseInput): Promise<GetCaseResult | null>;
  updateCase(input: UpdateCaseInput): Promise<BusinessCaseRecord | null>;
  requestCaseDeletion(input: RequestCaseDeletionInput): Promise<{ requested: boolean }>;
  saveRevision(input: SaveRevisionInput): Promise<CaseRevisionRecord | null>;
  getRevision(input: GetRevisionInput): Promise<GetRevisionResult | null>;
  attachEvidence(input: AttachEvidenceInput): Promise<EvidenceItemRecord | null>;
}
