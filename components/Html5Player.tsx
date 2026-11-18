'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { VideoFormat, CaptionTrack, AudioOption } from '@/lib/types';

function heightOf(f: VideoFormat): number {
  if (f.height) return f.height;
  const m = String(f.qualityLabel || f.quality || '').match(/(\d+)p/);
  return m ? Number(m[1]) : 0;
}
function sortFormats(formats: VideoFormat[]): VideoFormat[] {
  // 統合形式（音声付き単一ファイル）を最優先にする（安定化パック第2弾）。
  // サーバー側で combined フラグが付いた formatStreams 由来の形式が対象
  const rank = (f: VideoFormat) => f.type === 'mp4' && (f.combined || f.hasAudio) ? 0 : f.type === 'mp4' ? 1 : f.type === 'dash' ? 2 : 3;
  // 同格・同解像度では H.264（avc1）を優先する。学校の Chromebook 等でもデコードできる
  // 可能性が高く、「形式はあるのに再生できない」失敗を減らせる（siatube の H.264 優先を参考）
  const codecRank = (f: VideoFormat) => (String(f.mime || '').includes('avc1') ? 0 : 1);
  return [...formats].sort((a, b) => rank(a) - rank(b) || heightOf(b) - heightOf(a) || codecRank(a) - codecRank(b));
}
// このブラウザで実際にデコードできる形式だけを候補に残す（canPlayType の実測）。
// 全滅する場合は元のリストをそのまま使う（判定が厳しすぎた場合の保険）。
function filterPlayable(formats: VideoFormat[]): VideoFormat[] {
  if (typeof document === 'undefined') return formats;
  try {
    const probe = document.createElement('video');
    const ok = formats.filter(f => {
      if (f.type !== 'mp4' || !f.mime) return true;
      try { return probe.canPlayType(f.mime) !== ''; } catch { return true; }
    });
    return ok.length ? ok : formats;
  } catch { return formats; }
}
const PREF_HEIGHT_KEY = 'mugi-pref-height';

export function Html5Player({ formats, captions, poster, title, startAt, onAllFailed, audios, source, timeRef }: { formats: VideoFormat[]; captions: CaptionTrack[]; poster?: string; title?: string; startAt?: number; onAllFailed?: (time: number) => void; audios?: AudioOption[]; source?: string; timeRef?: React.MutableRefObject<number> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sorted = sortFormats(filterPlayable(formats));
  // 前回選んだ画質（高さ）を覚えておき、次回はそれに一番近い形式から始める
  const [idx, setIdx] = useState(() => {
    try {
      const pref = Number(localStorage.getItem(PREF_HEIGHT_KEY) || 0);
      if (pref > 0) {
        const exact = sorted.findIndex(f => heightOf(f) === pref);
        if (exact >= 0) return exact;
        let best = -1; let bestH = -1;
        sorted.forEach((f, i) => { const h = heightOf(f); if (h > 0 && h <= pref && h > bestH) { bestH = h; best = i; } });
        if (best >= 0) return best;
      }
    } catch { /* localStorage不可の環境では既定の0 */ }
    return 0;
  });
  const startAppliedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tried, setTried] = useState<number[]>([]);
  const [captionLang, setCaptionLang] = useState('');
  const [showCaptions, setShowCaptions] = useState(false);
  // 操作UIは再生中に数秒触らないと自動で消して映像の邪魔をしない（YouTube方式）
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null); const dashRef = useRef<any>(null);
  const current = sorted[idx];
  // 音質（音声ビットレート）選択: 分離再生時は audios から選んだ音声を使う。
  // 既定は最高ビットレート（サーバー側で降順ソート済み）
  const [audioIdx, setAudioIdx] = useState(0);
  const effectiveAudioUrl = current?.audioUrl ? (audios?.[audioIdx]?.url || current.audioUrl) : undefined;
  // 取得元ラベル表示用（「invidious:https://...」→ ホスト名だけ抜く）
  const sourceHost = source ? source.replace(/^(invidious|piped):/, '').replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  // ダブルタップシークのフィードバック表示
  const [seekFx, setSeekFx] = useState<{ dir: 1 | -1; key: number } | null>(null);
  useEffect(() => { if (!seekFx) return; const t = setTimeout(() => setSeekFx(null), 650); return () => clearTimeout(t); }, [seekFx]);

  const cleanup = () => {
    try { hlsRef.current?.destroy(); } catch {}
    try { dashRef.current?.destroy(); } catch {}
    hlsRef.current = null; dashRef.current = null;
  };
  // 映像と音声が別URLの形式では、隠しaudio要素を映像に同期して再生する（わかめtube Plus方式）
  const syncAudio = useCallback((force = false) => {
    const v = videoRef.current; const a = audioRef.current;
    if (!v || !a || !effectiveAudioUrl) return;
    a.playbackRate = v.playbackRate;
    a.volume = v.volume; a.muted = v.muted;
    if (force || Math.abs(a.currentTime - v.currentTime) > 0.4) {
      try { a.currentTime = v.currentTime + 0.05; } catch {}
    }
    if (!v.paused && a.paused) a.play().catch(() => {});
    if (v.paused && !a.paused) a.pause();
  }, [current, effectiveAudioUrl]);
  const attach = useCallback(async () => {
    const v = videoRef.current; if (!v || !current) return;
    cleanup(); setLoading(true); setError('');
    v.playbackRate = rate;
    const a = audioRef.current;
    if (a) {
      a.pause();
      if (effectiveAudioUrl) { if (a.src !== effectiveAudioUrl) { a.src = effectiveAudioUrl; a.load(); } }
      else { a.removeAttribute('src'); a.load(); }
    }
    if (current.type === 'mp4') { v.src = current.url; v.load(); }
    else if (current.type === 'hls') {
      if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = current.url; v.load(); }
      else {
        const Hls = (await import('hls.js')).default;
        if (Hls.isSupported()) {
          const hls = new Hls({ maxBufferLength: 30 }); hlsRef.current = hls;
          hls.loadSource(current.url); hls.attachMedia(v);
          hls.on(Hls.Events.ERROR, (_: any, data: any) => { if (data.fatal) handleError(new Error(data.type || 'HLS error')); });
        } else { v.src = current.url; v.load(); }
      }
    } else if (current.type === 'dash') {
      const dashjs = (await import('dashjs')).default;
      const player = dashjs.MediaPlayer().create(); dashRef.current = player;
      player.initialize(v, current.url, true);
      player.on('error', () => handleError(new Error('DASH error')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  useEffect(() => { attach(); return cleanup; }, [attach]);
  useEffect(() => () => cleanup(), []);
  // 音質を切り替えたら、映像はそのままに音声だけ差し替えて再生位置を同期する
  useEffect(() => {
    const a = audioRef.current; const v = videoRef.current;
    if (!a || !v || !effectiveAudioUrl || a.src === effectiveAudioUrl) return;
    a.src = effectiveAudioUrl; a.load();
    try { a.currentTime = v.currentTime + 0.05; } catch { /* シーク不可ならそのまま */ }
    if (!v.paused) a.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioIdx]);

  const handleError = (e?: Error) => {
    setLoading(false);
    const next = sorted.findIndex((_, i) => !tried.includes(i) && i !== idx);
    if (next >= 0) {
      setTried(t => [...t, idx]);
      setIdx(next);
      return;
    }
    setError('再生中にエラーが発生しました。別の形式も試しましたが再生できませんでした。設定から公式埋め込みプレイヤーへの切り替えもできます。');
    // 現在の再生位置を渡す（別ソースへ切り替えた先で続きから再開するため）
    onAllFailed?.(videoRef.current?.currentTime || 0);
  };
  const toggle = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => handleError()); else v.pause(); };
  // シングルタップ=再生/停止、ダブルタップ=左右で±10秒シーク（YouTubeアプリ方式）。
  // シングル判定を少し遅らせるため、クリックはタイマー経由で toggle する
  const clickRef = useRef<{ t: number; timer: ReturnType<typeof setTimeout> | null }>({ t: 0, timer: null });
  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const right = e.clientX - rect.left > rect.width / 2;
    if (now - clickRef.current.t < 320) {
      if (clickRef.current.timer) { clearTimeout(clickRef.current.timer); clickRef.current.timer = null; }
      clickRef.current.t = 0;
      const v = videoRef.current; if (!v) return;
      const dur = isFinite(v.duration) ? v.duration : Infinity;
      v.currentTime = Math.max(0, Math.min(dur, v.currentTime + (right ? 10 : -10)));
      setSeekFx({ dir: right ? 1 : -1, key: now });
      pokeUi();
      return;
    }
    clickRef.current.t = now;
    clickRef.current.timer = setTimeout(() => { clickRef.current.timer = null; toggle(); }, 300);
  };
  const seek = (s: number) => { const v = videoRef.current; if (v) v.currentTime = s; };
  const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
  const applyVolume = (vol: number, mute: boolean) => {
    if (videoRef.current) { videoRef.current.volume = vol; videoRef.current.muted = mute; }
    if (audioRef.current) { audioRef.current.volume = vol; audioRef.current.muted = mute; }
  };
  const pokeUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const v = videoRef.current;
    if (v && !v.paused && !v.ended) hideTimer.current = setTimeout(() => setUiVisible(false), 2500);
  }, []);
  useEffect(() => {
    if (!playing) { setUiVisible(true); if (hideTimer.current) clearTimeout(hideTimer.current); }
    else pokeUi();
  }, [playing, pokeUi]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return (
    <div ref={wrapRef} className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black ${!uiVisible && playing ? 'cursor-none' : ''}`} onMouseMove={pokeUi} onTouchStart={pokeUi} onKeyDown={e => {
      pokeUi();
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') seek(time + 10); if (e.key === 'ArrowLeft') seek(time - 10);
      if (e.key === 'f') wrapRef.current?.requestFullscreen?.(); if (e.key === 'm') { const m = !muted; setMuted(m); applyVolume(volume, m); }
    }} tabIndex={0}>
      <video ref={videoRef} className="h-full w-full" poster={poster} playsInline
        onPlay={() => { setPlaying(true); syncAudio(true); }}
        onPause={() => { setPlaying(false); syncAudio(); }}
        onTimeUpdate={e => { setTime(e.currentTarget.currentTime); if (timeRef) timeRef.current = e.currentTarget.currentTime; syncAudio(); }}
        onSeeked={() => syncAudio(true)}
        onLoadedMetadata={e => {
          setDuration(e.currentTarget.duration); setLoading(false);
          // 別ソース切替で作り直されたプレイヤーでは、前プレイヤーの再生位置から再開する
          if (startAt && startAt > 0 && !startAppliedRef.current) {
            startAppliedRef.current = true;
            try { e.currentTarget.currentTime = startAt; } catch { /* シーク不可なら先頭から */ }
          }
          syncAudio(true);
        }}
        onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); syncAudio(); }}
        onError={() => handleError()}
        onClick={handleVideoClick}
      >
        {showCaptions && captionLang && captions.filter(c => c.language === captionLang).map(c => <track key={c.language} kind="subtitles" src={c.url} srcLang={c.language} label={c.label} default />)}
      </video>
      <audio ref={audioRef} preload="auto" className="hidden" />
      {seekFx && (
        <div key={seekFx.key} className={`pointer-events-none absolute inset-y-0 ${seekFx.dir > 0 ? 'right-0' : 'left-0'} flex w-1/3 items-center justify-center`}>
          <span className="animate-pulse rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white">{seekFx.dir > 0 ? '10秒 »' : '« 10秒'}</span>
        </div>
      )}
      {loading && !error && <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm">読み込み中…</div>}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center">
          <div><p className="text-sm text-red-300">{error}</p><button className="mt-3 rounded-full bg-wakame px-4 py-2 text-sm font-bold text-black" onClick={() => { setTried([]); setIdx(0); setError(''); attach(); }}>再試行</button></div>
        </div>
      )}
      {!uiVisible && duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/25">
          <div className="h-full bg-green-400" style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
        </div>
      )}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <input type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={e => seek(Number(e.target.value))} className="w-full accent-green-400" aria-label="シークバー" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={toggle} className="rounded-full bg-white/10 px-3 py-1">{playing ? '一時停止' : '再生'}</button>
          <span className="text-xs text-neutral-300">{fmt(time)} / {fmt(duration)}</span>
          <button onClick={() => { const m = !muted; setMuted(m); applyVolume(volume, m); }} className="rounded-full bg-white/10 px-2 py-1 text-xs">{muted || volume === 0 ? 'ミュート解除' : 'ミュート'}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); applyVolume(v, v === 0); }} className="w-20 accent-green-400" aria-label="音量" />
          <select value={rate} onChange={e => { const r = Number(e.target.value); setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; if (audioRef.current) audioRef.current.playbackRate = r; }} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="再生速度">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => <option key={r} value={r} className="text-black">{r}倍</option>)}
          </select>
          {sorted.length > 1 && (
            <select value={idx} onChange={e => { const n = Number(e.target.value); setTried([]); setIdx(n); const h = heightOf(sorted[n]); if (h > 0) { try { localStorage.setItem(PREF_HEIGHT_KEY, String(h)); } catch { /* 保存できなくても再生は続ける */ } } }} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="画質">
              {sorted.map((f, i) => <option key={i} value={i} className="text-black">{f.type.toUpperCase()} {f.qualityLabel || f.quality || ''}{f.audioUrl ? '（音声分離）' : ''}</option>)}
            </select>
          )}
          {current?.audioUrl && audios && audios.length > 1 && (
            <select value={audioIdx} onChange={e => setAudioIdx(Number(e.target.value))} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="音質">
              {audios.map((a, i) => <option key={a.url} value={i} className="text-black">音声 {a.label}</option>)}
            </select>
          )}
          {captions.length > 0 && (
            <select value={captionLang} onChange={e => { setCaptionLang(e.target.value); setShowCaptions(!!e.target.value); }} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="字幕">
              <option value="" className="text-black">字幕なし</option>
              {captions.map(c => <option key={c.language} value={c.language} className="text-black">{c.label}</option>)}
            </select>
          )}
          <span className="ml-auto text-[11px] text-neutral-400">{current?.type.toUpperCase()} {current?.qualityLabel || ''}{sourceHost ? ` ・ 取得元: ${sourceHost}` : ''}</span>
          <button onClick={() => wrapRef.current?.requestFullscreen?.()} className="rounded-full bg-white/10 px-3 py-1">全画面</button>
        </div>
      </div>
    </div>
  );
}
