export interface VideoFormat {
  url: string;
  type: 'mp4' | 'hls' | 'dash';
  mime?: string;
  quality?: string;
  qualityLabel?: string;
  fps?: number;
  hasAudio?: boolean;
  contentLength?: number;
  // 映像と音声が別URLの形式（Invidious adaptiveFormats）用。プレイヤーが隠しaudio要素を同期再生する
  audioUrl?: string;
  height?: number;
  // formatStreams 由来の「音声付き単一ファイル」（itag 18等）。true の形式は分離再生より
  // 優先される（同期ズレが原理的に起きず、再生開始も速いため）
  combined?: boolean;
  // 音声形式のビットレート（bps）。音質選択の表示・並び替えに使う
  bitrate?: number;
}
// 分離再生時に選べる音声（音質）候補。bitrate の高い順
export interface AudioOption { url: string; bitrate: number; label: string; }
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
  // publishedText（インスタンス生成の相対時刻文字列）はロケールがバラバラで
  // アラビア語等になるため使わない。サーバーは埋めず、表示は publishedAt から
  // クライアント側で日本語に整形する（timeAgo）。
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
  // 分離再生（adaptiveFormats）で選択可能な音声候補。未指定なら各形式の audioUrl が使われる
  audios?: AudioOption[];
  duration?: number;
  source: string;
  related?: Video[];
  // 複数の取得元が「再生不可」と返したため即確定した理由（メンバー限定・非公開など）。
  // 付いている場合は formats は空で、クライアントは無駄なリトライをせず Education 等へ進む。
  unavailable?: string;
  // 取得元側の都合（Invidious companion 未導入のインスタンスばかりで形式が取れなかった等）で
  // 全滅した理由。動画自体の「再生不可」（unavailable）とは別で、クライアントは
  // 取得元都合の文言で表示する。
  sourceBlocked?: string;
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
  player: 'html5' | 'embed' | 'education';
  layout: 'grid' | 'list';
  secretMode: boolean;
  endpoints: ApiEndpoint[];
}
// わかめtube Plus（toka-kun/wkt-Plus）が使う Invidious 一覧を土台にしたデフォルト。
// 先頭2件は 2026-11-10 実測で formatStreams（音声付きMP4）を返し、?local=true で
// インスタンス自身が中継する /videoplayback URL になることを確認済み
// （ブラウザが googlevideo.com / youtube.com に触れずに再生できる）。
// サーバー側では lib/api.ts が wkt-Plus と同じ配布リスト（toka-kun/Education）を
// 取得して自動で追随するので、この配列はそのフォールバック。
export const DEFAULT_INVIDIOUS = [
  'https://invidious.i234.cyou',
  'https://iv.catgirl.cloud',
  'https://yt.chocolatemoo53.com',
  'https://yt.omada.cafe',
  'https://echostreamz.com',
  'https://invidious.ritoge.com',
  'https://invidious.darkness.services',
  'https://iv.melmac.space',
  'https://y.com.sb',
  'https://super8.absturztau.be',
  'https://inv.thepixora.com',
  'https://inv.zoomerville.com',
  'https://invidious.ducks.party',
  'https://inv.kamuridesu.com',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.materialio.us',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
  'https://inv.owo.si',
  'https://inv.miningtcup.me',
  'https://invidious.schenkel.eti.br',
  'https://yt.thechangebook.org',
];
// 2026-11-08計測で vid.puffyan.us / inv.us.projectsegfau.lt は6秒タイムアウトで応答なしのため除外
// 2026-11-08計測で pipedapi.kavin.rocks は526、pipedapi-libre.kavin.rocks / pipedapi.privatemelon.org は応答なし、
// piped.video はAPIではなくフロントエンド（/streams がHTMLを返す）のため除外。現在、動作するPiped APIのデフォルトはない。
// ユーザーが設定で独自のPipedインスタンスを追加すれば、フォールバックとして使われる。
export const DEFAULT_PIPED: string[] = [];
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
  // 1.0万回 のような末尾 .0 は落として日本語として自然な表記にする
  const trimZero = (s: string) => s.replace(/\.0$/, '');
  if (n >= 1e8) return `${trimZero((n / 1e8).toFixed(1))}億回`;
  if (n >= 1e4) return `${trimZero((n / 1e4).toFixed(1))}万回`;
  return `${n.toLocaleString('ja-JP')}回`;
}
export function formatDuration(sec?: number) {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
// 相対時刻はインスタンス生成の文字列（publishedText）を使わず、
// publishedAt（ISO）から日本語で整形する。○分前・○時間前まで細かく出す。
export function timeAgo(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime(); if (isNaN(d)) return '';
  const diff = Date.now() - d;
  if (diff < 60_000) return 'たった今';
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (diff < hour) return `${Math.floor(diff / min)}分前`;
  if (diff < day) return `${Math.floor(diff / hour)}時間前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}日前`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}週間前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}か月前`;
  return `${Math.floor(diff / (365 * day))}年前`;
}
export function thumbFor(v: Partial<Video> & { videoId: string }) {
  return v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
}
