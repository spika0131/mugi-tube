'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Video, formatViews, formatDuration, timeAgo, thumbFor } from '@/lib/types';
export function VideoCard({ video, layout = 'grid' }: { video: Video; layout?: 'grid' | 'list' }) {
  if (layout === 'list') {
    return (
      <Link href={`/watch/${video.videoId}`} className="flex gap-3 rounded-xl bg-card p-2 hover:bg-neutral-800 transition">
        <span className="relative block w-40 shrink-0 overflow-hidden rounded-lg aspect-video"><Image src={thumbFor(video)} alt={video.title} fill className="object-cover" unoptimized sizes="160px" /><span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px]">{formatDuration(video.duration)}</span></span>
        <span className="min-w-0 py-1"><span className="block truncate font-medium">{video.title}</span><span className="block truncate text-sm text-neutral-400">{video.author}</span><span className="text-xs text-neutral-500">{formatViews(video.viewCount)} • {timeAgo(video.publishedAt)}</span></span>
      </Link>
    );
  }
  return (
    <Link href={`/watch/${video.videoId}`} className="group block overflow-hidden rounded-2xl bg-card hover:bg-neutral-800 transition">
      <span className="relative block overflow-hidden aspect-video"><Image src={thumbFor(video)} alt={video.title} fill className="object-cover group-hover:scale-[1.03] transition" unoptimized sizes="(max-width: 768px) 100vw, 33vw" /><span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs">{formatDuration(video.duration)}</span></span>
      <span className="block p-3"><span className="block font-medium leading-snug line-clamp-2">{video.title}</span><span className="mt-1 block truncate text-sm text-neutral-400">{video.author}</span><span className="text-xs text-neutral-500">{formatViews(video.viewCount)} • {timeAgo(video.publishedAt)}</span></span>
    </Link>
  );
}
