/** In-app photo rules (BUILD_BRIEF §5). Shared by the camera component, the upload action and tests. */

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTO_EDGE = 1600;
export const MAX_REVIEW_PHOTOS = 4;

export type MediaPhase = "before" | "after" | "condition" | "intake" | "general";

export const PHASE_LABEL: Record<MediaPhase, string> = {
  before: "Before", after: "After", condition: "Existing condition", intake: "Intake", general: "Other",
};

/** Phases each service can pick from when taking a job photo. */
export const PHASES_FOR: Record<"cleaning" | "laundry" | "carwash", MediaPhase[]> = {
  cleaning: ["before", "after", "general"],
  laundry: ["intake", "after", "general"],
  carwash: ["condition", "before", "after"],
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The stamp drawn onto every photo. */
export const stampText = (d: Date): string => `Taken on CleanConnect · ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/**
 * True for a JPEG that carries no EXIF/GPS metadata. Photos re-encoded from a canvas have none; this
 * rejects anything that still has an APP1 (EXIF/XMP) segment before the image data starts.
 */
export function isCleanJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return false;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xe1) return false; // APP1: EXIF / XMP
    if (marker === 0xda) return true; // start of scan: no metadata seen
    if (marker === 0xd9) return false;
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return false;
}

/** Scale (width, height) so the longest edge fits `max`, never upscaling. */
export function fitWithin(width: number, height: number, max: number = MAX_PHOTO_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
