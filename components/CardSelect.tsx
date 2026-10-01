"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { Tables } from "@/lib/supabase/database.types";

const CREATE_NEW_VALUE = "__new__";

interface CardSelectProps {
  cards: Pick<Tables<"cards">, "id" | "name">[];
  defaultValue?: string | null;
}

/**
 * 登録フォーム用のカード選択。既存カードから選ぶか、その場で新規作成できる
 * （requirements.md F-1「カードは登録済みのものから選ぶか、新規に作成する」）。
 * 新規作成を選んだ場合はcard_idを空にしてnew_card_nameを送信し、
 * createSubscription/updateSubscription側でカード作成とサブスク登録／更新を
 * 1回の送信でまとめて行う。
 */
export function CardSelect({ cards, defaultValue }: CardSelectProps) {
  const [selection, setSelection] = useState(defaultValue ?? "");
  const newCardNameId = useId();
  const isCreatingNew = selection === CREATE_NEW_VALUE;

  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        aria-label="支払いに使っているカード"
        value={selection}
        onChange={(event) => setSelection(event.target.value)}
      >
        <NativeSelectOption value="">未設定</NativeSelectOption>
        {cards.map((card) => (
          <NativeSelectOption key={card.id} value={card.id}>
            {card.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={CREATE_NEW_VALUE}>
          ＋ 新しいカードを追加
        </NativeSelectOption>
      </NativeSelect>
      <input
        type="hidden"
        name="card_id"
        value={isCreatingNew ? "" : selection}
      />
      {isCreatingNew ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={newCardNameId}>新しいカード名</Label>
          <Input
            id={newCardNameId}
            name="new_card_name"
            maxLength={50}
            required
          />
        </div>
      ) : null}
    </div>
  );
}
