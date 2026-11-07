import { SearchClient } from '@/components/SearchClient';

// 検索もホームと同じ方針: 枠は即表示し、結果はクライアント側で /api/search から読み込む。
// 以前はサーバーで検索APIを待ってから HTML を返していた。
export default function SearchPage({ searchParams }: { searchParams: { q?: string; sort?: string } }) {
  return <SearchClient q={searchParams.q || ''} sort={searchParams.sort || 'relevance'} />;
}
