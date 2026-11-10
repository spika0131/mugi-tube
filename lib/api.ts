import { ApiEndpoint, ChannelInfo, PlayerData, SearchResponse, Video, VideoFormat, CaptionTrack, DEFAULT_INVIDIOUS, defaultEndpoints } from './types';

// 注意: Next.js のサーバーではこのモジュールが複数コピー読み込まれることがあり、
// モジュールスコープの Map がリクエスト間で共有されない（実測で確認）。
// そのため可変の共有状態はすべて globalThis に置き、プロセス内で1つに統一する。
const __g = globalThis as any;
const cache: Map<string, { at: number; ttl: number; data: any }> = __g.__mugiCache || (__g.__mugiCache = new Map());
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
const scores: Map<string, { ms: number; at: number; failed: boolean }> = __g.__mugiScores || (__g.__mugiScores = new Map());
function orderByScore(eps: ApiEndpoint[]): ApiEndpoint[] {
  const now = Date.now();
  return [...eps].sort((a, b) => {
    const sa = scores.get(a.baseUrl), sb = scores.get(b.baseUrl);
    // 注意: !! で boolean に揃えること。false と undefined を混ぜると比較関数が
    // 矛盾し（両方向で -1 を返す）、ソート結果が不定になって速いインスタンスが後ろへ行く。
    const fa = !!(sa?.failed && now - sa.at < 60_000), fb = !!(sb?.failed && now - sb.at < 60_000);
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
// サムネイルは自前プロキシ /api/img 経由にする（わかめtube Plus の /wkt/back と同じ発想）。
// ブラウザが i.ytimg.com / yt3.ggpht.com に直接触れないので、管理デバイスでも画像が通る可能性がある。
export function proxyThumb(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (/(^|\.)ytimg\.com$/.test(u.hostname) || u.hostname === 'yt3.ggpht.com' || u.hostname.endsWith('.googleusercontent.com') || u.hostname.endsWith('.ggpht.com')) {
      return `/api/img?u=${encodeURIComponent(url)}`;
    }
  } catch { /* 相対URLなどはそのまま */ }
  return url;
}
// わかめtube Plus と同じく、Invidious の稼働インスタンス一覧を配布リストから取得して自動追随する。
// 取得元: https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json
// 1時間キャッシュ。失敗したら前回値か DEFAULT_INVIDIOUS を使う。環境変数 INVIDIOUS_ENDPOINTS があればそちらを優先（固定）。
const INV_LIST_URL = 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json';
let invListCache: { at: number; urls: string[] } | null = __g.__mugiInvList || null;
export async function getInvEndpoints(): Promise<ApiEndpoint[]> {
  const env = (process.env.INVIDIOUS_ENDPOINTS || '').split(',').map(s => s.trim()).filter(Boolean);
  let urls: string[];
  if (env.length) {
    urls = env;
  } else if (invListCache && Date.now() - invListCache.at < 3_600_000) {
    urls = invListCache.urls;
  } else {
    try {
      const remote: any = await fetchJson(INV_LIST_URL, 5000);
      const remoteUrls = (Array.isArray(remote) ? remote : []).map((s: any) => String(s || '').replace(/\/$/, '')).filter((s: string) => s.startsWith('https://'));
      if (!remoteUrls.length) throw new Error('empty invidious list');
      // 実測で中継再生できたものを先頭に固定し、残りは配布リスト順。重複は除く
      urls = [...new Set([...DEFAULT_INVIDIOUS, ...remoteUrls])];
      invListCache = { at: Date.now(), urls }; __g.__mugiInvList = invListCache;
    } catch {
      urls = invListCache?.urls || DEFAULT_INVIDIOUS;
    }
  }
  return urls.map((baseUrl, i) => ({ id: `inv-${i}`, kind: 'invidious' as const, baseUrl, enabled: true }));
}
function pipedEndpoints(): ApiEndpoint[] {
  return defaultEndpoints().filter(e => e.kind === 'piped');
}
function invThumb(v: any): string {
  const thumbs = v.videoThumbnails || [];
  const best = thumbs.find((t: any) => t.quality === 'medium') || thumbs[thumbs.length - 1] || thumbs[0];
  return proxyThumb(best?.url || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : ''));
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
    thumbnail: proxyThumb(v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
    author: v.uploaderName || '', authorId: v.uploaderUrl?.replace('/channel/', ''),
    viewCount: v.views, publishedAt: v.uploaded ? new Date(v.uploaded).toISOString() : undefined,
    publishedText: v.uploadedDate, duration: v.duration, lengthSeconds: v.duration,
  };
}
export async function searchVideos(query: string, sort: string, page?: string | null): Promise<SearchResponse> {
  const key = `search:${query}:${sort}:${page || ''}`;
  const hit = getCached<SearchResponse>(key); if (hit) return hit;
  const invEndpoints = await getInvEndpoints();
  // Invidious first, then Piped — 上位3件を並列で叩く
  try {
    const { data, source } = await tryEndpointsFast(invEndpoints, async (ep) => {
      const sortParam = sort === 'date' ? '&sort_by=date' : sort === 'views' ? '&sort_by=views' : '';
      const pageParam = page ? `&page=${encodeURIComponent(page)}` : '';
      const d = await fetchJson(`${ep.baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=video${sortParam}${pageParam}`, 5000);
      if (!Array.isArray(d)) throw new Error('search response is not an array');
      return d;
    });
    const results = (Array.isArray(data) ? data : []).map(normInvVideo).filter(Boolean) as Video[];
    const out: SearchResponse = { query, results, nextPage: null, source };
    setCached(key, out, 300_000); return out;
  } catch (_) { /* fall through to Piped */ }
  const { data, source } = await tryEndpointsFast(pipedEndpoints(), async (ep) => {
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
  const invEndpoints = await getInvEndpoints();
  try {
    const { data, source } = await tryEndpointsFast(invEndpoints, async (ep) => {
      const d = await fetchJson(`${ep.baseUrl}/api/v1/popular`, 5000);
      // 200でも0件を返すインスタンスがある（例: chocolatemoo53 の popular）。
      // 「最速の応答」を採用するレースでは、空応答が勝つとフィード全体が空になるため、空は失敗として扱う
      if (!Array.isArray(d) || !d.length) throw new Error('empty popular feed');
      return d;
    });
    const videos = (Array.isArray(data) ? data : []).map(normInvVideo).filter(Boolean) as Video[];
    // 初回表示は24件に絞る（サムネイル40枚同時読み込みを避ける）
    if (videos.length) { const out = { videos: videos.slice(0, 24), source }; setCached(key, out, 600_000); return out; }
    throw new Error('empty popular feed');
  } catch (_) { /* fall through */ }
  const { data, source } = await tryEndpointsFast(pipedEndpoints(), async (ep) => fetchJson(`${ep.baseUrl}/trending?region=JP`, 5000));
  const videos = (Array.isArray(data) ? data : []).map(normPipedVideo).filter(Boolean) as Video[];
  const out = { videos: videos.slice(0, 24), source }; setCached(key, out, 600_000); return out;
}
export async function getSuggestions(query: string): Promise<string[]> {
  try {
    const endpoints = await getInvEndpoints();
    const { data } = await tryEndpoints(endpoints, async (ep) => fetchJson(`${ep.baseUrl}/api/v1/search/suggestions?q=${encodeURIComponent(query)}`));
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch { return []; }
}
function invFormats(v: any): { formats: VideoFormat[]; captions: CaptionTrack[] } {
  const formats: VideoFormat[] = [];
  // formatStreams are MP4 files with audio — preferred, single URL.
  // ?local=true で取得しているので URL はインスタンス自身の /videoplayback 中継になり、
  // ブラウザが googlevideo.com に触れずに再生できる（2026-11-10 に i234.cyou で実測）。
  for (const f of v.formatStreams || []) {
    if (f.url) formats.push({ url: f.url, type: 'mp4', mime: f.type, quality: f.quality, qualityLabel: f.qualityLabel, fps: f.fps, hasAudio: true });
  }
  // adaptiveFormats: 映像と音声が別URL。高画質はこちらにしかないので、
  // 最も良い音声（audio/mp4 の最大bitrate）を audioUrl として付け、プレイヤー側で同期再生する
  // （わかめtube Plus の隠しaudio要素方式）。local=true なので映像・音声ともインスタンス中継。
  const adaptives: any[] = Array.isArray(v.adaptiveFormats) ? v.adaptiveFormats : [];
  const audios = adaptives.filter((f: any) => f.url && String(f.type || '').startsWith('audio/mp4'))
    .sort((a: any, b: any) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
  const bestAudio = audios[0]?.url as string | undefined;
  const heightOf = (f: any) => { const m = String(f.resolution || '').match(/(\d+)p/); return m ? Number(m[1]) : 0; };
  const videos = adaptives.filter((f: any) => f.url && String(f.type || '').startsWith('video/mp4') && String(f.type || '').includes('avc1'))
    .sort((a: any, b: any) => heightOf(b) - heightOf(a));
  const seenHeights = new Set<number>();
  for (const f of videos) {
    const h = heightOf(f); if (!h || seenHeights.has(h)) continue; seenHeights.add(h);
    formats.push({ url: f.url, type: 'mp4', mime: f.type, quality: f.resolution, qualityLabel: f.resolution, fps: f.fps, hasAudio: false, audioUrl: bestAudio, height: h });
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
// ストリームURLが本当に映像を返すか、Range付きGETで軽く確認する。
// 実測（2026-11-10）: iv.catgirl.cloud はAPI応答が完璧でも /videoplayback が
// text/html を返す（再生不可）。一方 invidious.i234.cyou は 206 + video/mp4 を返す。
// 「JSONが返ること」と「再生できること」は別物なので、採用前に必ず実物を確認する。
async function verifyStream(url: string, timeoutMs = 4500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, cache: 'no-store', redirect: 'follow',
      headers: { Range: 'bytes=0-15', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36' },
    });
    const ct = res.headers.get('content-type') || '';
    try { await res.body?.cancel(); } catch {}
    return (res.status === 200 || res.status === 206) && (ct.includes('video') || ct.includes('octet-stream') || ct.includes('mpegurl'));
  } catch { return false; }
  finally { clearTimeout(t); }
}

// Invidious から動画情報を取る。優先順に6件ずつ並列で取得し、
// 「再生できる形式がある」候補を優先順にストリーム実物確認して、最初に通ったものを採用する。
// 1バッチ目で確認が通らなければ2バッチ目（次の6件）も試す。
// それでも全滅したら、最初の候補を最後の望みとして返す（ブラウザ側のフォールバックに委ねる）。
export interface InvVideoResult { data: any; source: string; verified: boolean }
// 1回の走査で「combined（音声付きMP4）で実物確認OK」「形式は何でも実物確認OK」
// 「未確認だが形式はある」の順に最良のものを探す。
async function fetchInvVideo(id: string): Promise<InvVideoResult | null> {
  const endpoints = await getInvEndpoints();
  const ordered = orderByScore(endpoints);
  const probeOf = (d: any) => d.formatStreams?.[0]?.url
    || d.adaptiveFormats?.find((f: any) => f.url && String(f.type || '').startsWith('video/mp4'))?.url
    || d.adaptiveFormats?.[0]?.url;
  const hasCombined = (d: any) => !!d?.formatStreams?.length;
  const hasAny = (d: any) => hasCombined(d) || !!d?.adaptiveFormats?.length || !!d?.dashUrl || !!d?.hlsUrl;
  let firstUnverified: InvVideoResult | null = null;
  const anyCandidates: { ep: ApiEndpoint; d: any }[] = [];
  const tryProbe = async (ep: ApiEndpoint, d: any): Promise<boolean> => {
    const probe = probeOf(d);
    if (!probe) return false;
    const ok = await verifyStream(probe, 3500);
    scores.set(ep.baseUrl, ok ? { ms: 500, at: Date.now(), failed: false } : { ms: 9999, at: Date.now(), failed: true });
    return ok;
  };
  // 並列バッチ（4件ずつ・最大12件）。並列度を抑えるのは、同時接続が多いと
  // かえって各インスタンスの応答が遅くなりタイムアウトが増えるため。
  for (let offset = 0; offset < Math.min(ordered.length, 12); offset += 4) {
    const batch = ordered.slice(offset, offset + 4);
    const settled = await Promise.all(batch.map(async (ep) => {
      try {
        const d = await fetchJson(`${ep.baseUrl}/api/v1/videos/${id}?local=true`, 8000);
        return hasAny(d) ? { ep, d } : null;
      } catch { return null; }
    }));
    const candidates = settled.filter(Boolean) as { ep: ApiEndpoint; d: any }[];
    for (const c of candidates) {
      if (!firstUnverified) firstUnverified = { data: c.d, source: `invidious:${c.ep.baseUrl}`, verified: false };
      if (hasCombined(c.d)) {
        if (await tryProbe(c.ep, c.d)) return { data: c.d, source: `invidious:${c.ep.baseUrl}`, verified: true };
      } else {
        anyCandidates.push(c);
      }
    }
  }
  // combined で確認が取れなかったら、adaptive/DASH/HLS の候補を確認する
  for (const c of anyCandidates.slice(0, 4)) {
    if (await tryProbe(c.ep, c.d)) return { data: c.d, source: `invidious:${c.ep.baseUrl}`, verified: true };
  }
  // 最後に、優先順の先頭だけを単独で（並列の競合なしに）もう一度試す。
  // 並列バースト中はタイムアウトしていたインスタンスが、単独だと通ることがある。
  for (const ep of ordered.slice(0, 2)) {
    try {
      const d = await fetchJson(`${ep.baseUrl}/api/v1/videos/${id}?local=true`, 8000);
      if (hasAny(d) && await tryProbe(ep, d)) return { data: d, source: `invidious:${ep.baseUrl}`, verified: true };
    } catch { /* 次へ */ }
  }
  return firstUnverified;
}

export async function getVideo(id: string): Promise<PlayerData> {
  const key = `video:${id}`;
  const hit = getCached<PlayerData>(key); if (hit) return hit;
  const toPlayerData = (data: any, source: string): PlayerData => {
    const video: Video = normInvVideo(data) || { videoId: id, title: data.title || '', thumbnail: proxyThumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`), author: data.author || '' };
    video.description = data.description || ''; video.authorId = data.authorId; video.viewCount = data.viewCount;
    video.publishedAt = parsePublished(data.published);
    const { formats, captions } = invFormats(data);
    const related = (data.recommendedVideos || []).map(normInvVideo).filter(Boolean) as Video[];
    return { videoId: id, video, formats, captions, duration: data.lengthSeconds, source, related };
  };
  // Invidious: 実物確認が通った結果は5分、未確認の結果は30秒だけキャッシュする
  // （未確認＝たまたま再生できないインスタンスを掴んだ可能性があるため、早めに再挑戦する）
  const inv = await fetchInvVideo(id).catch(() => null);
  if (inv) { const out = toPlayerData(inv.data, inv.source); setCached(key, out, inv.verified ? 300_000 : 30_000); return out; }
  // 第3段階: Piped（デフォルトでは動作するインスタンスなし。設定で追加された場合のみ）
  try {
    const { data, source } = await tryEndpointsFast(pipedEndpoints(), async (ep) => fetchJson(`${ep.baseUrl}/streams/${id}`, 6000));
    const video: Video = {
      videoId: id, title: data.title || '', description: data.description || '', thumbnail: proxyThumb(data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
      author: data.uploader || '', authorId: data.uploaderUrl?.replace('/channel/', ''), viewCount: data.views, duration: data.duration,
    };
    const { formats, captions } = pipedFormats(data);
    const related = (data.relatedStreams || []).map(normPipedVideo).filter(Boolean) as Video[];
    const out: PlayerData = { videoId: id, video, formats, captions, duration: data.duration, source, related };
    setCached(key, out, 300_000); return out;
  } catch (e) { console.error('[getVideo piped failed]', e); /* fall through */ }
  // 最終フォールバック: youtubei.js（わかめtube Plus の本命ライブラリ）。
  // ANDROIDクライアントの itag18（音声付きMP4）を使う。URLは googlevideo 直リンクになるため
  // 管理デバイスでは通らない可能性があるが、通常環境では再生でき、最低限メタデータは返せる。
  const { getVideoViaYoutubei } = await import('./youtubei');
  const out = await getVideoViaYoutubei(id);
  setCached(key, out, 300_000); return out;
}
export async function getChannel(id: string, sort: string): Promise<ChannelInfo> {
  const key = `channel:${id}:${sort}`;
  const hit = getCached<ChannelInfo>(key); if (hit) return hit;
  const invEndpoints = await getInvEndpoints();
  try {
    const { data, source } = await tryEndpoints(invEndpoints, async (ep) => fetchJson(`${ep.baseUrl}/api/v1/channels/${id}`));
    const videos = (data.latestVideos || []).map(normInvVideo).filter(Boolean) as Video[];
    const sorted = sort === 'views' ? [...videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)) : sort === 'oldest' ? [...videos].reverse() : videos;
    const out: ChannelInfo = { authorId: id, author: data.author || '', authorThumbnail: proxyThumb(data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url), description: data.description || '', subscriberCount: data.subCount, totalViews: data.totalViews, videos: sorted, source };
    setCached(key, out); return out;
  } catch (_) { /* fall through */ }
  const { data, source } = await tryEndpoints(pipedEndpoints(), async (ep) => fetchJson(`${ep.baseUrl}/channel/${id}`));
  const videos = (data.relatedStreams || []).map(normPipedVideo).filter(Boolean) as Video[];
  const out: ChannelInfo = { authorId: id, author: data.name || '', authorThumbnail: proxyThumb(data.avatar), description: data.description || '', subscriberCount: data.subscriberCount, videos, source };
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
