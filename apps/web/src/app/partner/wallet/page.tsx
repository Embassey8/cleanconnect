import { Suspense } from "react";
import { WalletView } from "@/components/wallet/WalletView";

export default function PartnerWallet() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-extrabold">Payouts</h1>
      <p className="mb-6 text-sm text-text-2">Completed jobs are set aside as &ldquo;on hold&rdquo; and released to your available balance every Friday.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><WalletView /></Suspense>
    </div>
  );
}
