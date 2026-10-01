"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface SubscriptionActionState {
  success: boolean;
  error?: string;
}

const UNAUTHORIZED_ERROR = "操作できませんでした";
const UNEXPECTED_ERROR =
  "エラーが発生しました。時間をおいて再度お試しください";

function emptyToUndefined(
  value: FormDataEntryValue | null,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const subscriptionIdSchema = z.uuid({ error: "不正なIDです" });

const cycleSchema = z.enum(["monthly", "yearly", "weekly", "custom_days"], {
  error: "請求周期を選択してください",
});

const cancelUrlSchema = z
  .url({ error: "URLの形式が正しくありません" })
  .refine(
    (val) => val.startsWith("http://") || val.startsWith("https://"),
    { message: "http://またはhttps://で始まるURLを入力してください" },
  );

// design.md 12章のバリデーション仕様
const subscriptionInputSchema = z
  .object({
    service_name: z
      .string()
      .trim()
      .min(1, { error: "サービス名を入力してください" })
      .max(100, { error: "サービス名は100文字以内で入力してください" }),
    amount: z.coerce
      .number({ error: "金額を入力してください" })
      .int({ error: "金額は整数で入力してください" })
      .min(1, { error: "金額は1円以上で入力してください" }),
    cycle: cycleSchema,
    cycle_days: z.coerce
      .number()
      .int({ error: "日数は整数で入力してください" })
      .min(1, { error: "日数は1〜3650の範囲で入力してください" })
      .max(3650, { error: "日数は1〜3650の範囲で入力してください" })
      .optional(),
    next_billing_date: z.iso.date({ error: "有効な日付を入力してください" }),
    is_trial: z.boolean(),
    card_id: z.uuid({ error: "不正なカードです" }).optional(),
    cancel_url: cancelUrlSchema.optional(),
    memo: z
      .string()
      .max(500, { error: "メモは500文字以内で入力してください" })
      .optional(),
  })
  .refine(
    (data) =>
      data.cycle === "custom_days"
        ? data.cycle_days !== undefined
        : data.cycle_days === undefined,
    {
      message: "周期が「カスタム日数」の場合は日数を入力してください",
      path: ["cycle_days"],
    },
  );

function parseSubscriptionFormData(formData: FormData) {
  return subscriptionInputSchema.safeParse({
    service_name: formData.get("service_name"),
    amount: emptyToUndefined(formData.get("amount")),
    cycle: formData.get("cycle"),
    cycle_days: emptyToUndefined(formData.get("cycle_days")),
    next_billing_date: formData.get("next_billing_date"),
    is_trial: formData.get("is_trial") === "on",
    card_id: emptyToUndefined(formData.get("card_id")),
    cancel_url: emptyToUndefined(formData.get("cancel_url")),
    memo: emptyToUndefined(formData.get("memo")),
  });
}

// billing_anchor_dayはユーザー入力欄を設けず、next_billing_dateの「日」から
// サーバー側で自動算出する（design.md 12章）
function billingAnchorDayFrom(nextBillingDate: string): number {
  return Number(nextBillingDate.split("-")[2]);
}

function toSubscriptionError(error: { code?: string; message: string }) {
  console.error("[subscriptions]", error);
  if (error.code === "P0001") {
    // 他ユーザーのcard_idを指すトリガー違反（lib/supabase migration参照）。
    // 通常のUI操作では発生しない想定のため認可エラー扱いにする
    return UNAUTHORIZED_ERROR;
  }
  return UNEXPECTED_ERROR;
}

export async function createSubscription(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const parsed = parseSubscriptionFormData(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: UNAUTHORIZED_ERROR };
  }

  const { error } = await supabase.from("subscriptions").insert({
    user_id: user.id,
    service_name: input.service_name,
    amount: input.amount,
    cycle: input.cycle,
    cycle_days: input.cycle_days ?? null,
    next_billing_date: input.next_billing_date,
    billing_anchor_day: billingAnchorDayFrom(input.next_billing_date),
    is_trial: input.is_trial,
    card_id: input.card_id ?? null,
    cancel_url: input.cancel_url ?? null,
    memo: input.memo ?? null,
  });
  if (error) {
    return { success: false, error: toSubscriptionError(error) };
  }

  return { success: true };
}

export async function updateSubscription(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  const parsed = parseSubscriptionFormData(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      service_name: input.service_name,
      amount: input.amount,
      cycle: input.cycle,
      cycle_days: input.cycle_days ?? null,
      next_billing_date: input.next_billing_date,
      billing_anchor_day: billingAnchorDayFrom(input.next_billing_date),
      is_trial: input.is_trial,
      card_id: input.card_id ?? null,
      cancel_url: input.cancel_url ?? null,
      memo: input.memo ?? null,
    })
    .eq("id", idParsed.data)
    .select()
    .single();
  if (error) {
    return { success: false, error: toSubscriptionError(error) };
  }

  return { success: true };
}

export async function deleteSubscription(
  id: string,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", idParsed.data)
    .select()
    .single();
  if (error) {
    return { success: false, error: toSubscriptionError(error) };
  }

  return { success: true };
}

export async function cancelSubscription(
  id: string,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("id", idParsed.data)
    .select()
    .single();
  if (error) {
    return { success: false, error: toSubscriptionError(error) };
  }

  return { success: true };
}
