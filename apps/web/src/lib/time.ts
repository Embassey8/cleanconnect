/** `datetime-local` has no zone; Nigeria is UTC+1 all year. */
export function lagosToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : "Not scheduled";

/** ISO timestamp `days` from now (kept out of components so renders stay pure). */
export const isoInDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();
