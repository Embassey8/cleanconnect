import { Suspense } from "react";
import Link from "next/link";
import {
  CLEANING_TYPE_LABELS, LEDGER_KIND_LABEL, STATUS_LABEL, SUMMARY_STEPS, formatNaira, orderRef, orderTab, summaryStep, summaryStepOf,
  type CleaningType, type LedgerKind, type OrderService, type OrderStatus, type OrderTab,
} from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { signOut } from "@/app/login/actions";
import { formatWhen } from "@/lib/time";

const SERVICE_STYLE: Record<OrderService, { bg: string; stroke: string; icon: React.ReactNode }> = {
  cleaning: { bg: "bg-primary-tint", stroke: "#0B6B57", icon: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></> },
  laundry: { bg: "bg-laundry-bg", stroke: "#6A3FA0", icon: <><path d="M12 4a2 2 0 1 1 2 2c-1 0-2 .7-2 1.6V9" /><path d="M12 9l9 7H3z" /></> },
  carwash: { bg: "bg-carwash-bg", stroke: "#1F5FAE", icon: <><path d="M5 16V12l2-5h10l2 5v4" /><path d="M3 16h18v3H3z" /></> },
};

function pill(status: OrderStatus): string {
  if (status === "completed") return "bg-primary-tint text-primary";
  if (["cancelled", "declined", "expired"].includes(status)) return "bg-bg-admin text-muted";
  if (status === "disputed") return "bg-danger-bg text-danger";
  if (["out_for_delivery", "delivered", "en_route", "arrived"].includes(status)) return "bg-carwash-bg text-carwash";
  return "bg-warning-bg text-warning";
}

interface OrderRow {
  id: string; service: OrderService; status: OrderStatus; total: number; escrow_status: string; created_at: string; scheduled_at: string | null;
  cleaning_type: string | null; carwash_package: string | null; provider_id: string | null;
  providers: { display_name: string; slug: string } | { display_name: string; slug: string }[] | null;
}

function title(o: OrderRow, qty: number): string {
  if (o.service === "carwash") return `${o.carwash_package ? o.carwash_package[0].toUpperCase() + o.carwash_package.slice(1) : "Car"} car wash`;
  if (o.service === "laundry") return `Laundry · ${qty} item${qty === 1 ? "" : "s"}`;
  const t = o.cleaning_type ? CLEANING_TYPE_LABELS[o.cleaning_type as CleaningType] : "Cleaning";
  return qty > 0 ? `${t} · ${qty} area${qty === 1 ? "" : "s"}` : t;
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = (await getSessionUser())!;
  const supabase = await createClient();
  const sp = await searchParams;
  const tab: OrderTab = sp.tab === "completed" || sp.tab === "cancelled" ? sp.tab : "ongoing";

  const [{ data: profile }, { data: orders }, { data: wallet }, { count: savedP }, { count: savedM }] = await Promise.all([
    supabase.from("users").select("name, email, phone").eq("id", user.id).single(),
    supabase.from("orders")
      .select("id, service, status, total, escrow_status, created_at, scheduled_at, cleaning_type, carwash_package, provider_id, providers(display_name, slug)")
      .eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("saved_providers").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("saved_media").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const rows = (orders ?? []) as unknown as OrderRow[];
  const ids = rows.map((o) => o.id);
  const [{ data: lines }, { data: events }, { data: reviews }, { data: bal }, { data: tx }] = await Promise.all([
    ids.length ? supabase.from("order_lines").select("order_id, kind, qty").in("order_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("order_events").select("order_id, status, created_at").in("order_id", ids).order("id") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("reviews").select("order_id, rating").in("order_id", ids) : Promise.resolve({ data: [] }),
    wallet ? supabase.from("wallet_balances").select("available").eq("wallet_id", wallet.id).maybeSingle() : Promise.resolve({ data: null }),
    wallet ? supabase.from("ledger_entries").select("id, amount, kind, created_at").eq("wallet_id", wallet.id).eq("bucket", "available").order("id", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
  ]);

  const qtyOf = (id: string, kinds: string[]) => (lines ?? []).filter((l) => l.order_id === id && kinds.includes(l.kind)).reduce((a, l) => a + l.qty, 0);
  const rating = new Map((reviews ?? []).map((r) => [r.order_id, r.rating]));
  const counts = { ongoing: 0, completed: 0, cancelled: 0 } as Record<OrderTab, number>;
  for (const o of rows) counts[orderTab(o.status)]++;
  const shown = rows.filter((o) => orderTab(o.status) === tab);
  const completed = rows.filter((o) => o.status === "completed");
  const initials = (profile?.name || profile?.email || "?").split(/[\s@]+/).filter(Boolean).slice(0, 2).map((s: string) => s[0].toUpperCase()).join("");
  const prov = (o: OrderRow) => (Array.isArray(o.providers) ? o.providers[0] : o.providers);

  const tabLink = (t: OrderTab, label: string, n: number | null) => (
    <Link key={t} role="tab" aria-selected={tab === t} href={t === "ongoing" ? "/account" : `/account?tab=${t}`}
      className={`flex min-h-10 items-center whitespace-nowrap rounded-lg px-4 text-sm ${tab === t ? "bg-primary font-semibold text-white" : "font-medium text-text-2"}`}>
      {label}{n !== null ? ` (${n})` : ""}
    </Link>
  );

  return (
    <div className="flex flex-wrap items-start gap-6">
      <aside className="flex w-full flex-col gap-5 lg:max-w-[380px] lg:flex-1 lg:basis-80">
        <section aria-label="Profile" className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-6">
          <div className="flex items-center gap-3.5">
            <span className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-primary-tint text-xl font-extrabold text-primary">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{profile?.name || "Your name"}</p>
              <p className="truncate text-sm text-muted">{[profile?.email, profile?.phone].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center">
            {[[counts.ongoing, "Ongoing"], [counts.completed, "Completed"], [(savedP ?? 0) + (savedM ?? 0), "Saved"]].map(([n, l]) => (
              <Link key={l} href={l === "Saved" ? "/account/saved" : l === "Completed" ? "/account?tab=completed" : "/account"} className="flex flex-col gap-0.5 rounded-xl bg-bg px-1.5 py-3">
                <span className="text-xl font-extrabold">{n}</span><span className="text-xs text-muted">{l}</span>
              </Link>
            ))}
          </div>
          <Link href="/account/profile" className="flex min-h-11 items-center justify-center rounded-input border border-border text-sm font-semibold">Edit profile</Link>
          <form action={signOut}><button className="min-h-11 w-full rounded-input text-sm font-semibold text-muted hover:text-ink">Sign out</button></form>
        </section>

        <section aria-labelledby="wallet-h" className="flex flex-col gap-4 rounded-[18px] bg-ink p-6 text-white">
          <div className="flex items-center justify-between">
            <h2 id="wallet-h" className="text-base font-semibold text-[#c9d4d0]">Wallet balance</h2>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#CDEBE1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 13h2" /><path d="M3 10h18" /></svg>
          </div>
          <span className="text-4xl font-extrabold tracking-tight">{formatNaira(bal?.available ?? 0)}</span>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/account/wallet#fund" className="flex min-h-[46px] flex-1 items-center justify-center rounded-input bg-accent text-[15px] font-bold text-ink">Fund wallet</Link>
            <Link href="/account/wallet#withdraw" className="flex min-h-[46px] flex-1 items-center justify-center rounded-input border border-[#5b6b65] text-[15px] font-semibold">Withdraw</Link>
          </div>
          <p className="text-[13px] text-[#c9d4d0]">Fund by card, bank transfer or USSD (test mode for now).</p>
        </section>

        <section aria-labelledby="tx-h" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-[22px]">
          <h2 id="tx-h" className="text-base font-bold">Recent transactions</h2>
          {(tx ?? []).length === 0 ? <p className="text-sm text-muted">No transactions yet.</p> : (
            <ul className="flex flex-col">
              {(tx ?? []).map((t) => (
                <li key={t.id} className="flex justify-between gap-2.5 border-b border-bg-admin py-2.5 text-sm last:border-0">
                  <span className="flex flex-col gap-0.5"><span className="font-semibold">{LEDGER_KIND_LABEL[t.kind as LedgerKind] ?? t.kind}</span><span className="text-xs text-muted">{formatWhen(t.created_at)}</span></span>
                  <span className={`font-bold ${t.amount > 0 ? "text-primary" : ""}`}>{t.amount > 0 ? "+" : "−"}{formatNaira(Math.abs(t.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/account/wallet" className="py-2 text-sm font-semibold text-primary">See all transactions →</Link>
        </section>
      </aside>

      <section aria-label="Orders" className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[30px] font-extrabold tracking-tight">My orders</h1>
          <div role="tablist" aria-label="Order status" className="flex max-w-full gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface p-1">
            {tabLink("ongoing", "Ongoing", counts.ongoing)}{tabLink("completed", "Completed", counts.completed)}{tabLink("cancelled", "Cancelled", counts.cancelled)}
          </div>
        </div>

        {tab === "completed" ? null : shown.length === 0 && (
          <p className="rounded-card bg-surface p-6 text-muted">{tab === "ongoing" ? <>No ongoing orders. <Link href="/marketplace" className="font-semibold text-primary">Find a provider</Link> to get started.</> : "Nothing here."}</p>
        )}
        {tab !== "completed" && shown.map((o) => {
          const st = SERVICE_STYLE[o.service];
          const step = summaryStep(o.service, o.status);
          const labels = SUMMARY_STEPS[o.service];
          const when = (i: number) => (events ?? []).find((e) => e.order_id === o.id && summaryStepOf(o.service, e.status as OrderStatus) === i)?.created_at;
          const p = prov(o);
          const qty = o.service === "cleaning" ? qtyOf(o.id, ["area"]) : o.service === "laundry" ? qtyOf(o.id, ["laundry"]) : 0;
          return (
            <article key={o.id} className="flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <span className={`flex size-[52px] shrink-0 items-center justify-center rounded-[14px] ${st.bg}`}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={st.stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{st.icon}</svg>
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/account/orders/${o.id}`} className="text-lg font-bold hover:text-primary">{title(o, qty)}</Link>
                    <span className="text-sm text-muted">{p?.display_name ?? "CleanConnect partner"} · {formatWhen(o.scheduled_at)} · Order #{orderRef(o.service, o.id)}</span>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${pill(o.status)}`}>{STATUS_LABEL[o.status]}</span>
              </div>
              {step !== null && (
                <ol aria-label="Order progress" className="grid grid-cols-4 gap-2">
                  {labels.map((l, i) => {
                    const state = i < step ? "done" : i === step ? "current" : "todo";
                    const at = when(i);
                    return (
                      <li key={l} className="flex flex-col gap-2" aria-current={state === "current" ? "step" : undefined}>
                        <span className={`h-1.5 rounded-full ${state === "done" ? "bg-primary" : state === "current" ? "bg-accent" : "bg-border"}`} />
                        <span className={`text-[13px] ${state === "todo" ? "font-semibold text-muted" : state === "current" ? "font-bold" : "font-semibold"}`}>{l}</span>
                        <span className="text-xs text-muted">{state !== "todo" && at ? formatWhen(at) : "—"}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bg-admin pt-4">
                <span className="text-[15px]">
                  <span className="text-muted">{o.escrow_status === "unpaid" ? "Total:" : o.escrow_status === "refunded" ? "Refunded:" : "Paid from wallet:"}</span> <strong>{formatNaira(o.total)}</strong>{" "}
                  {o.escrow_status === "held" && <span className="text-[13px] text-muted">(held until you confirm)</span>}
                  {o.escrow_status === "unpaid" && !["cancelled", "declined", "expired"].includes(o.status) && <Link href={`/account/orders/${o.id}`} className="ml-1 text-[13px] font-semibold text-primary">Pay now</Link>}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/account/orders/${o.id}`} className="flex min-h-11 items-center rounded-input border border-border px-4 text-sm font-semibold">View details</Link>
                  {p && <Link href="/messages" className="flex min-h-11 items-center rounded-input border border-border px-4 text-sm font-semibold">Message provider</Link>}
                  <Link href="/support" className="flex min-h-11 items-center rounded-input border border-border px-4 text-sm font-semibold">Report an issue</Link>
                </div>
              </div>
            </article>
          );
        })}

        {tab !== "cancelled" && (
          <section aria-labelledby="done-h" className="flex flex-col gap-1.5 rounded-[18px] border border-border bg-surface p-6">
            <h2 id="done-h" className="mb-2 text-lg font-bold">{tab === "completed" ? "Completed orders" : "Recently completed"}</h2>
            {completed.length === 0 ? <p className="text-sm text-muted">Completed orders will appear here.</p> : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead><tr className="text-left text-muted">
                    {["Service", "Provider", "Date", "Amount"].map((h) => <th key={h} className="border-b border-border px-2 py-2.5 font-semibold">{h}</th>)}
                    <th className="border-b border-border px-2 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody>
                    {(tab === "completed" ? completed : completed.slice(0, 5)).map((o) => {
                      const p = prov(o);
                      const r = rating.get(o.id);
                      const qty = o.service === "cleaning" ? qtyOf(o.id, ["area"]) : o.service === "laundry" ? qtyOf(o.id, ["laundry"]) : 0;
                      return (
                        <tr key={o.id} className="border-b border-bg-admin last:border-0">
                          <td className="px-2 py-3 font-semibold"><Link href={`/account/orders/${o.id}`} className="hover:text-primary">{title(o, qty)}</Link></td>
                          <td className="px-2 py-3">{p?.display_name ?? "CleanConnect partner"}</td>
                          <td className="px-2 py-3">{new Date(o.created_at).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "short", day: "numeric" })}</td>
                          <td className="px-2 py-3">{formatNaira(o.total)}</td>
                          <td className="px-2 py-3 text-right">
                            {r ? <span className="text-muted">★ {r}.0</span> : <Link href={`/account/orders/${o.id}`} className="font-semibold text-primary">Rate</Link>}
                            {" · "}<Link href={o.service === "carwash" ? "/car-wash" : p ? `/p/${p.slug}` : "/marketplace"} className="font-semibold text-primary">Rebook</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}

export default function AccountPage(props: PageProps<"/account">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Account searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}
