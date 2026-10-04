import { Resend } from "resend";

export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export interface DueNotificationInput {
  /** YYYY-MM-DD。日次バッチの繰り越し処理後の値（必ず今日以降） */
  nextBillingDate: string;
  notifyDays: number[];
  /** このサブスク・このnext_billing_dateに対して既にnotification_logsに
   * 記録済みのkind一覧 */
  sentKinds: number[];
  /** YYYY-MM-DD。lib/date.tsのgetTodayJST()の戻り値 */
  today: string;
}

/**
 * 1件のサブスクについて、今日新たに通知すべきkind（何日前か）の一覧を返す。
 * design.md 6章: 「残りN日以内」で未送信のものを抽出する（「ちょうどN日前」では
 * ない。バッチが数日停止しても翌日以降のバッチが自動的に追いつけるようにするため）
 *
 * design.md 6章「通知日数の設定変更時の挙動」: 通知日数を増やしても、既に近い
 * サブスクの過去分は送り直さず次の請求サイクルから適用する。この今回のサイクルで
 * 既により小さいkind（＝より請求日に近いタイミング）が送信済みなら、それより
 * 大きいkindは「後から追加された、このサイクルでは手遅れの設定」とみなし送らない
 * （バッチ停止からの追いつきなら、まだどのkindも送信されていないはずなので
 * この条件には引っかからない）
 */
export function dueNotificationKinds({
  nextBillingDate,
  notifyDays,
  sentKinds,
  today,
}: DueNotificationInput): number[] {
  const daysRemaining = daysBetween(today, nextBillingDate);
  const sent = new Set(sentKinds);
  const smallestSent = sentKinds.length > 0 ? Math.min(...sentKinds) : null;
  return [...new Set(notifyDays)]
    .filter(
      (n) =>
        daysRemaining <= n &&
        !sent.has(n) &&
        (smallestSent === null || n <= smallestSent),
    )
    .sort((a, b) => a - b);
}

export interface NotificationItem {
  serviceName: string;
  amount: number;
  /** YYYY-MM-DD。design.md 7章「本文にサービス名／金額／請求日」の請求日 */
  billingDate: string;
  /** 実際の残り日数。通知の根拠になったkind（しきい値）ではなく実態を見せる。
   * バッチの追いつき時にkindと実際の残り日数がずれることがあるため */
  daysRemaining: number;
  cancelUrl: string | null;
}

function formatBillingDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export interface NotificationEmailContent {
  subject: string;
  text: string;
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

/**
 * 通知メールの件名・本文を組み立てる（design.md 7章）。
 * 同日に複数件あれば1通に集約する
 */
export function buildNotificationEmail(
  items: NotificationItem[],
  appUrl: string,
): NotificationEmailContent {
  if (items.length === 0) {
    throw new Error("items must not be empty");
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  // 複数件をまとめて送る場合でも、各件のdaysRemainingが必ず同じとは限らない
  // （異なるサブスクがたまたま同日に該当した場合など）。全件が同じ日数の
  // ときだけdesign.md 7章の「N日後に」形式を使い、そうでなければ1件分の
  // 日数を全件の日数であるかのように誤って示さない表現にする
  const daysRemainingValues = new Set(items.map((item) => item.daysRemaining));
  const subject =
    items.length === 1
      ? `【サブスク】${items[0].daysRemaining}日後に ${items[0].serviceName} ${formatYen(items[0].amount)} の請求があります`
      : daysRemainingValues.size === 1
        ? `【サブスク】${items[0].daysRemaining}日後に${items.length}件の請求があります（計 ${formatYen(totalAmount)}）`
        : `【サブスク】直近${items.length}件の請求予定があります（計 ${formatYen(totalAmount)}）`;

  const lines = items.map((item) => {
    const base = `・${item.serviceName}　${formatYen(item.amount)}（${formatBillingDate(item.billingDate)}・${item.daysRemaining}日後）`;
    return item.cancelUrl
      ? `${base}\n  解約ページ: ${item.cancelUrl}`
      : base;
  });

  // design.md 7章: 合計金額はメールに載せない（把握したくなればアプリを開く動線を残す）
  const text = [
    "以下のサブスクの請求が近づいています。",
    "",
    ...lines,
    "",
    `アプリで確認する: ${appUrl}`,
  ].join("\n");

  return { subject, text };
}

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Resendでメールを送信する。design.md 13章: 送信失敗時はnotification_logsに
 * 記録しない（呼び出し側の責務）ことで、翌日のバッチが自動的に再送を試みる
 */
export async function sendNotificationEmail(
  to: string,
  content: NotificationEmailContent,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error(
      "[notifications] RESEND_API_KEY or RESEND_FROM_EMAIL is not set",
    );
    return { success: false, error: "not configured" };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: content.subject,
    text: content.text,
  });
  if (error) {
    console.error("[notifications] failed to send", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
