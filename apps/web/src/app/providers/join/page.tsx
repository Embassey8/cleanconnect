import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_COMMISSION_RATE } from "@cleanconnect/shared";
import { Logo } from "@/components/shell/PublicShell";
import { JoinForm } from "@/components/providers/JoinForm";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

async function Gate() {
  const user = await getSessionUser();
  if (!user) {
    const next = encodeURIComponent("/providers/join");
    return (
      <div className="max-w-xl rounded-card border border-border bg-surface p-6">
        <p className="mb-4 text-text-2">Create an account or sign in first, then come back to register.</p>
        <Link href={`/signup?next=${next}`} className="mr-3 inline-flex min-h-11 items-center rounded-input bg-primary px-5 font-bold text-white">Create account</Link>
        <Link href={`/login?next=${next}`} className="inline-flex min-h-11 items-center font-semibold text-primary">Sign in</Link>
      </div>
    );
  }
  if (user.role !== "customer") {
    return <p className="rounded-card border border-border bg-surface p-6">Your account is already set up as a {user.role}. <Link className="font-semibold text-primary" href={user.role === "provider" ? "/provider" : "/account"}>Go to your dashboard</Link></p>;
  }
  const supabase = await createClient();
  const { data: s } = await supabase.from("money_settings").select("vip_price").maybeSingle();
  return <JoinForm commissionPct={Math.round(DEFAULT_COMMISSION_RATE * 100)} vipPrice={s?.vip_price ?? 20000} />;
}

export default function JoinPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3"><Logo /><span className="rounded-md border border-border px-2 py-1 text-[13px] font-semibold text-muted">for Providers</span></div>
          <span className="text-sm text-muted">Already registered? <Link href="/login?next=%2Fprovider" className="font-semibold text-primary">Log in</Link></span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-7 px-4 pb-16 pt-9 md:px-6">
        <div className="flex max-w-[760px] flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Offer your services on CleanConnect</h1>
          <p className="text-base leading-relaxed text-muted">Register as a business or an individual. Once our team approves your verification, customers can find, message and book you.</p>
        </div>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Gate /></Suspense>
      </main>
    </div>
  );
}
