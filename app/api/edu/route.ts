import { NextResponse } from 'next/server';
// Education 再生（youtubeeducation.com 埋め込み）用のパラメータ取得。
// わかめtube Plus と同じ配布元から取得する: defaultKey.json が指すキーを既定とし、
// 取れなければ他のキー/ソースを順に試す。パラメータは1時間キャッシュ、失敗時は1分だけ抑制。
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

let cache: { at: number; value: { params: string; source: string } | null } | null = null;

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

async function loadParams(): Promise<{ params: string; source: string }> {
  let ordered = SOURCES;
  try {
    const dk = JSON.parse(await fetchText(DEFAULT_KEY_URL));
    const def = SOURCES.find(s => s.id === dk?.id);
    if (def) ordered = [def, ...SOURCES.filter(s => s.id !== def.id)];
  } catch { /* 既定順のまま */ }
  const errors: string[] = [];
  for (const src of ordered) {
    try { return { params: await fetchSource(src), source: src.id }; }
    catch (e: any) { errors.push(`${src.id}: ${e?.message || e}`); }
  }
  throw new Error(errors.join(' | ') || 'edu params unavailable');
}

export async function GET() {
  const now = Date.now();
  if (cache && cache.value && now - cache.at < 3_600_000) return NextResponse.json(cache.value);
  if (cache && !cache.value && now - cache.at < 60_000) return NextResponse.json({ error: 'edu params temporarily unavailable' }, { status: 502 });
  try {
    const value = await loadParams();
    cache = { at: now, value };
    return NextResponse.json(value);
  } catch (e: any) {
    cache = { at: now, value: null };
    return NextResponse.json({ error: e?.message || 'edu params failed' }, { status: 502 });
  }
}
