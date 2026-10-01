"use server";

import { z } from "zod";
import { getTodayJST } from "@/lib/date";
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
    // next_billing_dateは今日(JST)以降のみ許可する。過去日を許すと、日次バッチの
    // carryForwardBilling（T5-1）が経過した周期分すべてをpayment_historyへ記録して
    // しまい、実際には発生していない支払いを捏造することになる。これはrequirements.md
    // F-9「記録するのは実績のみ（過去には遡らない）」に反する
    next_billing_date: z.iso
      .date({ error: "有効な日付を入力してください" })
      .refine((value) => value >= getTodayJST(), {
        message: "次回請求日は今日以降の日付を入力してください",
      }),
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
  if (
    error.code === "P0001" || // 他ユーザーのcard_idを指すトリガー違反
    error.code === "PGRST116" || // RLSで対象が見えない（他ユーザーの行／存在しないid）
    error.code === "42501" // RLSのWITH CHECKによる直接の拒否
  ) {
    return UNAUTHORIZED_ERROR;
  }
  return UNEXPECTED_ERROR;
}

interface ResolveCardIdResult {
  cardId: string | null;
  error?: string;
}

/**
 * card_id（既存カードを選択）とnew_card_name（その場で新規作成）の
 * どちらが送られてきたかを解決する。両方は通常UIからは送られないが、
 * 直接呼び出された場合はnew_card_nameを優先する
 */
async function resolveCardId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  cardId: string | undefined,
  newCardName: string | undefined,
): Promise<ResolveCardIdResult> {
  if (!newCardName) {
    return { cardId: cardId ?? null };
  }

  const { data: newCard, error } = await supabase
    .from("cards")
    .insert({ user_id: userId, name: newCardName })
    .select("id")
    .single();
  if (error || !newCard) {
    console.error("[subscriptions] card creation failed", error);
    if (error?.code === "23505") {
      return { cardId: null, error: "同じ名前のカードが既にあります" };
    }
    return { cardId: null, error: UNEXPECTED_ERROR };
  }

  return { cardId: newCard.id };
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

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: UNAUTHORIZED_ERROR };
    }

    const resolvedCard = await resolveCardId(
      supabase,
      user.id,
      input.card_id,
      input.new_card_name,
    );
    if (resolvedCard.error) {
      return { success: false, error: resolvedCard.error };
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
      card_id: resolvedCard.cardId,
      cancel_url: input.cancel_url ?? null,
      memo: input.memo ?? null,
    });
    if (error) {
      // card_id・new_card_name共にPostgREST呼び出しは別リクエストのため
      // 1トランザクションにはならない。新規作成したカードだけが残ってしまうと、
      // 再送信時に同名カードの重複エラーで原因不明の失敗に見えるため、
      // 今回新規作成したカードは後始末する
      if (input.new_card_name && resolvedCard.cardId) {
        await supabase.from("cards").delete().eq("id", resolvedCard.cardId);
      }
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

    // billing_anchor_dayは「monthly周期のままnext_billing_dateも変更されていない」
    // 場合のみ既存の値を保持する。月末で丸められた日付のまま他の項目だけ編集した
    // ケースで再計算すると、繰り越しの基準日が丸められた値（例: 28）で上書きされ、
    // 以後の繰り越しが本来の基準（例: 31）に戻らなくなる（design.md 6章の月末問題）。
    // 一方、weekly/custom_days等からmonthlyへ切り替える場合は、過去の登録時に
    // 設定されたまま何年も更新されていない無関係なanchorが残っている可能性があるため、
    // 周期がmonthlyのまま変わっていない場合に限ってのみ保持する
    const { data: current, error: fetchError } = await supabase
      .from("subscriptions")
      .select("next_billing_date, billing_anchor_day, cycle, updated_at")
      .eq("id", idParsed.data)
      .single();
    if (fetchError || !current) {
      return {
        success: false,
        error: toSubscriptionError(fetchError ?? { message: "not found" }),
      };
    }
    if (current.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error:
          "他の操作により内容が更新されています。画面を再読み込みしてください",
      };
    }

    const shouldPreserveAnchor =
      current.cycle === "monthly" &&
      input.cycle === "monthly" &&
      input.next_billing_date === current.next_billing_date;
    const billingAnchorDay = shouldPreserveAnchor
      ? current.billing_anchor_day
      : billingAnchorDayFrom(input.next_billing_date);

    const resolvedCard = await resolveCardId(
      supabase,
      user.id,
      input.card_id,
      input.new_card_name,
    );
    if (resolvedCard.error) {
      return { success: false, error: resolvedCard.error };
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({
        service_name: input.service_name,
        amount: input.amount,
        cycle: input.cycle,
        cycle_days: input.cycle_days ?? null,
        next_billing_date: input.next_billing_date,
        billing_anchor_day: billingAnchorDay,
        is_trial: input.is_trial,
        card_id: resolvedCard.cardId,
        cancel_url: input.cancel_url ?? null,
        memo: input.memo ?? null,
      })
      .eq("id", idParsed.data)
      .select()
      .single();
    if (error) {
      // createSubscriptionと同様、新規作成したカードだけが残ってしまうのを防ぐ
      if (input.new_card_name && resolvedCard.cardId) {
        await supabase.from("cards").delete().eq("id", resolvedCard.cardId);
      }
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
