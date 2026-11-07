'use client';
import { useStore } from '@/lib/store';
import { VideoCard } from '@/components/VideoCard';
import Link from 'next/link';

export default function LibraryPage() {
  const { store, update } = useStore();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">マイライブラリ</h1>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold">お気に入り ({store.favorites.length})</h2>
        {store.favorites.length === 0 ? <p className="text-neutral-400">お気に入りはまだありません。</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{store.favorites.map(v => <VideoCard key={v.videoId} video={v} />)}</div>}
      </section>
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-3"><h2 className="text-lg font-bold">再生履歴 ({store.history.length})</h2><button onClick={() => update(s => ({ ...s, history: [] }))} className="rounded-full bg-card px-3 py-1 text-xs">履歴を消去</button></div>
        {store.settings.secretMode && <p className="mb-2 text-sm text-yellow-300">シークレットモード中のため、履歴は保存されません。</p>}
        {store.history.length === 0 ? <p className="text-neutral-400">履歴はまだありません。</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{store.history.map(v => <VideoCard key={v.videoId} video={v} />)}</div>}
      </section>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold">保存した再生リスト</h2>
        {store.playlists.length === 0 ? <p className="text-neutral-400">再生リストはまだありません。視聴ページから追加できます。</p> : store.playlists.map(p => (
          <div key={p.id} className="mb-6 rounded-2xl bg-card p-4"><h3 className="mb-3 font-bold">{p.name} ({p.videos.length})</h3><div className="grid gap-3">{p.videos.map(v => <VideoCard key={v.videoId} video={v} layout="list" />)}</div></div>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">検索履歴</h2>
        {store.searchHistory.length === 0 ? <p className="text-neutral-400">検索履歴はありません。</p> : <div className="flex flex-wrap gap-2">{store.searchHistory.map(q => <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="rounded-full bg-card px-3 py-1 text-sm">{q}</Link>)}</div>}
      </section>
    </div>
  );
}
