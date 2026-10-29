import { describe, expect, it } from "vitest";
import { computeProfit, nextApplicationStage, partnerScore, partnerTier, rankPartners } from "./ops";

const base = { offersTotal: 0, offersAccepted: 0, jobsCompleted: 0, onTimeJobs: 0 };

describe("partner score", () => {
  it("is null with no data", () => expect(partnerScore(base)).toBeNull());
  it("weights only the components that exist", () => {
    // acceptance 8/10 and on-time 9/10: (0.25*0.9 + 0.2*0.8) / 0.45
    expect(partnerScore({ ...base, offersTotal: 10, offersAccepted: 8, jobsCompleted: 10, onTimeJobs: 9 })).toBe(86);
  });
  it("uses rating and photos once available", () => {
    expect(partnerScore({ offersTotal: 10, offersAccepted: 10, jobsCompleted: 10, onTimeJobs: 10, rating: 5, photoCompliance: 1 })).toBe(100);
    expect(partnerScore({ offersTotal: 10, offersAccepted: 10, jobsCompleted: 10, onTimeJobs: 10, rating: 4, photoCompliance: 1 })).toBe(92);
  });
});

describe("tiers and ranking", () => {
  it("needs a minimum number of jobs", () => expect(partnerTier(99, 2)).toBe("new"));
  it("maps score to tier", () => {
    expect(partnerTier(95, 20)).toBe("gold");
    expect(partnerTier(80, 20)).toBe("silver");
    expect(partnerTier(60, 20)).toBe("bronze");
  });
  it("ranks best first, unscored last", () => {
    const a = { id: "a", stats: { ...base } };
    const b = { id: "b", stats: { ...base, offersTotal: 4, offersAccepted: 2 } };
    const c = { id: "c", stats: { ...base, offersTotal: 4, offersAccepted: 4 } };
    expect(rankPartners([a, b, c]).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
});

describe("profit", () => {
  it("follows the brief's formula", () => {
    const r = computeProfit({
      marketplaceCommission: 100000, carwashRevenue: 60000, vip: 40000, advertising: 10000,
      partnerPayouts: 40000, expenses: { salaries: 50000, marketing: 10000 },
    });
    expect(r).toEqual({ income: 210000, costs: 100000, profit: 110000, margin: 52.4 });
  });
  it("has a zero margin with no income", () => {
    expect(computeProfit({ marketplaceCommission: 0, carwashRevenue: 0, vip: 0, advertising: 0, partnerPayouts: 0, expenses: {} }).margin).toBe(0);
  });
});

describe("application pipeline", () => {
  it("steps through each pipeline", () => {
    expect(nextApplicationStage("partner", "applied")).toBe("inspection");
    expect(nextApplicationStage("partner", "approved")).toBeNull();
    expect(nextApplicationStage("staff", "interview")).toBe("offer");
  });
});
