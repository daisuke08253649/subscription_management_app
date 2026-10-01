"use client";

import { useState } from "react";
import { logout } from "@/actions/auth";
import {
  SubscriptionList,
  type SubscriptionWithCard,
} from "@/components/SubscriptionList";
import { SubscriptionFormModal } from "@/components/SubscriptionFormModal";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/lib/supabase/database.types";

interface SubscriptionsPageProps {
  subscriptions: SubscriptionWithCard[];
  cards: Pick<Tables<"cards">, "id" | "name">[];
  userEmail?: string;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; subscription: SubscriptionWithCard };

export function SubscriptionsPage({
  subscriptions,
  cards,
  userEmail,
}: SubscriptionsPageProps) {
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-lg font-medium">サブスク管理</h1>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            ログアウト
          </Button>
        </form>
      </header>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          契約中のサブスク（次回請求日順）
        </h2>
        <Button
          type="button"
          size="sm"
          onClick={() => setModal({ mode: "create" })}
        >
          追加
        </Button>
      </div>

      <SubscriptionList
        subscriptions={subscriptions}
        onEdit={(subscription) => setModal({ mode: "edit", subscription })}
      />

      <SubscriptionFormModal
        key={modal.mode === "edit" ? modal.subscription.id : "new"}
        open={modal.mode !== "closed"}
        onClose={() => setModal({ mode: "closed" })}
        cards={cards}
        subscription={modal.mode === "edit" ? modal.subscription : undefined}
      />
    </div>
  );
}
