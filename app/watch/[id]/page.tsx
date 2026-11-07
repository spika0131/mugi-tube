import { getVideo } from '@/lib/api';
import { WatchClient } from '@/components/WatchClient';

export default async function WatchPage({ params }: { params: { id: string } }) {
  let data: any = null; let error = '';
  try { data = await getVideo(params.id); } catch (e: any) { error = e?.message || '動画情報を取得できませんでした'; }
  if (error || !data) return <div className="rounded-xl border border-red-900 bg-red-950/50 p-6 text-sm text-red-200">動画を読み込めませんでした。<br />{error}<br />設定の「動画API」で別のインスタンスを試すか、公式埋め込みプレイヤーへの切り替えもできます。</div>;
  return <WatchClient data={data} />;
}
