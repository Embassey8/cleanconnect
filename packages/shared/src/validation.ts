/** Input checks shared by web and mobile. Real verification happens server-side (KYC provider). */
export const isNin = (v: string) => /^\d{11}$/.test(v.trim());
export const isBvn = isNin;
/** RC (companies) or BN (business names) followed by digits, e.g. RC1234567 / BN 123456. */
export const isCacNumber = (v: string) => /^(RC|BN)\s?\d{5,8}$/i.test(v.trim());

export type ProviderKind = "business" | "individual";
export type RegisterService = "cleaning" | "laundry";

/** Which identity documents a registration needs (BUILD_BRIEF §2). */
export function requiredChecks(type: ProviderKind, service: RegisterService): ("cac" | "nin" | "bvn" | "selfie")[] {
  if (type === "business") return ["cac"];
  return service === "laundry" ? ["nin", "bvn", "selfie"] : ["nin", "selfie"];
}

export interface RegistrationInput {
  type: ProviderKind;
  service: RegisterService;
  displayName: string;
  areas: string[];
  cac?: string;
  nin?: string;
  bvn?: string;
}

/** Returns field -> message; empty object means valid. */
export function validateRegistration(i: RegistrationInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.displayName.trim().length < 2) e.displayName = "Enter your name or business name.";
  if (i.areas.length === 0) e.areas = "Add at least one area you cover.";
  const need = requiredChecks(i.type, i.service);
  if (need.includes("cac") && !isCacNumber(i.cac ?? "")) e.cac = "Enter your RC or BN number, e.g. RC1234567.";
  if (need.includes("nin") && !isNin(i.nin ?? "")) e.nin = "NIN must be 11 digits.";
  if (need.includes("bvn") && !isBvn(i.bvn ?? "")) e.bvn = "BVN must be 11 digits.";
  return e;
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";

/** Parse a naira input. "" -> null (not offered); invalid/negative -> undefined; else whole naira. */
export function parseNaira(v: string): number | null | undefined {
  const t = v.replace(/[,\s₦]/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Math.round(Number(t));
}
