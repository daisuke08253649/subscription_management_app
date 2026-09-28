import { describe, expect, it } from "vitest";
import { getTodayJST } from "./date";

describe("getTodayJST", () => {
  it("JST日付が変わる直前（UTC 14:59）は前日の日付を返す", () => {
    expect(getTodayJST(new Date("2026-01-01T14:59:00Z"))).toBe("2026-01-01");
  });

  it("JST日付が変わった直後（UTC 15:00 = JST 翌0:00）は翌日の日付を返す", () => {
    expect(getTodayJST(new Date("2026-01-01T15:00:00Z"))).toBe("2026-01-02");
  });

  it("年またぎでも正しくJSTの日付を返す", () => {
    expect(getTodayJST(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
  });

  it("YYYY-MM-DD形式（ゼロ埋め）で返す", () => {
    expect(getTodayJST(new Date("2026-03-05T00:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
