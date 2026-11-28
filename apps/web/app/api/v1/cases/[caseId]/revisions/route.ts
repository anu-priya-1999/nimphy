import type { NextResponse } from 'next/server';
import { handleSaveRevision } from '../../../../../../lib/cases/handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await context.params;
  return handleSaveRevision(request, caseId);
}
