import { Suspense } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";
import { VerifyIdentityForm } from "@/components/wallet/WalletForms";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";

async function Loader() {
  const user = (await getSessionUser())!;
  if (user.role !== "customer") {
    return (
      <p className="rounded-card border border-border bg-surface p-5 text-sm text-text-2">
        Identity checks for service providers happen when you register and decide whether you appear in the marketplace.{" "}
        <Link href={user.role === "provider" ? "/provider" : "/account"} className="font-semibold text-primary">Go back</Link>
      </p>
    );
  }
  const supabase = await createClient();
  const { data: v } = await supabase.from("user_verifications").select("kind, status, provider_ref, verified_at").eq("user_id", user.id).maybeSingle();

  if (v?.status === "verified") {
    return (
      <section className="space-y-4 rounded-card border border-border bg-surface p-6" role="status">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0b6b57" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <div>
            <h2 className="text-lg font-extrabold">Identity verified</h2>
            <p className="text-sm text-muted">{formatWhen(v.verified_at)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-bg p-4 text-sm">
          <div><dt className="text-muted">ID type</dt><dd className="font-semibold">{String(v.kind).toUpperCase()}</dd></div>
          <div><dt className="text-muted">Number</dt><dd className="font-semibold">•••••••{v.provider_ref}</dd></div>
        </dl>
        <p className="text-sm text-text-2">You can add money to your wallet and withdraw. We only keep the last 4 digits of your number.</p>
        <Link href="/account/wallet" className="flex min-h-11 items-center justify-center rounded-input bg-primary text-sm font-bold text-white hover:bg-primary-hover">Go to wallet</Link>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-card border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-extrabold">Verify your identity</h2>
        <p className="mt-1 text-sm text-text-2">
          To keep everyone&apos;s money safe, we confirm who you are before you can add money or withdraw. Enter your NIN or BVN and we&apos;ll check it
          against the name on your account.
        </p>
      </div>
      {v?.status === "pending" && (
        <p role="status" className="rounded-input bg-warning-bg px-3 py-2 text-sm font-semibold text-warning">
          We&apos;re still checking your last submission. You can submit again if it&apos;s been more than a few minutes.
        </p>
      )}
      <VerifyIdentityForm previous={v?.status as "mismatch" | "failed" | "pending" | undefined} />
    </section>
  );
}

export default function VerifyPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-md">
        <Link href="/account" className="text-sm font-semibold text-primary">← My account</Link>
        <h1 className="mb-6 mt-2 text-2xl font-extrabold">Identity verification</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Loader /></Suspense>
      </div>
    </PublicShell>
  );
}
