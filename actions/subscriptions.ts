"use server";

import { z } from "zod";
import { getTodayJST } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// supabase gen typesはPostgres関数引数のNULL許容性を生成しない（既知の制限）ため、
// 実際にはnullを受け付けるのに生成された型はnon-nullになる。生成型の不正確さを
// 補正するためだけに使う（anyは使わない）
type CreateSubscriptionArgs =
  Database["public"]["Functions"]["create_subscription_with_card"]["Args"];
type UpdateSubscriptionArgs =
  Database["public"]["Functions"]["update_subscription_with_card"]["Args"];

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
    // next_billing_dateが今日(JST)以降かどうかは、createSubscriptionでは常に、
    // updateSubscriptionでは「実際に日付が変更された場合のみ」検証する
    // （日付が未変更なら、繰り越し未処理で期限超過のまま残っている正当な状態を
    // 無関係な項目の編集まで巻き込んでブロックしないため。詳細は各関数を参照）。
    // そのため検証自体はここではなく、createSubscriptionとDB関数側で行う
    next_billing_date: z.iso.date({ error: "有効な日付を入力してください" }),
    is_trial: z.boolean(),
    card_id: z.uuid({ error: "不正なカードです" }).optional(),
    // requirements.md F-1: カードは登録済みのものから選ぶか、その場で新規作成できる
    new_card_name: z
      .string()
      .trim()
      .min(1, { error: "カード名を入力してください" })
      .max(50, { error: "カード名は50文字以内で入力してください" })
      .optional(),
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
    new_card_name: emptyToUndefined(formData.get("new_card_name")),
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
  if (error.code === "23505") {
    // カード名の重複（create_subscription_with_card/update_subscription_with_card
    // 内でのcards新規作成時）
    return "同じ名前のカードが既にあります";
  }
  if (error.code === "40001") {
    // update_subscription_with_card内の楽観的ロック不一致（serialization_failure）。
    // フォームを開いた後に日次バッチ等が対象行を更新していた場合に発生する
    return "他の操作により内容が更新されています。画面を再読み込みしてください";
  }
  if (error.code === "P0005") {
    // update_subscription_with_card内：next_billing_dateが実際に変更され、
    // かつ変更後の値が過去日だった場合
    return "次回請求日は今日以降の日付を入力してください";
  }
  if (
    error.code === "P0001" || // 他ユーザーのcard_idを指すトリガー違反
    error.code === "P0002" || // RPC内のSTRICT INTOで対象が見つからない（RLSによる非表示含む）
    error.code === "PGRST116" || // RLSで対象が見えない（直接テーブル呼び出し時）
    error.code === "42501" // RLSのWITH CHECKによる直接の拒否
  ) {
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

  // 新規登録では必ず今日(JST)以降の日付のみ許可する。過去日を許すと、日次バッチの
  // carryForwardBilling（T5-1）が経過した周期分すべてをpayment_historyへ記録して
  // しまい、実際には発生していない支払いを捏造することになる（requirements.md F-9
  // 「記録するのは実績のみ（過去には遡らない）」に反する）
  if (input.next_billing_date < getTodayJST()) {
    return {
      success: false,
      error: "次回請求日は今日以降の日付を入力してください",
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: UNAUTHORIZED_ERROR };
    }

    // カード新規作成とサブスク登録をPostgres関数内でまとめて行い、片方だけ
    // 成功して片方が失敗する状態を起こさない（Codexレビュー指摘対応）。
    // 関数はsecurity invoker（既定）のままauth.uid()を内部で使うため、RLSは
    // 引き続き有効（design.md 3章の多層防御）
    const { error } = await supabase.rpc("create_subscription_with_card", {
      p_service_name: input.service_name,
      p_amount: input.amount,
      p_cycle: input.cycle,
      p_cycle_days: input.cycle_days ?? null,
      p_next_billing_date: input.next_billing_date,
      p_billing_anchor_day: billingAnchorDayFrom(input.next_billing_date),
      p_is_trial: input.is_trial,
      p_card_id: input.card_id ?? null,
      p_new_card_name: input.new_card_name ?? null,
      p_cancel_url: input.cancel_url ?? null,
      p_memo: input.memo ?? null,
    } as CreateSubscriptionArgs);
    if (error) {
      return { success: false, error: toSubscriptionError(error) };
    }

    return { success: true };
  } catch (error) {
    console.error("[subscriptions] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function updateSubscription(
  _prevState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }
  // フォームを開いた時点のupdated_atを楽観的ロックのトークンとして使う。
  // モーダルを開いた後に日次バッチが繰り越しを行っていた場合、そのまま更新すると
  // バッチが進めたnext_billing_dateをフォームの古い値で上書きし、繰り越しを
  // 巻き戻してしまう（design.md 6章の冪等性を壊す）。そのため値が一致しなければ
  // 拒否する
  const expectedUpdatedAt = formData.get("expected_updated_at");
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt === "") {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  const parsed = parseSubscriptionFormData(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: UNAUTHORIZED_ERROR };
    }

    // billing_anchor_dayの保持／再計算判定・楽観的ロック（expected_updated_at）の
    // 検証・カード新規作成はすべてPostgres関数内の1トランザクションで行う
    // （Codexレビュー指摘対応：読み取りと書き込みを分けるとレースコンディションの
    // 余地が生まれるため）
    const { error } = await supabase.rpc("update_subscription_with_card", {
      p_subscription_id: idParsed.data,
      p_expected_updated_at: expectedUpdatedAt,
      p_service_name: input.service_name,
      p_amount: input.amount,
      p_cycle: input.cycle,
      p_cycle_days: input.cycle_days ?? null,
      p_next_billing_date: input.next_billing_date,
      p_is_trial: input.is_trial,
      p_card_id: input.card_id ?? null,
      p_new_card_name: input.new_card_name ?? null,
      p_cancel_url: input.cancel_url ?? null,
      p_memo: input.memo ?? null,
      p_today: getTodayJST(),
    } as UpdateSubscriptionArgs);
    if (error) {
      return { success: false, error: toSubscriptionError(error) };
    }

    return { success: true };
  } catch (error) {
    console.error("[subscriptions] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function deleteSubscription(
  id: string,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  try {
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
  } catch (error) {
    console.error("[subscriptions] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function cancelSubscription(
  id: string,
): Promise<SubscriptionActionState> {
  const idParsed = subscriptionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: UNEXPECTED_ERROR };
  }

  try {
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
  } catch (error) {
    console.error("[subscriptions] unexpected error", error);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}
