import { describe, expect, it } from "vitest";
import { earnedBadges, isStar, overallFromCategories, ratingSummary, starsText } from "./reviews";

describe("ratings", () => {
  it("validates star values", () => {
    expect(isStar(5)).toBe(true);
    expect(isStar(0)).toBe(false);
    expect(isStar(3.5)).toBe(false);
  });
  it("derives an overall rating from categories", () => {
    expect(overallFromCategories({ quality: 5, punctuality: 4, communication: 5, value: 4 })).toBe(5);
    expect(overallFromCategories({ quality: 3, punctuality: 3, communication: 4, value: 3 })).toBe(3);
  });
  it("summarises a distribution", () => {
    const s = ratingSummary([0, 0, 1, 2, 7]);
    expect(s.count).toBe(10);
    expect(s.average).toBe(4.6);
    expect(s.distribution[0]).toEqual({ stars: 5, count: 7, percent: 70 });
  });
  it("handles no reviews", () => {
    expect(ratingSummary([0, 0, 0, 0, 0]).average).toBeNull();
    expect(starsText(null)).toBe("No ratings yet");
    expect(starsText(4.66)).toBe("4.7 ★");
  });
});

describe("badges", () => {
  it("awards Top rated only with enough reviews", () => {
    expect(earnedBadges({ ratingAverage: 4.9, ratingCount: 3, jobsCompleted: 3 })).toEqual([]);
    expect(earnedBadges({ ratingAverage: 4.8, ratingCount: 12, jobsCompleted: 12 })).toEqual(["Top rated"]);
  });
  it("awards the highest order milestone", () => {
    expect(earnedBadges({ ratingAverage: null, ratingCount: 0, jobsCompleted: 130 })).toEqual(["100+ orders"]);
    expect(earnedBadges({ ratingAverage: null, ratingCount: 0, jobsCompleted: 520 })).toEqual(["500+ orders"]);
  });
});
