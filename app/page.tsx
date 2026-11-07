import Link from 'next/link';
import { getFeed } from '@/lib/api';
import { VideoCard } from '@/components/VideoCard';
import { HomeClient } from '@/components/HomeClient';

const CATEGORIES = ['音楽', 'ゲーム', 'ニュース', 'スポーツ', '料理', 'テクノロジー', 'アニメ', '旅行', '科学', 'コメディ'];

export default async function Home() {
  let videos: any[] = []; let source = ''; let error = '';
  try { const f = await getFeed(); videos = f.videos; source = f.source; } catch (e: any) { error = e?.message || 'フィードの取得に失敗しました'; }
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(c => <Link key={c} href={`/search?q=${encodeURIComponent(c)}`} className="shrink-0 rounded-full bg-card px-4 py-1.5 text-sm hover:bg-neutral-700">{c}</Link>)}
      </div>
      <h1 className="mb-4 text-xl font-bold">人気動画</h1>
      {error && <div className="mb-4 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-200">人気フィードを取得できませんでした。公開APIインスタンスの調子が悪い可能性があります。設定の「動画API」で接続チェックを試すか、しばらく待って再読み込みしてください。<br /><span className="text-xs text-red-300">{error}</span></div>}
      {!error && videos.length === 0 && <p className="text-neutral-400">動画が見つかりませんでした。</p>}
      <HomeClient videos={videos} source={source} />
    </div>
  );
}
