import type { NextConfig } from "next";

/**
 * 全ルートに付ける共通のセキュリティヘッダ。
 *
 * CSP は frame-ancestors / base-uri / object-src だけに絞っている。
 * script-src まで制限すると公開サイトの計測タグ（GA・Yahoo・Clarity・Meta Pixel、
 * src/app/(public)/layout.tsx）が全て止まるため、そこは指摘Cとして別途整理する。
 * ここで守るのは主にクリックジャッキング（管理画面・ログイン画面を iframe に嵌める攻撃）。
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
