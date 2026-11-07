'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import type { ApiEndpoint, ApiHealth } from '@/lib/types';

export default function SettingsPage() {
  const { store, update } = useStore();
  const [health, setHealth] = useState<ApiHealth[]>([]);
  const [checking, setChecking] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newKind, setNewKind] = useState<'invidious' | 'piped'>('invidious');
  const s = store.settings;
  const set = (patch: Partial<typeof s>) => update(st => ({ ...st, settings: { ...st.settings, ...patch } }));
  const check = async () => {
    setChecking(true);
    try { const r = await fetch(`/api/health?endpoints=${encodeURIComponent(JSON.stringify(s.endpoints))}`); const j = await r.json(); setHealth(j.results || []); } finally { setChecking(false); }
  };
  const move = (i: number, dir: -1 | 1) => {
    const eps = [...s.endpoints]; const j = i + dir; if (j < 0 || j >= eps.length) return;
    [eps[i], eps[j]] = [eps[j], eps[i]]; set({ endpoints: eps });
  };
  const add = () => {
    const url = newUrl.trim().replace(/\/$/, ''); if (!url) return;
    set({ endpoints: [...s.endpoints, { id: `custom-${Date.now()}`, kind: newKind, baseUrl: url, enabled: true }] }); setNewUrl('');
  };
  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">設定</h1>
      <section className="mb-8 rounded-2xl bg-card p-5">
        <h2 className="mb-3 font-bold">プレイヤー</h2>
        <div className="flex gap-2">
          <button onClick={() => set({ player: 'html5' })} className={`rounded-full px-4 py-2 text-sm ${s.player === 'html5' ? 'bg-wakame font-bold text-black' : 'bg-neutral-800'}`}>独自HTML5プレイヤー</button>
          <button onClick={() => set({ player: 'embed' })} className={`rounded-full px-4 py-2 text-sm ${s.player === 'embed' ? 'bg-wakame font-bold text-black' : 'bg-neutral-800'}`}>公式埋め込みプレイヤー</button>
        </div>
        <p className="mt-2 text-sm text-neutral-400">HTML5プレイヤーが再生できない動画は、公式埋め込みに切り替えると再生できる場合があります。</p>
      </section>
      <section className="mb-8 rounded-2xl bg-card p-5">
        <h2 className="mb-3 font-bold">表示</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => set({ layout: 'grid' })} className={`rounded-full px-4 py-2 text-sm ${s.layout === 'grid' ? 'bg-wakame font-bold text-black' : 'bg-neutral-800'}`}>グリッド表示</button>
          <button onClick={() => set({ layout: 'list' })} className={`rounded-full px-4 py-2 text-sm ${s.layout === 'list' ? 'bg-wakame font-bold text-black' : 'bg-neutral-800'}`}>リスト表示</button>
          <button onClick={() => set({ secretMode: !s.secretMode })} className={`rounded-full px-4 py-2 text-sm ${s.secretMode ? 'bg-yellow-400 font-bold text-black' : 'bg-neutral-800'}`}>シークレットモード: {s.secretMode ? 'オン' : 'オフ'}</button>
        </div>
        <p className="mt-2 text-sm text-neutral-400">シークレットモード中は再生履歴を保存しません。</p>
      </section>
      <section className="mb-8 rounded-2xl bg-card p-5">
        <h2 className="mb-3 font-bold">動画API</h2>
        <p className="mb-3 text-sm text-neutral-400">Invidious / Piped の公開インスタンスを登録・切り替えできます。特定の1つのインスタンスに依存しない構造です。APIの利用規約・著作権・アクセス制御を尊重し、DRM・年齢制限・認証・広告の回避機能は実装していません。</p>
        <button onClick={check} disabled={checking} className="mb-3 rounded-full bg-wakame px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{checking ? '確認中…' : '接続チェック（応答速度を計測）'}</button>
        <div className="space-y-2">
          {s.endpoints.map((ep: ApiEndpoint, i: number) => {
            const h = health.find(x => x.id === ep.id);
            return (
              <div key={ep.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-900 p-3 text-sm">
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">{ep.kind}</span>
                <span className="flex-1 break-all">{ep.baseUrl}</span>
                {h && <span className={h.ok ? 'text-green-400' : 'text-red-400'}>{h.ok ? `OK ${h.ms}ms` : `エラー ${h.error || h.status || ''}`}</span>}
                <button onClick={() => set({ endpoints: s.endpoints.map(e => e.id === ep.id ? { ...e, enabled: !e.enabled } : e) })} className="rounded-full bg-neutral-800 px-2 py-1 text-xs">{ep.enabled ? '有効' : '無効'}</button>
                <button onClick={() => move(i, -1)} className="rounded-full bg-neutral-800 px-2 py-1 text-xs">↑</button>
                <button onClick={() => move(i, 1)} className="rounded-full bg-neutral-800 px-2 py-1 text-xs">↓</button>
                <button onClick={() => set({ endpoints: s.endpoints.filter(e => e.id !== ep.id) })} className="rounded-full bg-neutral-800 px-2 py-1 text-xs">削除</button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={newKind} onChange={e => setNewKind(e.target.value as any)} className="rounded-full bg-neutral-900 px-3 py-2 text-sm"><option value="invidious">Invidious</option><option value="piped">Piped</option></select>
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com" className="flex-1 min-w-[200px] rounded-full border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none" />
          <button onClick={add} className="rounded-full bg-wakame px-4 py-2 text-sm font-bold text-black">追加</button>
        </div>
      </section>
      <section className="rounded-2xl bg-card p-5 text-sm text-neutral-400">
        <h2 className="mb-2 font-bold text-white">YouTube Data API v3 について</h2>
        <p>現在はAPIキーを必要としない Invidious / Piped 経由で動画情報を取得しています。YouTube Data API v3 のキーを用意した場合は、lib/api.ts のアダプター層に Data API 用のアダプターを追加するだけで差し替えられる構造です。</p>
      </section>
    </div>
  );
}
