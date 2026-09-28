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

const UNEXPECTED_ERROR_MESSAGE =
  "エラーが発生しました。時間をおいて再度お試しください";

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
      return UNEXPECTED_ERROR_MESSAGE;
  }
}

/**
 * Supabase Auth呼び出しをtry/catchで包み、{success,error}形式に統一する
 * （design.md 13章）。想定外の例外（環境変数不備・通信エラー等）でServer Actionが
 * 例外を投げたままクライアントに伝わってしまうのを防ぐ。
 * 戻り値がnullなら成功（呼び出し側でredirectする）。redirect()はこの関数の外、
 * catchに掛からない場所で呼ぶこと。
 */
async function callSupabaseAuth(
  run: () => Promise<{ error: AuthError | null }>,
): Promise<AuthActionState | null> {
  try {
    const { error } = await run();
    if (error) {
      return { success: false, error: toJapaneseAuthError(error) };
    }
    return null;
  } catch (error) {
    console.error("[auth] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR_MESSAGE };
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

  const failure = await callSupabaseAuth(async () => {
    const supabase = await createClient();
    return supabase.auth.signInWithPassword(parsed.data);
  });
  if (failure) {
    return failure;
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

  const failure = await callSupabaseAuth(async () => {
    const supabase = await createClient();
    return supabase.auth.signUp(parsed.data);
  });
  if (failure) {
    return failure;
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

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const failure = await callSupabaseAuth(async () => {
    const supabase = await createClient();
    return supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl}/auth/confirm?next=/auth/update-password`,
    });
  });
  if (failure) {
    return failure;
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

  const failure = await callSupabaseAuth(async () => {
    const supabase = await createClient();
    return supabase.auth.updateUser({ password: parsed.data.password });
  });
  if (failure) {
    return failure;
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  const failure = await callSupabaseAuth(async () => {
    const supabase = await createClient();
    return supabase.auth.signOut();
  });
  if (failure) {
    redirect("/?error=logout_failed");
  }

  redirect("/auth/login");
}
