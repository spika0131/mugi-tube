'use client';
import { useStore } from '@/lib/store';
import { VideoCard } from '@/components/VideoCard';
import type { Video } from '@/lib/types';

export function HomeClient({ videos, source }: { videos: Video[]; source: string }) {
  const { store } = useStore();
  const recent = store.settings.secretMode ? [] : store.history.slice(0, 8);
  return (
    <div>
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
