import type { MetadataRoute } from "next";

// design.md 1章: PWAはmanifestのみ（Service Workerは作らない）。
// ホーム画面に追加できるようにすることが目的
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "サブスク管理",
    short_name: "サブスク管理",
    description: "契約中のサブスクを一元管理するアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#171717",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
