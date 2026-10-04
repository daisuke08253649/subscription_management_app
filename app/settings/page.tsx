import Link from "next/link";
import { CardManagement } from "@/components/CardManagement";
import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [settingsResult, cardsResult] = await Promise.all([
    supabase.from("settings").select("*").maybeSingle(),
    supabase.from("cards").select("id, name").order("name"),
  ]);

  if (settingsResult.error || cardsResult.error) {
    console.error(
      "[settings/page] failed to load data",
      settingsResult.error,
      cardsResult.error,
    );
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">
          データの取得に失敗しました。時間をおいて再度お試しください
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="font-heading text-lg font-medium">設定</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">データのエクスポート</h2>
          <p className="text-sm text-muted-foreground">
            登録しているサブスクのデータをいつでも手元に取り出せます。
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/export/json">JSONでエクスポート</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export/csv">CSVでエクスポート</a>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">通知設定</h2>
        <NotificationSettingsForm
          notifyEmail={settingsResult.data?.notify_email ?? null}
          notifyDays={settingsResult.data?.notify_days ?? []}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">カード管理</h2>
        <CardManagement cards={cardsResult.data ?? []} />
      </section>
    </div>
  );
}
