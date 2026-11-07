import { searchVideos } from '@/lib/api';
import { SearchClient } from '@/components/SearchClient';

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; sort?: string } }) {
  const q = searchParams.q || '';
  const sort = searchParams.sort || 'relevance';
  let results: any[] = []; let source = ''; let error = '';
  if (q) { try { const r = await searchVideos(q, sort); results = r.results; source = r.source; } catch (e: any) { error = e?.message || '検索に失敗しました'; } }
  return <SearchClient q={q} sort={sort} initial={results} source={source} error={error} />;
}
