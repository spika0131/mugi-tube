'use client';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { ApiEndpoint, AppSettings, Video, defaultEndpoints } from './types';

const KEY = 'mugi-tube-v1';
export interface StoredVideo extends Video { watchedAt?: number; }
export interface Playlist { id: string; name: string; videos: StoredVideo[]; createdAt: number; }
export interface Store {
  favorites: StoredVideo[];
  history: StoredVideo[];
  playlists: Playlist[];
  searchHistory: string[];
  settings: AppSettings;
}
const defaultSettings: AppSettings = { player: 'html5', layout: 'grid', secretMode: false, endpoints: defaultEndpoints() };
function load(): Store {
  if (typeof window === 'undefined') return { favorites: [], history: [], playlists: [], searchHistory: [], settings: defaultSettings };
  try { const raw = localStorage.getItem(KEY); if (!raw) return { favorites: [], history: [], playlists: [], searchHistory: [], settings: defaultSettings };
    const p = JSON.parse(raw); return { favorites: p.favorites || [], history: p.history || [], playlists: p.playlists || [], searchHistory: p.searchHistory || [], settings: { ...defaultSettings, ...(p.settings || {}), endpoints: p.settings?.endpoints?.length ? p.settings.endpoints : defaultEndpoints() } };
  } catch { return { favorites: [], history: [], playlists: [], searchHistory: [], settings: defaultSettings }; }
}
const StoreCtx = createContext<{ store: Store; update: (fn: (s: Store) => Store) => void } | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => load());
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }, [store]);
  const update = useCallback((fn: (s: Store) => Store) => setStore(s => fn(s)), []);
  return <StoreCtx.Provider value={{ store, update }}>{children}</StoreCtx.Provider>;
}
export function useStore() { const c = useContext(StoreCtx); if (!c) throw new Error('useStore outside provider'); return c; }
export function useFavorites() {
  const { store, update } = useStore();
  const isFav = (id: string) => store.favorites.some(v => v.videoId === id);
  const toggleFav = (v: Video) => update(s => ({ ...s, favorites: isFav(v.videoId) ? s.favorites.filter(x => x.videoId !== v.videoId) : [{ ...v, watchedAt: Date.now() }, ...s.favorites] }));
  return { favorites: store.favorites, isFav, toggleFav };
}
export function recordHistory(v: Video) {
  try {
    const s = load(); if (s.settings.secretMode) return;
    const history = [{ ...v, watchedAt: Date.now() }, ...s.history.filter(x => x.videoId !== v.videoId)].slice(0, 100);
    localStorage.setItem(KEY, JSON.stringify({ ...s, history }));
  } catch {}
}

// Mini player
export interface MiniState { video: Video | null; src?: string; }
const MiniCtx = createContext<{ mini: MiniState; setMini: (m: MiniState) => void; closeMini: () => void } | null>(null);
export function MiniProvider({ children }: { children: ReactNode }) {
  const [mini, setMiniState] = useState<MiniState>({ video: null });
  const setMini = useCallback((m: MiniState) => setMiniState(m), []);
  const closeMini = useCallback(() => setMiniState({ video: null }), []);
  return <MiniCtx.Provider value={{ mini, setMini, closeMini }}>{children}</MiniCtx.Provider>;
}
export function useMini() { const c = useContext(MiniCtx); if (!c) throw new Error('useMini outside provider'); return c; }
export type { AppSettings, ApiEndpoint };
