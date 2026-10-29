import { Suspense } from "react";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { formatWhen } from "@/lib/time";
import { WalletView } from "@/components/wallet/WalletView";

async function Earnings() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, service, total, commission_amount, settled_at")
    .eq("provider_id", p.id).eq("escrow_status", "released")
    .order("settled_at", { ascending: false }).limit(20);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-extrabold">Earnings per job</h2>
      <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface">
        {rows.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="capitalize">{o.service}<span className="ml-2 text-muted">{formatWhen(o.settled_at)}</span></span>
            <span>
              <span className="text-muted">Commission {formatNaira(o.commission_amount ?? 0)} · </span>
              <span className="font-bold text-primary">You earned {formatNaira(o.total - (o.commission_amount ?? 0))}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ProviderWallet() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-extrabold">Earnings &amp; wallet</h1>
      <Suspense fallback={null}><Earnings /></Suspense>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><WalletView /></Suspense>
    </div>
  );
}
