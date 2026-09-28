"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthActionState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { success: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>メールを送信しました</CardTitle>
          <CardDescription>
            届いたメールのリンクから新しいパスワードを設定してください
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>パスワードの再設定</CardTitle>
        <CardDescription>
          登録済みのメールアドレスを入力してください
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "送信中..." : "再設定メールを送る"}
          </Button>
          <Link
            href="/auth/login"
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            ログインに戻る
          </Link>
        </CardContent>
      </form>
    </Card>
  );
}
