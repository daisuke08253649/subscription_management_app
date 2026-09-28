"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthActionState } from "@/actions/auth";
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

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>新規登録</CardTitle>
        <CardDescription>
          メールアドレスとパスワードでアカウントを作成します
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "登録中..." : "登録する"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            すでにアカウントをお持ちの場合は
            <Link
              href="/auth/login"
              className="ml-1 text-foreground underline underline-offset-4"
            >
              ログイン
            </Link>
          </p>
        </CardContent>
      </form>
    </Card>
  );
}
