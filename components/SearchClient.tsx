'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VideoCard } from '@/components/VideoCard';
import { useStore } from '@/lib/store';
import type { Video } from '@/lib/types';

export function SearchClient({ q, sort, initial, source, error }: { q: string; sort: string; initial: Video[]; source: string; error: string }) {
  const [videos, setVideos] = useState(initial);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter(); const sp = useSearchParams();
  const { store } = useStore();
  // Capture nextPage from first API call is not available server-side; load-more uses page=2 for Invidious-style paging
  const [page, setPage] = useState(1);
  const loadMore = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&sort=${sort}&page=${page + 1}`);
      const j = await r.json();
      setVideos(v => [...v, ...(j.results || [])]); setNextPage(j.nextPage || null); setPage(p => p + 1);
    } finally { setLoading(false); }
  };
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">「{q}」の検索結果</h1>
      <p className="mb-4 text-sm text-neutral-400">{videos.length}件 {source ? `• 取得元: ${source}` : ''}</p>
      <div className="mb-4 flex gap-2">
        {([['relevance', '関連度'], ['date', '投稿日'], ['views', '再生回数']] as const).map(([v, l]) => (
          <button key={v} onClick={() => router.push(`/search?q=${encodeURIComponent(q)}&sort=${v}`)} className={`rounded-full px-4 py-1.5 text-sm ${sort === v ? 'bg-wakame font-bold text-black' : 'bg-card'}`}>{l}</button>
        ))}
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-200">検索できませんでした。{error}</div>}
      <div className={`grid gap-4 ${store.settings.layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
        {videos.map(v => <VideoCard key={v.videoId} video={v} layout={store.settings.layout} />)}
      </div>
      {videos.length > 0 && <div className="mt-6 text-center"><button onClick={loadMore} disabled={loading} className="rounded-full bg-card px-6 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50">{loading ? '読み込み中…' : 'もっと読み込む'}</button></div>}
    </div>
  );
}
