import { Suspense } from "react";
import Link from "next/link";
import { requireOwnProvider } from "@/lib/auth/provider";

const BANNER = {
  pending: ["bg-warning-bg text-warning", "Your verification is being reviewed. You'll be visible to customers once approved."],
  approved: ["bg-primary-tint text-primary", "You're approved and visible to customers."],
  rejected: ["bg-danger-bg text-danger", "Your application was not approved."],
  suspended: ["bg-danger-bg text-danger", "Your profile is suspended. Contact support."],
} as const;

async function Dashboard() {
  const p = await requireOwnProvider();
  const [cls, text] = BANNER[p.status];
  return (
    <>
      <h1 className="text-2xl font-extrabold">{p.display_name}</h1>
      <p role="status" className={`mt-4 rounded-card px-4 py-3 text-sm font-semibold ${cls}`}>
        {text}{p.status === "rejected" && p.rejection_reason ? ` Reason: ${p.rejection_reason}` : ""}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/provider/prices" className="inline-flex min-h-11 items-center rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover">
          Edit prices
        </Link>
        {p.status === "approved" && (
          <Link href={`/p/${p.slug}`} className="inline-flex min-h-11 items-center rounded-input border border-border bg-surface px-5 font-bold">
            View public profile
          </Link>
        )}
      </div>
    </>
  );
}

export default function ProviderHome() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Dashboard /></Suspense>;
}
