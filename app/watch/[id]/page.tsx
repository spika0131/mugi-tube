import { WatchClient } from '@/components/WatchClient';

// 視聴ページも枠だけ即表示し、動画情報はクライアント側で /api/video/[id] から読み込む。
// 以前はサーバーで Invidious を待ってから HTML を返していた。
export default function WatchPage({ params }: { params: { id: string } }) {
  return <WatchClient videoId={params.id} />;
}
