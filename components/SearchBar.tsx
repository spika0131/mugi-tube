'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export function SearchBar({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const [sugs, setSugs] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { store, update } = useStore();
  const timer = useRef<any>(null);
  useEffect(() => {
    if (!q.trim()) { setSugs([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`); const j = await r.json(); setSugs(j.suggestions || []); } catch { setSugs([]); }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);
  const go = (term: string) => {
    const t = term.trim(); if (!t) return;
    update(s => ({ ...s, searchHistory: [t, ...s.searchHistory.filter(x => x !== t)].slice(0, 20) }));
    setOpen(false); router.push(`/search?q=${encodeURIComponent(t)}`);
  };
  return (
    <div className="relative w-full max-w-xl">
      <form onSubmit={e => { e.preventDefault(); go(q); }} className="flex">
        <input id="mugi-search" value={q} autoFocus={autoFocus} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="検索 — / キーでも開けます" className="w-full rounded-l-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm outline-none focus:border-wakame" />
        <button className="rounded-r-full bg-wakame px-4 text-sm font-bold text-black hover:bg-wakame-dim">検索</button>
      </form>
      {open && (sugs.length > 0 || store.searchHistory.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl overflow-hidden">
          {sugs.map(s => <button key={s} onMouseDown={() => go(s)} className="block w-full px-4 py-2 text-left text-sm hover:bg-neutral-800">{s}</button>)}
          {sugs.length === 0 && store.searchHistory.slice(0, 5).map(s => <button key={s} onMouseDown={() => go(s)} className="block w-full px-4 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800">履歴: {s}</button>)}
        </div>
      )}
    </div>
  );
}
