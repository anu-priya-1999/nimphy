import { hashCanonicalJson, type CaseId, type UserId } from '@nimphy/domain';
import type {
  BusinessCaseRecord,
  CaseRepository,
  CaseRevisionSummary,
  EvidenceItemRecord,
  EvidenceKind,
  ListCasesCursor,
  UpdatableCaseStatus,
} from '@nimphy/persistence';
import { ApiProblemError } from '../api/errors';
import {
  encodeListCasesCursor,
  type ValidatedCaseInputsDto,
  type ValidatedProvenancedMoneyDto,
} from './validation';

export interface CaseUseCaseDeps {
  readonly caseRepo: CaseRepository;
}

export interface BusinessCaseDto {
  readonly id: string;
  readonly title: string;
  readonly status: 'active' | 'archived' | 'pending_deletion';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RevisionSummaryDto {
  readonly id: string;
  readonly revisionNo: number;
  readonly inputsSchemaVersion: number;
  readonly inputsHash: string;
  readonly createdAt: string;
}

export interface GetCaseResponseDto extends BusinessCaseDto {
  readonly latestRevision: RevisionSummaryDto | null;
}

export interface ListCasesResponseDto {
  readonly items: readonly BusinessCaseDto[];
  readonly nextCursor: string | null;
}

export interface RevisionWarningDto {
  readonly code: 'WARN-MISSING-EVIDENCE';
  readonly fieldPath: string;
  readonly message: string;
}

export interface SaveRevisionResponseDto {
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly inputsHash: string;
  readonly warnings: readonly RevisionWarningDto[];
}

export interface EvidenceItemDto {
  readonly id: string;
  readonly revisionId: string;
  readonly fieldPath: string | null;
  readonly provenance: string;
  readonly kind: EvidenceKind;
  readonly summary: string;
  readonly sourceRef: string | null;
  readonly capturedAt: string | null;
  readonly createdAt: string;
}

export interface GetRevisionResponseDto {
  readonly revisionId: string;
  readonly caseId: string;
  readonly revisionNo: number;
  readonly inputsSchemaVersion: number;
  readonly inputs: Record<string, unknown>;
  readonly inputsHash: string;
  readonly createdAt: string;
  readonly evidenceItems: readonly EvidenceItemDto[];
}

export interface DeleteCaseResponseDto {
  readonly status: 'deletion_requested';
}

function toBusinessCaseDto(record: BusinessCaseRecord): BusinessCaseDto {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toRevisionSummaryDto(summary: CaseRevisionSummary): RevisionSummaryDto {
  return {
    id: summary.id,
    revisionNo: summary.revisionNo,
    inputsSchemaVersion: summary.inputsSchemaVersion,
    inputsHash: summary.inputsHash,
    createdAt: summary.createdAt.toISOString(),
  };
}

function toEvidenceItemDto(item: EvidenceItemRecord): EvidenceItemDto {
  return {
    id: item.id,
    revisionId: item.revisionId,
    fieldPath: item.fieldPath,
    provenance: item.provenance,
    kind: item.kind,
    summary: item.summary,
    sourceRef: item.sourceRef,
    capturedAt: item.capturedAt,
    createdAt: item.createdAt.toISOString(),
  };
}

function hasEvidenceRefs(field: ValidatedProvenancedMoneyDto): boolean {
  return Array.isArray(field.evidenceRefs) && field.evidenceRefs.length > 0;
}

export function computeRevisionWarnings(
  inputs: ValidatedCaseInputsDto,
): readonly RevisionWarningDto[] {
  const warnings: RevisionWarningDto[] = [];

  if (!hasEvidenceRefs(inputs.listPrice)) {
    warnings.push({
      code: 'WARN-MISSING-EVIDENCE',
      fieldPath: 'listPrice',
      message: 'No evidence attached.',
    });
  }

  if (inputs.unitProductionCost && !hasEvidenceRefs(inputs.unitProductionCost)) {
    warnings.push({
      code: 'WARN-MISSING-EVIDENCE',
      fieldPath: 'unitProductionCost',
      message: 'No evidence attached.',
    });
  }

  for (let i = 0; i < inputs.fixedCosts.length; i++) {
    const cost = inputs.fixedCosts[i];
    if (cost && !hasEvidenceRefs(cost)) {
      warnings.push({
        code: 'WARN-MISSING-EVIDENCE',
        fieldPath: `fixedCosts[${i}]`,
        message: 'No evidence attached.',
      });
    }
  }

  return warnings;
}

export async function createCaseUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly title: string;
    readonly correlationId: string;
  },
): Promise<BusinessCaseDto> {
  const record = await deps.caseRepo.createCase({
    userId: input.userId,
    title: input.title,
    correlationId: input.correlationId,
  });
  return toBusinessCaseDto(record);
}

export async function listCasesUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly limit: number;
    readonly cursor: ListCasesCursor | null;
    readonly status?: UpdatableCaseStatus;
  },
): Promise<ListCasesResponseDto> {
  const page = await deps.caseRepo.listCases({
    userId: input.userId,
    limit: input.limit,
    cursor: input.cursor,
    status: input.status,
  });

  const lastItem = page.items[page.items.length - 1];
  const nextCursor =
    page.hasMore && lastItem
      ? encodeListCasesCursor({ updatedAt: lastItem.updatedAt, id: lastItem.id })
      : null;

  return {
    items: page.items.map(toBusinessCaseDto),
    nextCursor,
  };
}

export async function getCaseUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
  },
): Promise<GetCaseResponseDto> {
  const found = await deps.caseRepo.getCaseWithLatestRevision({
    userId: input.userId,
    caseId: input.caseId,
  });

  if (!found) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return {
    ...toBusinessCaseDto(found.businessCase),
    latestRevision: found.latestRevision ? toRevisionSummaryDto(found.latestRevision) : null,
  };
}

export async function updateCaseUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
    readonly title?: string;
    readonly status?: UpdatableCaseStatus;
    readonly correlationId: string;
  },
): Promise<BusinessCaseDto> {
  const updated = await deps.caseRepo.updateCase({
    userId: input.userId,
    caseId: input.caseId,
    title: input.title,
    status: input.status,
    correlationId: input.correlationId,
  });

  if (!updated) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return toBusinessCaseDto(updated);
}

export async function requestCaseDeletionUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
    readonly acknowledgePaidLoss: boolean;
    readonly correlationId: string;
  },
): Promise<DeleteCaseResponseDto> {
  // STEP-024 will add payment-aware ERR-LIFE-001 (in-flight CAPTURE_REQUESTED)
  // and ERR-LIFE-002 (active entitlement without acknowledgePaidLoss=true) guards here.
  void input.acknowledgePaidLoss;

  const result = await deps.caseRepo.requestCaseDeletion({
    userId: input.userId,
    caseId: input.caseId,
    correlationId: input.correlationId,
  });

  if (!result.requested) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return { status: 'deletion_requested' };
}

export async function saveRevisionUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
    readonly inputsSchemaVersion: 1;
    readonly inputs: ValidatedCaseInputsDto;
    readonly correlationId: string;
  },
): Promise<SaveRevisionResponseDto> {
  const inputsHash = hashCanonicalJson(input.inputs);
  const warnings = computeRevisionWarnings(input.inputs);

  const saved = await deps.caseRepo.saveRevision({
    userId: input.userId,
    caseId: input.caseId,
    inputs: input.inputs as unknown as Record<string, unknown>,
    inputsSchemaVersion: input.inputsSchemaVersion,
    inputsHash,
    correlationId: input.correlationId,
  });

  if (!saved) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return {
    revisionId: saved.id,
    revisionNo: saved.revisionNo,
    inputsHash: saved.inputsHash,
    warnings,
  };
}

export async function getRevisionUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
    readonly revisionNo: number;
  },
): Promise<GetRevisionResponseDto> {
  const found = await deps.caseRepo.getRevision({
    userId: input.userId,
    caseId: input.caseId,
    revisionNo: input.revisionNo,
  });

  if (!found) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return {
    revisionId: found.revision.id,
    caseId: found.revision.caseId,
    revisionNo: found.revision.revisionNo,
    inputsSchemaVersion: found.revision.inputsSchemaVersion,
    inputs: found.revision.inputs,
    inputsHash: found.revision.inputsHash,
    createdAt: found.revision.createdAt.toISOString(),
    evidenceItems: found.evidenceItems.map(toEvidenceItemDto),
  };
}

export async function attachEvidenceUseCase(
  deps: CaseUseCaseDeps,
  input: {
    readonly userId: UserId;
    readonly caseId: CaseId;
    readonly revisionNo: number;
    readonly fieldPath: string | null;
    readonly provenance: EvidenceItemRecord['provenance'];
    readonly kind: EvidenceKind;
    readonly summary: string;
    readonly sourceRef: string | null;
    readonly capturedAt: string | null;
  },
): Promise<EvidenceItemDto> {
  const created = await deps.caseRepo.attachEvidence({
    userId: input.userId,
    caseId: input.caseId,
    revisionNo: input.revisionNo,
    fieldPath: input.fieldPath,
    provenance: input.provenance,
    kind: input.kind,
    summary: input.summary,
    sourceRef: input.sourceRef,
    capturedAt: input.capturedAt,
  });

  if (!created) {
    throw new ApiProblemError('ERR-RES-001', 'Resource not found');
  }

  return toEvidenceItemDto(created);
}
