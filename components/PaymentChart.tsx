"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyPayment } from "@/lib/billing";

const chartConfig = {
  total: { label: "請求額", color: "var(--foreground)" },
} satisfies ChartConfig;

function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

interface PaymentChartProps {
  data: MonthlyPayment[];
}

/**
 * 月ごとの実際の請求額の推移（design.md 8章、折れ線1本）。
 * 履歴は繰り越し（日次バッチ）の初回実行から蓄積されるため、
 * 最初は空・データ点1つの状態になる
 */
export function PaymentChart({ data }: PaymentChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        請求の履歴はまだありません。請求日を過ぎると、ここに月ごとの推移が表示されます
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        月ごとの請求額の推移
      </h2>
      <ChartContainer config={chartConfig} className="h-48 w-full">
        <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => `${Number(value.split("-")[1])}月`}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => value.toLocaleString("ja-JP")}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  formatMonth(String(payload?.[0]?.payload?.month ?? ""))
                }
                formatter={(value) => formatYen(Number(value))}
              />
            }
          />
          <Line
            dataKey="total"
            type="linear"
            stroke="var(--color-total)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-total)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      {data.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          次の請求月以降に推移の線が伸びていきます
        </p>
      ) : null}
    </div>
  );
}
