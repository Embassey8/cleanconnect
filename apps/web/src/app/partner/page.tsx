import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { availableActions, formatNaira, partnerScore, partnerTier, type OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnPartner } from "@/lib/auth/partner";
import { formatWhen, lagosDayRange, lagosWeekStart } from "@/lib/time";
import { ACTIVE, ORDER_COLUMNS, jobTitle, jobWhere, one, type PartnerOrder } from "@/lib/partner-ui";
import { OfferButtons } from "@/components/ops/Buttons";
import { ActionButtons } from "@/components/orders/ActionButtons";
import { OrderMedia } from "@/components/media/OrderMedia";
import { AvailabilityToggle, Countdown } from "@/components/partner/PartnerControls";

const STEPS = ["Arrived", "Condition checked", "Washing", "Customer sign-off"];
const STEP_AT: Partial<Record<OrderStatus, number>> = { assigned: 0, en_route: 0, arrived: 1, condition_checked: 2, washing: 2, awaiting_signoff: 3 };
const tile = "flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4";

async function Jobs() {
  await connection(); // the day/week windows below read the clock
  const p = await requireOwnPartner();
  const supabase = await createClient();
  const { start, end } = lagosDayRange();
  const week = lagosWeekStart();
  // One lean query: open work, today's jobs and this week's finished jobs.
  const open = `(${["assigning", ...ACTIVE].join(",")})`;
  const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("provider_id", p.id)
    .or(`status.in.${open},and(scheduled_at.gte.${start},scheduled_at.lte.${end}),settled_at.gte.${week}`)
    .order("scheduled_at", { ascending: true, nullsFirst: false }).limit(60);
  const rows = (data ?? []) as unknown as PartnerOrder[];
  const { data: jobs } = rows.length ? await supabase.from("carwash_jobs").select("order_id, partner_payout, offer_expires_at").in("order_id", rows.map((o) => o.id)) : { data: [] };
  const jobMap = new Map((jobs ?? []).map((j) => [j.order_id, j]));
  const payoutOf = (id: string) => jobMap.get(id)?.partner_payout ?? 0;

  const today = rows.filter((o) => o.scheduled_at && o.scheduled_at >= start && o.scheduled_at <= end && !["requested", "assigning", "cancelled", "declined", "expired"].includes(o.status));
  const done = today.filter((o) => o.status === "completed").length;
  const onSite = today.filter((o) => ["arrived", "condition_checked", "washing", "awaiting_signoff"].includes(o.status)).length;
  const weekPayout = rows.filter((o) => o.escrow_status === "released" && o.settled_at && o.settled_at >= week).reduce((a, o) => a + payoutOf(o.id), 0);
  const offers = rows.filter((o) => o.status === "assigning");
  const active = rows.find((o) => ACTIVE.includes(o.status));

  const s = p.stats;
  const score = partnerScore(s);
  const tier = partnerTier(score, s.jobsCompleted);
  const onTime = s.jobsCompleted ? Math.round((s.onTimeJobs / s.jobsCompleted) * 100) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[26px] font-extrabold">{p.display_name}</h1><span className="rounded-md bg-carwash-bg px-2 py-1 text-[11px] font-extrabold text-carwash">HAND-PICKED PARTNER</span></div>
          <span className="text-sm text-muted">{p.areas.length ? `Zone: ${p.areas.join(", ")}` : "No zone set"} · {s.jobsCompleted} job{s.jobsCompleted === 1 ? "" : "s"} completed</span>
        </div>
        <AvailabilityToggle on={p.accepting} />
      </div>

      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}><span className="text-[13px] text-muted">Jobs today</span><span className="text-[26px] font-extrabold">{today.length}</span>
          <span className="text-xs text-muted">{done} done · {onSite} on site · {Math.max(0, today.length - done - onSite)} to go</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Payout this week</span><span className="text-[26px] font-extrabold">{formatNaira(weekPayout)}</span><span className="text-xs text-muted">Paid every Friday</span></div>
        <div className={tile}><span className="text-[13px] text-muted">On-time arrival</span><span className="text-[26px] font-extrabold">{onTime === null ? "—" : `${onTime}%`}</span><span className="text-xs text-muted">{s.jobsCompleted ? `Over ${s.jobsCompleted} job${s.jobsCompleted === 1 ? "" : "s"}` : "After your first job"}</span></div>
        <Link href="/partner/score" className="flex flex-col gap-1 rounded-[14px] bg-carwash p-4 text-white"><span className="text-[13px] text-[#d6e2f5]">Partner score</span>
          <span className="text-[26px] font-extrabold">{score === null ? "—" : `${score} / 100`}</span>
          <span className="text-xs text-[#d6e2f5]">{tier === "new" ? "Builds after your first jobs" : tier === "gold" ? "Gold tier · priority jobs" : `${tier[0].toUpperCase()}${tier.slice(1)} tier`}</span></Link>
      </section>

      <section aria-labelledby="as-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5"><h2 id="as-h" className="text-xl font-extrabold">New jobs from CleanConnect</h2><span className="text-[13px] text-muted">Accept within the time shown or it goes to the next partner</span></div>
        {offers.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{p.accepting ? "No new offers right now." : "You're paused, so no new offers will arrive. Switch on “Available for jobs” to receive them."}</p> : offers.map((o, i) => {
          const j = jobMap.get(o.id);
          return i === 0 ? (
            <article key={o.id} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-accent bg-surface p-[18px]">
              <div className="flex flex-wrap justify-between gap-2.5">
                <div className="flex flex-col gap-1"><span className="text-[17px] font-bold">{jobTitle(o)}</span><span className="text-sm text-muted">{jobWhere(o)} · {formatWhen(o.scheduled_at ?? o.created_at)}</span></div>
                <span className="self-start rounded-full bg-warning-bg px-2.5 py-1.5 text-[13px] font-bold text-warning">{j ? <Countdown until={j.offer_expires_at} /> : "Respond soon"}</span>
              </div>
              {o.notes && <div className="flex flex-wrap gap-2"><span className="rounded-lg bg-bg px-2.5 py-1.5 text-[13px]">{o.notes}</span></div>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bg-admin pt-3">
                <span className="flex flex-col"><span className="text-xs text-muted">Your fixed payout</span><span className="text-xl font-extrabold">{formatNaira(payoutOf(o.id))}</span></span>
                <OfferButtons orderId={o.id} />
              </div>
            </article>
          ) : (
            <article key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-[18px]">
              <div className="flex flex-col gap-1"><span className="text-base font-bold">{jobTitle(o)}</span><span className="text-sm text-muted">{jobWhere(o)} · {formatWhen(o.scheduled_at ?? o.created_at)}</span></div>
              <span className="flex flex-wrap items-center gap-2"><span className="mr-1.5 text-[17px] font-extrabold">{formatNaira(payoutOf(o.id))}</span><OfferButtons orderId={o.id} /></span>
            </article>
          );
        })}
      </section>

      {active ? (
        <section aria-labelledby="aj-h" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap justify-between gap-2.5">
            <h2 id="aj-h" className="text-lg font-extrabold">Active job · {jobTitle(active)}</h2>
            <span className="text-[13px] text-muted">{one(active.order_addresses)?.area ?? "—"} · {formatWhen(active.scheduled_at)}</span>
          </div>
          <ol aria-label="Job steps" className="grid grid-cols-4 gap-2">
            {STEPS.map((l, i) => {
              const at = STEP_AT[active.status] ?? 0;
              const st = i < at ? "done" : i === at ? "current" : "todo";
              return (
                <li key={l} aria-current={st === "current" ? "step" : undefined} className="flex flex-col gap-1.5">
                  <span className={`h-1.5 rounded-full ${st === "done" ? "bg-carwash" : st === "current" ? "bg-accent" : "bg-border"}`} />
                  <span className={`text-[13px] ${st === "todo" ? "text-muted" : st === "current" ? "font-bold" : "font-semibold"}`}>{l}</span>
                </li>
              );
            })}
          </ol>
          <Suspense fallback={null}><OrderMedia orderId={active.id} service="carwash" status={active.status} viewer="provider" /></Suspense>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-bg-admin pt-3.5">
            <Link href="/support" className="flex min-h-11 items-center rounded-input border border-border px-4 text-sm font-semibold">Report a problem</Link>
            <ActionButtons orderId={active.id} actions={availableActions("carwash", active.status, "provider")} />
          </div>
        </section>
      ) : <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">No active job. Accepted jobs show here with their steps and photos. See <Link href="/partner/schedule" className="font-semibold text-carwash">your schedule</Link>.</p>}
    </>
  );
}

export default function PartnerHome() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Jobs /></Suspense>;
}
