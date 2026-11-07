import { ApiEndpoint, ChannelInfo, PlayerData, SearchResponse, Video, VideoFormat, CaptionTrack, defaultEndpoints } from './types';

const cache = new Map<string, { at: number; ttl: number; data: any }>();
function getCached<T>(key: string): T | null {
  const e = cache.get(key); if (!e) return null;
  if (Date.now() - e.at > e.ttl) { cache.delete(key); return null; }
  return e.data as T;
}
function setCached(key: string, data: any, ttl = 120_000) { if (cache.size > 500) cache.clear(); cache.set(key, { at: Date.now(), ttl, data }); }

export async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'mugi-tube/0.1' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
async function tryEndpoints<T>(endpoints: ApiEndpoint[], fn: (ep: ApiEndpoint) => Promise<T>): Promise<{ data: T; source: string }> {
  const errors: string[] = [];
  for (const ep of endpoints.filter(e => e.enabled)) {
    try {
      const data = await fn(ep);
      return { data, source: `${ep.kind}:${ep.baseUrl}` };
    } catch (e: any) { errors.push(`${ep.baseUrl}: ${e?.message || e}`); }
  }
  throw new Error(errors.join(' | ') || 'all endpoints failed');
}
// 無料でできる高速化: インスタンスごとの実測レイテンシを覚えて速い順に試す。
// 失敗したインスタンスは60秒間だけ後回しにする（毎回全インスタンスを叩かない）。
const scores = new Map<string, { ms: number; at: number; failed: boolean }>();
function orderByScore(eps: ApiEndpoint[]): ApiEndpoint[] {
  const now = Date.now();
  return [...eps].sort((a, b) => {
    const sa = scores.get(a.baseUrl), sb = scores.get(b.baseUrl);
    const fa = sa?.failed && now - sa.at < 60_000, fb = sb?.failed && now - sb.at < 60_000;
    if (fa !== fb) return fa ? 1 : -1;
    return (sa?.ms ?? 1500) - (sb?.ms ?? 1500);
  });
}
async function tryEndpointsFast<T>(endpoints: ApiEndpoint[], fn: (ep: ApiEndpoint) => Promise<T>, timeoutMs = 4000): Promise<{ data: T; source: string }> {
  const enabled = orderByScore(endpoints.filter(e => e.enabled));
  const batch = enabled.slice(0, 3);
  const rest = enabled.slice(3);
  const timed = (ep: ApiEndpoint) => (async () => {
    const t0 = Date.now();
    try {
      const data = await fn(ep);
      scores.set(ep.baseUrl, { ms: Date.now() - t0, at: Date.now(), failed: false });
      return data;
    } catch (e) {
      scores.set(ep.baseUrl, { ms: 9999, at: Date.now(), failed: true });
      throw e;
    }
  })();
  if (batch.length > 1) {
    try {
      const raced = await Promise.any(batch.map(async (ep) => {
        const data = await Promise.race([
          timed(ep),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('race timeout')), timeoutMs)),
        ]);
        return { data, source: `${ep.kind}:${ep.baseUrl}` };
      }));
      return raced;
    } catch (_) { /* 全滅したら残りを順番に試す */ }
  }
  return tryEndpoints(rest.length ? [...batch, ...rest] : enabled, fn);
}
function invThumb(v: any): string {
  const thumbs = v.videoThumbnails || [];
  const best = thumbs.find((t: any) => t.quality === 'medium') || thumbs[thumbs.length - 1] || thumbs[0];
  return best?.url || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : '');
}
function parsePublished(p: any): string | undefined {
  if (p == null || p === '') return undefined;
  if (typeof p === 'number') { const d = new Date(p * 1000); return isNaN(d.getTime()) ? undefined : d.toISOString(); }
  const d = new Date(p); return isNaN(d.getTime()) ? undefined : d.toISOString();
}
function normInvVideo(v: any): Video | null {
  if (!v?.videoId) return null;
  return {
    videoId: v.videoId, title: v.title || '', description: v.description || '',
    thumbnail: invThumb(v), author: v.author || '', authorId: v.authorId,
    viewCount: v.viewCount, publishedAt: parsePublished(v.published),
    publishedText: v.publishedText, duration: v.lengthSeconds, lengthSeconds: v.lengthSeconds,
  };
}
function normPipedVideo(v: any): Video | null {
  const id = v.url?.replace('/watch?v=', '') || v.id; if (!id) return null;
  return {
    videoId: id, title: v.title || '', description: v.shortDescription || '',
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    author: v.uploaderName || '', authorId: v.uploaderUrl?.replace('/channel/', ''),
    viewCount: v.views, publishedAt: v.uploaded ? new Date(v.uploaded).toISOString() : undefined,
    publishedText: v.uploadedDate, duration: v.duration, lengthSeconds: v.duration,
  };
}
export async function searchVideos(query: string, sort: string, page?: string | null): Promise<SearchResponse> {
  const key = `search:${query}:${sort}:${page || ''}`;
  const hit = getCached<SearchResponse>(key); if (hit) return hit;
  const endpoints = defaultEndpoints();
  // Invidious first, then Piped — 上位3件を並列で叩く
  try {
    const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'invidious'), async (ep) => {
      const sortParam = sort === 'date' ? '&sort_by=date' : sort === 'views' ? '&sort_by=views' : '';
      const pageParam = page ? `&page=${encodeURIComponent(page)}` : '';
      return fetchJson(`${ep.baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=video${sortParam}${pageParam}`, 5000);
    });
    const results = (Array.isArray(data) ? data : []).map(normInvVideo).filter(Boolean) as Video[];
    const out: SearchResponse = { query, results, nextPage: null, source };
    setCached(key, out, 300_000); return out;
  } catch (_) { /* fall through to Piped */ }
  const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'piped'), async (ep) => {
    const filter = sort === 'date' ? 'date' : sort === 'views' ? 'views' : 'all';
    const next = page ? `&nextpage=${encodeURIComponent(page)}` : '';
    return fetchJson(`${ep.baseUrl}/search?q=${encodeURIComponent(query)}&filter=${filter}${next}`, 5000);
  });
  const items = data.items || data.content || [];
  const results = items.map(normPipedVideo).filter(Boolean) as Video[];
  const out: SearchResponse = { query, results, nextPage: data.nextpage || null, source };
  setCached(key, out, 300_000); return out;
}
export async function getFeed(): Promise<{ videos: Video[]; source: string }> {
  const key = 'feed:popular';
  const hit = getCached<{ videos: Video[]; source: string }>(key); if (hit) return hit;
  const endpoints = defaultEndpoints();
  try {
    const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'invidious'), async (ep) => fetchJson(`${ep.baseUrl}/api/v1/popular`, 5000));
    const videos = (Array.isArray(data) ? data : []).map(normInvVideo).filter(Boolean) as Video[];
    // 初回表示は24件に絞る（サムネイル40枚同時読み込みを避ける）
    if (videos.length) { const out = { videos: videos.slice(0, 24), source }; setCached(key, out, 600_000); return out; }
    throw new Error('empty popular feed');
  } catch (_) { /* fall through */ }
  const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'piped'), async (ep) => fetchJson(`${ep.baseUrl}/trending?region=JP`, 5000));
  const videos = (Array.isArray(data) ? data : []).map(normPipedVideo).filter(Boolean) as Video[];
  const out = { videos: videos.slice(0, 24), source }; setCached(key, out, 600_000); return out;
}
export async function getSuggestions(query: string): Promise<string[]> {
  try {
    const endpoints = defaultEndpoints().filter(e => e.kind === 'invidious');
    const { data } = await tryEndpoints(endpoints, async (ep) => fetchJson(`${ep.baseUrl}/api/v1/search/suggestions?q=${encodeURIComponent(query)}`));
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch { return []; }
}
function invFormats(v: any): { formats: VideoFormat[]; captions: CaptionTrack[] } {
  const formats: VideoFormat[] = [];
  // formatStreams are MP4 files with audio — preferred, single URL
  for (const f of v.formatStreams || []) {
    if (f.url) formats.push({ url: f.url, type: 'mp4', mime: f.type, quality: f.quality, qualityLabel: f.qualityLabel, fps: f.fps, hasAudio: true });
  }
  // DASH manifest (dash.js) — separate audio/video handled by the player library, not as a single URL
  if (v.dashUrl) formats.push({ url: v.dashUrl, type: 'dash', quality: 'DASH', hasAudio: true });
  // HLS — request local=true so all stages go through the CORS-enabled instance
  if (v.hlsUrl) {
    const u = v.hlsUrl.includes('local=true') ? v.hlsUrl : `${v.hlsUrl}${v.hlsUrl.includes('?') ? '&' : '?'}local=true`;
    formats.push({ url: u, type: 'hls', quality: 'HLS', hasAudio: true });
  }
  const captions: CaptionTrack[] = (v.captions || []).filter((c: any) => c.url).map((c: any) => ({ label: c.label, language: c.languageCode, url: c.url }));
  return { formats, captions };
}
function pipedFormats(v: any): { formats: VideoFormat[]; captions: CaptionTrack[] } {
  const formats: VideoFormat[] = [];
  for (const s of v.videoStreams || []) {
    if (s.url && s.mimeType?.includes('video/mp4')) formats.push({ url: s.url, type: 'mp4', mime: s.mimeType, quality: s.quality, qualityLabel: s.quality, fps: s.fps, hasAudio: false });
  }
  for (const s of v.audioStreams || []) {
    if (s.url && s.mimeType?.includes('audio/mp4')) formats.push({ url: s.url, type: 'mp4', mime: s.mimeType, quality: 'audio', hasAudio: true });
  }
  if (v.dash) formats.push({ url: v.dash, type: 'dash', quality: 'DASH', hasAudio: true });
  if (v.hls) formats.push({ url: v.hls, type: 'hls', quality: 'HLS', hasAudio: true });
  const captions: CaptionTrack[] = (v.subtitles || []).filter((c: any) => c.url).map((c: any) => ({ label: c.name || c.code, language: c.code, url: c.url }));
  return { formats, captions };
}
export async function getVideo(id: string): Promise<PlayerData> {
  const key = `video:${id}`;
  const hit = getCached<PlayerData>(key); if (hit) return hit;
  const endpoints = defaultEndpoints();
  try {
    const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'invidious'), async (ep) => fetchJson(`${ep.baseUrl}/api/v1/videos/${id}?local=true`, 6000));
    const video: Video = normInvVideo(data) || { videoId: id, title: data.title || '', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, author: data.author || '' };
    video.description = data.description || ''; video.authorId = data.authorId; video.viewCount = data.viewCount;
    video.publishedAt = parsePublished(data.published);
    const { formats, captions } = invFormats(data);
    const related = (data.recommendedVideos || []).map(normInvVideo).filter(Boolean) as Video[];
    const out: PlayerData = { videoId: id, video, formats, captions, duration: data.lengthSeconds, source, related };
    setCached(key, out, 300_000); return out;
  } catch (e) { console.error('[getVideo invidious failed]', e); /* fall through */ }
  const { data, source } = await tryEndpointsFast(endpoints.filter(e => e.kind === 'piped'), async (ep) => fetchJson(`${ep.baseUrl}/streams/${id}`, 6000));
  const video: Video = {
    videoId: id, title: data.title || '', description: data.description || '', thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    author: data.uploader || '', authorId: data.uploaderUrl?.replace('/channel/', ''), viewCount: data.views, duration: data.duration,
  };
  const { formats, captions } = pipedFormats(data);
  const related = (data.relatedStreams || []).map(normPipedVideo).filter(Boolean) as Video[];
  const out: PlayerData = { videoId: id, video, formats, captions, duration: data.duration, source, related };
  setCached(key, out, 300_000); return out;
}
export async function getChannel(id: string, sort: string): Promise<ChannelInfo> {
  const key = `channel:${id}:${sort}`;
  const hit = getCached<ChannelInfo>(key); if (hit) return hit;
  const endpoints = defaultEndpoints();
  try {
    const { data, source } = await tryEndpoints(endpoints.filter(e => e.kind === 'invidious'), async (ep) => fetchJson(`${ep.baseUrl}/api/v1/channels/${id}`));
    const videos = (data.latestVideos || []).map(normInvVideo).filter(Boolean) as Video[];
    const sorted = sort === 'views' ? [...videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)) : sort === 'oldest' ? [...videos].reverse() : videos;
    const out: ChannelInfo = { authorId: id, author: data.author || '', authorThumbnail: data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url, description: data.description || '', subscriberCount: data.subCount, totalViews: data.totalViews, videos: sorted, source };
    setCached(key, out); return out;
  } catch (_) { /* fall through */ }
  const { data, source } = await tryEndpoints(endpoints.filter(e => e.kind === 'piped'), async (ep) => fetchJson(`${ep.baseUrl}/channel/${id}`));
  const videos = (data.relatedStreams || []).map(normPipedVideo).filter(Boolean) as Video[];
  const out: ChannelInfo = { authorId: id, author: data.name || '', authorThumbnail: data.avatar, description: data.description || '', subscriberCount: data.subscriberCount, videos, source };
  setCached(key, out); return out;
}
export async function checkEndpoints(endpoints: ApiEndpoint[]) {
  return Promise.all(endpoints.map(async (ep) => {
    const started = Date.now();
    try {
      const url = ep.kind === 'invidious' ? `${ep.baseUrl}/api/v1/stats` : `${ep.baseUrl}/search?q=test`;
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } }).finally(() => clearTimeout(t));
      return { id: ep.id, kind: ep.kind, baseUrl: ep.baseUrl, ok: res.ok, ms: Date.now() - started, status: res.status };
    } catch (e: any) { return { id: ep.id, kind: ep.kind, baseUrl: ep.baseUrl, ok: false, ms: Date.now() - started, error: e?.message || 'error' }; }
  }));
}
