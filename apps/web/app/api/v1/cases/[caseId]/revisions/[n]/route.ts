import type { NextResponse } from 'next/server';
import { handleGetRevision } from '../../../../../../../lib/cases/handlers';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string; n: string }> },
): Promise<NextResponse> {
  const { caseId, n } = await context.params;
  return handleGetRevision(request, caseId, n);
}
