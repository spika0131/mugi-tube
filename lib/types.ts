export interface VideoFormat {
  url: string;
  type: 'mp4' | 'hls' | 'dash';
  mime?: string;
  quality?: string;
  qualityLabel?: string;
  fps?: number;
  hasAudio?: boolean;
  contentLength?: number;
}
export interface CaptionTrack { label: string; language: string; url: string; }
export interface Video {
  videoId: string;
  title: string;
  description?: string;
  thumbnail: string;
  author: string;
  authorId?: string;
  authorThumbnail?: string;
  viewCount?: number;
  publishedAt?: string;
  publishedText?: string;
  duration?: number;
  lengthSeconds?: number;
  availableFormats?: VideoFormat[];
  source?: string;
}
export interface SearchResponse { query: string; results: Video[]; nextPage?: string | null; source: string; }
export interface PlayerData {
  videoId: string;
  video: Video;
  formats: VideoFormat[];
  captions: CaptionTrack[];
  duration?: number;
  source: string;
  related?: Video[];
}
export interface ChannelInfo {
  authorId: string;
  author: string;
  authorThumbnail?: string;
  description?: string;
  subscriberCount?: number;
  totalViews?: number;
  videos: Video[];
  source?: string;
}
export interface ApiEndpoint {
  id: string;
  kind: 'invidious' | 'piped';
  baseUrl: string;
  enabled: boolean;
  label?: string;
}
export interface ApiHealth { id: string; kind: string; baseUrl: string; ok: boolean; ms?: number; status?: number; error?: string; }
export interface AppSettings {
  player: 'html5' | 'embed';
  layout: 'grid' | 'list';
  secretMode: boolean;
  endpoints: ApiEndpoint[];
}
export const DEFAULT_INVIDIOUS = [
  'https://yt.chocolatemoo53.com',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://vid.puffyan.us',
  'https://inv.us.projectsegfau.lt',
];
export const DEFAULT_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.privatemelon.org',
  'https://piped.video',
];
export function defaultEndpoints(): ApiEndpoint[] {
  const inv = (process.env.INVIDIOUS_ENDPOINTS || '').split(',').map(s => s.trim()).filter(Boolean);
  const pip = (process.env.PIPED_ENDPOINTS || '').split(',').map(s => s.trim()).filter(Boolean);
  const invList = inv.length ? inv : DEFAULT_INVIDIOUS;
  const pipList = pip.length ? pip : DEFAULT_PIPED;
  return [
    ...invList.map((baseUrl, i) => ({ id: `inv-${i}`, kind: 'invidious' as const, baseUrl, enabled: true })),
    ...pipList.map((baseUrl, i) => ({ id: `pip-${i}`, kind: 'piped' as const, baseUrl, enabled: true })),
  ];
}
export function formatViews(n?: number) {
  if (n == null) return '';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}億回`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万回`;
  return `${n.toLocaleString()}回`;
}
export function formatDuration(sec?: number) {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function timeAgo(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime(); if (isNaN(d)) return iso;
  const diff = Date.now() - d; const day = 86400000;
  if (diff < day) return '今日';
  if (diff < 30 * day) return `${Math.floor(diff / day)}日前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}か月前`;
  return `${Math.floor(diff / (365 * day))}年前`;
}
export function thumbFor(v: Partial<Video> & { videoId: string }) {
  return v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
}
