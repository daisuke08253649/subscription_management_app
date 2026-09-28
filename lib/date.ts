const JST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * JSTの「今日」をYYYY-MM-DD形式で返す。
 * DBのdate型カラム（next_billing_date等）との比較にそのまま使える。
 */
export function getTodayJST(now: Date = new Date()): string {
  return JST_FORMATTER.format(now);
}
