"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthActionState } from "@/actions/auth";
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

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const error = state.error ?? initialError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ログイン</CardTitle>
        <CardDescription>
          メールアドレスとパスワードでログインします
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">パスワード</Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                パスワードを忘れた場合
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "ログイン中..." : "ログイン"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            アカウントをお持ちでない場合は
            <Link
              href="/auth/signup"
              className="ml-1 text-foreground underline underline-offset-4"
            >
              新規登録
            </Link>
          </p>
        </CardContent>
      </form>
    </Card>
  );
}
