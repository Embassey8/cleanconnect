import { Suspense } from "react";
import Link from "next/link";
import { STATUS_LABEL, TERMINAL, formatNaira, partnerScore, partnerTier, type OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnPartner } from "@/lib/auth/partner";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";
import { OfferButtons } from "@/components/ops/Buttons";

const TIER: Record<string, string> = {
  gold: "bg-vip-bg text-vip", silver: "bg-bg-admin text-text-2", bronze: "bg-warning-bg text-warning", new: "bg-primary-tint text-primary",
};

async function Dashboard() {
  const p = await requireOwnPartner();
  const supabase = await createClient();
  const user = await getSessionUser();
  const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user!.id).maybeSingle();
  const [{ data: orders }, { data: jobs }, { data: rates }, { data: bal }] = await Promise.all([
    supabase.from("orders").select("id, status, total, scheduled_at, carwash_package, vehicle, is_mobile, created_at")
      .eq("provider_id", p.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("carwash_jobs").select("order_id, partner_payout, offer_expires_at"),
    supabase.from("carwash_rates").select("package, vehicle, partner_payout").order("package"),
    supabase.from("wallet_balances").select("available, held").eq("wallet_id", wallet?.id ?? "").maybeSingle(),
  ]);
  const jobMap = new Map((jobs ?? []).map((j) => [j.order_id, j]));
  const rows = orders ?? [];
  const offers = rows.filter((o) => o.status === "assigning");
  const active = rows.filter((o) => !["assigning"].includes(o.status) && !TERMINAL.includes(o.status as OrderStatus));
  const score = partnerScore(p.stats);
  const tier = partnerTier(score, p.stats.jobsCompleted);
  const b = bal as { available: number; held: number } | null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">{p.display_name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${TIER[tier]}`}>{tier === "new" ? "New partner" : `${tier} partner`}</span>
          Score: {score === null ? "not enough jobs yet" : `${score}/100`} · {p.stats.jobsCompleted} jobs · acceptance {p.stats.offersTotal ? Math.round((p.stats.offersAccepted / p.stats.offersTotal) * 100) : 0}%
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface p-4"><p className="text-sm text-muted">Paid out Friday</p><p className="text-2xl font-extrabold">{formatNaira(b?.held ?? 0)}</p></div>
        <div className="rounded-card border border-border bg-surface p-4"><p className="text-sm text-muted">Available to withdraw</p><p className="text-2xl font-extrabold">{formatNaira(b?.available ?? 0)}</p></div>
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Job offers</h2>
        {offers.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No offers right now.</p> : (
          <ul className="space-y-3">
            {offers.map((o) => (
              <li key={o.id} className="rounded-card border border-primary bg-primary-tint p-4">
                <p className="font-bold capitalize">{o.carwash_package} · {o.vehicle} · {o.is_mobile ? "come to customer" : "drop-off"}</p>
                <p className="text-sm text-text-2">You earn {formatNaira(jobMap.get(o.id)?.partner_payout ?? 0)} · {formatWhen(o.scheduled_at ?? o.created_at)}</p>
                <p className="mb-2 text-sm font-semibold text-warning">Respond by {formatWhen(jobMap.get(o.id)?.offer_expires_at ?? null)}</p>
                <OfferButtons orderId={o.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Your jobs</h2>
        {active.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No active jobs.</p> : (
          <ul className="space-y-3">
            {active.map((o) => (
              <li key={o.id}>
                <Link href={`/partner/orders/${o.id}`} className="flex min-h-11 items-center justify-between rounded-card border border-border bg-surface p-4 hover:border-primary">
                  <span className="font-bold capitalize">{o.carwash_package} · {o.vehicle}</span>
                  <span className="text-sm font-bold text-primary">{STATUS_LABEL[o.status as OrderStatus]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Payout rates</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(rates ?? []).map((r) => (
            <li key={`${r.package}${r.vehicle}`} className="flex justify-between rounded-input border border-border bg-surface px-3 py-2">
              <span className="capitalize">{r.package} · {r.vehicle}</span><strong>{formatNaira(r.partner_payout)}</strong>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Payouts are fixed by CleanConnect and paid weekly on Fridays.</p>
      </section>
    </div>
  );
}

export default function PartnerHome() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Dashboard /></Suspense>;
}
