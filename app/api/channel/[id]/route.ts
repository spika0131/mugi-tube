import { NextRequest, NextResponse } from 'next/server';
import { getChannel } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sort = req.nextUrl.searchParams.get('sort') || 'newest';
  try { return NextResponse.json(await getChannel(params.id, sort)); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'channel failed' }, { status: 502 }); }
}
