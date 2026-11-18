'use client';
import { useEffect, useRef } from 'react';

// 画面遷移で状態が消える問題への対策（sessionStorage ベース）:
// App Router では別画面へ行って戻るとページコンポーネントが再マウントされ、
// useState の内容（検索結果・フィード・動画情報）とスクロール位置が初期化される。
// そこで「戻ってきたら再取得なしで復帰できる」よう、一覧系の状態を
// sessionStorage に退避し、スクロール位置も保存/復元する。
// sessionStorage はタブを閉じれば消えるため、端末に履歴を残さない方針とも合う。

const SCROLL_PREFIX = 'mugi-scroll:';

export function saveScrollPos(key: string) {
  try { sessionStorage.setItem(SCROLL_PREFIX + key, String(window.scrollY)); } catch { /* 容量超過などは無視 */ }
}
export function loadScrollPos(key: string): number {
  try {
    const v = Number(sessionStorage.getItem(SCROLL_PREFIX + key));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}

// ready（=一覧の描画が済んだ）になったら保存済みスクロール位置へ一度だけ復元し、
// 以後のスクロールを随時保存する。復元前に scroll イベントで 0 を上書きすると
// 位置が消えるため、復元が済むまでは保存しない。
export function useScrollRestore(key: string, ready: boolean) {
  const restoredRef = useRef(false);
  useEffect(() => { restoredRef.current = false; }, [key]);
  useEffect(() => {
    const onScroll = () => { if (restoredRef.current) saveScrollPos(key); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (restoredRef.current) saveScrollPos(key);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;
    const y = loadScrollPos(key);
    if (y > 0) {
      // レイアウト確定後に復元する（画像等で高さが後から伸びる場合に備え2回試みる）
      requestAnimationFrame(() => window.scrollTo(0, y));
      const t = setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y); }, 350);
      return () => clearTimeout(t);
    }
  }, [key, ready]);
}

// TTL付きの小さな sessionStorage キャッシュ（検索結果・動画情報の退避用）
export function loadSessionCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.at !== 'number' || Date.now() - p.at > ttlMs) return null;
    return p.data as T;
  } catch { return null; }
}
export function saveSessionCache(key: string, data: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* 容量超過などは無視 */ }
}
export function clearSessionCache(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
