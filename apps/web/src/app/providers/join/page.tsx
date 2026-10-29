import { Suspense } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";
import { JoinForm } from "@/components/providers/JoinForm";
import { getSessionUser } from "@/lib/auth/session";

async function Gate() {
  const user = await getSessionUser();
  if (!user) {
    const next = encodeURIComponent("/providers/join");
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <p className="mb-4 text-text-2">Create an account or sign in first, then come back to register.</p>
        <Link href={`/signup?next=${next}`} className="mr-3 inline-flex min-h-11 items-center rounded-input bg-primary px-5 font-bold text-white">Create account</Link>
        <Link href={`/login?next=${next}`} className="inline-flex min-h-11 items-center font-semibold text-primary">Sign in</Link>
      </div>
    );
  }
  if (user.role !== "customer") {
    return <p className="rounded-card border border-border bg-surface p-6">Your account is already set up as a {user.role}. <Link className="font-semibold text-primary" href="/account">Go to your account</Link></p>;
  }
  return <JoinForm />;
}

export default function JoinPage() {
  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">Offer your services on CleanConnect</h1>
      <p className="mb-8 mt-2 max-w-2xl text-text-2">
        Register as a business or an individual. Once our team approves your verification, customers can find, message and book you.
      </p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Gate /></Suspense>
    </PublicShell>
  );
}
