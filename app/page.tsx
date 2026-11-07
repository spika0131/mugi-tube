import Link from 'next/link';
import { HomeClient } from '@/components/HomeClient';

const CATEGORIES = ['音楽', 'ゲーム', 'ニュース', 'スポーツ', '料理', 'テクノロジー', 'アニメ', '旅行', '科学', 'コメディ'];

// 軽量サイト（わかめtube / チョコtube型）と同じ方針: ページの枠は即表示し、
// 人気フィードはクライアント側で /api/feed から後から読み込む。
// 以前はサーバーで Invidious を待ってから HTML を返していたため、TTFB が 1.5 秒前後になっていた。
export default function Home() {
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(c => <Link key={c} href={`/search?q=${encodeURIComponent(c)}`} className="shrink-0 rounded-full bg-card px-4 py-1.5 text-sm hover:bg-neutral-700">{c}</Link>)}
      </div>
      <h1 className="mb-4 text-xl font-bold">人気動画</h1>
      <HomeClient />
    </div>
  );
}
