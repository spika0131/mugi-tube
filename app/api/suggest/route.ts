import { NextRequest, NextResponse } from 'next/server';
import { getSuggestions } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  return NextResponse.json({ suggestions: await getSuggestions(q) });
}
