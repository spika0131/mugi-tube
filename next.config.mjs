/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // youtubei.js はサーバー側でのみ使う（バンドルせず node_modules から直接読み込む）
  experimental: { serverComponentsExternalPackages: ['youtubei.js'] },
  // サムネイル配信元への preconnect を Link ヘッダーで送る（初回表示の DNS/TLS 待ちを減らす）
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Link', value: '<https://i.ytimg.com>; rel=preconnect; crossorigin, <https://yt.chocolatemoo53.com>; rel=preconnect' },
      ],
    }];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.ytimg.com' },
      { protocol: 'https', hostname: '**.ggpht.com' },
      { protocol: 'https', hostname: '**.googlevideo.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};
export default nextConfig;
