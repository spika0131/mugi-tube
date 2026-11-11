import { NextResponse } from 'next/server';
import { getVideo } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  try { return NextResponse.json(await getVideo(params.id, fresh), { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'video failed' }, { status: 502 }); }
}
