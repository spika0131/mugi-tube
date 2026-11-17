import { NextResponse } from 'next/server';
import { getVideo } from '@/lib/api';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const sp = new URL(req.url).searchParams;
  const fresh = sp.get('fresh') === '1';
  // exclude: プレイヤーが再生失敗した取得元インスタンスの baseUrl（カンマ区切り）。
  // サーバーはそれらを走査の最後尾に回して、別ソースでの取得を試す。
  const exclude = (sp.get('exclude') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
  try { return NextResponse.json(await getVideo(params.id, fresh, exclude), { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'video failed' }, { status: 502 }); }
}
