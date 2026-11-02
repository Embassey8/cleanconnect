export type KycStatus = "verified" | "mismatch" | "failed" | "pending";

/** Lower-case, strip punctuation and legal suffixes so "Sparkle Ltd." matches "SPARKLE LIMITED". */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(limited|ltd|enterprises|enterprise|nigeria|nig|plc|co|company|and|the)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** True when one name contains the other once normalised (either may be a longer legal name). */
export function namesMatch(a: string, b: string): boolean {
  const x = normaliseName(a), y = normaliseName(b);
  return x !== "" && y !== "" && (x.includes(y) || y.includes(x));
}

interface SmileResponse { ResultCode?: string; Actions?: Record<string, string>; FullName?: string; Company?: string; company?: string }

/** Person check (NIN / BVN): the number must exist and the registered name must match the applicant. */
export function mapIdentityResult(res: SmileResponse): KycStatus {
  const a = res.Actions ?? {};
  const verified = a.Verify_ID_Number;
  if (verified === "Not Verified") return "failed";
  if (verified !== "Verified") return "pending";
  const names = a.Names;
  if (names === "Exact Match" || names === "Partial Match" || names === "Transposed") return "verified";
  if (names === "No Match") return "mismatch";
  return "pending";
}

/** Business check (CAC): the registered company name must match the name the applicant gave. */
export function mapBusinessResult(res: SmileResponse, expectedName: string): KycStatus {
  const company = res.Company ?? res.company ?? "";
  if (!company) return res.ResultCode ? "failed" : "pending";
  return namesMatch(company, expectedName) ? "verified" : "mismatch";
}

/** Split a full name into the first and last name Smile ID asks for. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : parts[0] };
}
