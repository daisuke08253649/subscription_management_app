"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionState } from "@/actions/auth";
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

export function UpdatePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>新しいパスワードを設定</CardTitle>
        <CardDescription>
          新しいパスワードを入力してください
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">新しいパスワード</Label>
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
            {isPending ? "更新中..." : "パスワードを更新"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
