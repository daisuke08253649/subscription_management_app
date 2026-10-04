"use client";

import { useState } from "react";
import Link from "next/link";
import { logout } from "@/actions/auth";
import {
  SubscriptionList,
  type SubscriptionWithCard,
} from "@/components/SubscriptionList";
import { SubscriptionFormModal } from "@/components/SubscriptionFormModal";
import { SubscriptionTotals } from "@/components/SubscriptionTotals";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/lib/supabase/database.types";

interface SubscriptionsPageProps {
  subscriptions: SubscriptionWithCard[];
  cards: Pick<Tables<"cards">, "id" | "name">[];
  userEmail?: string;
  monthlyTotal: number;
  yearlyTotal: number;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; subscription: SubscriptionWithCard };

export function SubscriptionsPage({
  subscriptions,
  cards,
  userEmail,
  monthlyTotal,
  yearlyTotal,
}: SubscriptionsPageProps) {
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  // モーダルを開くたびに増やし、SubscriptionFormModalのkeyに使う。
  // create時のkeyが常に"new"固定だと、1回目の登録成功でuseActionStateの
  // state.successがtrueのまま残り、2回目の登録成功時にuseEffectの依存配列
  // （state.success）が変化せず発火しない（モーダルが閉じず一覧も更新されない）
  // バグがあったため、開くたびに必ず再マウントさせてstateをリセットする
  const [formSessionId, setFormSessionId] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg font-medium">サブスク管理</h1>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">設定</Link>
          </Button>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              ログアウト
            </Button>
          </form>
        </div>
      </header>

      <SubscriptionTotals monthlyTotal={monthlyTotal} yearlyTotal={yearlyTotal} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          契約中のサブスク（次回請求日順）
        </h2>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setFormSessionId((id) => id + 1);
            setModal({ mode: "create" });
          }}
        >
          追加
        </Button>
      </div>

      <SubscriptionList
        subscriptions={subscriptions}
        onEdit={(subscription) => {
          setFormSessionId((id) => id + 1);
          setModal({ mode: "edit", subscription });
        }}
      />

      <SubscriptionFormModal
        key={formSessionId}
        open={modal.mode !== "closed"}
        onClose={() => setModal({ mode: "closed" })}
        cards={cards}
        subscription={modal.mode === "edit" ? modal.subscription : undefined}
      />
    </div>
  );
}
