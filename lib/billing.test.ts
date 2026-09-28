import { describe, expect, it } from "vitest";
import { calculateMonthlyAmount } from "./billing";

describe("calculateMonthlyAmount", () => {
  it("monthlyは金額そのまま", () => {
    expect(calculateMonthlyAmount({ amount: 1000, cycle: "monthly" })).toBe(
      1000,
    );
  });

  it("yearlyは金額÷12（割り切れる場合）", () => {
    expect(calculateMonthlyAmount({ amount: 12000, cycle: "yearly" })).toBe(
      1000,
    );
  });

  it("yearlyは端数を四捨五入する", () => {
    // 1000 / 12 = 83.33... -> 83
    expect(calculateMonthlyAmount({ amount: 1000, cycle: "yearly" })).toBe(
      83,
    );
  });

  it("weeklyは金額×52÷12を四捨五入する", () => {
    // 100 * 52 / 12 = 433.33... -> 433
    expect(calculateMonthlyAmount({ amount: 100, cycle: "weekly" })).toBe(
      433,
    );
  });

  it("custom_daysは金額×365÷日数÷12を四捨五入する", () => {
    // 3000 * 365 / 90 / 12 = 1013.88... -> 1014
    expect(
      calculateMonthlyAmount({
        amount: 3000,
        cycle: "custom_days",
        cycleDays: 90,
      }),
    ).toBe(1014);
  });

  it("四捨五入は0.5以上を切り上げる", () => {
    // 1 * 365 / 365 / 12 * 6 = 0.5 の境界を作る: amount=6, cycleDays=365 -> 6*365/365/12 = 0.5 -> 1
    expect(
      calculateMonthlyAmount({
        amount: 6,
        cycle: "custom_days",
        cycleDays: 365,
      }),
    ).toBe(1);
  });

  it("custom_daysでcycleDaysが未指定なら例外を投げる", () => {
    expect(() =>
      calculateMonthlyAmount({ amount: 1000, cycle: "custom_days" }),
    ).toThrow();
  });

  it("custom_daysでcycleDaysが0以下なら例外を投げる", () => {
    expect(() =>
      calculateMonthlyAmount({
        amount: 1000,
        cycle: "custom_days",
        cycleDays: 0,
      }),
    ).toThrow();
  });
});
