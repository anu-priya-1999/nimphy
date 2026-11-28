import type { NextResponse } from 'next/server';
import {
  handleDeleteCase,
  handleGetCase,
  handleUpdateCase,
} from '../../../../../lib/cases/handlers';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await context.params;
  return handleGetCase(request, caseId);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await context.params;
  return handleUpdateCase(request, caseId);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const { caseId } = await context.params;
  return handleDeleteCase(request, caseId);
}
