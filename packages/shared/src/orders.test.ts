import { describe, expect, it } from "vitest";
import { PROGRESS, TRANSITIONS, availableActions, progressFraction, type OrderService } from "./orders";

describe("order transitions", () => {
  it("lets providers accept or decline a request, and customers only cancel", () => {
    expect(availableActions("cleaning", "requested", "provider")).toEqual(["accepted", "declined"]);
    expect(availableActions("cleaning", "requested", "customer")).toEqual(["cancelled"]);
  });
  it("lets only the customer confirm completion", () => {
    expect(availableActions("cleaning", "awaiting_confirmation", "customer")).toContain("completed");
    expect(availableActions("cleaning", "awaiting_confirmation", "provider")).toEqual([]);
  });
  it("laundry intake can branch to price approval", () => {
    expect(availableActions("laundry", "received", "provider")).toEqual(["cleaning", "awaiting_price_approval"]);
    expect(availableActions("laundry", "awaiting_price_approval", "customer")).toEqual(["cleaning"]);
  });
  it("has no actions from terminal states", () => {
    for (const s of ["completed", "cancelled", "declined", "expired"] as const)
      for (const svc of ["cleaning", "laundry", "carwash"] as OrderService[])
        expect(TRANSITIONS[svc].filter((x) => x.from === s)).toEqual([]);
  });
  it("every provider/customer happy-path step is reachable", () => {
    for (const svc of ["cleaning", "laundry"] as const) {
      const steps = PROGRESS[svc];
      for (let i = 0; i < steps.length - 1; i++) {
        const ok = TRANSITIONS[svc].some((x) => x.from === steps[i] && x.to === steps[i + 1]);
        expect(ok, `${svc}: ${steps[i]} -> ${steps[i + 1]}`).toBe(true);
      }
    }
  });
});

describe("progressFraction", () => {
  it("runs 0..1", () => {
    expect(progressFraction("cleaning", "requested")).toBe(0);
    expect(progressFraction("cleaning", "completed")).toBe(1);
    expect(progressFraction("cleaning", "in_progress")).toBe(0.5);
    expect(progressFraction("cleaning", "cancelled")).toBe(0);
  });
});
