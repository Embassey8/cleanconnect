import Link from "next/link";

type Status = "verified" | "pending" | "mismatch" | "failed" | null;

const LOOK: Record<string, { chip: string; label: string; hint: string }> = {
  verified: { chip: "bg-primary-tint text-primary", label: "Verified", hint: "You can add money to your wallet and withdraw." },
  pending: { chip: "bg-warning-bg text-warning", label: "Checking", hint: "We're checking your details. This can take a few minutes." },
  mismatch: { chip: "bg-danger-bg text-danger", label: "Didn't match", hint: "The number didn't match the name on your account. Try again." },
  failed: { chip: "bg-danger-bg text-danger", label: "Not found", hint: "We couldn't find that number. Check it and try again." },
  none: { chip: "bg-warning-bg text-warning", label: "Not verified", hint: "Verify your identity to add money to your wallet or withdraw." },
};

/** Compact identity-verification status for the account sidebar. */
export function IdentityCard({ status }: { status: Status }) {
  const look = LOOK[status ?? "none"];
  return (
    <section aria-labelledby="id-h" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="id-h" className="text-base font-bold">Identity verification</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${look.chip}`}>{look.label}</span>
      </div>
      <p className="text-sm text-muted">{look.hint}</p>
      <Link href="/account/verify" className={`flex min-h-11 items-center justify-center rounded-input text-sm font-semibold ${status === "verified" ? "border border-border" : "bg-primary text-white hover:bg-primary-hover"}`}>
        {status === "verified" ? "View details" : status === "pending" ? "See status" : "Verify my identity"}
      </Link>
    </section>
  );
}
