import { getChannel } from '@/lib/api';
import { VideoCard } from '@/components/VideoCard';
import Link from 'next/link';
import Image from 'next/image';

export default async function ChannelPage({ params, searchParams }: { params: { id: string }; searchParams: { sort?: string } }) {
  const sort = searchParams.sort || 'newest';
  let ch: any = null; let error = '';
  try { ch = await getChannel(params.id, sort); } catch (e: any) { error = e?.message || 'チャンネルを取得できませんでした'; }
  if (error || !ch) return <div className="rounded-xl border border-red-900 bg-red-950/50 p-6 text-sm text-red-200">チャンネルを読み込めませんでした。<br />{error}</div>;
  return (
    <div>
      <div className="flex items-center gap-4">
        {ch.authorThumbnail && <Image src={ch.authorThumbnail} alt={ch.author} width={80} height={80} className="rounded-full" unoptimized />}
        <div><h1 className="text-2xl font-bold">{ch.author}</h1><p className="text-sm text-neutral-400">{ch.subscriberCount ? `${ch.subscriberCount.toLocaleString()}人` : ''} {ch.totalViews ? `• ${ch.totalViews.toLocaleString()}回視聴` : ''}</p></div>
      </div>
      {ch.description && <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-card p-4 text-sm text-neutral-300">{ch.description}</p>}
      <div className="mb-4 mt-6 flex gap-2">
        {([['newest', '新しい順'], ['oldest', '古い順'], ['views', '再生回数順']] as const).map(([v, l]) => <Link key={v} href={`/channel/${params.id}?sort=${v}`} className={`rounded-full px-4 py-1.5 text-sm ${sort === v ? 'bg-wakame font-bold text-black' : 'bg-card'}`}>{l}</Link>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{ch.videos.map((v: any) => <VideoCard key={v.videoId} video={v} />)}</div>
      {ch.videos.length === 0 && <p className="text-neutral-400">公開動画が見つかりませんでした。</p>}
    </div>
  );
}
