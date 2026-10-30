import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnPartner } from "@/lib/auth/partner";
import { clockTime, formatWhen, lagosDayRange } from "@/lib/time";
import { ORDER_COLUMNS, jobTitle, one, statusChip, type PartnerOrder } from "@/lib/partner-ui";

const card = "flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5";

function Row({ o, showDate }: { o: PartnerOrder; showDate?: boolean }) {
  const c = statusChip(o.status);
  return (
    <Link href={`/partner/orders/${o.id}`} className={`flex items-center gap-3.5 border-b border-bg-admin py-2.5 last:border-0 ${["arrived", "condition_checked", "washing"].includes(o.status) ? "bg-[#fffbf3]" : ""}`}>
      <span className={`${showDate ? "w-[120px]" : "w-[70px]"} shrink-0 text-[13px] font-bold text-muted`}>{o.scheduled_at ? (showDate ? formatWhen(o.scheduled_at) : clockTime(o.scheduled_at)) : "—"}</span>
      <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold">{jobTitle(o)}</span><span className="truncate text-xs text-muted">{one(o.order_addresses)?.area ?? "Area shown after you accept"}</span></span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${c.cls}`}>{c.text}</span>
    </Link>
  );
}

async function Schedule() {
  await connection();
  const p = await requireOwnPartner();
  const supabase = await createClient();
  const { start, end } = lagosDayRange();
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("provider_id", p.id)
    .gte("scheduled_at", start).not("status", "in", "(requested,assigning,cancelled,declined,expired,completed,disputed)")
    .order("scheduled_at").limit(40);
  const rows = (data ?? []) as unknown as PartnerOrder[];
  const { data: doneToday } = await supabase.from("orders").select(ORDER_COLUMNS).eq("provider_id", p.id)
    .eq("status", "completed").gte("scheduled_at", start).lte("scheduled_at", end).order("scheduled_at");
  const today = [...((doneToday ?? []) as unknown as PartnerOrder[]), ...rows.filter((o) => o.scheduled_at! <= end)].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const upcoming = rows.filter((o) => o.scheduled_at! > end);
  return (
    <>
      <section aria-labelledby="sch-h" className={card}>
        <h2 id="sch-h" className="mb-2.5 text-lg font-extrabold">Today</h2>
        {today.length === 0 ? <p className="text-sm text-muted">Nothing scheduled for today.</p> : today.map((o) => <Row key={o.id} o={o} />)}
      </section>
      <section aria-labelledby="up-h" className={card}>
        <h2 id="up-h" className="mb-2.5 text-lg font-extrabold">Coming up</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">No upcoming jobs. New offers appear on <Link href="/partner" className="font-semibold text-carwash">Assigned jobs</Link>.</p> : upcoming.map((o) => <Row key={o.id} o={o} showDate />)}
      </section>
    </>
  );
}

export default function SchedulePage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Today&apos;s schedule</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Schedule /></Suspense>
    </>
  );
}
