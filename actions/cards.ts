"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface CardActionState {
  success: boolean;
  error?: string;
}

const UNAUTHORIZED_ERROR = "操作できませんでした";
const UNEXPECTED_ERROR =
  "エラーが発生しました。時間をおいて再度お試しください";

// design.md 12章: カード名は必須・1〜50文字
const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "カード名を入力してください" })
  .max(50, { error: "カード名は50文字以内で入力してください" });

// Server Actionsは直接呼び出せてしまうため、id自体もここで検証する
// （design.md 12章）。未検証のままPostgresへ渡すと22P02（不正なUUID形式）に
// なってしまう
const cardIdSchema = z.uuid({ error: "不正なカードです" });

// design.md 13章: DB制約違反は意味のあるメッセージに変換して返す
function toCardError(error: { code?: string; message: string }): string {
  console.error("[cards]", error);
  if (error.code === "23505") {
    return "同じ名前のカードが既にあります";
  }
  if (error.code === "PGRST116") {
    return "カードが見つかりませんでした";
  }
  return UNEXPECTED_ERROR;
}

export async function createCard(name: string): Promise<CardActionState> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: UNAUTHORIZED_ERROR };
    }

    const { error } = await supabase
      .from("cards")
      .insert({ user_id: user.id, name: parsed.data });
    if (error) {
      return { success: false, error: toCardError(error) };
    }

    return { success: true };
  } catch (error) {
    console.error("[cards] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function updateCard(
  cardId: string,
  name: string,
): Promise<CardActionState> {
  const idParsed = cardIdSchema.safeParse(cardId);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0].message };
  }
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const supabase = await createClient();
    // .select().single()を付けないと、RLSで対象0件（他人のcard_idや不正なid）でも
    // エラーにならず更新できたかのように見えてしまう（PostgRESTの既知の挙動）
    const { error } = await supabase
      .from("cards")
      .update({ name: parsed.data })
      .eq("id", idParsed.data)
      .select()
      .single();
    if (error) {
      return { success: false, error: toCardError(error) };
    }

    return { success: true };
  } catch (error) {
    console.error("[cards] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function deleteCard(cardId: string): Promise<CardActionState> {
  const idParsed = cardIdSchema.safeParse(cardId);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0].message };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("cards")
      .delete()
      .eq("id", idParsed.data)
      .select()
      .single();
    if (error) {
      return { success: false, error: toCardError(error) };
    }

    return { success: true };
  } catch (error) {
    console.error("[cards] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}
