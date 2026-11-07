import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StoreProvider, MiniProvider } from '@/lib/store';
import { SearchBar } from '@/components/SearchBar';
import { MiniPlayer } from '@/components/MiniPlayer';
import { KeyboardShortcut } from '@/components/KeyboardShortcut';

export const metadata: Metadata = { title: 'むぎTube', description: 'YouTube動画ポータル — 検索・視聴・チャンネル・お気に入り・履歴' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <StoreProvider><MiniProvider>
          <KeyboardShortcut />
          <header className="sticky top-0 z-40 border-b border-neutral-800 bg-black/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
              <Link href="/" className="text-xl font-black tracking-tight"><span className="text-wakame">むぎ</span>Tube</Link>
              <div className="min-w-[200px] flex-1"><SearchBar /></div>
              <nav className="flex gap-4 text-sm text-neutral-300">
                <Link href="/" className="hover:text-wakame">ホーム</Link>
                <Link href="/library" className="hover:text-wakame">ライブラリ</Link>
                <Link href="/settings" className="hover:text-wakame">設定</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">むぎTube — YouTubeの公式API・埋め込み機能と、Invidious / Piped の公開APIを利用しています。DRM・年齢制限・認証・広告の回避機能はありません。</footer>
          <MiniPlayer />
        </MiniProvider></StoreProvider>
      </body>
    </html>
  );
}
