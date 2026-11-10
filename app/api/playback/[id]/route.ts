import { NextResponse } from 'next/server';
import { getVideo } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(_: Request, { params }: { params: { id: string } }) {
  try { const d = await getVideo(params.id); return NextResponse.json({ videoId: d.videoId, formats: d.formats, captions: d.captions, duration: d.duration, source: d.source }); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'playback failed' }, { status: 502 }); }
}
