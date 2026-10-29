import { describe, expect, it } from "vitest";
import { requiredChecks, slugify, validateRegistration } from "./validation";

describe("requiredChecks", () => {
  it("matches the brief", () => {
    expect(requiredChecks("business", "laundry")).toEqual(["cac"]);
    expect(requiredChecks("individual", "cleaning")).toEqual(["nin", "selfie"]);
    expect(requiredChecks("individual", "laundry")).toEqual(["nin", "bvn", "selfie"]);
  });
});

describe("validateRegistration", () => {
  const base = { type: "individual" as const, service: "laundry" as const, displayName: "Ada", areas: ["Lekki"], nin: "12345678901", bvn: "10987654321" };
  it("accepts a complete laundry individual", () => expect(validateRegistration(base)).toEqual({}));
  it("needs BVN only for laundry individuals", () => {
    expect(validateRegistration({ ...base, bvn: "" }).bvn).toBeTruthy();
    expect(validateRegistration({ ...base, service: "cleaning", bvn: "" })).toEqual({});
  });
  it("validates CAC for businesses", () => {
    const b = { type: "business" as const, service: "cleaning" as const, displayName: "Sparkle Ltd", areas: ["Ikeja"] };
    expect(validateRegistration({ ...b, cac: "nope" }).cac).toBeTruthy();
    expect(validateRegistration({ ...b, cac: "RC1234567" })).toEqual({});
  });
  it("requires an area and a name", () => {
    const e = validateRegistration({ ...base, displayName: "", areas: [] });
    expect(e.displayName && e.areas).toBeTruthy();
  });
});

describe("slugify", () => {
  it("makes url-safe slugs", () => {
    expect(slugify("  Sparkle & Shine Ltd.! ")).toBe("sparkle-shine-ltd");
    expect(slugify("!!!")).toBe("provider");
  });
});

import { parseNaira } from "./validation";
describe("parseNaira", () => {
  it("handles empty, formatted, and invalid input", () => {
    expect(parseNaira("")).toBeNull();
    expect(parseNaira(" ₦1,500 ")).toBe(1500);
    expect(parseNaira("2500.6")).toBe(2501);
    expect(parseNaira("-5")).toBeUndefined();
    expect(parseNaira("abc")).toBeUndefined();
  });
});
