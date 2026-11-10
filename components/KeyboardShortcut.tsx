'use client';
import { useEffect } from 'react';
export function KeyboardShortcut() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault(); document.getElementById('mugi-search')?.focus();
      }
      // 学校用パニックボタン: Esc 1回で再生中の音声・映像を止めて Google へ即移動する
      // （IME変換中の Esc は変換キャンセルとして使うので除外する）
      if (e.key === 'Escape' && !e.isComposing) {
        document.querySelectorAll('video, audio').forEach((m) => {
          const el = m as HTMLMediaElement;
          try { el.pause(); el.muted = true; el.volume = 0; } catch { /* noop */ }
        });
        window.location.replace('https://www.google.com/');
      }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return null;
}
