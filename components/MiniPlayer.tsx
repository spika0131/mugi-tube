'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMini } from '@/lib/store';
import { Html5Player } from './Html5Player';
import type { PlayerData } from '@/lib/types';

export function MiniPlayer() {
  const { mini, closeMini } = useMini();
  const [data, setData] = useState<PlayerData | null>(null);
  useEffect(() => {
    if (!mini.video) { setData(null); return; }
    let live = true;
    fetch(`/api/playback/${mini.video.videoId}`).then(r => r.json()).then(j => { if (live && j.formats) setData(j); }).catch(() => {});
    return () => { live = false; };
  }, [mini.video]);
  if (!mini.video) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[90vw] overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 text-xs"><Link href={`/watch/${mini.video.videoId}`} className="truncate hover:text-wakame">{mini.video.title}</Link><button onClick={closeMini} className="ml-2 rounded-full bg-white/10 px-2 py-0.5">閉じる</button></div>
      {data ? <Html5Player formats={data.formats} captions={data.captions} poster={mini.video.thumbnail} title={mini.video.title} /> : <div className="aspect-video grid place-items-center bg-black text-sm">読み込み中…</div>}
    </div>
  );
}
