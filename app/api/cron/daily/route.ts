import { carryForwardBilling } from "@/lib/billing";
import { getTodayJST } from "@/lib/date";
import {
  buildNotificationEmail,
  daysBetween,
  dueNotificationKinds,
  sendNotificationEmail,
  type NotificationItem,
} from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * 日次バッチ（design.md 6章）。
 * 1. 繰り越し：期日を過ぎたactiveなサブスクをnext_billing_date >= todayまで進める
 * 2. 通知抽出・送信：ユーザーごとにsettings.notify_daysの各Nを満たす未送信分を
 *    1通のメールに集約して送信
 * Vercel Cronからのみ呼ばれる想定のため、CRON_SECRETで保護する（design.md 5章）
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // CRON_SECRET未設定時、`Bearer ${undefined}` === "Bearer undefined"という
  // 固定文字列と一致してしまうと誰でも叩けてしまうため、未設定なら明示的に拒否する
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = getTodayJST();

    await rolloverOverdueSubscriptions(admin, today);
    await sendDueNotifications(admin, today);

    return new Response("OK", { status: 200 });
  } catch (error) {
    // design.md 13章: バッチ全体が例外で中断しても自分宛のアラートは送らない。
    // 「残りN日以内・未送信」の追いつきロジックにより翌日のバッチが自動的に
    // 取りこぼしを回収するため、単発の失敗は致命的ではない
    console.error("[cron/daily] unexpected error", error);
    return new Response("OK", { status: 200 });
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function rolloverOverdueSubscriptions(
  admin: AdminClient,
  today: string,
) {
  const { data: overdue, error: fetchError } = await fetchAllRows(
    (from, to) =>
      admin
        .from("subscriptions")
        .select("*")
        .eq("status", "active")
        .lt("next_billing_date", today)
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (fetchError) {
    console.error("[cron/daily] failed to fetch overdue subscriptions", fetchError);
    return;
  }

  // サブスク1件ごとにtry/catchし、1件の異常データが他件に影響しないようにする
  // （design.md 13章）
  for (const sub of overdue ?? []) {
    try {
      const result = carryForwardBilling({
        nextBillingDate: sub.next_billing_date,
        billingAnchorDay: sub.billing_anchor_day,
        cycle: sub.cycle,
        cycleDays: sub.cycle_days,
        amount: sub.amount,
        isTrial: sub.is_trial,
        today,
      });

      if (result.billedEvents.length > 0) {
        // onConflict + ignoreDuplicatesでpayment_historyへの書き込みを冪等にする。
        // 前日の実行がpayment_history挿入後・subscriptions更新前に失敗していた
        // 場合、翌日同じbilled_onを再挿入しようとして一意制約違反になり
        // 復旧できなくなるのを防ぐ
        const { error: historyError } = await admin
          .from("payment_history")
          .upsert(
            result.billedEvents.map((event) => ({
              subscription_id: sub.id,
              billed_on: event.billedOn,
              amount: event.amount,
            })),
            { onConflict: "subscription_id,billed_on", ignoreDuplicates: true },
          );
        if (historyError) throw historyError;
      }

      // updated_atで楽観ロックする。fetch後、このupdateまでの間にユーザーが
      // 画面から編集していた場合、ここでの計算は古い値に基づいているため、
      // 新しい編集を上書きしてしまわないよう対象0件（＝並行編集あり）なら
      // 更新せずスキップする（既存のupdateSubscription RPCと同じ考え方）
      const { error: updateError } = await admin
        .from("subscriptions")
        .update({
          next_billing_date: result.nextBillingDate,
          is_trial: result.isTrial,
        })
        .eq("id", sub.id)
        .eq("updated_at", sub.updated_at)
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
    } catch (error) {
      console.error(`[cron/daily] rollover failed for subscription ${sub.id}`, error);
    }
  }
}

interface DueNotification {
  subscription: Tables<"subscriptions">;
  kinds: number[];
  daysRemaining: number;
}

async function sendDueNotifications(admin: AdminClient, today: string) {
  // next_billing_date >= todayのみを対象にする。繰り越し処理が失敗した
  // サブスクはnext_billing_dateが過去日のまま残り、daysRemainingが負の値に
  // なってどのkindの条件も満たしてしまう（「-1日後」のような通知が送られ、
  // 本来の請求日でもないtarget_dateがログに記録されてしまう）ため除外する
  // Data APIは1000行で切り捨てるため、増え続ける可能性のある
  // subscriptions・notification_logsはfetchAllRowsで全件取得する。
  // 切り捨てられると未訪問のサブスクが通知されなかったり、記録済みの
  // ログが「未送信」と誤認されて重複送信されたりする
  const [subscriptionsResult, settingsResult, logsResult] = await Promise.all([
    fetchAllRows((from, to) =>
      admin
        .from("subscriptions")
        .select("*")
        .eq("status", "active")
        .gte("next_billing_date", today)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin
        .from("settings")
        .select("*")
        .order("user_id", { ascending: true })
        .range(from, to),
    ),
    // 現在のサイクルのtarget_dateは必ず今日以降。過去サイクルのログは
    // 判定に不要なので除外して件数を抑える
    fetchAllRows((from, to) =>
      admin
        .from("notification_logs")
        .select("subscription_id, target_date, kind")
        .gte("target_date", today)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (
    subscriptionsResult.error ||
    settingsResult.error ||
    logsResult.error ||
    !settingsResult.data ||
    !subscriptionsResult.data ||
    !logsResult.data
  ) {
    console.error(
      "[cron/daily] failed to fetch data for notifications",
      subscriptionsResult.error,
      settingsResult.error,
      logsResult.error,
    );
    return;
  }

  const settingsByUser = new Map(
    settingsResult.data.map((s) => [s.user_id, s]),
  );
  const sentKindsByKey = new Map<string, number[]>();
  for (const log of logsResult.data) {
    const key = `${log.subscription_id}:${log.target_date}`;
    const existing = sentKindsByKey.get(key) ?? [];
    existing.push(log.kind);
    sentKindsByKey.set(key, existing);
  }

  const dueByUser = new Map<string, DueNotification[]>();
  for (const sub of subscriptionsResult.data) {
    const notifyDays = settingsByUser.get(sub.user_id)?.notify_days ?? [];
    if (notifyDays.length === 0) continue;

    const key = `${sub.id}:${sub.next_billing_date}`;
    const kinds = dueNotificationKinds({
      nextBillingDate: sub.next_billing_date,
      notifyDays,
      sentKinds: sentKindsByKey.get(key) ?? [],
      today,
    });
    if (kinds.length === 0) continue;

    const list = dueByUser.get(sub.user_id) ?? [];
    list.push({
      subscription: sub,
      kinds,
      daysRemaining: daysBetween(today, sub.next_billing_date),
    });
    dueByUser.set(sub.user_id, list);
  }

  if (dueByUser.size === 0) return;

  // APP_URLが未設定のままlocalhostにフォールバックすると、本番で届く
  // メールのリンクが誰にも開けないものになってしまう（design.md 10章の
  // 環境変数一覧に必須項目として明記）。送信してしまうと「送信済み」として
  // 記録され翌日の追いつきでも直らないため、未設定時は送信自体をスキップする
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error("[cron/daily] APP_URL is not set, skipping notifications");
    return;
  }

  for (const [userId, items] of dueByUser) {
    try {
      const email = await resolveNotifyEmail(admin, userId, settingsByUser);
      if (!email) continue;

      const notificationItems: NotificationItem[] = items.map((item) => ({
        serviceName: item.subscription.service_name,
        amount: item.subscription.amount,
        billingDate: item.subscription.next_billing_date,
        daysRemaining: item.daysRemaining,
        cancelUrl: item.subscription.cancel_url,
      }));

      const content = buildNotificationEmail(notificationItems, appUrl);
      const sendResult = await sendNotificationEmail(email, content);

      // design.md 13章: 送信成功時のみ記録する。失敗時は翌日のバッチが
      // 「未送信」として自動的に再送を試みる
      if (sendResult.success) {
        const logRows = items.flatMap((item) =>
          item.kinds.map((kind) => ({
            subscription_id: item.subscription.id,
            target_date: item.subscription.next_billing_date,
            kind,
          })),
        );
        const { error: logError } = await admin
          .from("notification_logs")
          .insert(logRows);
        if (logError) {
          console.error(
            `[cron/daily] failed to record notification_logs for user ${userId}`,
            logError,
          );
        }
      }
    } catch (error) {
      console.error(`[cron/daily] notification failed for user ${userId}`, error);
    }
  }
}

async function resolveNotifyEmail(
  admin: AdminClient,
  userId: string,
  settingsByUser: Map<string, Tables<"settings">>,
): Promise<string | null> {
  const notifyEmail = settingsByUser.get(userId)?.notify_email;
  if (notifyEmail) return notifyEmail;

  // design.md 3章: 通知先メールの既定はauth.users.email
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    console.error(`[cron/daily] could not resolve email for user ${userId}`, error);
    return null;
  }
  return data.user.email;
}
