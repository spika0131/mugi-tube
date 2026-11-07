import { NextResponse } from 'next/server';
import { getVideo } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(await getVideo(params.id)); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'video failed' }, { status: 502 }); }
}
