import { describe, expect, it } from "vitest";
import { calculateMonthlyAmount, carryForwardBilling } from "./billing";

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

describe("carryForwardBilling", () => {
  it("next_billing_date === todayでは繰り越さない（請求日当日は進めない）", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-03-15",
      billingAnchorDay: 15,
      cycle: "monthly",
      amount: 1000,
      isTrial: false,
      today: "2026-03-15",
    });
    expect(result).toEqual({
      nextBillingDate: "2026-03-15",
      isTrial: false,
      billedEvents: [],
    });
  });

  it("design.mdの例の通り月末問題を解決する: 1/31→2/28→3/31（2/28→3/28にならない）", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-01-31",
      billingAnchorDay: 31,
      cycle: "monthly",
      amount: 1000,
      isTrial: false,
      today: "2026-04-01",
    });
    expect(result.billedEvents.map((e) => e.billedOn)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(result.nextBillingDate).toBe("2026-04-30");
  });

  it("うるう年（2024年）の2/29を正しく経由する", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2024-01-31",
      billingAnchorDay: 31,
      cycle: "monthly",
      amount: 1000,
      isTrial: false,
      today: "2024-03-02",
    });
    expect(result.billedEvents.map((e) => e.billedOn)).toEqual([
      "2024-01-31",
      "2024-02-29",
    ]);
    expect(result.nextBillingDate).toBe("2024-03-31");
  });

  it("weeklyで複数周期分を一度に追いつかせる", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-01-01",
      billingAnchorDay: 1,
      cycle: "weekly",
      amount: 500,
      isTrial: false,
      today: "2026-01-29",
    });
    expect(result.billedEvents.map((e) => e.billedOn)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
    ]);
    expect(result.nextBillingDate).toBe("2026-01-29");
  });

  it("custom_daysで指定日数ごとに繰り越す", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-01-01",
      billingAnchorDay: 1,
      cycle: "custom_days",
      cycleDays: 10,
      amount: 300,
      isTrial: false,
      today: "2026-01-25",
    });
    expect(result.billedEvents.map((e) => e.billedOn)).toEqual([
      "2026-01-01",
      "2026-01-11",
      "2026-01-21",
    ]);
    expect(result.nextBillingDate).toBe("2026-01-31");
  });

  it("yearlyは自前計算せず日付ライブラリに委任し、複数年の追いつきもできる", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2025-03-15",
      billingAnchorDay: 15,
      cycle: "yearly",
      amount: 12000,
      isTrial: false,
      today: "2026-04-01",
    });
    expect(result.billedEvents.map((e) => e.billedOn)).toEqual([
      "2025-03-15",
      "2026-03-15",
    ]);
    expect(result.nextBillingDate).toBe("2027-03-15");
  });

  it("繰り越しが1回でも発生すればis_trialをfalseにする（トライアル終了＝初回請求）", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-01-01",
      billingAnchorDay: 1,
      cycle: "monthly",
      amount: 1000,
      isTrial: true,
      today: "2026-02-01",
    });
    expect(result.isTrial).toBe(false);
  });

  it("繰り越しが発生しなければis_trialを変更しない", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-05-01",
      billingAnchorDay: 1,
      cycle: "monthly",
      amount: 1000,
      isTrial: true,
      today: "2026-01-01",
    });
    expect(result.isTrial).toBe(true);
    expect(result.billedEvents).toEqual([]);
  });

  it("billedEventsの各行に請求額が記録される", () => {
    const result = carryForwardBilling({
      nextBillingDate: "2026-01-01",
      billingAnchorDay: 1,
      cycle: "monthly",
      amount: 1980,
      isTrial: false,
      today: "2026-02-01",
    });
    expect(result.billedEvents).toEqual([
      { billedOn: "2026-01-01", amount: 1980 },
    ]);
  });
});
