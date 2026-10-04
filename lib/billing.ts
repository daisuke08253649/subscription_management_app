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
 * 請求周期の違いを正規化し、月額換算額（丸め前）を返す。
 * 換算ルールはdesign.md 4章の表に基づく。
 */
function rawMonthlyEquivalent({ amount, cycle, cycleDays }: BillingInput): number {
  switch (cycle) {
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
    case "weekly":
      return (amount * 52) / 12;
    case "custom_days":
      if (!cycleDays || cycleDays <= 0) {
        throw new Error("custom_daysの場合はcycleDaysが1以上の整数で必要です");
      }
      return (amount * 365) / cycleDays / 12;
  }
}

/**
 * 請求周期の違いを正規化し、月額換算額（四捨五入済み）を返す。
 * DBには換算値を保存しない。
 */
export function calculateMonthlyAmount(input: BillingInput): number {
  return Math.round(rawMonthlyEquivalent(input));
}

export interface SubscriptionTotals {
  monthlyTotal: number;
  yearlyTotal: number;
}

/**
 * 契約中サブスク一覧から月額換算合計・年間総額を出す（design.md 4章・F-3）。
 * 端数は表示時に四捨五入する方針（design.md）のため、月額・年額それぞれを
 * 丸め前の値から独立して合算・丸めする。月額換算を個別に丸めてから12倍すると、
 * 例えば年額5,900円のサブスクが「月額492円×12=5,904円」という実際の支払額と
 * ずれた年間総額になってしまうため
 */
export function calculateTotals(
  subscriptions: BillingInput[],
): SubscriptionTotals {
  const monthlyTotal = Math.round(
    subscriptions.reduce((sum, sub) => sum + rawMonthlyEquivalent(sub), 0),
  );
  const yearlyTotal = Math.round(
    subscriptions.reduce((sum, sub) => sum + rawMonthlyEquivalent(sub) * 12, 0),
  );
  return { monthlyTotal, yearlyTotal };
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

export interface MonthlyPayment {
  /** YYYY-MM */
  month: string;
  total: number;
}

/**
 * payment_historyをbilled_onの年月で集計する（design.md 8章）。
 * 最初の請求月から現在月まで、請求の無い月も0円で埋めて連続した月軸にする。
 * 履歴が無ければ空配列を返す
 */
export function aggregateMonthlyPayments(
  rows: { billed_on: string; amount: number }[],
  currentMonth: string,
): MonthlyPayment[] {
  if (rows.length === 0) return [];

  const totals = new Map<string, number>();
  for (const row of rows) {
    const month = row.billed_on.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + row.amount);
  }

  const months = [...totals.keys()].sort();
  const first = months[0];
  const last = months[months.length - 1] > currentMonth ? months[months.length - 1] : currentMonth;

  const result: MonthlyPayment[] = [];
  let [year, month] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    result.push({ month: key, total: totals.get(key) ?? 0 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}
