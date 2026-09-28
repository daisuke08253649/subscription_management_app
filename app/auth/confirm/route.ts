import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * パスワード再設定メール（supabase/templates/recovery.html）のリンク先。
 * token_hashをセッションに交換してから、指定のページへリダイレクトする（PKCEフロー）。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = next;
      redirectTo.search = "";
      return NextResponse.redirect(redirectTo);
    }
  }

  const errorRedirect = request.nextUrl.clone();
  errorRedirect.pathname = "/auth/login";
  errorRedirect.search = "";
  errorRedirect.searchParams.set("error", "reset_link_invalid");
  return NextResponse.redirect(errorRedirect);
}
