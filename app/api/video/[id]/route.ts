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
  try {
    const data = await getVideo(params.id, fresh, exclude);
    // 「再生不可」「取得元側の制限」の判定結果は CDN にもキャッシュさせない。
    // 取得元の状態は時間で変わるため、判定を固定すると誤判定が TTL の間ずっと
    // 再生できる動画を塞いでしまう。形式が取れた結果だけ従来通りキャッシュする。
    const isVerdict = !!(data as any).unavailable || !!(data as any).sourceBlocked;
    return NextResponse.json(data, { headers: { 'Cache-Control': isVerdict ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600' } });
  }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'video failed' }, { status: 502 }); }
}
