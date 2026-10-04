import { getTodayJST } from "@/lib/date";
import { fetchAllRows } from "@/lib/supabase/paginate";
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
      fetchAllRows((from, to) =>
        supabase
          .from("subscriptions")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("cards")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("payment_history")
          .select("*")
          .order("billed_on", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("notification_logs")
          .select("*")
          .order("sent_at", { ascending: true })
          .range(from, to),
      ),
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
      // settings.notify_emailがnullの場合、design.md 3章によりauth.users.emailが
      // 実際の通知先になる。JSON単体で設定を再現できるよう実効値も含める
      effective_notify_email: settings.data?.notify_email ?? user.email ?? null,
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
