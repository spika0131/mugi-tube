'use client';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { VideoCard } from '@/components/VideoCard';
import type { Video } from '@/lib/types';

const FEED_CACHE_KEY = 'mugi-tube-feed-v1';
const FEED_CACHE_TTL = 10 * 60 * 1000;

function loadFeedCache(): { videos: Video[]; source: string } | null {
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.at > FEED_CACHE_TTL) return null;
    return p;
  } catch { return null; }
}

export function HomeClient() {
  const { store } = useStore();
  const [videos, setVideos] = useState<Video[]>([]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const recent = store.settings.secretMode ? [] : store.history.slice(0, 8);

  useEffect(() => {
    let cancelled = false;
    const cached = loadFeedCache();
    if (cached) { setVideos(cached.videos); setSource(cached.source); setLoading(false); }
    fetch('/api/feed')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (j.error) { if (!cached) setError(j.error); return; }
        setVideos(j.videos || []); setSource(j.source || '');
        try { sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ at: Date.now(), videos: j.videos || [], source: j.source || '' })); } catch {}
      })
      .catch(e => { if (!cancelled && !cached) setError(e?.message || 'フィードの取得に失敗しました'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {error && <div className="mb-4 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-200">人気フィードを取得できませんでした。公開APIインスタンスの調子が悪い可能性があります。設定の「動画API」で接続チェックを試すか、しばらく待って再読み込みしてください。<br /><span className="text-xs text-red-300">{error}</span></div>}
      {loading && videos.length === 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="読み込み中">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-card">
              <div className="aspect-video animate-pulse bg-neutral-800" />
              <div className="space-y-2 p-3"><div className="h-4 animate-pulse rounded bg-neutral-800" /><div className="h-3 w-2/3 animate-pulse rounded bg-neutral-800" /></div>
            </div>
          ))}
        </div>
      )}
      {!loading && videos.length === 0 && !error && <p className="text-neutral-400">動画が見つかりませんでした。</p>}
      <div className={`grid gap-4 ${store.settings.layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
        {videos.map(v => <VideoCard key={v.videoId} video={v} layout={store.settings.layout} />)}
      </div>
      {source && <p className="mt-4 text-xs text-neutral-500">取得元: {source}</p>}
      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">最近見た動画</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">{recent.map(v => <div key={v.videoId} className="w-64 shrink-0"><VideoCard video={v} /></div>)}</div>
        </section>
      )}
    </div>
  );
}
