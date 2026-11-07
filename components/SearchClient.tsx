'use client';
import { useCallback, useEffect, useState } from 'react';
import { VideoCard } from '@/components/VideoCard';
import { useStore } from '@/lib/store';
import type { Video } from '@/lib/types';

export function SearchClient({ q, sort: initialSort }: { q: string; sort: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  const { store } = useStore();

  const runSearch = useCallback(async (s: string, p: number, append: boolean) => {
    if (!q) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&sort=${s}&page=${p}`);
      const j = await r.json();
      if (j.error) { setError(j.error); return; }
      setVideos(v => append ? [...v, ...(j.results || [])] : (j.results || []));
      setSource(j.source || '');
    } catch (e: any) { setError(e?.message || '検索に失敗しました'); }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { setPage(1); setVideos([]); runSearch(sort, 1, false); }, [q, sort, runSearch]);

  const loadMore = () => { const p = page + 1; setPage(p); runSearch(sort, p, true); };
  const changeSort = (s: string) => { if (s === sort) return; setSort(s); setPage(1); };

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
