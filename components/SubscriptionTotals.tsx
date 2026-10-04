interface SubscriptionTotalsProps {
  monthlyTotal: number;
  yearlyTotal: number;
}

/**
 * 契約中サブスクの月額換算合計・年間総額を併記する（requirements.md F-3）
 */
export function SubscriptionTotals({
  monthlyTotal,
  yearlyTotal,
}: SubscriptionTotalsProps) {
  return (
    <div className="flex gap-8 rounded-xl p-4 ring-1 ring-foreground/10">
      <div>
        <p className="text-sm text-muted-foreground">月額換算合計</p>
        <p className="text-xl font-medium tabular-nums">
          {monthlyTotal.toLocaleString("ja-JP")}円
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">年間総額</p>
        <p className="text-xl font-medium tabular-nums">
          {yearlyTotal.toLocaleString("ja-JP")}円
        </p>
      </div>
    </div>
  );
}
