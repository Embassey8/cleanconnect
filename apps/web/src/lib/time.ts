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

const lagosDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }); // YYYY-MM-DD

/** Conversation-list timestamp: time today, weekday this week, otherwise "Oct 20". */
export function listTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (lagosDay(d) === lagosDay(now)) return d.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false });
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short" });
  return d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric" });
}

export const dayKey = (iso: string): string => lagosDay(new Date(iso));

/** Day separator label in a thread: "Today", "Yesterday" or "Oct 20". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (lagosDay(d) === lagosDay(now)) return "Today";
  if (lagosDay(d) === lagosDay(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric" });
}

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false });

/** Today's date in Lagos as YYYY-MM-DD, for `min` on date inputs. */
export const lagosToday = (): string => lagosDay(new Date());
