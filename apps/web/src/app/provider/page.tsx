import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PROVIDER_TABS, formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { isoInDays, lagosDayRange, lagosWeekStart } from "@/lib/time";
import { AvailabilityToggle } from "@/components/partner/PartnerControls";
import { TabOrders } from "@/components/provider/OrderCards";
import { PricesCard, TeamCard, VipCard, WithdrawCard } from "@/components/provider/SideCards";
import { LaundryOverview } from "@/components/provider/LaundryOverview";

const BANNER = {
  pending: ["bg-warning-bg text-warning", "Your verification is being reviewed. You'll be visible to customers once approved."],
  approved: null,
  rejected: ["bg-danger-bg text-danger", "Your application was not approved."],
  suspended: ["bg-danger-bg text-danger", "Your profile is suspended. Contact support."],
} as const;

const tile = "flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4";
const wait = <div className="h-32 animate-pulse rounded-2xl bg-border/60" />;

async function Overview({ searchParams }: { searchParams: PageProps<"/provider">["searchParams"] }) {
  await connection(); // today/week/30-day windows read the clock
  const p = await requireOwnProvider();
  if (p.service === "laundry") return <LaundryOverview p={p} searchParams={searchParams} />;
  const service = "cleaning" as const;
  const tabs = PROVIDER_TABS[service];
  const raw = (await searchParams).tab;
  const tabId = tabs.some((t) => t.id === raw) ? (raw as string) : tabs[0].id;
  const supabase = await createClient();

  // One light query powers the tiles and the tab counts.
  const { data: sum } = await supabase.from("orders")
    .select("status, scheduled_at, total, commission_amount, escrow_status, settled_at, created_at")
    .eq("provider_id", p.id).order("created_at", { ascending: false }).limit(400);
  const rows = sum ?? [];
  const [{ data: st }, { data: threads }] = await Promise.all([
    supabase.from("provider_stats").select("rating_avg, rating_count").eq("provider_id", p.id).maybeSingle(),
    service === "cleaning" ? supabase.from("threads").select("id, messages(kind, sender_id)").eq("provider_id", p.id) : Promise.resolve({ data: [] }),
  ]);
  const { data: checks } = await supabase.from("verifications").select("kind, status").eq("provider_id", p.id);

  const { start, end } = lagosDayRange();
  const week = lagosWeekStart();
  const day30 = isoInDays(-30);
  const count = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;
  const today = rows.filter((r) => r.scheduled_at && r.scheduled_at >= start && r.scheduled_at <= end && !["requested", "cancelled", "declined", "expired"].includes(r.status));
  const inProgressToday = today.filter((r) => PROVIDER_TABS[service].find((t) => t.id === "progress")!.statuses.includes(r.status as never)).length;
  const earned = rows.filter((r) => r.escrow_status === "released" && r.settled_at && r.settled_at >= week).reduce((a, r) => a + r.total - (r.commission_amount ?? 0), 0);
  const recent = rows.filter((r) => r.created_at >= day30);
  const done30 = recent.filter((r) => r.status === "completed").length;
  const failed30 = recent.filter((r) => ["declined", "expired", "disputed"].includes(r.status)).length;
  const completion = done30 + failed30 > 0 ? Math.round((done30 / (done30 + failed30)) * 100) : null;
  const awaiting = count(["awaiting_confirmation", "delivered"]);
  // Quote requests: chats where the customer wrote last-ish and no quote was sent yet.
  const quoteThreads = (threads ?? []).filter((t) => { const m = (t.messages ?? []) as { kind: string }[]; return m.length > 0 && !m.some((x) => x.kind === "quote"); });

  const banner = BANNER[p.status];
  const verified = (checks ?? []).filter((c) => c.status === "verified").map((c) => c.kind.toUpperCase());
  const rating = st?.rating_avg == null ? null : Number(st.rating_avg);
  const sub = [p.type === "business" ? "Business" : "Individual", verified.length ? `${verified.join(" + ")} verified` : null, rating === null ? "No ratings yet" : `★ ${rating.toFixed(1)} (${st?.rating_count} review${st?.rating_count === 1 ? "" : "s"})`].filter(Boolean).join(" · ");

  const tabLink = (id: string, label: string, n: number | null) => (
    <Link key={id} role="tab" aria-selected={tabId === id} href={id === tabs[0].id ? "/provider" : `/provider?tab=${id}`}
      className={`flex min-h-10 items-center rounded-full px-3.5 text-[13px] ${tabId === id ? "bg-primary font-bold text-white" : "border border-border bg-surface"}`}>{label}{n !== null && n > 0 ? ` · ${n}` : ""}</Link>
  );

  return (
    <>
      {banner && <p role="status" className={`rounded-card px-4 py-3 text-sm font-semibold ${banner[0]}`}>{banner[1]}{p.status === "rejected" && p.rejection_reason ? ` Reason: ${p.rejection_reason}` : ""}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[26px] font-extrabold">{p.display_name}</h1>{p.plan === "vip" && <span className="rounded-md bg-vip-bg px-2 py-1 text-[11px] font-extrabold text-vip">VIP</span>}</div>
          <span className="text-sm text-muted">{sub}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {p.status === "approved" && <Link href={`/p/${p.slug}`} className="flex min-h-11 items-center rounded-input border border-border bg-surface px-3.5 text-sm font-semibold">View public profile</Link>}
          <AvailabilityToggle on={p.accepting_jobs} tone="primary" onLabel="Online — taking jobs" offLabel="Offline — not taking new orders" />
        </div>
      </div>

      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}><span className="text-[13px] text-muted">Jobs today</span><span className="text-[26px] font-extrabold">{today.length}</span><span className="text-xs text-muted">{inProgressToday} in progress</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Earned this week</span><span className="text-[26px] font-extrabold">{formatNaira(earned)}</span><span className="text-xs text-muted">After commission</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Completion rate</span><span className="text-[26px] font-extrabold">{completion === null ? "—" : `${completion}%`}</span><span className="text-xs text-muted">Last 30 days</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Rating</span><span className="text-[26px] font-extrabold">{rating === null ? "—" : `${rating.toFixed(1)} ★`}</span><span className="text-xs text-muted">{st?.rating_count ?? 0} review{st?.rating_count === 1 ? "" : "s"}</span></div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="orders-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <h2 id="orders-h" className="text-xl font-extrabold">Orders</h2>
          <div role="tablist" aria-label="Order status" className="flex flex-wrap gap-1.5">
            {tabs.map((t, i) => (
              <span key={t.id} className="contents">
                {tabLink(t.id, t.label, count(t.statuses))}
                {i === 0 && service === "cleaning" && (
                  <Link role="tab" aria-selected={tabId === "quotes"} href="/provider?tab=quotes" className={`flex min-h-10 items-center rounded-full px-3.5 text-[13px] ${tabId === "quotes" ? "bg-primary font-bold text-white" : "border border-border bg-surface"}`}>
                    Quote requests{quoteThreads.length > 0 ? ` · ${quoteThreads.length}` : ""}</Link>
                )}
              </span>
            ))}
          </div>
          {tabId === "quotes" ? (
            quoteThreads.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">No customers are waiting for a quote.</p> : (
              <ul className="flex flex-col gap-3">
                {quoteThreads.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
                    <span><span className="block text-base font-bold">Quote request</span><span className="text-sm text-muted">A customer is asking for a price in chat.</span></span>
                    <Link href={`/messages/${t.id}`} className="flex min-h-11 items-center rounded-input bg-primary px-4 text-sm font-bold text-white">Send a quote</Link>
                  </li>
                ))}
              </ul>
            )
          ) : <Suspense key={tabId} fallback={wait}><TabOrders providerId={p.id} service={service} tabId={tabId} /></Suspense>}
        </section>

        <div className="flex w-full flex-col gap-4 lg:max-w-[380px] lg:flex-1 lg:basis-80">
          <Suspense fallback={wait}><WithdrawCard awaiting={awaiting} /></Suspense>
          <Suspense fallback={wait}><PricesCard /></Suspense>
          <Suspense fallback={wait}><TeamCard /></Suspense>
          <Suspense fallback={wait}><VipCard /></Suspense>
        </div>
      </div>
    </>
  );
}

export default function ProviderHome(props: PageProps<"/provider">) {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Overview searchParams={props.searchParams} /></Suspense>;
}
