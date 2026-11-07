import { NextRequest, NextResponse } from 'next/server';
import { getFeed } from '@/lib/api';
export const dynamic = 'force-dynamic';
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };
export async function GET() {
  try { const feed = await getFeed(); return NextResponse.json(feed, { headers: CACHE }); }
  catch (e: any) { return NextResponse.json({ videos: [], source: 'none', error: e?.message || 'feed failed' }, { status: 502 }); }
}
