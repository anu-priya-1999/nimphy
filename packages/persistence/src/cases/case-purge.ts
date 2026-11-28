import type { CaseId } from '@nimphy/domain';
import type { SqlQueryClient } from '../db/types';

export interface PurgeCaseResult {
  readonly purged: boolean;
  readonly notFound: boolean;
}

/**
 * Phase 2 purge of a `pending_deletion` business case via `nimphy_purge_business_case`.
 * Must be executed by a connection/client running under the `nimphy_purge` role.
 * Cascades to `case_revisions`, `evidence_items`, and `calculation_runs`.
 */
export async function purgePendingBusinessCase(
  purgeClient: SqlQueryClient,
  caseId: CaseId,
): Promise<PurgeCaseResult> {
  try {
    await purgeClient.query('SELECT nimphy_purge_business_case($1);', [caseId]);
    return { purged: true, notFound: false };
  } catch (error) {
    const pgCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (pgCode === 'P0002') {
      return { purged: false, notFound: true };
    }
    throw error;
  }
}
