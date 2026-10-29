import { Suspense } from "react";
import Link from "next/link";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { DisputeButtons, PayoutButtons, RunJobsButton } from "@/components/admin/MoneyButtons";

async function Payouts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payouts")
    .select("id, amount, bank_name, account_name, account_last4, eta_hours, created_at, users(name)")
    .eq("status", "pending").order("created_at");
  const rows = data ?? [];
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No withdrawals waiting.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((p) => {
        const u = (Array.isArray(p.users) ? p.users[0] : p.users) as { name: string } | null;
        return (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <div>
              <p className="font-extrabold">{formatNaira(p.amount)} <span className="font-normal text-muted">for {u?.name || "user"}</span></p>
              <p className="text-sm text-text-2">{p.account_name} · {p.bank_name} ····{p.account_last4}</p>
              <p className="text-xs text-muted">Requested {formatWhen(p.created_at)} · due within {p.eta_hours}h</p>
            </div>
            <PayoutButtons payoutId={p.id} />
          </li>
        );
      })}
    </ul>
  );
}

async function Disputes() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, service, total, created_at, providers(display_name)")
    .eq("status", "disputed").eq("escrow_status", "held").order("created_at");
  const rows = data ?? [];
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No open disputes.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((o) => {
        const p = (Array.isArray(o.providers) ? o.providers[0] : o.providers) as { display_name: string } | null;
        return (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <div>
              <p className="font-extrabold capitalize">{o.service} · {formatNaira(o.total)}</p>
              <p className="text-sm text-text-2">{p?.display_name ?? "Car wash"} ·{" "}
                <Link href={`/account/orders/${o.id}`} className="font-semibold text-primary">View order</Link></p>
            </div>
            <DisputeButtons orderId={o.id} />
          </li>
        );
      })}
    </ul>
  );
}

async function Platform() {
  const supabase = await createClient();
  const { data: w } = await supabase.from("wallets").select("id").eq("kind", "platform").maybeSingle();
  const { data: b } = w ? await supabase.from("wallet_balances").select("available").eq("wallet_id", w.id).maybeSingle() : { data: null };
  return <p className="text-sm text-text-2">Platform balance (commission and VIP fees): <strong>{formatNaira(b?.available ?? 0)}</strong></p>;
}

export default function PayoutsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Payouts &amp; disputes</h1>
        <Suspense fallback={null}><Platform /></Suspense>
      </div>
      <section>
        <h2 className="mb-2 font-extrabold">Withdrawals to settle</h2>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Payouts /></Suspense>
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Disputed orders</h2>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Disputes /></Suspense>
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Scheduled jobs</h2>
        <p className="mb-2 text-sm text-text-2">Expires unanswered requests (refunding them), auto-confirms silent customers and renews VIP plans. Until a scheduler is connected, run them here.</p>
        <RunJobsButton />
      </section>
    </div>
  );
}
