import { Suspense } from "react";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { formatWhen, isoInDays } from "@/lib/time";

async function Subs() {
  const supabase = await createClient();
  const soon = isoInDays(7);
  const { data } = await supabase.from("vip_subscriptions").select("id, status, price, current_period_end, auto_renew, providers(display_name)").order("current_period_end");
  const rows = data ?? [];
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No VIP subscriptions yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((s) => {
        const p = (Array.isArray(s.providers) ? s.providers[0] : s.providers) as { display_name: string } | null;
        const due = s.status === "active" && s.current_period_end < soon;
        return (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4 text-sm">
            <span className="font-bold">{p?.display_name}</span>
            <span className="text-text-2">{formatNaira(s.price)} · {s.status === "active" ? `renews ${formatWhen(s.current_period_end)}` : "expired"}</span>
            <span className="flex gap-2 text-xs font-bold">
              {due && <span className="rounded-full bg-warning-bg px-3 py-1 text-warning">Renewal due within 7 days</span>}
              {s.status === "active" && !s.auto_renew && <span className="rounded-full bg-danger-bg px-3 py-1 text-danger">Won&apos;t renew</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminVip() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">VIP</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Subs /></Suspense>
    </>
  );
}
