import { getTodayJST } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

/**
 * 全データをJSON（全項目）で書き出す（requirements.md F-7, M-1）。
 * RLSスコープのクライアントを使うため、各テーブルへの単純なselect("*")で
 * 自ユーザーの行のみが返る（payment_history/notification_logsはuser_id
 * カラムを持たないが、RLSポリシーがsubscriptions経由で判定する）。
 * design.md 5章: Cookieセッションを検証し、未ログイン時は401を返す
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [subscriptions, cards, paymentHistory, notificationLogs, settings] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase.from("cards").select("*").order("created_at", {
        ascending: true,
      }),
      supabase
        .from("payment_history")
        .select("*")
        .order("billed_on", { ascending: true }),
      supabase
        .from("notification_logs")
        .select("*")
        .order("sent_at", { ascending: true }),
      supabase.from("settings").select("*").maybeSingle(),
    ]);

  const queryError =
    subscriptions.error ||
    cards.error ||
    paymentHistory.error ||
    notificationLogs.error ||
    settings.error;
  if (queryError) {
    console.error("[export/json]", queryError);
    return new Response("Internal Server Error", { status: 500 });
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      subscriptions: subscriptions.data,
      cards: cards.data,
      payment_history: paymentHistory.data,
      notification_logs: notificationLogs.data,
      settings: settings.data,
    },
    null,
    2,
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscriptions_${getTodayJST()}.json"`,
    },
  });
}
