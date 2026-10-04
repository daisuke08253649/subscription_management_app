import {
  addDays,
  addMonths,
  addYears,
  getDaysInMonth,
  setDate,
  startOfMonth,
} from "date-fns";

export type BillingCycle = "monthly" | "yearly" | "weekly" | "custom_days";

export interface BillingInput {
  amount: number;
  cycle: BillingCycle;
  cycleDays?: number | null;
}

/**
 * 請求周期の違いを正規化し、月額換算額（四捨五入済み）を返す。
 * 換算ルールはdesign.md 4章の表に基づく。DBには換算値を保存しない。
 */
export function calculateMonthlyAmount({
  amount,
  cycle,
  cycleDays,
}: BillingInput): number {
  switch (cycle) {
    case "monthly":
      return amount;
    case "yearly":
      return Math.round(amount / 12);
    case "weekly":
      return Math.round((amount * 52) / 12);
    case "custom_days":
      if (!cycleDays || cycleDays <= 0) {
        throw new Error("custom_daysの場合はcycleDaysが1以上の整数で必要です");
      }
      return Math.round((amount * 365) / cycleDays / 12);
  }
}

export interface SubscriptionTotals {
  monthlyTotal: number;
  yearlyTotal: number;
}

/**
 * 契約中サブスク一覧から月額換算合計・年間総額を出す（design.md 4章・F-3）。
 * 年間総額は月額換算合計の12倍とする（各サブスクのyearly換算を個別に
 * 丸めて合算すると、画面に表示される「月額合計×12」と一致しなくなるため）
 */
export function calculateTotals(
  subscriptions: BillingInput[],
): SubscriptionTotals {
  const monthlyTotal = subscriptions.reduce(
    (sum, sub) => sum + calculateMonthlyAmount(sub),
    0,
  );
  return {
    monthlyTotal,
    yearlyTotal: monthlyTotal * 12,
  };
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 「翌月のbilling_anchor_day（月末は丸める）」を返す。
 * addMonthsを前回の繰り越し結果（既に月末丸めされている場合がある）に
 * 繰り返し適用すると、丸められた日がそのまま基準になってしまい
 * 1/31→2/28→3/28という誤りを生む（design.md 6章）。
 * 必ずanchorDayを基準に毎回計算し直すことで1/31→2/28→3/31を実現する。
 */
function advanceMonthlyByAnchor(current: Date, anchorDay: number): Date {
  const nextMonthStart = addMonths(startOfMonth(current), 1);
  const daysInNextMonth = getDaysInMonth(nextMonthStart);
  return setDate(nextMonthStart, Math.min(anchorDay, daysInNextMonth));
}

function advanceOnce(
  current: Date,
  cycle: BillingCycle,
  billingAnchorDay: number,
  cycleDays: number | null | undefined,
): Date {
  switch (cycle) {
    case "monthly":
      return advanceMonthlyByAnchor(current, billingAnchorDay);
    case "yearly":
      // 自前のうるう年計算はしない。日付ライブラリに委任する（design.md 6章）
      return addYears(current, 1);
    case "weekly":
      return addDays(current, 7);
    case "custom_days":
      if (!cycleDays || cycleDays <= 0) {
        throw new Error("custom_daysの場合はcycleDaysが1以上の整数で必要です");
      }
      return addDays(current, cycleDays);
  }
}

export interface CarryForwardInput {
  /** 現在のnext_billing_date（YYYY-MM-DD） */
  nextBillingDate: string;
  /** 1〜31。monthly周期の繰り越し計算の基準日 */
  billingAnchorDay: number;
  cycle: BillingCycle;
  cycleDays?: number | null;
  amount: number;
  isTrial: boolean;
  /** JSTの今日（YYYY-MM-DD）。lib/date.tsのgetTodayJST()の戻り値を渡す */
  today: string;
}

export interface BilledEvent {
  billedOn: string;
  amount: number;
}

export interface CarryForwardResult {
  nextBillingDate: string;
  isTrial: boolean;
  /** 今回の繰り越しでpayment_historyに追加すべき行（0件のこともある） */
  billedEvents: BilledEvent[];
}

/**
 * 請求日を過ぎたサブスクを、next_billing_date >= todayになるまで
 * 1周期ずつ冪等に進める（design.md 6章）。
 * 繰り越しは請求日の翌日に行う方針のため、next_billing_date === todayでは進めない。
 * DBへの書き込み（payment_history・subscriptionsの更新）はこの関数の責務外。
 * 呼び出し側（日次バッチ）がbilledEventsを元に行う。
 */
export function carryForwardBilling({
  nextBillingDate,
  billingAnchorDay,
  cycle,
  cycleDays,
  amount,
  isTrial,
  today,
}: CarryForwardInput): CarryForwardResult {
  const todayDate = parseDateOnly(today);
  let currentDate = parseDateOnly(nextBillingDate);
  const billedEvents: BilledEvent[] = [];
  let nextIsTrial = isTrial;

  while (currentDate < todayDate) {
    billedEvents.push({ billedOn: formatDateOnly(currentDate), amount });
    // 繰り越しが発生した = 初回請求が発生した = トライアル終了（design.md 6章）
    nextIsTrial = false;
    currentDate = advanceOnce(currentDate, cycle, billingAnchorDay, cycleDays);
  }

  return {
    nextBillingDate: formatDateOnly(currentDate),
    isTrial: nextIsTrial,
    billedEvents,
  };
}
