"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSubscription, deleteSubscription } from "@/actions/subscriptions";
import { Button } from "@/components/ui/button";
import { getTodayJST } from "@/lib/date";
import type { Tables } from "@/lib/supabase/database.types";

export type SubscriptionWithCard = Tables<"subscriptions"> & {
  cards: Pick<Tables<"cards">, "id" | "name"> | null;
};

interface SubscriptionListProps {
  subscriptions: SubscriptionWithCard[];
  onEdit: (subscription: SubscriptionWithCard) => void;
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

function formatBillingDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  // custom_daysは最大3650日（約10年）先まで許容するため、年が今年と異なる
  // 場合は年も表示しないと「1月1日」が2027年か2028年か区別できなくなる
  const currentYear = getTodayJST().split("-")[0];
  const yearPrefix = year === currentYear ? "" : `${Number(year)}年`;
  return `${yearPrefix}${Number(month)}月${Number(day)}日`;
}

function formatCycle(sub: Pick<Tables<"subscriptions">, "cycle" | "cycle_days">): string {
  switch (sub.cycle) {
    case "monthly":
      return "月額";
    case "yearly":
      return "年額";
    case "weekly":
      return "週額";
    case "custom_days":
      return `${sub.cycle_days}日ごと`;
  }
}

export function SubscriptionList({
  subscriptions,
  onEdit,
}: SubscriptionListProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (subscriptions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        登録中のサブスクはありません
      </p>
    );
  }

  function handleCancel(id: string) {
    // 解約すると一覧（status=activeのみ表示）から消え、現時点では復元UIも
    // 無いため、誤操作での解約を防ぐ確認を挟む
    if (!window.confirm("このサブスクを解約します。よろしいですか？")) {
      return;
    }
    startTransition(async () => {
      const result = await cancelSubscription(id);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("このサブスクを削除します。よろしいですか？")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteSubscription(id);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-border">
      {subscriptions.map((sub) => (
        <li key={sub.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{sub.service_name}</p>
            <p className="text-sm text-muted-foreground">
              {formatCycle(sub)}・次回請求 {formatBillingDate(sub.next_billing_date)}
              {sub.cards ? `・${sub.cards.name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <p className="tabular-nums">{formatYen(sub.amount)}</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => onEdit(sub)}
              >
                編集
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleCancel(sub.id)}
              >
                解約
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleDelete(sub.id)}
              >
                削除
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
