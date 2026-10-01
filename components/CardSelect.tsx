import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { Tables } from "@/lib/supabase/database.types";

interface CardSelectProps {
  cards: Pick<Tables<"cards">, "id" | "name">[];
  defaultValue?: string | null;
}

/**
 * 登録フォーム用のカード選択。既存カードから選ぶのみ（design.md 9章）。
 * 新規作成は設定画面のカード管理UI（T6-1）から行う。
 */
export function CardSelect({ cards, defaultValue }: CardSelectProps) {
  return (
    <NativeSelect
      name="card_id"
      defaultValue={defaultValue ?? ""}
      aria-label="支払いに使っているカード"
    >
      <NativeSelectOption value="">未設定</NativeSelectOption>
      {cards.map((card) => (
        <NativeSelectOption key={card.id} value={card.id}>
          {card.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
