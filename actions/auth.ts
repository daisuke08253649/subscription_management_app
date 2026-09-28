"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AuthActionState {
  success: boolean;
  error?: string;
}

const emailSchema = z
  .email({ error: "メールアドレスの形式が正しくありません" })
  .min(1, { error: "メールアドレスを入力してください" });

const passwordSchema = z
  .string()
  .min(1, { error: "パスワードを入力してください" });

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const resetRequestSchema = z.object({ email: emailSchema });
const updatePasswordSchema = z.object({ password: passwordSchema });

// design.md 13章: 詳細はconsole.errorでサーバー側のログにのみ残し、
// ユーザーにはSupabaseのAuthErrorを日本語化した一般的なメッセージのみ返す。
// 確認できているerror.codeのみ個別メッセージにし、それ以外は汎用メッセージにフォールバックする。
function toJapaneseAuthError(error: AuthError): string {
  console.error("[auth]", error);
  switch (error.code) {
    case "invalid_credentials":
      return "メールアドレスまたはパスワードが正しくありません";
    case "email_not_confirmed":
      return "メールアドレスの確認が完了していません";
    case "user_already_exists":
    case "email_exists":
      return "このメールアドレスは既に登録されています";
    case "weak_password":
      return "パスワードの強度が不十分です";
    case "same_password":
      return "現在と同じパスワードは設定できません";
    case "over_email_send_rate_limit":
      return "しばらく時間をおいてから再度お試しください";
    default:
      return "エラーが発生しました。時間をおいて再度お試しください";
  }
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { success: false, error: toJapaneseAuthError(error) };
  }

  redirect("/");
}

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    return { success: false, error: toJapaneseAuthError(error) };
  }

  redirect("/");
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${appUrl}/auth/confirm?next=/auth/update-password` },
  );
  if (error) {
    return { success: false, error: toJapaneseAuthError(error) };
  }

  return { success: true };
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { success: false, error: toJapaneseAuthError(error) };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
