"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSubscription,
  updateSubscription,
  type SubscriptionActionState,
} from "@/actions/subscriptions";
import { CardSelect } from "@/components/CardSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/lib/supabase/database.types";

type Subscription = Tables<"subscriptions">;

interface SubscriptionFormModalProps {
  open: boolean;
  onClose: () => void;
  cards: Pick<Tables<"cards">, "id" | "name">[];
  subscription?: Subscription;
}

const initialState: SubscriptionActionState = { success: false };

export function SubscriptionFormModal({
  open,
  onClose,
  cards,
  subscription,
}: SubscriptionFormModalProps) {
  const router = useRouter();
  const isEdit = subscription !== undefined;
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateSubscription : createSubscription,
    initialState,
  );
  const [cycle, setCycle] = useState(subscription?.cycle ?? "monthly");

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onClose();
    }
    // onCloseはモーダルの開閉のたびに新しい関数参照になりうるため依存配列に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, router]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "サブスクを編集" : "サブスクを登録"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {isEdit ? (
            <>
              <input type="hidden" name="id" value={subscription.id} />
              <input
                type="hidden"
                name="expected_updated_at"
                value={subscription.updated_at}
              />
            </>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="service_name">サービス名</Label>
            <Input
              id="service_name"
              name="service_name"
              defaultValue={subscription?.service_name}
              required
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">金額（円）</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={1}
                step={1}
                defaultValue={subscription?.amount}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cycle">請求周期</Label>
              <NativeSelect
                id="cycle"
                name="cycle"
                value={cycle}
                onChange={(event) =>
                  setCycle(event.target.value as Subscription["cycle"])
                }
              >
                <NativeSelectOption value="monthly">月額</NativeSelectOption>
                <NativeSelectOption value="yearly">年額</NativeSelectOption>
                <NativeSelectOption value="weekly">週額</NativeSelectOption>
                <NativeSelectOption value="custom_days">
                  カスタム日数
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {cycle === "custom_days" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cycle_days">何日ごと</Label>
              <Input
                id="cycle_days"
                name="cycle_days"
                type="number"
                min={1}
                max={3650}
                step={1}
                defaultValue={subscription?.cycle_days ?? undefined}
                required
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="next_billing_date">次回請求日</Label>
            <Input
              id="next_billing_date"
              name="next_billing_date"
              type="date"
              defaultValue={subscription?.next_billing_date}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>支払いに使っているカード</Label>
            <CardSelect cards={cards} defaultValue={subscription?.card_id} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="memo">メモ</Label>
            <Textarea
              id="memo"
              name="memo"
              maxLength={500}
              defaultValue={subscription?.memo ?? undefined}
            />
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
