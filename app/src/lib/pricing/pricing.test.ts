import { describe, expect, it } from "vitest";
import {
  assignTags,
  computeCleaning,
  computeLaundry,
  formatNaira,
  intakeDiff,
  quoteCarWash,
  type LaundryPriceList,
} from "./index";

const PRICES: LaundryPriceList = {
  shirt: { dry: 1500, wash: 800, iron: 400 },
  trousers: { dry: 1500, wash: 800, iron: 400 },
  native: { dry: 3500, wash: 2000, iron: 1000 },
  agbada: { dry: 6000, wash: null, iron: 2000 },
};

describe("formatNaira", () => {
  it("uses en-NG separators", () => expect(formatNaira(20000)).toBe("₦20,000"));
});

describe("computeLaundry", () => {
  // Design default: 3 shirts dry, 2 native dry, 4 trousers iron
  const qty = { "dry:shirt": 3, "dry:native": 2, "iron:trousers": 4 };

  it("matches the reference default order", () => {
    const t = computeLaundry(PRICES, qty, false);
    expect(t.subtotal).toBe(3 * 1500 + 2 * 3500 + 4 * 400); // 13,100
    expect(t.delivery).toBe(1500);
    expect(t.total).toBe(14600);
    expect(t.freeDeliveryGap).toBe(6900);
    expect(t.commission).toBe(1965);
    expect(t.providerEarns).toBe(13100 - 1965 + 1500);
  });

  it("adds express % and waives delivery over the threshold", () => {
    const t = computeLaundry(PRICES, qty, true);
    expect(t.express).toBe(6550);
    expect(t.cleaning).toBe(19650);
    expect(t.delivery).toBe(1500);
    const big = computeLaundry(PRICES, { ...qty, "dry:shirt": 5 }, true);
    expect(big.delivery).toBe(0);
  });

  it("charges nothing for an empty basket and ignores unoffered services", () => {
    expect(computeLaundry(PRICES, {}, true).total).toBe(0);
    const t = computeLaundry(PRICES, { "wash:agbada": 2 }, false);
    expect(t.itemCount).toBe(0);
    expect(t.total).toBe(0);
  });

  it("does not take commission on delivery", () => {
    const t = computeLaundry(PRICES, { "dry:shirt": 1 }, false);
    expect(t.commission).toBe(225);
    expect(t.providerEarns).toBe(1500 - 225 + 1500);
  });
});

describe("intake", () => {
  it("assigns sequential tags", () => {
    expect(assignTags([1, 5, 0, 3], 412)).toEqual(["0412", "0413–0417", "—", "0418–0420"]);
  });
  it("flags a changed total for approval", () => {
    const booked = computeLaundry(PRICES, { "dry:shirt": 4 }, false);
    const counted = computeLaundry(PRICES, { "dry:shirt": 5 }, false);
    expect(intakeDiff(booked, counted)).toEqual({ diff: 1500, needsApproval: true });
    expect(intakeDiff(booked, booked).needsApproval).toBe(false);
  });
});

describe("computeCleaning", () => {
  const areaPrices = { bed: 5000, sit: 6000, kit: 6000, bath: 3500 };
  const qty = { bed: 3, sit: 1, kit: 1, bath: 2 };
  const base = {
    propertyType: "home" as const,
    cleaningType: "regular" as const,
    frequency: "once" as const,
    areaPrices,
    qty,
    extras: [],
  };

  it("regular one-off", () => {
    const t = computeCleaning(base);
    expect(t.areaSub).toBe(34000);
    expect(t.total).toBe(34000);
  });
  it("deep clean multiplier + extras + weekly discount", () => {
    const t = computeCleaning({ ...base, cleaningType: "deep", extras: ["fridge"], frequency: "week" });
    expect(t.typeExtra).toBe(20400);
    expect(t.before).toBe(54400 + 3000);
    expect(t.discount).toBe(5740);
    expect(t.total).toBe(57400 - 5740);
  });
  it("applies minimum order", () => {
    const t = computeCleaning({ ...base, qty: { bath: 1 } });
    expect(t.minApplied).toBe(true);
    expect(t.total).toBe(10000);
  });
  it("is zero with no areas and skips unoffered areas", () => {
    expect(computeCleaning({ ...base, qty: {} }).total).toBe(0);
    expect(computeCleaning({ ...base, qty: { stair: 2 } }).total).toBe(0);
  });
});

describe("quoteCarWash", () => {
  const rates = { "full:saloon": { customerPrice: 6000, partnerPayout: 4000 } };
  it("adds service fee and mobile bonus to payout", () => {
    expect(quoteCarWash(rates, "full", "saloon", 500, true, 1000)).toEqual({
      price: 6000, serviceFee: 500, total: 6500, partnerPayout: 5000,
    });
    expect(quoteCarWash(rates, "exterior", "suv", 500, false)).toBeNull();
  });
});
