"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface SettingsActionState {
  success: boolean;
  error?: string;
}

const UNAUTHORIZED_ERROR = "操作できませんでした";
const UNEXPECTED_ERROR =
  "エラーが発生しました。時間をおいて再度お試しください";

// design.md 12章: notify_emailは任意。未入力時はauth.users.emailを使う
const notifyEmailSchema = z
  .union([
    z.email({ error: "メールアドレスの形式が正しくありません" }),
    z.literal(""),
  ])
  .optional();

// design.md 12章: 0〜365の整数。重複は保存時に除去する
const notifyDaysSchema = z.array(z.coerce.number().int().min(0).max(365));

export interface UpdateSettingsInput {
  notifyEmail: string;
  notifyDays: number[];
}

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<SettingsActionState> {
  const emailParsed = notifyEmailSchema.safeParse(input.notifyEmail);
  if (!emailParsed.success) {
    return { success: false, error: emailParsed.error.issues[0].message };
  }
  const daysParsed = notifyDaysSchema.safeParse(input.notifyDays);
  if (!daysParsed.success) {
    return { success: false, error: "通知日数の指定が正しくありません" };
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
      .from("settings")
      .update({
        notify_email: emailParsed.data ? emailParsed.data : null,
        notify_days: [...new Set(daysParsed.data)].sort((a, b) => a - b),
      })
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) {
      console.error("[settings]", error);
      return { success: false, error: UNEXPECTED_ERROR };
    }

    return { success: true };
  } catch (error) {
    console.error("[settings] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}
