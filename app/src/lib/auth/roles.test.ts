import { describe, expect, it } from "vitest";
import { canAccess, homeFor } from "./roles";

describe("canAccess", () => {
  it("keeps admin and partner areas private", () => {
    expect(canAccess("/admin/overview", "customer")).toBe(false);
    expect(canAccess("/admin/overview", "admin")).toBe(true);
    expect(canAccess("/partner", "provider")).toBe(false);
    expect(canAccess("/provider/prices", null)).toBe(false);
  });
  it("leaves public routes open", () => {
    expect(canAccess("/", null)).toBe(true);
    expect(canAccess("/marketplace", null)).toBe(true);
    expect(canAccess("/providers/join", null)).toBe(true);
  });
  it("does not confuse /providers/join with /provider", () => {
    expect(canAccess("/providers/join", "customer")).toBe(true);
  });
});

describe("homeFor", () => {
  it("routes each role", () => {
    expect(homeFor({ id: "1", role: "partner", name: "x" })).toBe("/partner");
    expect(homeFor({ id: "1", role: "customer", name: "x" })).toBe("/account");
  });
});
