import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";

export const metadata: Metadata = { title: "Page not found · CleanConnect" };

export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-primary">404</p>
        <h1 className="text-3xl font-extrabold text-ink">We can&apos;t find that page</h1>
        <p className="text-muted">The link may be old, or the provider is no longer listed. Try the marketplace to find cleaning, laundry and car wash services.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link href="/marketplace" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-bold text-white">Browse the marketplace</Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 font-bold text-ink">Go home</Link>
        </div>
      </div>
    </PublicShell>
  );
}
