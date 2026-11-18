import { NextResponse } from 'next/server';
// Education 再生（youtubeeducation.com 埋め込み）用のパラメータ取得。
// わかめtube Plus と同じ配布元群から取得する（安定化パック第2弾で複数保持に拡張）:
// 全ソースを並列取得して成功したパラメータをすべて保持し、defaultKey.json が
// 指すキーを先頭に並べる。クライアントは1つが塞がれても次のパラメータへ
// 順に切り替えて再生を成立させられる。パラメータは1時間キャッシュし、
// 再取得に失敗したら前回の成功値を（古くても）返して全滅を避ける。
export const dynamic = 'force-dynamic';

interface EduSource { id: string; url: string; type: 'json' | 'text'; key?: string }
const SOURCES: EduSource[] = [
  { id: 'edurl_toka1', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key1.json', type: 'json', key: 'result' },
  { id: 'edurl_toka2', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key2.json', type: 'json', key: 'result' },
  { id: 'edurl_toka3', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key3.json', type: 'json', key: 'result' },
  { id: 'edurl_toka4', url: 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key4.json', type: 'json', key: 'result' },
  { id: 'edurl_wakame', url: 'https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/edu.text', type: 'text' },
  { id: 'edurl_sia', url: 'https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json', type: 'json', key: 'params' },
  { id: 'edurl_wool1', url: 'https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/1.txt', type: 'text' },
  { id: 'edurl_wool2', url: 'https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/2.txt', type: 'text' },
];
const DEFAULT_KEY_URL = 'https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/defaultKey.json';

export interface EduParamSet { params: string; source: string }
export interface EduResponse { params: string; source: string; alternates: EduParamSet[] }

// Next.js のサーバーではモジュールが複数コピー読み込まれることがあるため、
// 共有キャッシュは globalThis に置く（lib/api.ts と同じ理由）
const __g = globalThis as any;
function getCache(): { at: number; value: EduResponse | null } | null { return __g.__mugiEduCache || null; }
function setCache(v: { at: number; value: EduResponse | null } | null) { __g.__mugiEduCache = v; }

async function fetchText(url: string, timeoutMs = 5000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'mugi-tube/0.1' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

async function fetchSource(src: EduSource): Promise<string> {
  const raw = await fetchText(src.url);
  let value = raw;
  if (src.type === 'json') {
    const json = JSON.parse(raw);
    value = String(json?.[src.key || 'result'] || '');
  }
  value = value.trim();
  if (!value) throw new Error('empty');
  // 元データは HTML 属性向けに &amp; 表記。iframe の src として使うので & に戻す
  return value.replace(/&amp;/g, '&');
}

// 全ソースを並列取得し、成功したものをすべて返す。
// 並びは defaultKey が指すキーを先頭に、残りは SOURCES の定義順。
// 同一パラメータの重複は除く（複数ソースが同じキーを配ることがある）。
async function loadAllParams(): Promise<EduResponse> {
  let defaultId = '';
  try {
    const dk = JSON.parse(await fetchText(DEFAULT_KEY_URL));
    defaultId = String(dk?.id || '');
  } catch { /* 既定順のまま */ }
  const settled = await Promise.all(SOURCES.map(async (src) => {
    try { return { params: await fetchSource(src), source: src.id } as EduParamSet; }
    catch { return null; }
  }));
  const ok = settled.filter(Boolean) as EduParamSet[];
  if (!ok.length) throw new Error('edu params unavailable from all sources');
  const seen = new Set<string>();
  const unique = ok.filter(p => (seen.has(p.params) ? false : (seen.add(p.params), true)));
  const head = unique.filter(p => p.source === defaultId);
  const rest = unique.filter(p => p.source !== defaultId);
  const ordered = [...head, ...rest];
  return { params: ordered[0].params, source: ordered[0].source, alternates: ordered.slice(1) };
}

export async function GET() {
  const now = Date.now();
  const cache = getCache();
  if (cache && cache.value && now - cache.at < 3_600_000) return NextResponse.json(cache.value);
  if (cache && !cache.value && now - cache.at < 60_000) return NextResponse.json({ error: 'edu params temporarily unavailable' }, { status: 502 });
  try {
    const value = await loadAllParams();
    setCache({ at: now, value });
    return NextResponse.json(value);
  } catch (e: any) {
    // 再取得に失敗しても、前回の成功値が残っていればそれを返す（最後の砦を全滅させない）
    if (cache?.value) return NextResponse.json(cache.value);
    setCache({ at: now, value: null });
    return NextResponse.json({ error: e?.message || 'edu params failed' }, { status: 502 });
  }
}
