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

/** "2h ago", "Yesterday", "Oct 20": compact relative time for tables. */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 48) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric" });
}

export interface MonthOption { key: string; label: string; long: string }

/** The current month and the previous `n - 1`, newest first. `key` is YYYY-MM. */
export function recentMonths(n: number): MonthOption[] {
  const [y, m] = lagosDay(new Date()).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      long: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });
}

/** Whole days from now until `iso` (negative when past). */
export const daysUntil = (iso: string): number => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** A valid `?month=YYYY-MM` from the last 12 months, else the current month. */
export function pickMonth(v: string | string[] | undefined): string {
  const keys = recentMonths(12).map((m) => m.key);
  return typeof v === "string" && keys.includes(v) ? v : keys[0];
}
