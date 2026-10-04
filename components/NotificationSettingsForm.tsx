"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// design.md 12章: 14/7/3/1/当日（0）のプリセット＋任意の日数入力
const PRESET_DAYS = [14, 7, 3, 1, 0] as const;

function presetLabel(day: number): string {
  return day === 0 ? "当日" : `${day}日前`;
}

interface NotificationSettingsFormProps {
  notifyEmail: string | null;
  notifyDays: number[];
}

export function NotificationSettingsForm({
  notifyEmail,
  notifyDays,
}: NotificationSettingsFormProps) {
  const [email, setEmail] = useState(notifyEmail ?? "");
  const [selectedPresets, setSelectedPresets] = useState<Set<number>>(
    () => new Set(notifyDays.filter((d) => (PRESET_DAYS as readonly number[]).includes(d))),
  );
  const [customDay, setCustomDay] = useState(() => {
    const nonPreset = notifyDays.find(
      (d) => !(PRESET_DAYS as readonly number[]).includes(d),
    );
    return nonPreset !== undefined ? String(nonPreset) : "";
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const emailId = useId();
  const customDayId = useId();

  function togglePreset(day: number) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const days = [...selectedPresets];
    if (customDay.trim() !== "") {
      const parsed = Number(customDay);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
        setMessage({ type: "error", text: "日数は0〜365の整数で入力してください" });
        return;
      }
      days.push(parsed);
    }

    startTransition(async () => {
      const result = await updateSettings({ notifyEmail: email, notifyDays: days });
      if (!result.success) {
        setMessage({ type: "error", text: result.error ?? "保存に失敗しました" });
        return;
      }
      setMessage({ type: "success", text: "保存しました" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId}>通知先メールアドレス</Label>
        <Input
          id={emailId}
          type="email"
          placeholder="未入力の場合はログイン中のメールアドレスを使用します"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">通知するタイミング</span>
        <div className="flex flex-wrap gap-4">
          {PRESET_DAYS.map((day) => {
            const id = `notify-day-${day}`;
            return (
              <div key={day} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selectedPresets.has(day)}
                  onCheckedChange={() => togglePreset(day)}
                />
                <Label htmlFor={id} className="font-normal">
                  {presetLabel(day)}
                </Label>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={customDayId} className="font-normal text-muted-foreground">
            その他（日前）
          </Label>
          <Input
            id={customDayId}
            type="number"
            min={0}
            max={365}
            className="w-24"
            value={customDay}
            onChange={(event) => setCustomDay(event.target.value)}
          />
        </div>
      </div>

      {message ? (
        <p
          className={
            message.type === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="self-start">
        保存
      </Button>
    </form>
  );
}
