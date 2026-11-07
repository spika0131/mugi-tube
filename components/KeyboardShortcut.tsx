'use client';
import { useEffect } from 'react';
export function KeyboardShortcut() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault(); document.getElementById('mugi-search')?.focus();
      }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return null;
}
