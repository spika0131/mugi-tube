# むぎTube

YouTubeを便利に検索・視聴できる独自の動画ポータル。ダークテーマ、独自HTML5プレイヤー、Invidious / Piped アダプター層を備えた Next.js アプリです。

## 機能

- ホーム: 人気動画フィード、カテゴリー別、最近見た動画
- 検索: キーワード検索、サムネイル、並び替え、続き読み込み、検索履歴・候補表示
- 視聴: 独自HTML5プレイヤー（再生/シーク/音量/速度/全画面/字幕/画質、HLSは hls.js、DASHは dash.js、MP4 → DASH → HLS の優先順位で自動切替）、関連動画、お気に入り、再生リスト、履歴、ミニプレイヤー
- チャンネル: アイコン・説明・公開動画一覧・並び替え
- ライブラリ: お気に入り・再生履歴・再生リスト・検索履歴（ブラウザに保存）
- 設定: プレイヤー切替（独自HTML5 / 公式埋め込み）、レイアウト切替、シークレットモード、動画APIの登録・切替・接続チェック

## 技術

Next.js (App Router) + React + TypeScript + Tailwind CSS。サーバー側の Next.js API Routes がサービス層となり、Invidious / Piped のレスポンスを共通モデルに変換します。タイムアウト・AbortController・フォールバック・キャッシュ付きです。

## 開発

```bash
npm install
npm run dev
```

## デプロイ（Vercel）

1. このリポジトリを GitHub に push する
2. Vercel で「Add New Project」→ GitHub リポジトリ `spika0131/mugi-tube` を選択
3. Framework は Next.js が自動検出されます。環境変数は不要です（任意で `INVIDIOUS_ENDPOINTS` / `PIPED_ENDPOINTS` をカンマ区切りで指定できます）
4. Deploy

## 注意

- YouTube Data API v3 のキーは不要です。キーを用意した場合は `lib/api.ts` にアダプターを追加して差し替えできます。
- 公開 Invidious / Piped インスタンスは不安定な場合があります。設定の「動画API」で接続チェックをして、使えるインスタンスを優先してください。自前のインスタンスを立てるのが最も安定します。
- APIの利用規約・著作権・アクセス制御を尊重します。DRM・年齢制限・認証・広告の回避機能は実装していません。

<!-- Git連携テスト: 2026-11-07 23:27 JST、mainへのpushでVercel自動デプロイが走るか確認するための小さな変更です。 -->
