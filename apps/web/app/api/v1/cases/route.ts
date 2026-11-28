import type { NextResponse } from 'next/server';
import { handleCreateCase, handleListCases } from '../../../../lib/cases/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handleCreateCase(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleListCases(request);
}
