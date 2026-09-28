import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        {user?.email} でログイン中
      </p>
      <p className="text-sm text-muted-foreground">
        一覧画面は Phase 2 以降で実装予定です。
      </p>
      {searchParams.error === "logout_failed" ? (
        <p className="text-sm text-destructive">
          ログアウトに失敗しました。時間をおいて再度お試しください
        </p>
      ) : null}
      <form action={logout}>
        <Button type="submit" variant="outline">
          ログアウト
        </Button>
      </form>
    </div>
  );
}
