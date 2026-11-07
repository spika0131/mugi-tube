import { NextRequest, NextResponse } from 'next/server';
import { checkEndpoints } from '@/lib/api';
import { defaultEndpoints, ApiEndpoint } from '@/lib/types';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const custom = req.nextUrl.searchParams.get('endpoints');
  let eps: ApiEndpoint[] = defaultEndpoints();
  if (custom) { try { const p = JSON.parse(custom); if (Array.isArray(p) && p.length) eps = p; } catch {} }
  return NextResponse.json({ results: await checkEndpoints(eps) });
}
