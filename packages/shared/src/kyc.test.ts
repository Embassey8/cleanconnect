import { describe, expect, it } from "vitest";
import { mapBusinessResult, mapIdentityResult, namesMatch, splitName } from "./kyc";

describe("kyc", () => {
  it("maps identity checks", () => {
    expect(mapIdentityResult({ Actions: { Verify_ID_Number: "Verified", Names: "Exact Match" } })).toBe("verified");
    expect(mapIdentityResult({ Actions: { Verify_ID_Number: "Verified", Names: "Partial Match" } })).toBe("verified");
    expect(mapIdentityResult({ Actions: { Verify_ID_Number: "Verified", Names: "No Match" } })).toBe("mismatch");
    expect(mapIdentityResult({ Actions: { Verify_ID_Number: "Not Verified" } })).toBe("failed");
    expect(mapIdentityResult({ Actions: { Verify_ID_Number: "Unable to Verify" } })).toBe("pending");
    expect(mapIdentityResult({})).toBe("pending");
  });
  it("matches company names loosely", () => {
    expect(namesMatch("SPARKLE CLEANING LIMITED", "Sparkle Cleaning")).toBe(true);
    expect(namesMatch("Acme Ltd.", "Sparkle")).toBe(false);
    expect(mapBusinessResult({ Company: "SPARKLE CLEANING LTD" }, "Sparkle Cleaning")).toBe("verified");
    expect(mapBusinessResult({ Company: "OTHER LTD" }, "Sparkle Cleaning")).toBe("mismatch");
    expect(mapBusinessResult({ ResultCode: "1013" }, "Sparkle")).toBe("failed");
    expect(mapBusinessResult({}, "Sparkle")).toBe("pending");
  });
  it("splits names", () => {
    expect(splitName("Ada Obi Eze")).toEqual({ first: "Ada", last: "Eze" });
    expect(splitName("Ada")).toEqual({ first: "Ada", last: "Ada" });
  });
});
