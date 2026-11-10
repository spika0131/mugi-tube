import { NextRequest, NextResponse } from 'next/server';
// サムネイル等の画像プロキシ（わかめtube Plus の /wkt/back と同じ役割）。
// ブラウザが i.ytimg.com / yt3.ggpht.com / *.googleusercontent.com に直接触れずに
// 画像を表示できるようにする。許可ホスト以外は中継しない（オープンリレー防止）。
export const dynamic = 'force-dynamic';

function allowed(hostname: string): boolean {
  return /(^|\.)ytimg\.com$/.test(hostname)
    || hostname === 'yt3.ggpht.com'
    || hostname.endsWith('.googleusercontent.com')
    || hostname.endsWith('.ggpht.com');
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return NextResponse.json({ error: 'missing u' }, { status: 400 });
  let target: URL;
  try { target = new URL(u); } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }); }
  if (target.protocol !== 'https:' || !allowed(target.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', Accept: 'image/*' },
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'img fetch failed' }, { status: 502 });
  }
}
