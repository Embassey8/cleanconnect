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
  /** Business name exactly as it appears on the CAC certificate. */
  cacName?: string;
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
  if (need.includes("cac") && (i.cacName ?? "").trim().length < 2) e.cacName = "Enter the business name exactly as it appears on your CAC certificate.";
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

/** CAC certificate upload: a photo or scan of the certificate. */
export const CAC_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export type CertificateImage = { type: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** Identify an image from its first bytes, so a renamed file or a forged content type is not trusted. */
export function sniffImage(b: Uint8Array): CertificateImage | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { type: "image/png", ext: "png" };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** Returns the detected image, or the message to show the applicant. */
export function checkCacDocument(bytes: Uint8Array): { ok: true; image: CertificateImage } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "Upload a photo or scan of your CAC certificate." };
  if (bytes.length > CAC_DOCUMENT_MAX_BYTES) return { ok: false, reason: "The image is too large. Use one under 5 MB." };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, reason: "Upload a JPG, PNG or WebP image of your certificate." };
  return { ok: true, image };
}
