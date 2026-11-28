import type { NextResponse } from 'next/server';
import { handleAttachEvidence } from '../../../../../../../../lib/cases/handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; n: string }> },
): Promise<NextResponse> {
  const { caseId, n } = await context.params;
  return handleAttachEvidence(request, caseId, n);
}
