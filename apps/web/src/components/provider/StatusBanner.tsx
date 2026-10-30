const BANNER = {
  pending: ["bg-warning-bg text-warning", "Your verification is being reviewed. You'll be visible to customers once approved."],
  approved: null,
  rejected: ["bg-danger-bg text-danger", "Your application was not approved."],
  suspended: ["bg-danger-bg text-danger", "Your profile is suspended. Contact support."],
} as const;

export function StatusBanner({ status, reason }: { status: keyof typeof BANNER; reason?: string | null }) {
  const b = BANNER[status];
  if (!b) return null;
  return <p role="status" className={`rounded-card px-4 py-3 text-sm font-semibold ${b[0]}`}>{b[1]}{status === "rejected" && reason ? ` Reason: ${reason}` : ""}</p>;
}
