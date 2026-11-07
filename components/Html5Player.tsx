'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { VideoFormat, CaptionTrack } from '@/lib/types';

function sortFormats(formats: VideoFormat[]): VideoFormat[] {
  const rank = (f: VideoFormat) => f.type === 'mp4' && f.hasAudio ? 0 : f.type === 'mp4' ? 1 : f.type === 'dash' ? 2 : 3;
  return [...formats].sort((a, b) => rank(a) - rank(b));
}

export function Html5Player({ formats, captions, poster, title, onAllFailed }: { formats: VideoFormat[]; captions: CaptionTrack[]; poster?: string; title?: string; onAllFailed?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sorted = sortFormats(formats);
  const [idx, setIdx] = useState(0);
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
  const hlsRef = useRef<any>(null); const dashRef = useRef<any>(null);
  const current = sorted[idx];

  const cleanup = () => {
    try { hlsRef.current?.destroy(); } catch {}
    try { dashRef.current?.destroy(); } catch {}
    hlsRef.current = null; dashRef.current = null;
  };
  const attach = useCallback(async () => {
    const v = videoRef.current; if (!v || !current) return;
    cleanup(); setLoading(true); setError('');
    v.playbackRate = rate;
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

  const handleError = (e?: Error) => {
    setLoading(false);
    const next = sorted.findIndex((_, i) => !tried.includes(i) && i !== idx);
    if (next >= 0) {
      setTried(t => [...t, idx]);
      setIdx(next);
      return;
    }
    setError('再生中にエラーが発生しました。別の形式も試しましたが再生できませんでした。設定から公式埋め込みプレイヤーへの切り替えもできます。');
    onAllFailed?.();
  };
  const toggle = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => handleError()); else v.pause(); };
  const seek = (s: number) => { const v = videoRef.current; if (v) v.currentTime = s; };
  const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
  const mp4s = sorted.filter(f => f.type === 'mp4' && f.hasAudio);

  return (
    <div ref={wrapRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black" onKeyDown={e => {
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') seek(time + 10); if (e.key === 'ArrowLeft') seek(time - 10);
      if (e.key === 'f') wrapRef.current?.requestFullscreen?.(); if (e.key === 'm') setMuted(m => !m);
    }} tabIndex={0}>
      <video ref={videoRef} className="h-full w-full" poster={poster} playsInline
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { setDuration(e.currentTarget.duration); setLoading(false); }}
        onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)}
        onError={() => handleError()}
        onClick={toggle}
      >
        {showCaptions && captionLang && captions.filter(c => c.language === captionLang).map(c => <track key={c.language} kind="subtitles" src={c.url} srcLang={c.language} label={c.label} default />)}
      </video>
      {loading && !error && <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm">読み込み中…</div>}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center">
          <div><p className="text-sm text-red-300">{error}</p><button className="mt-3 rounded-full bg-wakame px-4 py-2 text-sm font-bold text-black" onClick={() => { setTried([]); setIdx(0); setError(''); attach(); }}>再試行</button></div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8">
        <input type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={e => seek(Number(e.target.value))} className="w-full accent-green-400" aria-label="シークバー" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={toggle} className="rounded-full bg-white/10 px-3 py-1">{playing ? '一時停止' : '再生'}</button>
          <span className="text-xs text-neutral-300">{fmt(time)} / {fmt(duration)}</span>
          <button onClick={() => setMuted(m => !m)} className="rounded-full bg-white/10 px-2 py-1 text-xs">{muted || volume === 0 ? 'ミュート解除' : 'ミュート'}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; } }} className="w-20 accent-green-400" aria-label="音量" />
          <select value={rate} onChange={e => { const r = Number(e.target.value); setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="再生速度">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => <option key={r} value={r} className="text-black">{r}倍</option>)}
          </select>
          {mp4s.length > 1 && (
            <select value={idx} onChange={e => setIdx(Number(e.target.value))} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="画質">
              {sorted.map((f, i) => <option key={i} value={i} className="text-black">{f.type.toUpperCase()} {f.qualityLabel || f.quality || ''}</option>)}
            </select>
          )}
          {captions.length > 0 && (
            <select value={captionLang} onChange={e => { setCaptionLang(e.target.value); setShowCaptions(!!e.target.value); }} className="rounded bg-white/10 px-1 py-1 text-xs text-white" aria-label="字幕">
              <option value="" className="text-black">字幕なし</option>
              {captions.map(c => <option key={c.language} value={c.language} className="text-black">{c.label}</option>)}
            </select>
          )}
          <span className="ml-auto text-[11px] text-neutral-400">{current?.type.toUpperCase()} • {title || ''}</span>
          <button onClick={() => wrapRef.current?.requestFullscreen?.()} className="rounded-full bg-white/10 px-3 py-1">全画面</button>
        </div>
      </div>
    </div>
  );
}
