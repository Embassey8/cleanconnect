import { Suspense } from "react";
import Link from "next/link";
import { WalletView } from "@/components/wallet/WalletView";

export default function WalletPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
      <Link href="/account" className="text-sm font-semibold text-primary">← My account</Link>
      <h1 className="mb-6 mt-2 text-2xl font-extrabold">Wallet</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><WalletView /></Suspense>
    </main>
  );
}
