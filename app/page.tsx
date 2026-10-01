import { SubscriptionsPage } from "@/components/SubscriptionsPage";
import { createClient } from "@/lib/supabase/server";

export default async function Home(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: subscriptions }, { data: cards }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, cards(id, name)")
      .eq("status", "active")
      .order("next_billing_date", { ascending: true }),
    supabase.from("cards").select("id, name").order("name"),
  ]);

  return (
    <>
      {searchParams.error === "logout_failed" ? (
        <p className="mt-4 text-center text-sm text-destructive">
          ログアウトに失敗しました。時間をおいて再度お試しください
        </p>
      ) : null}
      <SubscriptionsPage
        subscriptions={subscriptions ?? []}
        cards={cards ?? []}
        userEmail={user?.email}
      />
    </>
  );
}
