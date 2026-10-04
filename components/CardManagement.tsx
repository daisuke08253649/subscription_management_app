"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCard, deleteCard, updateCard } from "@/actions/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/lib/supabase/database.types";

interface CardManagementProps {
  cards: Pick<Tables<"cards">, "id" | "name">[];
}

export function CardManagement({ cards }: CardManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newCardName, setNewCardName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const newCardId = useId();

  function startEdit(card: Pick<Tables<"cards">, "id" | "name">) {
    setError(null);
    setEditingId(card.id);
    setEditingName(card.name);
  }

  function handleRename(cardId: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateCard(cardId, editingName);
      if (!result.success) {
        setError(result.error ?? "名前の変更に失敗しました");
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(cardId: string) {
    if (
      !window.confirm(
        "このカードを削除します。紐づくサブスクの支払いカードは未設定に戻ります。よろしいですか？",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteCard(cardId);
      if (!result.success) {
        setError(result.error ?? "削除に失敗しました");
        return;
      }
      router.refresh();
    });
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCard(newCardName);
      if (!result.success) {
        setError(result.error ?? "作成に失敗しました");
        return;
      }
      setNewCardName("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          登録済みのカードはありません
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center justify-between gap-2 py-2">
              {editingId === card.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={editingName}
                    maxLength={50}
                    onChange={(event) => setEditingName(event.target.value)}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRename(card.id)}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setEditingId(null)}
                  >
                    キャンセル
                  </Button>
                </div>
              ) : (
                <>
                  <span className="truncate">{card.name}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => startEdit(card)}
                    >
                      リネーム
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleDelete(card.id)}
                    >
                      削除
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <Input
          id={newCardId}
          placeholder="新しいカード名"
          maxLength={50}
          value={newCardName}
          onChange={(event) => setNewCardName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={isPending}>
          追加
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
