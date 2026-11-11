'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Html5Player } from './Html5Player';
import { VideoCard } from './VideoCard';
import { useStore, useFavorites, useMini, recordHistory } from '@/lib/store';
import { formatViews, timeAgo } from '@/lib/types';
import type { PlayerData } from '@/lib/types';

export function WatchClient({ videoId }: { videoId: string }) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [useFresh, setUseFresh] = useState(false);
  const freshUsedRef = useRef(false);
  useEffect(() => { freshUsedRef.current = false; setUseFresh(false); }, [videoId]);
  // プレイヤーが全形式失敗したとき、キャッシュを捨てた取り直し（別インスタンス期待）を1回だけ許可する
  const handleRequestFresh = () => {
    if (freshUsedRef.current) return false;
    freshUsedRef.current = true;
    setUseFresh(true);
    setReloadKey(k => k + 1);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setData(null); setAttempt(0);
    // 取得元インスタンスの成否はタイミングで揺れるため、失敗したら少し待って最大3回まで自動リトライする
    (async () => {
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        try {
          const r = await fetch(`/api/video/${encodeURIComponent(videoId)}${useFresh ? '?fresh=1' : ''}`);
          const j = await r.json();
          if (cancelled) return;
          if (!j.error && j.formats) { setData(j); setLoading(false); return; }
          if (i === 2) { setError(j.error || '動画情報を取得できませんでした'); setLoading(false); return; }
        } catch (e: any) {
          if (cancelled) return;
          if (i === 2) { setError(e?.message || '動画情報を取得できませんでした'); setLoading(false); return; }
        }
        await new Promise(res => setTimeout(res, 2500));
      }
    })();
    return () => { cancelled = true; };
  }, [videoId, reloadKey, useFresh]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="relative aspect-video animate-pulse rounded-2xl bg-neutral-800">
            {attempt > 1 && <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">取得を再試行しています…（{attempt}/3回目）</div>}
          </div>
          <div className="mt-4 h-6 w-3/4 animate-pulse rounded bg-neutral-800" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-neutral-800" />
        </div>
        <aside><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-800" />)}</div></aside>
      </div>
    );
  }
  if (error || !data) {
    // 独自プレイヤー用の取得が全滅しても行き止まりにしない：Education 再生に自動で逃がす
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3 rounded-xl border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-200">
            独自プレイヤー用の動画取得に失敗したため、Education再生に切り替えました。時間をおいて「もう一度試す」と独自プレイヤーで開けることもあります。
            <button onClick={() => setReloadKey(k => k + 1)} className="ml-3 rounded-lg bg-amber-800 px-3 py-1 text-xs text-white hover:bg-amber-700">もう一度試す</button>
            <div className="mt-1 text-xs text-amber-300/70">{error}</div>
          </div>
          <EducationPlayer videoId={videoId} title="動画" />
        </div>
        <aside />
      </div>
    );
  }
  return <WatchBody key={reloadKey} data={data} onRequestFresh={handleRequestFresh} />;
}

type PlayMode = 'html5' | 'education' | 'embed';

function EducationPlayer({ videoId, title }: { videoId: string; title: string }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/edu').then(r => r.json()).then(j => {
      if (cancelled) return;
      if (!j.params) { setFailed(true); return; }
      const p = String(j.params);
      setSrc(`https://www.youtubeeducation.com/embed/${videoId}${p.startsWith('?') ? p : `?${p}`}&playlist=${videoId}`);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [videoId]);
  if (failed) return <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black p-6 text-center text-sm text-neutral-300">Education再生の準備に失敗しました。下の「公式埋め込み」に切り替えてみてください。</div>;
  if (!src) return <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black text-sm text-neutral-400">Education再生を準備中…</div>;
  return <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe src={src} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>;
}

function WatchBody({ data, onRequestFresh }: { data: PlayerData; onRequestFresh?: () => boolean }) {
  const { video, formats, captions, related, source } = data;
  const { store, update } = useStore();
  const { isFav, toggleFav } = useFavorites();
  const { setMini } = useMini();
  const [showDesc, setShowDesc] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  // 再生方法は3つから選べる（設定の既定値で初期化し、このページでは手動切替も可能）:
  // 独自HTML5（Invidious中継が本命）→ Education（youtubeeducation.com埋め込み）→ 公式埋め込み。
  // 独自プレイヤーの全形式が死んだら Education へ自動で切り替える（公式埋め込みは
  // youtube-nocookie.com が規制される環境では通らないため、その手前で Education を挟む）。
  const [mode, setMode] = useState<PlayMode>(store.settings.player);
  const [autoSwitched, setAutoSwitched] = useState(false);
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
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-400">再生方法:</span>
          {([['html5', '独自プレイヤー'], ['education', 'Education'], ['embed', '公式埋め込み']] as [PlayMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setAutoSwitched(false); }} className={`rounded-full px-3 py-1.5 ${mode === m ? 'bg-wakame font-bold text-black' : 'bg-card text-neutral-300'}`}>{label}</button>
          ))}
        </div>
        {mode === 'education' ? (
          <EducationPlayer videoId={video.videoId} title={video.title} />
        ) : mode === 'embed' ? (
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe src={`https://www.youtube-nocookie.com/embed/${video.videoId}`} title={video.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
        ) : formats.length ? (
          <Html5Player formats={formats} captions={captions} poster={video.thumbnail} title={video.title} onAllFailed={() => { if (onRequestFresh && onRequestFresh()) return; setAutoSwitched(true); setMode('education'); }} />
        ) : (
          <EducationPlayer videoId={video.videoId} title={video.title} />
        )}
        {autoSwitched && <p className="mt-2 text-xs text-neutral-400">独自プレイヤーでの再生ができなかったため、Education再生に切り替えました。上のボタンからいつでも戻せます。</p>}
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
