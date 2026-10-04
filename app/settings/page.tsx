import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          通知設定・カード管理
        </h2>
        <p className="text-sm text-muted-foreground">
          近日実装予定です。
        </p>
      </section>
    </div>
  );
}
