import { NextRequest, NextResponse } from 'next/server';
import { searchVideos } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const sort = req.nextUrl.searchParams.get('sort') || 'relevance';
  const page = req.nextUrl.searchParams.get('page');
  if (!q.trim()) return NextResponse.json({ query: q, results: [], nextPage: null, source: 'none' });
  try { return NextResponse.json(await searchVideos(q, sort, page), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }); }
  catch (e: any) { return NextResponse.json({ query: q, results: [], nextPage: null, source: 'none', error: e?.message || 'search failed' }, { status: 502 }); }
}
