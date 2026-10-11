import type { NextConfig } from "next";

// Next.jsはインラインスクリプトを出力するため、厳格なscript-srcをいきなり
// 強制すると画面が壊れる。まずクリックジャッキング対策のframe-ancestorsだけを
// 強制し、本体のCSPはReport-Onlyで違反を観測してからnonce方式へ移行する
const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  // `next dev`がAGENTS.mdへバージョン固有の注意書きを自動追記するのを無効化する。
  // AGENTS.mdはClaude Code/Codexの運用ルールを定めた文書であり、Next.js側の
  // 生成物と混在させない
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
