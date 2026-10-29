import { Suspense } from "react";
import { STATUS_LABEL, formatNaira, partnerScore, partnerTier, rankPartners, type OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { AssignControl } from "@/components/ops/Buttons";

async function Requests() {
  const supabase = await createClient();
  const [{ data: orders }, { data: partners }] = await Promise.all([
    supabase.from("orders")
      .select("id, status, total, scheduled_at, created_at, carwash_package, vehicle, is_mobile, providers(display_name), order_addresses(area)")
      .eq("service", "carwash").in("status", ["requested", "assigning", "assigned", "en_route", "arrived", "condition_checked", "washing", "awaiting_signoff"])
      .order("created_at"),
    supabase.from("providers")
      .select("id, display_name, areas, partner_scores(offers_total, offers_accepted, jobs_completed, on_time_jobs)")
      .eq("service", "carwash").eq("status", "approved"),
  ]);
  const { data: quality } = await supabase.from("partner_quality").select("provider_id, rating_avg, jobs_completed, photo_jobs");
  const qById = new Map((quality ?? []).map((q) => [q.provider_id, q]));
  const ranked = rankPartners((partners ?? []).map((p) => {
    const s = (Array.isArray(p.partner_scores) ? p.partner_scores[0] : p.partner_scores) as
      { offers_total: number; offers_accepted: number; jobs_completed: number; on_time_jobs: number } | null;
    const q = qById.get(p.id);
    const stats = {
      offersTotal: s?.offers_total ?? 0, offersAccepted: s?.offers_accepted ?? 0, jobsCompleted: s?.jobs_completed ?? 0, onTimeJobs: s?.on_time_jobs ?? 0,
      rating: q?.rating_avg == null ? null : Number(q.rating_avg),
      photoCompliance: q && q.jobs_completed > 0 ? q.photo_jobs / q.jobs_completed : null,
    };
    return { id: p.id, name: p.display_name, areas: p.areas as string[], stats };
  }));
  const options = ranked.map((p) => {
    const sc = partnerScore(p.stats);
    return { id: p.id, label: `${p.name}${p.areas.length ? ` (${p.areas.join(", ")})` : ""} · ${sc ?? "no score"}${sc !== null ? ` · ${partnerTier(sc, p.stats.jobsCompleted)}` : ""}` };
  });
  const rows = orders ?? [];
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No car wash requests right now.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((o) => {
        const prov = (Array.isArray(o.providers) ? o.providers[0] : o.providers) as { display_name: string } | null;
        const addr = (Array.isArray(o.order_addresses) ? o.order_addresses[0] : o.order_addresses) as { area: string | null } | null;
        const assignable = o.status === "requested" || o.status === "assigning";
        return (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <div>
              <p className="font-extrabold capitalize">{o.carwash_package} · {o.vehicle} · {formatNaira(o.total)}</p>
              <p className="text-sm text-text-2">{o.is_mobile ? "Come to customer" : "Drop-off"}{addr?.area ? ` · ${addr.area}` : ""} · {formatWhen(o.scheduled_at ?? o.created_at)}</p>
              <p className="text-sm font-semibold text-primary">{STATUS_LABEL[o.status as OrderStatus]}{prov ? ` · ${prov.display_name}` : ""}</p>
            </div>
            {assignable && <AssignControl orderId={o.id} partners={options} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function RequestsPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">User requests</h1>
      <p className="mb-6 text-text-2">Offer each car wash to a partner (best score first). They have 10 minutes to accept; the customer is charged when they do.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Requests /></Suspense>
    </>
  );
}
