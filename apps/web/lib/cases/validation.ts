import {
  isBookFormat,
  isProvenance,
  isSupportedCurrency,
  parseCaseId,
  type BookFormat,
  type CaseId,
  type CurrencyCode,
  type Provenance,
  type ScenarioName,
} from '@nimphy/domain';
import type { EvidenceKind, ListCasesCursor, UpdatableCaseStatus } from '@nimphy/persistence';
import { ApiProblemError, type FieldValidationIssue } from '../api/errors';

const VALID_EVIDENCE_KINDS = new Set<EvidenceKind>(['quote', 'url', 'note', 'document_ref']);
const VALID_UPDATABLE_STATUSES = new Set<UpdatableCaseStatus>(['active', 'archived']);
const POSITIVE_DECIMAL_RE = /^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/;
const COST_VARIANCE_RE = /^-?\d+(?:\.\d+)?$/;
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ValidatedCreateCaseInput {
  readonly title: string;
}

export interface ValidatedUpdateCaseInput {
  readonly title?: string;
  readonly status?: UpdatableCaseStatus;
}

export interface ValidatedListCasesQuery {
  readonly limit: number;
  readonly cursor: ListCasesCursor | null;
  readonly status?: UpdatableCaseStatus;
}

export interface ValidatedMoneyDto {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export interface ValidatedProvenancedMoneyDto {
  readonly value: ValidatedMoneyDto;
  readonly provenance: Provenance;
  readonly evidenceRefs?: readonly string[];
}

export interface ValidatedFixedCostItemDto extends ValidatedProvenancedMoneyDto {
  readonly label: string;
}

export interface ValidatedScenarioInputDto {
  readonly units: number;
  readonly listPriceMinor: number;
  readonly costVariancePercent?: string;
}

export interface ValidatedCaseConceptDto {
  readonly title?: string;
  readonly genre?: string;
  readonly notes?: string;
}

export interface ValidatedCaseInputsDto {
  readonly marketplace: string;
  readonly format: BookFormat;
  readonly concept?: ValidatedCaseConceptDto;
  readonly pageCount?: number;
  readonly fileSizeMb?: string;
  readonly listPrice: ValidatedProvenancedMoneyDto;
  readonly unitProductionCost?: ValidatedProvenancedMoneyDto;
  readonly fixedCosts: readonly ValidatedFixedCostItemDto[];
  readonly scenarios: Record<ScenarioName, ValidatedScenarioInputDto>;
}

export interface ValidatedSaveRevisionInput {
  readonly inputsSchemaVersion: 1;
  readonly inputs: ValidatedCaseInputsDto;
}

export interface ValidatedAttachEvidenceInput {
  readonly fieldPath: string | null;
  readonly provenance: Provenance;
  readonly kind: EvidenceKind;
  readonly summary: string;
  readonly sourceRef: string | null;
  readonly capturedAt: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushIssue(issues: FieldValidationIssue[], path: string, message: string): void {
  issues.push({ path, code: 'ERR-VAL-002', message });
}

function throwIfIssues(issues: FieldValidationIssue[]): void {
  if (issues.length > 0) {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', { errors: issues });
  }
}

function checkUnknownKeys(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  basePath: string,
  issues: FieldValidationIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      const path = basePath ? `${basePath}.${key}` : key;
      pushIssue(issues, path, `Unknown field "${key}" is not allowed`);
    }
  }
}

function isValidCalendarDateOnly(value: string): boolean {
  const match = ISO_DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function parseCaseIdParam(raw: string): CaseId {
  try {
    return parseCaseId(raw);
  } catch {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [{ path: 'caseId', code: 'ERR-VAL-002', message: 'caseId must be a valid UUID' }],
    });
  }
}

export function parseRevisionNoParam(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        {
          path: 'revisionNo',
          code: 'ERR-VAL-002',
          message: 'revisionNo must be a positive integer',
        },
      ],
    });
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < 1 || num > 2_147_483_647) {
    throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
      errors: [
        {
          path: 'revisionNo',
          code: 'ERR-VAL-002',
          message: 'revisionNo is out of supported integer range',
        },
      ],
    });
  }
  return num;
}

export function encodeListCasesCursor(cursor: ListCasesCursor): string {
  const payload = JSON.stringify({
    u: cursor.updatedAt.toISOString(),
    i: cursor.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeListCasesCursor(raw: string): ListCasesCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    if (!isPlainObject(parsed)) return null;
    if (typeof parsed.u !== 'string' || typeof parsed.i !== 'string') return null;
    const updatedAt = new Date(parsed.u);
    if (Number.isNaN(updatedAt.getTime())) return null;
    const id = parseCaseId(parsed.i);
    return { updatedAt, id };
  } catch {
    return null;
  }
}

export function validateCreateCaseBody(body: Record<string, unknown>): ValidatedCreateCaseInput {
  const issues: FieldValidationIssue[] = [];
  checkUnknownKeys(body, new Set(['title']), '', issues);

  if (typeof body.title !== 'string') {
    pushIssue(issues, 'title', 'title must be a string');
  } else {
    const trimmed = body.title.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      pushIssue(issues, 'title', 'title must be between 1 and 200 characters');
    }
  }

  throwIfIssues(issues);
  return { title: (body.title as string).trim() };
}

export function validateUpdateCaseBody(body: Record<string, unknown>): ValidatedUpdateCaseInput {
  const issues: FieldValidationIssue[] = [];
  checkUnknownKeys(body, new Set(['title', 'status']), '', issues);

  if (body.title === undefined && body.status === undefined) {
    pushIssue(issues, 'body', 'At least one of title or status must be provided');
  }

  let title: string | undefined;
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      pushIssue(issues, 'title', 'title must be a string');
    } else {
      const trimmed = body.title.trim();
      if (trimmed.length < 1 || trimmed.length > 200) {
        pushIssue(issues, 'title', 'title must be between 1 and 200 characters');
      } else {
        title = trimmed;
      }
    }
  }

  let status: UpdatableCaseStatus | undefined;
  if (body.status !== undefined) {
    if (
      typeof body.status !== 'string' ||
      !VALID_UPDATABLE_STATUSES.has(body.status as UpdatableCaseStatus)
    ) {
      pushIssue(issues, 'status', 'status must be either "active" or "archived"');
    } else {
      status = body.status as UpdatableCaseStatus;
    }
  }

  throwIfIssues(issues);
  return {
    ...(title !== undefined ? { title } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

export function validateListCasesQuery(searchParams: URLSearchParams): ValidatedListCasesQuery {
  const issues: FieldValidationIssue[] = [];

  for (const key of searchParams.keys()) {
    if (key !== 'limit' && key !== 'cursor' && key !== 'status') {
      pushIssue(issues, `query.${key}`, `Unknown query parameter "${key}"`);
    }
  }

  let limit = 20;
  const rawLimit = searchParams.get('limit');
  if (rawLimit !== null) {
    if (!/^[1-9]\d*$/.test(rawLimit)) {
      pushIssue(issues, 'query.limit', 'limit must be an integer between 1 and 100');
    } else {
      const parsed = Number(rawLimit);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
        pushIssue(issues, 'query.limit', 'limit must be between 1 and 100');
      } else {
        limit = parsed;
      }
    }
  }

  let cursor: ListCasesCursor | null = null;
  const rawCursor = searchParams.get('cursor');
  if (rawCursor !== null && rawCursor.length > 0) {
    cursor = decodeListCasesCursor(rawCursor);
    if (!cursor) {
      pushIssue(issues, 'query.cursor', 'cursor is malformed');
    }
  }

  let status: UpdatableCaseStatus | undefined;
  const rawStatus = searchParams.get('status');
  if (rawStatus !== null) {
    if (!VALID_UPDATABLE_STATUSES.has(rawStatus as UpdatableCaseStatus)) {
      pushIssue(issues, 'query.status', 'status must be either "active" or "archived"');
    } else {
      status = rawStatus as UpdatableCaseStatus;
    }
  }

  throwIfIssues(issues);
  return {
    limit,
    cursor,
    ...(status !== undefined ? { status } : {}),
  };
}

function validateEvidenceRefs(
  rawRefs: unknown,
  path: string,
  issues: FieldValidationIssue[],
): readonly string[] | undefined {
  if (rawRefs === undefined) return undefined;
  if (!Array.isArray(rawRefs)) {
    pushIssue(issues, path, 'evidenceRefs must be an array of strings');
    return undefined;
  }
  if (rawRefs.length > 50) {
    pushIssue(issues, path, 'evidenceRefs cannot exceed 50 entries');
    return undefined;
  }
  const refs: string[] = [];
  for (let i = 0; i < rawRefs.length; i++) {
    const item = rawRefs[i];
    if (typeof item !== 'string' || item.trim().length === 0 || item.length > 200) {
      pushIssue(issues, `${path}[${i}]`, 'Each evidenceRef must be a non-empty string (<= 200)');
    } else {
      refs.push(item.trim());
    }
  }
  return refs;
}

function validateProvenancedMoney(
  raw: unknown,
  path: string,
  allowZero: boolean,
  expectedCurrency: CurrencyCode | null,
  issues: FieldValidationIssue[],
): ValidatedProvenancedMoneyDto | null {
  if (!isPlainObject(raw)) {
    pushIssue(issues, path, 'Must be an object with value and provenance');
    return null;
  }

  checkUnknownKeys(raw, new Set(['value', 'provenance', 'evidenceRefs']), path, issues);

  let amountMinor = 0;
  let currency: CurrencyCode | null = null;
  if (!isPlainObject(raw.value)) {
    pushIssue(issues, `${path}.value`, 'value must be a Money object');
  } else {
    checkUnknownKeys(raw.value, new Set(['amountMinor', 'currency']), `${path}.value`, issues);
    if (
      typeof raw.value.amountMinor !== 'number' ||
      !Number.isSafeInteger(raw.value.amountMinor) ||
      (allowZero ? raw.value.amountMinor < 0 : raw.value.amountMinor <= 0)
    ) {
      pushIssue(
        issues,
        `${path}.value.amountMinor`,
        allowZero ? 'amountMinor must be a non-negative safe integer' : 'amountMinor must be > 0',
      );
    } else {
      amountMinor = raw.value.amountMinor;
    }

    if (!isSupportedCurrency(raw.value.currency)) {
      pushIssue(issues, `${path}.value.currency`, 'Unsupported currency code');
    } else {
      currency = raw.value.currency;
      if (expectedCurrency && currency !== expectedCurrency) {
        pushIssue(
          issues,
          `${path}.value.currency`,
          `Currency must match listPrice currency (${expectedCurrency})`,
        );
      }
    }
  }

  let provenance: Provenance | null = null;
  if (!isProvenance(raw.provenance)) {
    pushIssue(
      issues,
      `${path}.provenance`,
      'provenance must be one of user_input, official_fact, estimate, assumption',
    );
  } else {
    provenance = raw.provenance;
  }

  const evidenceRefs = validateEvidenceRefs(raw.evidenceRefs, `${path}.evidenceRefs`, issues);

  if (currency === null || provenance === null) {
    return null;
  }

  return {
    value: { amountMinor, currency },
    provenance,
    ...(evidenceRefs !== undefined ? { evidenceRefs } : {}),
  };
}

function validateScenarioInput(
  raw: unknown,
  path: string,
  issues: FieldValidationIssue[],
): ValidatedScenarioInputDto | null {
  if (!isPlainObject(raw)) {
    pushIssue(issues, path, 'Scenario entry must be an object');
    return null;
  }

  checkUnknownKeys(raw, new Set(['units', 'listPriceMinor', 'costVariancePercent']), path, issues);

  if (typeof raw.units !== 'number' || !Number.isSafeInteger(raw.units) || raw.units < 0) {
    pushIssue(issues, `${path}.units`, 'units must be a non-negative safe integer');
  }

  if (
    typeof raw.listPriceMinor !== 'number' ||
    !Number.isSafeInteger(raw.listPriceMinor) ||
    raw.listPriceMinor <= 0
  ) {
    pushIssue(issues, `${path}.listPriceMinor`, 'listPriceMinor must be > 0');
  }

  let costVariancePercent: string | undefined;
  if (raw.costVariancePercent !== undefined) {
    if (typeof raw.costVariancePercent !== 'string') {
      pushIssue(issues, `${path}.costVariancePercent`, 'costVariancePercent must be a string');
    } else {
      const s = raw.costVariancePercent;
      if (s.length === 0 || s.length > 50 || !COST_VARIANCE_RE.test(s)) {
        pushIssue(
          issues,
          `${path}.costVariancePercent`,
          'costVariancePercent must be a valid decimal string',
        );
      } else if (s.startsWith('-')) {
        const numPart = s.slice(1);
        const dotIndex = numPart.indexOf('.');
        const whole = dotIndex === -1 ? numPart : numPart.slice(0, dotIndex);
        const frac = dotIndex === -1 ? '' : numPart.slice(dotIndex + 1);
        if (BigInt(whole) > 100n || (BigInt(whole) === 100n && /[1-9]/.test(frac))) {
          pushIssue(
            issues,
            `${path}.costVariancePercent`,
            'costVariancePercent cannot be less than -100',
          );
        } else {
          costVariancePercent = s;
        }
      } else {
        costVariancePercent = s;
      }
    }
  }

  return {
    units: raw.units as number,
    listPriceMinor: raw.listPriceMinor as number,
    ...(costVariancePercent !== undefined ? { costVariancePercent } : {}),
  };
}

export function validateSaveRevisionBody(
  body: Record<string, unknown>,
): ValidatedSaveRevisionInput {
  const issues: FieldValidationIssue[] = [];
  checkUnknownKeys(body, new Set(['inputsSchemaVersion', 'inputs']), '', issues);

  if (body.inputsSchemaVersion !== 1) {
    pushIssue(issues, 'inputsSchemaVersion', 'inputsSchemaVersion must be 1');
  }

  if (!isPlainObject(body.inputs)) {
    pushIssue(issues, 'inputs', 'inputs must be an object');
    throwIfIssues(issues);
  }

  const rawInputs = body.inputs as Record<string, unknown>;
  checkUnknownKeys(
    rawInputs,
    new Set([
      'marketplace',
      'format',
      'concept',
      'pageCount',
      'fileSizeMb',
      'listPrice',
      'unitProductionCost',
      'fixedCosts',
      'scenarios',
    ]),
    'inputs',
    issues,
  );

  let marketplace = '';
  if (typeof rawInputs.marketplace !== 'string' || rawInputs.marketplace.trim().length === 0) {
    pushIssue(issues, 'inputs.marketplace', 'marketplace must be a non-empty string');
  } else if (rawInputs.marketplace.trim().length > 100) {
    pushIssue(issues, 'inputs.marketplace', 'marketplace cannot exceed 100 characters');
  } else {
    marketplace = rawInputs.marketplace.trim();
  }

  let format: BookFormat | null = null;
  if (!isBookFormat(rawInputs.format)) {
    pushIssue(issues, 'inputs.format', 'format must be one of ebook, paperback, hardcover');
  } else {
    format = rawInputs.format;
  }

  let concept: ValidatedCaseConceptDto | undefined;
  if (rawInputs.concept !== undefined) {
    if (!isPlainObject(rawInputs.concept)) {
      pushIssue(issues, 'inputs.concept', 'concept must be an object');
    } else {
      checkUnknownKeys(
        rawInputs.concept,
        new Set(['title', 'genre', 'notes']),
        'inputs.concept',
        issues,
      );
      const nextConcept: { title?: string; genre?: string; notes?: string } = {};
      if (rawInputs.concept.title !== undefined) {
        if (typeof rawInputs.concept.title !== 'string' || rawInputs.concept.title.length > 200) {
          pushIssue(issues, 'inputs.concept.title', 'concept.title must be a string (<= 200)');
        } else {
          nextConcept.title = rawInputs.concept.title;
        }
      }
      if (rawInputs.concept.genre !== undefined) {
        if (typeof rawInputs.concept.genre !== 'string' || rawInputs.concept.genre.length > 100) {
          pushIssue(issues, 'inputs.concept.genre', 'concept.genre must be a string (<= 100)');
        } else {
          nextConcept.genre = rawInputs.concept.genre;
        }
      }
      if (rawInputs.concept.notes !== undefined) {
        if (typeof rawInputs.concept.notes !== 'string' || rawInputs.concept.notes.length > 2000) {
          pushIssue(issues, 'inputs.concept.notes', 'concept.notes must be a string (<= 2000)');
        } else {
          nextConcept.notes = rawInputs.concept.notes;
        }
      }
      concept = nextConcept;
    }
  }

  if (format === 'ebook') {
    if (rawInputs.pageCount !== undefined) {
      pushIssue(issues, 'inputs.pageCount', 'pageCount is not allowed for ebook format');
    }
    if (rawInputs.fileSizeMb !== undefined) {
      if (
        typeof rawInputs.fileSizeMb !== 'string' ||
        rawInputs.fileSizeMb.length > 32 ||
        !POSITIVE_DECIMAL_RE.test(rawInputs.fileSizeMb)
      ) {
        pushIssue(
          issues,
          'inputs.fileSizeMb',
          'fileSizeMb must be a positive decimal string (e.g. "2.5")',
        );
      }
    }
  } else if (format === 'paperback' || format === 'hardcover') {
    if (rawInputs.fileSizeMb !== undefined) {
      pushIssue(issues, 'inputs.fileSizeMb', 'fileSizeMb is only allowed for ebook format');
    }
    if (
      rawInputs.pageCount !== undefined &&
      (typeof rawInputs.pageCount !== 'number' ||
        !Number.isSafeInteger(rawInputs.pageCount) ||
        rawInputs.pageCount < 1 ||
        rawInputs.pageCount > 10000)
    ) {
      pushIssue(issues, 'inputs.pageCount', 'pageCount must be an integer between 1 and 10000');
    }
  }

  const listPrice = validateProvenancedMoney(
    rawInputs.listPrice,
    'inputs.listPrice',
    false,
    null,
    issues,
  );
  const baseCurrency = listPrice?.value.currency ?? null;

  let unitProductionCost: ValidatedProvenancedMoneyDto | undefined;
  if (rawInputs.unitProductionCost !== undefined) {
    const parsedCost = validateProvenancedMoney(
      rawInputs.unitProductionCost,
      'inputs.unitProductionCost',
      true,
      baseCurrency,
      issues,
    );
    if (parsedCost) {
      unitProductionCost = parsedCost;
    }
  }

  const fixedCosts: ValidatedFixedCostItemDto[] = [];
  if (!Array.isArray(rawInputs.fixedCosts)) {
    pushIssue(issues, 'inputs.fixedCosts', 'fixedCosts must be an array');
  } else if (rawInputs.fixedCosts.length > 100) {
    pushIssue(issues, 'inputs.fixedCosts', 'fixedCosts cannot exceed 100 items');
  } else {
    for (let i = 0; i < rawInputs.fixedCosts.length; i++) {
      const item = rawInputs.fixedCosts[i];
      const itemPath = `inputs.fixedCosts[${i}]`;
      if (!isPlainObject(item)) {
        pushIssue(issues, itemPath, 'fixedCosts item must be an object');
        continue;
      }
      checkUnknownKeys(
        item,
        new Set(['label', 'value', 'provenance', 'evidenceRefs']),
        itemPath,
        issues,
      );
      if (
        typeof item.label !== 'string' ||
        item.label.trim().length < 1 ||
        item.label.length > 100
      ) {
        pushIssue(issues, `${itemPath}.label`, 'label must be between 1 and 100 characters');
      }
      const moneyPart = validateProvenancedMoney(
        {
          value: item.value,
          provenance: item.provenance,
          ...(item.evidenceRefs !== undefined ? { evidenceRefs: item.evidenceRefs } : {}),
        },
        itemPath,
        true,
        baseCurrency,
        issues,
      );
      if (moneyPart && typeof item.label === 'string') {
        fixedCosts.push({
          label: item.label.trim(),
          ...moneyPart,
        });
      }
    }
  }

  let scenarios: Record<ScenarioName, ValidatedScenarioInputDto> | null = null;
  if (!isPlainObject(rawInputs.scenarios)) {
    pushIssue(issues, 'inputs.scenarios', 'scenarios must be an object with low, base, high');
  } else {
    checkUnknownKeys(
      rawInputs.scenarios,
      new Set(['low', 'base', 'high']),
      'inputs.scenarios',
      issues,
    );
    const low = validateScenarioInput(rawInputs.scenarios.low, 'inputs.scenarios.low', issues);
    const base = validateScenarioInput(rawInputs.scenarios.base, 'inputs.scenarios.base', issues);
    const high = validateScenarioInput(rawInputs.scenarios.high, 'inputs.scenarios.high', issues);
    if (low && base && high) {
      scenarios = { low, base, high };
    }
  }

  throwIfIssues(issues);

  return {
    inputsSchemaVersion: 1,
    inputs: {
      marketplace,
      format: format as BookFormat,
      ...(concept !== undefined ? { concept } : {}),
      ...(rawInputs.pageCount !== undefined ? { pageCount: rawInputs.pageCount as number } : {}),
      ...(rawInputs.fileSizeMb !== undefined ? { fileSizeMb: rawInputs.fileSizeMb as string } : {}),
      listPrice: listPrice as ValidatedProvenancedMoneyDto,
      ...(unitProductionCost !== undefined ? { unitProductionCost } : {}),
      fixedCosts,
      scenarios: scenarios as Record<ScenarioName, ValidatedScenarioInputDto>,
    },
  };
}

export function validateAttachEvidenceBody(
  body: Record<string, unknown>,
): ValidatedAttachEvidenceInput {
  const issues: FieldValidationIssue[] = [];
  checkUnknownKeys(
    body,
    new Set(['fieldPath', 'provenance', 'kind', 'summary', 'sourceRef', 'capturedAt']),
    '',
    issues,
  );

  let fieldPath: string | null = null;
  if (body.fieldPath !== undefined && body.fieldPath !== null) {
    if (
      typeof body.fieldPath !== 'string' ||
      body.fieldPath.trim().length === 0 ||
      body.fieldPath.length > 200
    ) {
      pushIssue(issues, 'fieldPath', 'fieldPath must be a non-empty string (<= 200) or null');
    } else {
      fieldPath = body.fieldPath.trim();
    }
  }

  if (!isProvenance(body.provenance)) {
    pushIssue(
      issues,
      'provenance',
      'provenance must be one of user_input, official_fact, estimate, assumption',
    );
  }

  if (typeof body.kind !== 'string' || !VALID_EVIDENCE_KINDS.has(body.kind as EvidenceKind)) {
    pushIssue(issues, 'kind', 'kind must be one of quote, url, note, document_ref');
  }

  let summary = '';
  if (typeof body.summary !== 'string') {
    pushIssue(issues, 'summary', 'summary must be a string');
  } else {
    const trimmed = body.summary.trim();
    if (trimmed.length < 1 || trimmed.length > 2000) {
      pushIssue(issues, 'summary', 'summary must be between 1 and 2000 characters');
    } else {
      summary = trimmed;
    }
  }

  let sourceRef: string | null = null;
  if (body.sourceRef !== undefined && body.sourceRef !== null) {
    if (typeof body.sourceRef !== 'string' || body.sourceRef.length > 2000) {
      pushIssue(issues, 'sourceRef', 'sourceRef must be a string (<= 2000) or null');
    } else {
      sourceRef = body.sourceRef;
    }
  }

  let capturedAt: string | null = null;
  if (body.capturedAt !== undefined && body.capturedAt !== null) {
    if (typeof body.capturedAt !== 'string' || !isValidCalendarDateOnly(body.capturedAt)) {
      pushIssue(issues, 'capturedAt', 'capturedAt must be a valid YYYY-MM-DD date or null');
    } else {
      capturedAt = body.capturedAt;
    }
  }

  throwIfIssues(issues);
  return {
    fieldPath,
    provenance: body.provenance as Provenance,
    kind: body.kind as EvidenceKind,
    summary,
    sourceRef,
    capturedAt,
  };
}

export function validateAcknowledgePaidLossParam(raw: string | null): boolean {
  if (raw === null) return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ApiProblemError('ERR-VAL-001', 'Validation failed', {
    errors: [
      {
        path: 'query.acknowledgePaidLoss',
        code: 'ERR-VAL-002',
        message: 'acknowledgePaidLoss must be "true" or "false"',
      },
    ],
  });
}
