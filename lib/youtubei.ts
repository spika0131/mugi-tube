// youtubei.js フォールバック（サーバー専用）
// わかめtube Plus が本命にしている Innertube ライブラリを、Invidious / Piped が
// 全滅したときの最終フォールバックとして使う。
// 実測（2026-11-10）: 既定の WEB クライアントでは format の URL が得られない
// （"No valid URL to decipher"）。ANDROID クライアントでは itag 18（音声付き
// 360p MP4）の直リンクが得られるため、再生用にはそちらを使う。
// 注意: 得られる URL は googlevideo.com 直リンクで、URL を作った IP 以外から
// 使える保証はない。通常環境向けの救済策であり、管理デバイス向けの本命は
// Invidious の ?local=true 中継（lib/api.ts）。
import type { PlayerData, Video, VideoFormat } from './types';
import { proxyThumb } from './api';

// モジュールの複数コピー読み込みに備え、クライアントは globalThis で共有する（lib/api.ts と同じ理由）
const __g = globalThis as any;
let clientPromise: Promise<any> | null = __g.__mugiYtClient || null;

function getClient(): Promise<any> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { Innertube, UniversalCache } = await import('youtubei.js');
      return Innertube.create({ lang: 'ja', location: 'JP', cache: new UniversalCache(false) });
    })().catch((e) => { clientPromise = null; __g.__mugiYtClient = null; throw e; });
    __g.__mugiYtClient = clientPromise;
  }
  // 初期化が長引いたらこのリクエストは諦める（裏では初期化が続き、次回は使い回せる）
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('youtubei init timeout')), 20_000));
  return Promise.race([clientPromise, timeout]);
}

function textOf(t: any): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.text || t.toString?.() || '';
}

export async function getVideoViaYoutubei(id: string): Promise<PlayerData> {
  const yt = await getClient();
  const info = await yt.getBasicInfo(id, { client: 'ANDROID' });
  const details = info.video_details || {};
  const formats: VideoFormat[] = [];
  const sd = info.streaming_data;
  for (const f of sd?.formats || []) {
    if (f?.url) formats.push({ url: f.url, type: 'mp4', mime: f.mime_type, qualityLabel: f.quality_label || '360p', quality: f.quality_label, hasAudio: true });
  }
  for (const f of sd?.adaptive_formats || []) {
    if (f?.url && String(f.mime_type || '').startsWith('video/mp4')) {
      formats.push({ url: f.url, type: 'mp4', mime: f.mime_type, qualityLabel: f.quality_label, quality: f.quality_label, hasAudio: false });
    }
  }
  if (!formats.length) throw new Error('youtubei: no playable formats');
  const thumbs = details.thumbnail || [];
  const thumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const video: Video = {
    videoId: id,
    title: textOf(details.title) || '',
    description: details.short_description || '',
    thumbnail: proxyThumb(thumb),
    author: details.author || '',
    authorId: details.channel_id,
    viewCount: details.view_count ? Number(details.view_count) : undefined,
    duration: details.duration,
    lengthSeconds: details.duration,
  };
  // 関連動画は WEB クライアントの getInfo から best-effort で取る（取れなくても致命ではない）
  let related: Video[] = [];
  try {
    const full = await yt.getInfo(id);
    const feed = full.watch_next_feed || [];
    related = feed.map((item: any) => {
      const vid = item?.video_id || item?.content_id || item?.id;
      if (!vid || typeof vid !== 'string') return null;
      const title = textOf(item.title) || textOf(item.metadata?.title);
      const author = textOf(item.author?.name) || textOf(item.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text);
      const thumbArr = item.content_image?.image || item.thumbnails || item.thumbnail;
      const thumbUrl = Array.isArray(thumbArr) ? thumbArr[0]?.url : undefined;
      return { videoId: vid, title, thumbnail: proxyThumb(thumbUrl || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`), author } as Video;
    }).filter(Boolean).slice(0, 20) as Video[];
  } catch { /* 関連動画なしで続行 */ }
  return { videoId: id, video, formats, captions: [], duration: details.duration, source: 'youtubei:ANDROID', related };
}
