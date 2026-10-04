import { SubscriptionsPage } from "@/components/SubscriptionsPage";
import { aggregateMonthlyPayments, calculateTotals } from "@/lib/billing";
import { getTodayJST } from "@/lib/date";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

export default async function Home(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [subscriptionsResult, cardsResult, paymentsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, cards(id, name)")
      .eq("status", "active")
      .order("next_billing_date", { ascending: true }),
    supabase.from("cards").select("id, name").order("name"),
    fetchAllRows((from, to) =>
      supabase
        .from("payment_history")
        .select("billed_on, amount")
        .order("billed_on", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  // data ?? []で握りつぶすと、クエリが本当に失敗した場合でも
  // 「登録0件」と誤認させてしまい、重複登録を誘発しかねない
  if (
    subscriptionsResult.error ||
    cardsResult.error ||
    paymentsResult.error ||
    !paymentsResult.data
  ) {
    console.error(
      "[page] failed to load data",
      subscriptionsResult.error,
      cardsResult.error,
      paymentsResult.error,
    );
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
      </div>
    );
  }

  const totals = calculateTotals(
    subscriptionsResult.data.map((sub) => ({
      amount: sub.amount,
      cycle: sub.cycle,
      cycleDays: sub.cycle_days,
    })),
  );

  const monthlyPayments = aggregateMonthlyPayments(
    paymentsResult.data,
    getTodayJST().slice(0, 7),
  );

  return (
    <>
      {searchParams.error === "logout_failed" ? (
        <p className="mt-4 text-center text-sm text-destructive">
          ログアウトに失敗しました。時間をおいて再度お試しください
        </p>
      ) : null}
      <SubscriptionsPage
        subscriptions={subscriptionsResult.data ?? []}
        cards={cardsResult.data ?? []}
        userEmail={user?.email}
        monthlyTotal={totals.monthlyTotal}
        yearlyTotal={totals.yearlyTotal}
        monthlyPayments={monthlyPayments}
      />
    </>
  );
}
