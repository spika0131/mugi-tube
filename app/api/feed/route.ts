import { NextRequest, NextResponse } from 'next/server';
import { getFeed } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const feed = await getFeed(); return NextResponse.json(feed); }
  catch (e: any) { return NextResponse.json({ videos: [], source: 'none', error: e?.message || 'feed failed' }, { status: 502 }); }
}
