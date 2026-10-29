import { describe, expect, it } from "vitest";
import {
  canProviderAccept, checkFunding, checkWithdrawal, orderCommission, payoutEtaHours,
  shortfall, shouldAutoConfirm, splitRelease, vipPeriodEnd,
} from "./wallet";

describe("commission", () => {
  it("laundry: on items only, not delivery (matches pricing tests: 1965)", () => {
    const o = { service: "laundry" as const, subtotal: 13100, surcharge: 0, total: 14600, commissionRate: 0.15 };
    expect(orderCommission(o)).toBe(1965);
    expect(splitRelease(o)).toEqual({ commission: 1965, providerCredit: 12635 });
  });
  it("laundry express includes the express fee and rounds half up", () => {
    const o = { service: "laundry" as const, subtotal: 13100, surcharge: 6550, total: 21150, commissionRate: 0.15 };
    expect(orderCommission(o)).toBe(2948);
  });
  it("cleaning: on the total", () => {
    const o = { service: "cleaning" as const, subtotal: 0, surcharge: 0, total: 51660, commissionRate: 0.15 };
    expect(orderCommission(o)).toBe(7749);
  });
  it("car wash is platform revenue", () => {
    expect(orderCommission({ service: "carwash", subtotal: 6000, surcharge: 0, total: 6500, commissionRate: 0.15 })).toBe(0);
  });
  it("provider credit plus commission always equals what the customer paid", () => {
    for (const total of [10000, 10001, 33333, 51660]) {
      const s = splitRelease({ service: "cleaning", subtotal: 0, surcharge: 0, total, commissionRate: 0.15 });
      expect(s.commission + s.providerCredit).toBe(total);
    }
  });
});

describe("withdrawals and funding", () => {
  it("validates withdrawals", () => {
    expect(checkWithdrawal(5000, 20000).ok).toBe(true);
    expect(checkWithdrawal(500, 20000).ok).toBe(false);
    expect(checkWithdrawal(25000, 20000).ok).toBe(false);
    expect(checkWithdrawal(1500.5, 20000).ok).toBe(false);
  });
  it("validates funding", () => {
    expect(checkFunding(10000).ok).toBe(true);
    expect(checkFunding(50).ok).toBe(false);
    expect(checkFunding(10_000_000).ok).toBe(false);
  });
  it("computes shortfall", () => {
    expect(shortfall(14600, 10000)).toBe(4600);
    expect(shortfall(14600, 20000)).toBe(0);
  });
});

describe("escrow and plans", () => {
  it("providers can accept only once money is held (car wash excepted)", () => {
    expect(canProviderAccept("laundry", "unpaid")).toBe(false);
    expect(canProviderAccept("laundry", "held")).toBe(true);
    expect(canProviderAccept("carwash", "unpaid")).toBe(true);
  });
  it("VIP gets faster payouts", () => {
    expect(payoutEtaHours("vip")).toBeLessThan(payoutEtaHours("standard"));
  });
  it("VIP period is 30 days by default", () => {
    expect(vipPeriodEnd(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
  it("auto-confirms after the window", () => {
    const since = new Date("2026-01-01T00:00:00Z");
    expect(shouldAutoConfirm(since, new Date("2026-01-02T23:59:00Z"))).toBe(false);
    expect(shouldAutoConfirm(since, new Date("2026-01-03T00:00:00Z"))).toBe(true);
  });
});
