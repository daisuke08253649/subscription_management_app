import { getTodayJST } from "@/lib/date";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

const HEADERS = [
  "サービス名",
  "金額",
  "請求周期",
  "日数（カスタム周期のみ）",
  "次回請求日",
  "トライアル中",
  "支払いカード",
  "解約ページURL",
  "ステータス",
  "メモ",
  "登録日",
];

function cycleLabel(sub: Pick<Tables<"subscriptions">, "cycle">): string {
  switch (sub.cycle) {
    case "monthly":
      return "月額";
    case "yearly":
      return "年額";
    case "weekly":
      return "週額";
    case "custom_days":
      return "カスタム日数";
  }
}

function statusLabel(status: Tables<"subscriptions">["status"]): string {
  return status === "active" ? "契約中" : "解約済み";
}

// =, +, -, @で始まる値はExcel等で数式として解釈されうる（CSVインジェクション）。
// 先頭にシングルクォートを付与し、文字列として開かれるようにする
// https://community.owasp.org/attacks/CSV_Injection
function neutralizeFormula(text: string): string {
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

// カンマ・改行・ダブルクォートを含む場合のみクォートする（表計算ソフト向けCSV）
function csvField(value: string | number | null): string {
  const text = neutralizeFormula(value === null ? "" : String(value));
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 表計算用にCSVで書き出す（requirements.md F-7）。全項目を網羅するJSONとは
 * 異なり、人が開いて見る用途のため読みやすい形（カード名を解決、周期・
 * ステータスを日本語ラベル化）にする。design.md 5章: 未ログイン時は401
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: subscriptions, error } = await fetchAllRows((from, to) =>
    supabase
      .from("subscriptions")
      .select("*, cards(name)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error || !subscriptions) {
    console.error("[export/csv]", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  const rows = subscriptions.map((sub) =>
    [
      csvField(sub.service_name),
      csvField(sub.amount),
      csvField(cycleLabel(sub)),
      csvField(sub.cycle === "custom_days" ? sub.cycle_days : null),
      csvField(sub.next_billing_date),
      csvField(sub.is_trial ? "はい" : "いいえ"),
      csvField(sub.cards?.name ?? null),
      csvField(sub.cancel_url),
      csvField(statusLabel(sub.status)),
      csvField(sub.memo),
      csvField(sub.created_at),
    ].join(","),
  );

  // Excelでの文字化けを防ぐためUTF-8 BOMを付与する
  const body = "﻿" + [HEADERS.join(","), ...rows].join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions_${getTodayJST()}.csv"`,
    },
  });
}
