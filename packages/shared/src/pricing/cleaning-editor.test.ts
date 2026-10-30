import { describe, expect, it } from "vitest";
import { CLEANING_AREAS, PREVIEW_EXAMPLES, PROPERTY_TYPES, TYPICAL_AREA_PRICES, compactNaira, computeCleaning, nearbyRange } from "./cleaning";

describe("price editor reference data", () => {
  it("has a typical price for every area and an example that only uses real areas", () => {
    for (const pt of PROPERTY_TYPES) {
      const ids = CLEANING_AREAS[pt.id].map((a) => a.id);
      expect(Object.keys(TYPICAL_AREA_PRICES[pt.id]).sort()).toEqual([...ids].sort());
      for (const id of Object.keys(PREVIEW_EXAMPLES[pt.id].qty)) expect(ids).toContain(id);
    }
  });
  it("gives a ±20% nearby range", () => expect(nearbyRange(5000)).toEqual({ low: 4000, high: 6000 }));
  it("formats compact naira", () => {
    expect(compactNaira(4000)).toBe("₦4k");
    expect(compactNaira(6500)).toBe("₦6.5k");
  });
  it("previews a home job with typical prices (regular vs deep clean)", () => {
    const ex = PREVIEW_EXAMPLES.home;
    const areaPrices = TYPICAL_AREA_PRICES.home;
    const regular = computeCleaning({ propertyType: "home", cleaningType: "regular", frequency: "once", areaPrices, qty: ex.qty, extras: [] });
    // 3×5000 + 6000 + 6000 + 2×3500
    expect(regular.areaSub).toBe(34000);
    expect(regular.total).toBe(34000);
    const deep = computeCleaning({ propertyType: "home", cleaningType: "deep", frequency: "once", areaPrices, qty: ex.qty, extras: [] });
    expect(deep.total).toBe(54400);
  });
});
