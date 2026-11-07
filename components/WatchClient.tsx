'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Html5Player } from './Html5Player';
import { VideoCard } from './VideoCard';
import { useStore, useFavorites, useMini, recordHistory } from '@/lib/store';
import { formatViews, timeAgo } from '@/lib/types';
import type { PlayerData } from '@/lib/types';

export function WatchClient({ data }: { data: PlayerData }) {
  const { video, formats, captions, related, source } = data;
  const { store, update } = useStore();
  const { isFav, toggleFav } = useFavorites();
  const { setMini } = useMini();
  const [showDesc, setShowDesc] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  useEffect(() => { recordHistory(video); }, [video.videoId]);
  const fav = isFav(video.videoId);
  const addToPlaylist = () => {
    const name = playlistName.trim() || 'お気に入りリスト';
    update(s => {
      const ex = s.playlists.find(p => p.name === name);
      if (ex) return { ...s, playlists: s.playlists.map(p => p.id === ex.id ? { ...p, videos: [video, ...p.videos.filter(v => v.videoId !== video.videoId)] } : p) };
      return { ...s, playlists: [{ id: `pl-${Date.now()}`, name, videos: [video], createdAt: Date.now() }, ...s.playlists] };
    });
    setPlaylistName('');
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        {store.settings.player === 'embed' ? (
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe src={`https://www.youtube-nocookie.com/embed/${video.videoId}`} title={video.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
        ) : formats.length ? (
          <Html5Player formats={formats} captions={captions} poster={video.thumbnail} title={video.title} />
        ) : (
          <div className="grid aspect-video place-items-center rounded-2xl bg-black text-sm text-red-300">再生可能な形式が見つかりませんでした。設定から公式埋め込みプレイヤーに切り替えてください。</div>
        )}
        <h1 className="mt-4 text-xl font-bold leading-snug">{video.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
          <Link href={video.authorId ? `/channel/${video.authorId}` : '#'} className="font-medium text-white hover:text-wakame">{video.author}</Link>
          <span>{formatViews(video.viewCount)}</span><span>{timeAgo(video.publishedAt)}</span><span className="text-xs">取得元: {source}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => toggleFav(video)} className={`rounded-full px-4 py-2 text-sm font-bold ${fav ? 'bg-wakame text-black' : 'bg-card'}`}>{fav ? '★ お気に入り済み' : '☆ お気に入り'}</button>
          <button onClick={() => setMini({ video })} className="rounded-full bg-card px-4 py-2 text-sm">ミニプレイヤーで見る</button>
          <input value={playlistName} onChange={e => setPlaylistName(e.target.value)} placeholder="再生リスト名" className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none" />
          <button onClick={addToPlaylist} className="rounded-full bg-card px-4 py-2 text-sm">再生リストに追加</button>
        </div>
        <div className="mt-4 rounded-2xl bg-card p-4 text-sm whitespace-pre-wrap">
          <button onClick={() => setShowDesc(s => !s)} className="mb-2 font-bold">{showDesc ? '説明を閉じる ▲' : '説明を見る ▼'}</button>
          {showDesc && <p className="text-neutral-300">{video.description || '説明はありません。'}</p>}
        </div>
      </div>
      <aside>
        <h2 className="mb-3 font-bold">関連動画</h2>
        <div className="grid gap-3">{(related || []).map(v => <VideoCard key={v.videoId} video={v} layout="list" />)}</div>
      </aside>
    </div>
  );
}
