import Link from "next/link";
import { connection } from "next/server";
import {
  STATUS_LABEL, TICKET_PRIORITY_ORDER, computeProfit, formatNaira, partnerScore, partnerTier, rankPartners,
  type MonthlyFinance, type OrderStatus,
} from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatWhen, recentMonths, timeAgo } from "@/lib/time";
import { AssignControl } from "@/components/ops/Buttons";
import { ReplyForm } from "@/components/ops/Forms";
import { ReviewButtons } from "./ReviewButtons";

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]";
const h2 = "text-lg font-bold";
const sub = "text-sm font-medium text-muted";
const chip = "rounded-md px-2 py-1 text-xs font-bold";
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** ₦18.4m for millions, full naira below that. */
export const money = (n: number) => (Math.abs(n) >= 1_000_000 ? `${n < 0 ? "−" : ""}₦${(Math.abs(n) / 1_000_000).toFixed(1)}m` : formatNaira(n));
const monthDate = (key: string) => `${key}-01`;

async function finance(key: string): Promise<{ raw: MonthlyFinance; calc: ReturnType<typeof computeProfit> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_finance", { p_month: monthDate(key) });
  if (error || !data) return null;
  const raw: MonthlyFinance = {
    marketplaceCommission: data.marketplace_commission, carwashRevenue: data.carwash_revenue, vip: data.vip,
    advertising: data.advertising, partnerPayouts: data.partner_payouts, expenses: data.expenses as Record<string, number>,
  };
  return { raw, calc: computeProfit(raw) };
}

const change = (cur: number, prev: number) => (prev > 0 ? `${cur >= prev ? "+" : "−"}${Math.abs(Math.round(((cur - prev) / prev) * 1000) / 10)}% vs last month` : null);

/* ---------- Key numbers ---------- */
export async function Kpis({ month }: { month: string }) {
  const supabase = await createClient();
  const months = recentMonths(7);
  const idx = Math.max(0, months.findIndex((m) => m.key === month));
  const [{ data: o }, cur, prev, { count: users }, { count: newUsers }] = await Promise.all([
    supabase.rpc("admin_overview"),
    finance(month),
    finance(months[idx + 1]?.key ?? month),
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", `${month}-01`),
  ]);
  const s = (o ?? {}) as Record<string, number>;
  const providers = (s.providers_business ?? 0) + (s.providers_individual ?? 0) + (s.partners ?? 0);
  const tile = "flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface p-[18px]";
  const label = "text-[13px] text-muted";
  const value = "text-[28px] font-extrabold";
  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
      <div className={tile}><span className={label}>Total users</span><span className={value}>{(users ?? 0).toLocaleString("en-NG")}</span>
        <span className="text-xs font-semibold text-primary">{newUsers ? `+${newUsers} this month` : "None new this month"}</span></div>
      <div className={tile}><span className={label}>On the website now</span><span className={value}>—</span><span className="text-xs text-muted">Live visitors aren&apos;t tracked yet</span></div>
      <div className={tile}><span className={label}>Service providers</span><span className={value}>{providers.toLocaleString("en-NG")}</span>
        <span className="text-xs text-muted">{s.providers_business ?? 0} shops · {s.providers_individual ?? 0} individuals · {s.partners ?? 0} car wash</span></div>
      <div className={tile}><span className={label}>Employees</span><span className={value}>{s.employees ?? 0}</span><span className="text-xs text-muted">Admin accounts</span></div>
      <div className={tile}><span className={label}>Income (month)</span><span className={value}>{cur ? money(cur.calc.income) : "—"}</span>
        <span className="text-xs font-semibold text-primary">{cur && prev && change(cur.calc.income, prev.calc.income)}</span></div>
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-primary p-[18px] text-white"><span className="text-[13px] text-[#cdebe1]">Net profit (month)</span>
        <span className={value}>{cur ? money(cur.calc.profit) : "—"}</span><span className="text-xs text-[#cdebe1]">{cur ? `${cur.calc.margin}% margin` : "Finance access needed"}</span></div>
    </section>
  );
}

/* ---------- Income & profit ---------- */
export async function FinanceSection({ month }: { month: string }) {
  await connection(); // the month list below reads the clock
  const months = recentMonths(6).reverse();
  const results = await Promise.all(months.map((m) => finance(m.key)));
  const cur = (await finance(month)) ?? null;
  if (!cur) return <section className={card}><h2 className={h2}>Income &amp; profit</h2><p className="text-sm text-muted">Finance details are visible to finance admins.</p></section>;
  const max = Math.max(1, ...results.map((r) => r?.calc.income ?? 0));
  const long = recentMonths(12).find((m) => m.key === month)?.long ?? month;
  const row = (k: string, v: string, tone?: string) => <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd className={`font-semibold ${tone ?? ""}`}>{v}</dd></div>;
  const total = (k: string, v: string, tone?: string) => <div className="flex justify-between border-t border-border pt-2.5"><dt className="font-bold">{k}</dt><dd className={`font-extrabold ${tone ?? ""}`}>{v}</dd></div>;
  const other = Object.values(cur.raw.expenses).reduce((a, b) => a + b, 0) - (cur.raw.expenses.salaries ?? 0);
  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <section id="finance" aria-labelledby="fin-h" className={`${card} flex-[3_1_520px] gap-[18px]`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fin-h" className={h2}>Income &amp; profit</h2>
          <div className="flex gap-3.5 text-[13px] text-text-2">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-[#a8d5c6]" />Income</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-primary" />Profit</span>
          </div>
        </div>
        <div role="img" aria-label={`Monthly income and profit for the last six months. ${months.map((m, i) => `${m.label}: income ${results[i]?.calc.income ?? 0}, profit ${results[i]?.calc.profit ?? 0}`).join("; ")}`}
          className="grid h-[200px] grid-cols-6 items-end gap-4 border-b border-border pb-1">
          {results.map((r, i) => {
            const inc = r?.calc.income ?? 0;
            const prof = Math.max(0, r?.calc.profit ?? 0);
            return (
              <div key={months[i].key} className="flex h-full items-end justify-center gap-1">
                <span className="w-[22px] rounded-t bg-[#a8d5c6]" style={{ height: `${(inc / max) * 100}%`, minHeight: inc > 0 ? 3 : 0 }} />
                <span className="w-[22px] rounded-t bg-primary" style={{ height: `${(prof / max) * 100}%`, minHeight: prof > 0 ? 3 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="-mt-2.5 grid grid-cols-6 gap-4 text-center text-xs text-muted">{months.map((m) => <span key={m.key}>{m.label}</span>)}</div>
      </section>
      <section aria-labelledby="calc-h" className={`${card} flex-[2_1_320px]`}>
        <h2 id="calc-h" className={h2}>Profit calculation · {long.split(" ")[0]}</h2>
        <dl className="flex flex-col gap-2.5 text-sm">
          {row("Marketplace commission", money(cur.raw.marketplaceCommission))}
          {row("Car wash (managed) revenue", money(cur.raw.carwashRevenue))}
          {row("VIP subscriptions", money(cur.raw.vip))}
          {row("Advertising", money(cur.raw.advertising))}
          {total("Total income", money(cur.calc.income))}
          {row("Car wash partner payouts", `−${money(cur.raw.partnerPayouts)}`, "text-danger")}
          {row("Staff salaries", `−${money(cur.raw.expenses.salaries ?? 0)}`, "text-danger")}
          {row("Marketing, payments & ops", `−${money(other)}`, "text-danger")}
          {total("Net profit", money(cur.calc.profit), "text-primary")}
        </dl>
        <Link href="/admin/income" className="py-1.5 text-sm font-semibold text-primary">Add income or expenses →</Link>
      </section>
    </div>
  );
}

/* ---------- Provider approvals ---------- */
const V_KIND: Record<string, string> = { cac: "CAC", nin: "NIN", bvn: "BVN", selfie: "Face match" };
const V_STYLE: Record<string, { text: string; cls: string }> = {
  verified: { text: "✓ matched", cls: "bg-primary-tint text-primary" }, pending: { text: "pending", cls: "bg-warning-bg text-warning" },
  mismatch: { text: "name mismatch", cls: "bg-danger-bg text-danger" }, failed: { text: "failed", cls: "bg-danger-bg text-danger" },
};

export async function ApprovalsSection({ type = "all", limit, basePath }: { type?: string; limit?: number; basePath?: string }) {
  const supabase = await createClient();
  let q = supabase.from("providers")
    .select("id, display_name, type, service, plan, created_at, verifications(kind, status)").eq("status", "pending").order("created_at");
  if (type === "business" || type === "individual") q = q.eq("type", type);
  const { data, error } = await q;
  const all = data ?? [];
  const rows = limit ? all.slice(0, limit) : all;
  const tab = (t: string, label: string) => (
    <Link key={t} href={`${basePath ?? "/admin/approvals"}${t === "all" ? "" : `?type=${t}`}`}
      className={`flex min-h-[38px] items-center rounded-lg border px-3 text-[13px] ${type === t ? "border-primary bg-primary-tint font-semibold text-primary" : "border-border bg-surface"}`}>{label}</Link>
  );
  return (
    <section id="approvals" aria-labelledby="appr-h" className={`${card} gap-3.5`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="appr-h" className={h2}>Approve service providers <span className={sub}>· {all.length} pending</span></h2>
        {basePath !== "/admin/overview" && <div className="flex flex-wrap gap-1.5">{tab("all", "All")}{tab("business", "Shops (CAC)")}{tab("individual", "Individuals (NIN/BVN)")}</div>}
      </div>
      {error && <p role="alert" className="text-sm text-danger">Could not load: {error.message}</p>}
      {rows.length === 0 ? <p className="text-sm text-muted">No providers are waiting for approval.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead><tr className="text-left text-[13px] text-muted">
              {["Provider", "Type", "Service", "Verification", "Plan", "Submitted", "Action"].map((h, i) => <th key={h} className={`border-b border-border px-2 py-2.5 font-semibold ${i === 6 ? "text-right" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-bg-admin last:border-0">
                  <td className="px-2 py-3 font-semibold">{p.display_name}</td>
                  <td className="px-2 py-3">{p.type === "business" ? "Shop" : "Individual"}</td>
                  <td className="px-2 py-3 capitalize">{p.service === "cleaning" ? "House cleaning" : p.service}</td>
                  <td className="px-2 py-3"><span className="flex flex-wrap gap-1">
                    {((p.verifications ?? []) as { kind: string; status: string }[]).map((v) => {
                      const s = V_STYLE[v.status] ?? V_STYLE.pending;
                      return <span key={v.kind} className={`${chip} ${s.cls}`}>{V_KIND[v.kind] ?? v.kind} {s.text}</span>;
                    })}
                  </span></td>
                  <td className="px-2 py-3">{p.plan === "vip" ? <span className={`${chip} bg-vip-bg font-extrabold text-vip`}>VIP</span> : "Standard"}</td>
                  <td className="px-2 py-3 text-muted">{timeAgo(p.created_at)}</td>
                  <td className="px-2 py-3"><div className="flex justify-end"><ReviewButtons providerId={p.id} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {limit && all.length > limit && <Link href="/admin/approvals" className="text-sm font-semibold text-primary">View all {all.length} →</Link>}
    </section>
  );
}

/* ---------- Car wash requests ---------- */
export async function RequestsSection({ limit }: { limit?: number }) {
  const supabase = await createClient();
  const [{ data: orders }, { data: partners }, { data: quality }] = await Promise.all([
    supabase.from("orders")
      .select("id, status, total, scheduled_at, created_at, carwash_package, vehicle, is_mobile, providers(display_name), order_addresses(area)")
      .eq("service", "carwash").in("status", ["requested", "assigning", "assigned", "en_route", "arrived", "condition_checked", "washing", "awaiting_signoff"]).order("created_at"),
    supabase.from("providers").select("id, display_name, areas, partner_scores(offers_total, offers_accepted, jobs_completed, on_time_jobs)").eq("service", "carwash").eq("status", "approved").eq("accepting_jobs", true),
    supabase.from("partner_quality").select("provider_id, rating_avg, jobs_completed, photo_jobs"),
  ]);
  const qById = new Map((quality ?? []).map((q) => [q.provider_id, q]));
  const ranked = rankPartners((partners ?? []).map((p) => {
    const s = one(p.partner_scores) as { offers_total: number; offers_accepted: number; jobs_completed: number; on_time_jobs: number } | null;
    const q = qById.get(p.id);
    return { id: p.id, name: p.display_name, areas: p.areas as string[], stats: {
      offersTotal: s?.offers_total ?? 0, offersAccepted: s?.offers_accepted ?? 0, jobsCompleted: s?.jobs_completed ?? 0, onTimeJobs: s?.on_time_jobs ?? 0,
      rating: q?.rating_avg == null ? null : Number(q.rating_avg), photoCompliance: q && q.jobs_completed > 0 ? q.photo_jobs / q.jobs_completed : null } };
  }));
  const options = ranked.map((p) => {
    const sc = partnerScore(p.stats);
    return { id: p.id, label: `${p.name}${p.areas.length ? ` (${p.areas.join(", ")})` : ""} · ${sc ?? "no score"}${sc !== null ? ` · ${partnerTier(sc, p.stats.jobsCompleted)}` : ""}` };
  });
  const rows = limit ? (orders ?? []).slice(0, limit) : orders ?? [];
  return (
    <section id="requests" aria-labelledby="req-h" className={`${card} flex-[1_1_420px]`}>
      <h2 id="req-h" className={h2}>User requests · car wash <span className={sub}>· assign a partner</span></h2>
      {rows.length === 0 ? <p className="text-sm text-muted">No car wash requests right now.</p> : (
        <ul className="flex flex-col">
          {rows.map((o) => {
            const prov = one(o.providers) as { display_name: string } | null;
            const area = (one(o.order_addresses) as { area: string | null } | null)?.area;
            const assignable = o.status === "requested" || o.status === "assigning";
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b border-bg-admin py-3 last:border-0">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold capitalize">{o.carwash_package} · {o.vehicle} · {formatNaira(o.total)}</span>
                  <span className="text-[13px] text-muted">{o.is_mobile ? "Come to customer" : "Drop-off"}{area ? ` · ${area}` : ""} · {formatWhen(o.scheduled_at ?? o.created_at)}{prov ? ` · ${prov.display_name}` : ""}</span>
                </span>
                {assignable ? <AssignControl orderId={o.id} partners={options} />
                  : <span className={`rounded-full bg-primary-tint px-2.5 py-1 text-xs font-bold text-primary`}>{STATUS_LABEL[o.status as OrderStatus]}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Registrations ---------- */
const ROLE_LABEL: Record<string, string> = { customer: "Customer", provider: "Provider", partner: "Car wash partner", admin: "Admin" };

export async function ActivitySection({ limit = 6 }: { limit?: number }) {
  const supabase = await createClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [{ data }, { count }] = await Promise.all([
    supabase.from("users").select("id, name, email, role, created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
  ]);
  return (
    <section id="activity" aria-labelledby="act-h" className={`${card} flex-[1_1_420px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="act-h" className={h2}>Registrations &amp; logins</h2>
        <span className="text-[13px] text-muted">Today: {count ?? 0} sign-ups · logins aren&apos;t tracked yet</span>
      </div>
      <ul className="flex flex-col text-sm">
        {(data ?? []).map((u) => (
          <li key={u.id} className="flex justify-between gap-2.5 border-b border-bg-admin py-2.5 last:border-0">
            <span><span className={`${chip} mr-1.5 bg-primary-tint text-primary`}>Sign-up</span>{u.name || u.email || "Unnamed"} · {ROLE_LABEL[u.role] ?? u.role}</span>
            <span className="shrink-0 text-muted">{timeAgo(u.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Locations ---------- */
export async function LocationsSection() {
  const supabase = await createClient();
  const [{ data: providers }, { data: admins }] = await Promise.all([
    supabase.from("providers").select("areas").eq("status", "approved"),
    supabase.from("users").select("id", { count: "exact" }).eq("role", "admin"),
  ]);
  const by = new Map<string, number>();
  for (const p of providers ?? []) for (const a of (p.areas as string[]).length ? (p.areas as string[]) : ["Unspecified"]) by.set(a, (by.get(a) ?? 0) + 1);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
  return (
    <section id="locations" aria-labelledby="loc-h" className={`${card} gap-4`}>
      <h2 id="loc-h" className={h2}>Employees &amp; service providers by location</h2>
      <div className="flex flex-wrap gap-6">
        <div role="img" aria-label="Map placeholder" className="flex min-h-[260px] flex-[1_1_360px] items-center justify-center rounded-xl border border-dashed border-[#a9b7b2] bg-[#e8eeeb] text-sm text-muted">Live map coming with location data</div>
        <div className="min-w-0 flex-[1_1_360px] overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead><tr className="text-left text-[13px] text-muted"><th className="border-b border-border p-2 font-semibold">Area</th><th className="border-b border-border p-2 font-semibold">Providers</th><th className="border-b border-border p-2 font-semibold">Share</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} className="p-3 text-muted">No approved providers yet.</td></tr>}
              {rows.map(([area, n]) => (
                <tr key={area}><td className="border-b border-bg-admin p-2.5 font-semibold">{area}</td><td className="border-b border-bg-admin p-2.5">{n}</td>
                  <td className="border-b border-bg-admin p-2.5"><span className="block h-2 w-full rounded-full bg-bg-admin"><span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.round((n / total) * 100)}%` }} /></span></td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">{admins?.length ?? 0} employee account{admins?.length === 1 ? "" : "s"} · staff locations aren&apos;t recorded yet.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Job applications (compact) ---------- */
const STAGE: Record<string, string> = {
  applied: "bg-bg-admin text-text-2", inspection: "bg-warning-bg text-warning", interview: "bg-carwash-bg text-carwash",
  offer: "bg-carwash-bg text-carwash", approved: "bg-primary-tint text-primary", hired: "bg-primary-tint text-primary", rejected: "bg-danger-bg text-danger",
};

export async function JobsSection({ limit = 3 }: { limit?: number }) {
  const supabase = await createClient();
  const { data } = await supabase.from("job_applications").select("id, kind, business_name, position, stage, created_at, users(name)").order("created_at", { ascending: false }).limit(limit);
  return (
    <section id="jobs" aria-labelledby="jobs-h" className={`${card} flex-[1_1_380px]`}>
      <div className="flex items-center justify-between gap-2.5"><h2 id="jobs-h" className={h2}>Job applications review</h2><Link href="/admin/applications" className="text-sm font-semibold text-primary">Open →</Link></div>
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">No applications yet.</p> : (
        <ul className="flex flex-col">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2.5 border-b border-bg-admin py-3 last:border-0">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{(one(a.users) as { name: string } | null)?.name || "Applicant"} · {a.kind === "partner" ? "Car wash partner" : a.position}</span>
                <span className="text-[13px] text-muted">{a.kind === "partner" ? a.business_name : "Staff"} · {timeAgo(a.created_at)}</span>
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STAGE[a.stage] ?? STAGE.applied}`}>{a.stage}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- VIP ---------- */
export async function VipSection({ limit }: { limit?: number }) {
  const supabase = await createClient();
  const { data } = await supabase.from("vip_subscriptions").select("id, status, price, current_period_end, auto_renew, providers(display_name)").eq("status", "active").order("current_period_end");
  const rows = limit ? (data ?? []).slice(0, limit) : data ?? [];
  return (
    <section id="vip" aria-labelledby="vip-h" className={`${card} flex-[1_1_380px] border-vip-border`}>
      <div className="flex items-center justify-between gap-2.5"><h2 id="vip-h" className={h2}>VIP calls</h2><span className="text-[13px] text-muted">{data?.length ?? 0} active VIP provider{data?.length === 1 ? "" : "s"}</span></div>
      {rows.length === 0 ? <p className="text-sm text-muted">No VIP subscriptions yet. Upgrade enquiries and email campaigns aren&apos;t tracked yet.</p> : (
        <ul className="flex flex-col">
          {rows.map((s) => {
            const p = one(s.providers) as { display_name: string } | null;
            const d = daysUntil(s.current_period_end);
            return (
              <li key={s.id} className="flex items-center justify-between gap-2.5 border-b border-bg-admin py-3 last:border-0">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{p?.display_name} · {formatNaira(s.price)}/month</span>
                  <span className="text-[13px] text-muted">{d <= 0 ? "Renewal due now" : `Renews in ${d} day${d === 1 ? "" : "s"}`} · {formatWhen(s.current_period_end)}</span>
                </span>
                <span className="flex gap-1.5 text-xs font-bold">
                  {d <= 7 && <span className="rounded-full bg-warning-bg px-2.5 py-1 text-warning">Renewal due</span>}
                  {!s.auto_renew && <span className="rounded-full bg-danger-bg px-2.5 py-1 text-danger">Won&apos;t renew</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- Support ---------- */
const PRIO: Record<string, string> = { high: "bg-danger-bg text-danger", normal: "bg-bg-admin text-text-2", low: "bg-bg-admin text-muted" };

export async function SupportSection({ limit }: { limit?: number }) {
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets")
    .select("id, subject, status, priority, updated_at, creator:users!support_tickets_created_by_fkey(name, role), assignee:users!support_tickets_assignee_id_fkey(name)")
    .neq("status", "resolved").order("updated_at", { ascending: false });
  const sorted = (data ?? []).sort((a, b) => TICKET_PRIORITY_ORDER[a.priority as keyof typeof TICKET_PRIORITY_ORDER] - TICKET_PRIORITY_ORDER[b.priority as keyof typeof TICKET_PRIORITY_ORDER]);
  const rows = limit ? sorted.slice(0, limit) : sorted;
  return (
    <section id="support" aria-labelledby="sup-h" className={`${card} flex-[3_1_460px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="sup-h" className={h2}>Support &amp; help tickets</h2>
        <span className="text-[13px] text-muted">{data?.length ?? 0} open</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">No open tickets.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead><tr className="text-left text-[13px] text-muted">{["Ticket", "From", "Priority", "Assignee"].map((h) => <th key={h} className="border-b border-border p-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((t) => {
                const by = one(t.creator) as { name: string; role: string } | null;
                const asg = one(t.assignee) as { name: string } | null;
                return (
                  <tr key={t.id}>
                    <td className="border-b border-bg-admin p-2.5 font-semibold"><Link href={`/admin/support/${t.id}`} className="hover:text-primary">{t.subject}</Link></td>
                    <td className="border-b border-bg-admin p-2.5">{ROLE_LABEL[by?.role ?? ""] ?? "User"}{by?.name ? ` · ${by.name}` : ""}</td>
                    <td className="border-b border-bg-admin p-2.5"><span className={`${chip} capitalize ${PRIO[t.priority]}`}>{t.priority}</span></td>
                    <td className="border-b border-bg-admin p-2.5">{asg?.name ?? "Unassigned"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- Chat (latest open ticket conversation) ---------- */
export async function ChatPanel() {
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets")
    .select("id, subject, status, created_by, creator:users!support_tickets_created_by_fkey(name)")
    .neq("status", "resolved").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: msgs } = t ? await supabase.from("ticket_messages").select("id, sender_id, body, internal, created_at").eq("ticket_id", t.id).order("id").limit(30) : { data: [] };
  return (
    <section id="chat" aria-labelledby="chat-h" className="flex min-w-0 flex-[2_1_340px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2.5 border-b border-border px-[18px] py-4">
        <h2 id="chat-h" className="text-base font-bold">Chat · {t ? (one(t.creator) as { name: string } | null)?.name || "User" : "No open conversations"}</h2>
        {t && <Link href={`/admin/support/${t.id}`} className="text-xs font-semibold text-primary">Open ticket →</Link>}
      </div>
      <div className="flex min-h-[180px] flex-1 flex-col gap-2.5 bg-[#fafbfa] p-4">
        {!t ? <p className="m-auto text-sm text-muted">Support conversations appear here as tickets come in.</p> : (msgs ?? []).map((m) => {
          const theirs = m.sender_id === t.created_by;
          return (
            <div key={m.id} className={`max-w-[80%] px-3 py-2.5 text-sm leading-normal ${m.internal ? "self-end rounded-xl border border-warning bg-warning-bg" : theirs ? "self-start rounded-[12px_12px_12px_4px] border border-border bg-surface" : "self-end rounded-[12px_12px_4px_12px] bg-ink text-white"}`}>
              {m.internal && <span className="mb-0.5 block text-[11px] font-bold">Internal note</span>}{m.body}
            </div>
          );
        })}
      </div>
      {t && <div className="border-t border-border p-3"><ReplyForm ticketId={t.id} staff /></div>}
    </section>
  );
}
