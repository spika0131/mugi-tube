'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoCard } from '@/components/VideoCard';
import { useStore } from '@/lib/store';
import { loadSessionCache, saveSessionCache, useScrollRestore } from '@/lib/scroll';
import type { Video } from '@/lib/types';

// 検索状態（クエリ・ソート・読み込み済みページ・結果）を sessionStorage に退避し、
// 設定/ライブラリ/視聴ページへ行って戻っても再検索なしで復帰できるようにする。
// ソートは URL クエリが真実（ブラウザの戻る/進むでも維持される）。
const SEARCH_CACHE_TTL = 10 * 60 * 1000;
const cacheKey = (q: string, sort: string) => `mugi-search-v1:${q}:${sort}`;
interface SearchCache { videos: Video[]; source: string; page: number; }

export function SearchClient({ q, sort }: { q: string; sort: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const { store } = useStore();
  const router = useRouter();
  const restoredRef = useRef('');

  const runSearch = useCallback(async (s: string, p: number, append: boolean, base: Video[] = []) => {
    if (!q) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&sort=${s}&page=${p}`);
      const j = await r.json();
      if (j.error) { setError(j.error); return; }
      const merged = append ? [...base, ...(j.results || [])] : (j.results || []);
      setVideos(merged);
      setSource(j.source || '');
      saveSessionCache(cacheKey(q, s), { videos: merged, source: j.source || '', page: p } satisfies SearchCache);
    } catch (e: any) { setError(e?.message || '検索に失敗しました'); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => {
    // 同じ q+sort での再マウント（他画面から戻ってきた）なら、キャッシュから即復帰して再検索しない
    const ck = cacheKey(q, sort);
    if (restoredRef.current !== ck) {
      restoredRef.current = ck;
      const cached = loadSessionCache<SearchCache>(ck, SEARCH_CACHE_TTL);
      if (cached && cached.videos.length) {
        setVideos(cached.videos); setSource(cached.source); setPage(cached.page); setError('');
        return;
      }
    }
    setPage(1); setVideos([]);
    runSearch(sort, 1, false);
  }, [q, sort, runSearch]);

  useScrollRestore(`search:${q}:${sort}`, !loading && videos.length > 0);

  const loadMore = () => { const p = page + 1; setPage(p); runSearch(sort, p, true, videos); };
  const changeSort = (s: string) => {
    if (s === sort) return;
    // ソートを URL に残すことで、戻る/進むや再マウントでも並び順が維持される
    router.replace(`/search?q=${encodeURIComponent(q)}&sort=${s}`, { scroll: false });
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">「{q}」の検索結果</h1>
      <p className="mb-4 text-sm text-neutral-400">{videos.length}件 {source ? `• 取得元: ${source}` : ''}</p>
      <div className="mb-4 flex gap-2">
        {([['relevance', '関連度'], ['date', '投稿日'], ['views', '再生回数']] as const).map(([v, l]) => (
          <button key={v} onClick={() => changeSort(v)} className={`rounded-full px-4 py-1.5 text-sm ${sort === v ? 'bg-wakame font-bold text-black' : 'bg-card'}`}>{l}</button>
        ))}
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-200">検索できませんでした。{error}</div>}
      {loading && videos.length === 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-card"><div className="aspect-video animate-pulse bg-neutral-800" /><div className="space-y-2 p-3"><div className="h-4 animate-pulse rounded bg-neutral-800" /><div className="h-3 w-2/3 animate-pulse rounded bg-neutral-800" /></div></div>
          ))}
        </div>
      )}
      <div className={`grid gap-4 ${store.settings.layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
        {videos.map(v => <VideoCard key={v.videoId} video={v} layout={store.settings.layout} />)}
      </div>
      {videos.length > 0 && <div className="mt-6 text-center"><button onClick={loadMore} disabled={loading} className="rounded-full bg-card px-6 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50">{loading ? '読み込み中…' : 'もっと読み込む'}</button></div>}
    </div>
  );
}
