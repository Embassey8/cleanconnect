import { describe, expect, it } from "vitest";
import { CAC_DOCUMENT_MAX_BYTES, checkCacDocument, requiredChecks, sniffImage, slugify, validateRegistration } from "./validation";

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
    expect(validateRegistration({ ...b, cac: "RC1234567", cacName: "Sparkle Limited" })).toEqual({});
  });
  it("requires the business name as registered with CAC", () => {
    const b = { type: "business" as const, service: "cleaning" as const, displayName: "Sparkle", areas: ["Ikeja"], cac: "RC1234567" };
    expect(validateRegistration(b).cacName).toBeTruthy();
    expect(validateRegistration({ ...b, cacName: " " }).cacName).toBeTruthy();
    expect(validateRegistration({ ...b, cacName: "Sparkle Limited" }).cacName).toBeUndefined();
    // individuals never need it
    expect(validateRegistration(base).cacName).toBeUndefined();
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

describe("CAC certificate image", () => {
  const bytes = (...n: number[]) => Uint8Array.from(n);
  const text = (t: string) => Uint8Array.from([...t].map((c) => c.charCodeAt(0)));
  const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
  const webp = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([1, 2, 3, 4], [..."WEBP"].map((c) => c.charCodeAt(0))));
  it("recognises JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffImage(jpeg)).toEqual({ type: "image/jpeg", ext: "jpg" });
    expect(sniffImage(png)).toEqual({ type: "image/png", ext: "png" });
    expect(sniffImage(webp)).toEqual({ type: "image/webp", ext: "webp" });
  });
  it("rejects anything else, whatever it is called", () => {
    expect(sniffImage(text("%PDF-1.7"))).toBeNull();
    expect(sniffImage(text("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it("checks presence, type and size", () => {
    expect(checkCacDocument(new Uint8Array()).ok).toBe(false);
    expect(checkCacDocument(text("hello")).ok).toBe(false);
    expect(checkCacDocument(jpeg)).toEqual({ ok: true, image: { type: "image/jpeg", ext: "jpg" } });
    const big = new Uint8Array(CAC_DOCUMENT_MAX_BYTES + 1); big.set(jpeg);
    const r = checkCacDocument(big);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/too large/);
    const exact = new Uint8Array(CAC_DOCUMENT_MAX_BYTES); exact.set(jpeg);
    expect(checkCacDocument(exact).ok).toBe(true);
  });
});
