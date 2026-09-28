import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // `next dev`がAGENTS.mdへバージョン固有の注意書きを自動追記するのを無効化する。
  // AGENTS.mdはClaude Code/Codexの運用ルールを定めた文書であり、Next.js側の
  // 生成物と混在させない
  agentRules: false,
};

export default nextConfig;
