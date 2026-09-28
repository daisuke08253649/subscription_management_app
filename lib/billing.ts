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
