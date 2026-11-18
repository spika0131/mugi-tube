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
  // 再生失敗した取得元を除外して別ソースを取り直す（Choco-Tube-Plus の exclude 方式）。
  // 失敗元は最大2回まで切り替え、再生位置は resumeAt で新しいプレイヤーに引き継ぐ。
  const [excludeHosts, setExcludeHosts] = useState<string[]>([]);
  const [resumeAt, setResumeAt] = useState(0);
  const switchCountRef = useRef(0);
  // 別ソース切替の段階表示用（「別ソースで再取得中…（n/2回目）」）
  const [switchCount, setSwitchCount] = useState(0);
  const dataRef = useRef<PlayerData | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    switchCountRef.current = 0; setSwitchCount(0); setUseFresh(false); setExcludeHosts([]); setResumeAt(0);
  }, [videoId]);
  const handleRequestAlt = (time: number) => {
    if (switchCountRef.current >= 2) return false;
    switchCountRef.current += 1;
    setSwitchCount(switchCountRef.current);
    const src = dataRef.current?.source || '';
    const m = src.match(/^(?:invidious|piped):(https?:\/\/.+)$/);
    if (m) setExcludeHosts(prev => (prev.includes(m[1]) ? prev : [...prev, m[1]]));
    if (time > 0) setResumeAt(time);
    setUseFresh(true);
    setReloadKey(k => k + 1);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setData(null); setAttempt(0);
    // 取得元インスタンスの成否はタイミングで揺れるため、失敗したら少し待って最大3回まで自動リトライする。
    // 待機は回数で延ばし、少しランダムにずらす（同時リトライの集中とレート制限の悪化を防ぐ。
    // siatube のリトライ規律を参考）。自前APIが 429 と Retry-After を返したらそれを尊重する。
    (async () => {
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        let waitMs = 2500 * (i + 1) + Math.floor(Math.random() * 800);
        try {
          const params = new URLSearchParams();
          if (useFresh) params.set('fresh', '1');
          if (excludeHosts.length) params.set('exclude', excludeHosts.join(','));
          const qs = params.toString();
          const r = await fetch(`/api/video/${encodeURIComponent(videoId)}${qs ? `?${qs}` : ''}`);
          if (r.status === 429) {
            const ra = Number(r.headers.get('retry-after'));
            if (Number.isFinite(ra) && ra > 0) waitMs = Math.min(ra * 1000, 15000);
            throw new Error('rate limited');
          }
          const j = await r.json();
          if (cancelled) return;
          if (!j.error && j.formats) { setData(j); setLoading(false); return; }
          if (i === 2) { setError(j.error || '動画情報を取得できませんでした'); setLoading(false); return; }
        } catch (e: any) {
          if (cancelled) return;
          if (i === 2) { setError(e?.message || '動画情報を取得できませんでした'); setLoading(false); return; }
        }
        await new Promise(res => setTimeout(res, waitMs));
      }
    })();
    return () => { cancelled = true; };
  }, [videoId, reloadKey, useFresh, excludeHosts]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="relative aspect-video animate-pulse rounded-2xl bg-neutral-800">
            {switchCount > 0
              ? <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">別ソースで再取得中…（{switchCount}/2回目）</div>
              : attempt > 1 && <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">取得を再試行しています…（{attempt}/3回目）</div>}
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
            <button onClick={() => { setUseFresh(true); setReloadKey(k => k + 1); }} className="ml-3 rounded-lg bg-amber-800 px-3 py-1 text-xs text-white hover:bg-amber-700">もう一度試す</button>
            <div className="mt-1 text-xs text-amber-300/70">{error}</div>
          </div>
          <EducationPlayer videoId={videoId} title="動画" />
        </div>
        <aside />
      </div>
    );
  }
  return <WatchBody key={reloadKey} data={data} resumeAt={resumeAt} onRequestAlt={handleRequestAlt} />;
}

type PlayMode = 'html5' | 'education' | 'embed';

function EducationPlayer({ videoId, title }: { videoId: string; title: string }) {
  // Education パラメータは複数保持し、1つが塞がれても次を順に試せる
  // （サーバーが配布元群から自動取得した候補を /api/edu が alternates 付きで返す）
  const [paramsList, setParamsList] = useState<{ params: string; source: string }[]>([]);
  const [pIdx, setPIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setParamsList([]); setPIdx(0); setFailed(false);
    fetch('/api/edu').then(r => r.json()).then(j => {
      if (cancelled) return;
      if (!j.params) { setFailed(true); return; }
      const list = [
        { params: String(j.params), source: String(j.source || '') },
        ...((Array.isArray(j.alternates) ? j.alternates : []) as any[]).map(a => ({ params: String(a?.params || ''), source: String(a?.source || '') })),
      ].filter(p => p.params);
      setParamsList(list.length ? list : [{ params: String(j.params), source: '' }]);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [videoId]);
  if (failed) return <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black p-6 text-center text-sm text-neutral-300">Education再生の準備に失敗しました。下の「公式埋め込み」に切り替えてみてください。</div>;
  const cur = paramsList[pIdx];
  if (!cur) return <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black text-sm text-neutral-400">Education再生を準備中…</div>;
  const p = cur.params;
  const src = `https://www.youtubeeducation.com/embed/${videoId}${p.startsWith('?') ? p : `?${p}`}&playlist=${videoId}`;
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe key={pIdx} src={src} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
      {paramsList.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span>Educationパラメータ: {cur.source || '既定'}（{pIdx + 1}/{paramsList.length}）</span>
          <button onClick={() => setPIdx(i => (i + 1) % paramsList.length)} className="rounded-full bg-card px-3 py-1 text-neutral-200 hover:bg-neutral-700">別のパラメータで試す</button>
          <span>再生できないときはパラメータを切り替えると開けることがあります。</span>
        </div>
      )}
    </div>
  );
}

function WatchBody({ data, resumeAt, onRequestAlt }: { data: PlayerData; resumeAt?: number; onRequestAlt?: (time: number) => boolean }) {
  const { video, formats, captions, related, source } = data;
  // 複数の取得元が「再生不可」と申告した動画は、独自プレイヤーを回さず理由を添えて Education へ
  if (data.unavailable) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3 rounded-xl border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-200">
            この動画は取得元で「再生不可」と判定されました（{data.unavailable}）。Education再生で開けるか試せます。
          </div>
          <EducationPlayer videoId={data.videoId} title={video.title || '動画'} />
        </div>
        <aside />
      </div>
    );
  }
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
  // 手動の「別ソースで再取得」用に、プレイヤーの現在位置を ref で受け取る
  const timeRef = useRef(0);
  const [altMsg, setAltMsg] = useState('');
  const handleManualAlt = () => {
    if (onRequestAlt && onRequestAlt(timeRef.current)) return;
    setAltMsg('切り替えられる別のソースがもうありません。Education再生への切替をお試しください。');
  };
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
          <button onClick={handleManualAlt} className="rounded-full bg-card px-3 py-1.5 text-neutral-300">別ソースで再取得</button>
          {altMsg && <span className="text-amber-300">{altMsg}</span>}
        </div>
        {mode === 'education' ? (
          <EducationPlayer videoId={video.videoId} title={video.title} />
        ) : mode === 'embed' ? (
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe src={`https://www.youtube-nocookie.com/embed/${video.videoId}`} title={video.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
        ) : formats.length ? (
          <Html5Player formats={formats} captions={captions} audios={data.audios} source={source} timeRef={timeRef} poster={video.thumbnail} title={video.title} startAt={resumeAt} onAllFailed={(t) => { if (onRequestAlt && onRequestAlt(t)) return; setAutoSwitched(true); setMode('education'); }} />
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
