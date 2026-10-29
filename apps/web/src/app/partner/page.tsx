import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  STATUS_LABEL, availableActions, formatNaira, partnerScore, partnerTier,
  type OrderStatus,
} from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnPartner } from "@/lib/auth/partner";
import { getSessionUser } from "@/lib/auth/session";
import { clockTime, formatWhen, lagosDayRange, lagosWeekStart } from "@/lib/time";
import { OfferButtons } from "@/components/ops/Buttons";
import { ActionButtons } from "@/components/orders/ActionButtons";
import { OrderMedia } from "@/components/media/OrderMedia";
import { AvailabilityToggle, Countdown } from "@/components/partner/PartnerControls";

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-5";
const PACKAGE: Record<string, string> = { exterior: "Exterior", full: "Full wash", detailing: "Detailing" };
const VEHICLE: Record<string, string> = { saloon: "Saloon", suv: "SUV", van: "Bus / van", pickup: "Pickup" };
const ACTIVE: OrderStatus[] = ["assigned", "en_route", "arrived", "condition_checked", "washing", "awaiting_signoff"];
const STEPS = ["Arrived", "Condition checked", "Washing", "Customer sign-off"];
const STEP_AT: Partial<Record<OrderStatus, number>> = { assigned: 0, en_route: 0, arrived: 1, condition_checked: 2, washing: 2, awaiting_signoff: 3 };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function chipFor(status: OrderStatus): { text: string; cls: string } {
  if (status === "completed") return { text: "Done", cls: "bg-primary-tint text-primary" };
  if (["arrived", "condition_checked", "washing"].includes(status)) return { text: "Washing", cls: "bg-warning-bg text-warning" };
  if (status === "awaiting_signoff") return { text: "Sign-off", cls: "bg-warning-bg text-warning" };
  if (status === "en_route") return { text: "En route", cls: "bg-carwash-bg text-carwash" };
  return { text: STATUS_LABEL[status], cls: "bg-bg-admin text-text-2" };
}

interface Row {
  id: string; status: OrderStatus; total: number; scheduled_at: string | null; created_at: string; carwash_package: string | null; vehicle: string | null;
  is_mobile: boolean | null; notes: string | null; settled_at: string | null; escrow_status: string;
  order_addresses: { area: string | null } | { area: string | null }[] | null;
}

function Bar({ label, value, shown }: { label: string; value: number | null; shown: string }) {
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <span className="flex justify-between"><span>{label}</span><strong>{value === null ? "—" : shown}</strong></span>
      <span className="block h-2 rounded-full bg-bg-admin"><span className="block h-2 rounded-full bg-carwash" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span>
    </div>
  );
}

async function Dashboard() {
  await connection(); // the day/week windows below read the clock
  const p = await requireOwnPartner();
  const user = (await getSessionUser())!;
  const supabase = await createClient();
  const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
  const [{ data: orders }, { data: jobs }, { data: rates }, { data: settings }, { data: bal }] = await Promise.all([
    supabase.from("orders")
      .select("id, status, total, scheduled_at, created_at, carwash_package, vehicle, is_mobile, notes, settled_at, escrow_status, order_addresses(area)")
      .eq("provider_id", p.id).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(200),
    supabase.from("carwash_jobs").select("order_id, partner_payout, offer_expires_at, settled_at"),
    supabase.from("carwash_rates").select("package, vehicle, partner_payout"),
    supabase.from("carwash_settings").select("mobile_bonus").maybeSingle(),
    supabase.from("wallet_balances").select("available, held").eq("wallet_id", wallet?.id ?? "").maybeSingle(),
  ]);
  const rows = (orders ?? []) as unknown as Row[];
  const jobMap = new Map((jobs ?? []).map((j) => [j.order_id, j]));
  const payoutOf = (id: string) => jobMap.get(id)?.partner_payout ?? 0;
  const title = (o: Row) => `${PACKAGE[o.carwash_package ?? ""] ?? "Car wash"} · ${VEHICLE[o.vehicle ?? ""] ?? ""}`.replace(/ · $/, "");
  const where = (o: Row) => `${o.is_mobile ? "Mobile (at customer)" : "Drop-off at your site"}${one(o.order_addresses)?.area ? ` · ${one(o.order_addresses)!.area}` : ""}`;

  const { start, end } = lagosDayRange();
  const weekStart = lagosWeekStart();
  const today = rows.filter((o) => o.scheduled_at && o.scheduled_at >= start && o.scheduled_at <= end && !["requested", "assigning", "cancelled", "declined", "expired"].includes(o.status));
  const done = today.filter((o) => o.status === "completed").length;
  const washing = today.filter((o) => ["arrived", "condition_checked", "washing", "awaiting_signoff"].includes(o.status)).length;
  const weekJobs = rows.filter((o) => o.escrow_status === "released" && o.settled_at && o.settled_at >= weekStart);
  const weekPayout = weekJobs.reduce((a, o) => a + payoutOf(o.id), 0);
  const unsettled = rows.filter((o) => o.escrow_status === "released" && !jobMap.get(o.id)?.settled_at);
  const offers = rows.filter((o) => o.status === "assigning");
  const active = rows.find((o) => ACTIVE.includes(o.status));

  const s = p.stats;
  const score = partnerScore(s);
  const tier = partnerTier(score, s.jobsCompleted);
  const onTime = s.jobsCompleted ? s.onTimeJobs / s.jobsCompleted : null;
  const accept = s.offersTotal ? s.offersAccepted / s.offersTotal : null;
  const tile = "flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4";

  const pkgs = ["exterior", "full", "detailing"] as const;
  const vehs = ["saloon", "suv", "van", "pickup"] as const;
  const rate = (pk: string, v: string) => (rates ?? []).find((r) => r.package === pk && r.vehicle === v)?.partner_payout;

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
          <span className="text-xs text-muted">{done} done · {washing} on site · {Math.max(0, today.length - done - washing)} to go</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Payout this week</span><span className="text-[26px] font-extrabold">{formatNaira(weekPayout)}</span><span className="text-xs text-muted">Paid every Friday</span></div>
        <div className={tile}><span className="text-[13px] text-muted">On-time arrival</span><span className="text-[26px] font-extrabold">{onTime === null ? "—" : `${Math.round(onTime * 100)}%`}</span><span className="text-xs text-muted">{s.jobsCompleted ? `Over ${s.jobsCompleted} job${s.jobsCompleted === 1 ? "" : "s"}` : "After your first job"}</span></div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-carwash p-4 text-white"><span className="text-[13px] text-[#d6e2f5]">Partner score</span>
          <span className="text-[26px] font-extrabold">{score === null ? "—" : `${score} / 100`}</span>
          <span className="text-xs text-[#d6e2f5]">{tier === "new" ? "Builds after your first jobs" : tier === "gold" ? "Gold tier · priority jobs" : `${tier[0].toUpperCase()}${tier.slice(1)} tier`}</span></div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <section aria-labelledby="as-h" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5"><h2 id="as-h" className="text-xl font-extrabold">New jobs from CleanConnect</h2><span className="text-[13px] text-muted">Accept within the time shown or it goes to the next partner</span></div>
            {offers.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">{p.accepting ? "No new offers right now." : "You're paused, so no new offers will arrive. Switch on “Available for jobs” to receive them."}</p> : offers.map((o, i) => {
              const j = jobMap.get(o.id);
              return i === 0 ? (
                <article key={o.id} className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-accent bg-surface p-[18px]">
                  <div className="flex flex-wrap justify-between gap-2.5">
                    <div className="flex flex-col gap-1"><span className="text-[17px] font-bold">{title(o)}</span><span className="text-sm text-muted">{where(o)} · {formatWhen(o.scheduled_at ?? o.created_at)}</span></div>
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
                  <div className="flex flex-col gap-1"><span className="text-base font-bold">{title(o)}</span><span className="text-sm text-muted">{where(o)} · {formatWhen(o.scheduled_at ?? o.created_at)}</span></div>
                  <span className="flex flex-wrap items-center gap-2"><span className="mr-1.5 text-[17px] font-extrabold">{formatNaira(payoutOf(o.id))}</span><OfferButtons orderId={o.id} /></span>
                </article>
              );
            })}
          </section>

          <section id="schedule" aria-labelledby="sch-h" className={`${card} scroll-mt-4 gap-1`}>
            <h2 id="sch-h" className="mb-2.5 text-lg font-extrabold">Today&apos;s schedule</h2>
            {today.length === 0 ? <p className="text-sm text-muted">Nothing scheduled for today.</p> : today.map((o) => {
              const c = chipFor(o.status);
              return (
                <Link key={o.id} href={`/partner/orders/${o.id}`} className={`flex items-center gap-3.5 border-b border-bg-admin py-2.5 last:border-0 ${["arrived", "condition_checked", "washing"].includes(o.status) ? "bg-[#fffbf3]" : ""}`}>
                  <span className="w-[70px] text-[13px] font-bold text-muted">{o.scheduled_at ? clockTime(o.scheduled_at) : "—"}</span>
                  <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{title(o)}</span><span className="text-xs text-muted">{one(o.order_addresses)?.area ?? "Area shown after you accept"}</span></span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.cls}`}>{c.text}</span>
                </Link>
              );
            })}
          </section>

          {active && (
            <section aria-labelledby="aj-h" className={`${card} gap-3.5`}>
              <div className="flex flex-wrap justify-between gap-2.5">
                <h2 id="aj-h" className="text-lg font-extrabold">Active job · {title(active)}</h2>
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
          )}
        </div>

        <div className="flex w-full flex-col gap-4 lg:max-w-[380px] lg:flex-1 lg:basis-80">
          <section id="score" aria-labelledby="ps-h" className={`${card} scroll-mt-4`}>
            <h2 id="ps-h" className="text-base font-extrabold">Partner score breakdown</h2>
            <p className="text-[13px] leading-normal text-muted">A higher score gets you more and better jobs.</p>
            <Bar label="Customer rating" value={s.rating == null ? null : s.rating / 5} shown={s.rating == null ? "—" : s.rating.toFixed(1)} />
            <Bar label="On-time arrival" value={onTime} shown={`${Math.round((onTime ?? 0) * 100)}%`} />
            <Bar label="Job acceptance" value={accept} shown={`${Math.round((accept ?? 0) * 100)}%`} />
            <Bar label="Photo compliance" value={s.photoCompliance ?? null} shown={`${Math.round((s.photoCompliance ?? 0) * 100)}%`} />
          </section>

          <section id="rates" aria-labelledby="pr-h" className={`${card} scroll-mt-4 gap-2.5`}>
            <div className="flex items-center justify-between"><h2 id="pr-h" className="text-base font-extrabold">Your payout rates</h2><span className="rounded-md bg-bg-admin px-2 py-1 text-[11px] font-bold text-text-2">Set by CleanConnect</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] border-collapse text-[13px]">
                <thead><tr className="text-left text-muted"><th className="px-1 py-1.5 font-semibold">Package</th>{vehs.map((v) => <th key={v} className="px-1 py-1.5 font-semibold">{VEHICLE[v].split(" ")[0]}</th>)}</tr></thead>
                <tbody>{pkgs.map((pk) => (
                  <tr key={pk}><td className="border-t border-bg-admin px-1 py-[7px] font-semibold">{PACKAGE[pk]}</td>
                    {vehs.map((v) => <td key={v} className="border-t border-bg-admin px-1 py-[7px]">{rate(pk, v) == null ? "—" : formatNaira(rate(pk, v)!)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <span className="text-xs text-muted">+ {formatNaira(settings?.mobile_bonus ?? 0)} mobile call-out bonus per job</span>
          </section>

          <section aria-labelledby="po-h" className="flex flex-col gap-2.5 rounded-2xl bg-ink p-5 text-white">
            <h2 id="po-h" className="text-sm font-semibold text-[#c9d4d0]">Next payout · Friday</h2>
            <span className="-mt-1 text-[28px] font-extrabold">{formatNaira(bal?.held ?? 0)}</span>
            <span className="text-[13px] text-[#c9d4d0]">{unsettled.length} completed job{unsettled.length === 1 ? "" : "s"} waiting · {formatNaira(bal?.available ?? 0)} available to withdraw</span>
            <Link href="/partner/wallet" className="py-1.5 text-sm font-bold text-accent">View payouts &amp; withdraw →</Link>
          </section>
        </div>
      </div>
    </>
  );
}

export default function PartnerHome() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Dashboard /></Suspense>;
}
