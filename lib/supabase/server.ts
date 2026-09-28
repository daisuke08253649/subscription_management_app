import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * RLS前提のサーバークライアント（Cookie経由）。
 * Server Components・Server Actions・Route Handlerから呼び出す。
 * リクエストごとに新規作成すること（design.md 3章・9章）。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Componentから呼ばれた場合はここでの書き込みができない。
            // セッション更新はauth操作を伴うServer Action／Route Handler側で行われるため無視してよい。
          }
        },
      },
    },
  );
}
