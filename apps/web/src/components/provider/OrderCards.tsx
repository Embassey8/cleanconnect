import Link from "next/link";
import {
  CLEANING_TYPE_LABELS, availableActions, formatNaira, orderCommission, STATUS_LABEL, PROVIDER_TABS,
  type CleaningType, type OrderStatus,
} from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { clockTime, formatWhen } from "@/lib/time";
import { ActionButtons } from "@/components/orders/ActionButtons";
import { OrderMedia } from "@/components/media/OrderMedia";
import { Countdown } from "@/components/partner/PartnerControls";
import { Suspense } from "react";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

interface Line { kind: string; label: string; qty: number }
interface Row {
  id: string; service: "cleaning" | "laundry"; status: OrderStatus; total: number; subtotal: number; surcharge: number; commission_rate: number;
  commission_amount: number | null; escrow_status: string; scheduled_at: string | null; created_at: string; accept_by: string | null;
  cleaning_type: string | null; is_express: boolean; notes: string | null;
  order_addresses: { area: string | null; address: string } | { area: string | null; address: string }[] | null;
  order_lines: Line[] | null;
}

const COLUMNS =
  "id, service, status, total, subtotal, surcharge, commission_rate, commission_amount, escrow_status, scheduled_at, created_at, accept_by, cleaning_type, is_express, notes, order_addresses(area, address), order_lines(kind, label, qty)";

const chip = "rounded-lg bg-bg px-2.5 py-1.5 text-[13px]";
const btnGhost = "flex min-h-11 items-center rounded-input border border-border bg-surface px-4 text-sm font-semibold";

function title(o: Row): string {
  const lines = o.order_lines ?? [];
  if (o.service === "laundry") {
    const n = lines.filter((l) => l.kind === "laundry").reduce((a, l) => a + l.qty, 0);
    return `Laundry${o.is_express ? " (express)" : ""} · ${n} item${n === 1 ? "" : "s"}`;
  }
  const n = lines.filter((l) => l.kind === "area").reduce((a, l) => a + l.qty, 0);
  const t = o.cleaning_type ? CLEANING_TYPE_LABELS[o.cleaning_type as CleaningType] : "Cleaning";
  return n > 0 ? `${t} · ${n} area${n === 1 ? "" : "s"}` : t;
}

const itemsText = (o: Row) =>
  (o.order_lines ?? []).filter((l) => l.kind === "area" || l.kind === "laundry" || l.kind === "quote").map((l) => `${l.qty} × ${l.label}`).join(" · ");

const earns = (o: Row) =>
  o.total - (o.commission_amount ?? orderCommission({ service: o.service, subtotal: o.subtotal, surcharge: o.surcharge, total: o.total, commissionRate: Number(o.commission_rate) }));

function Actions({ o }: { o: Row }) {
  const acts = availableActions(o.service, o.status, "provider");
  if (o.status === "requested" && o.escrow_status !== "held") {
    return <span className="rounded-full bg-warning-bg px-3 py-1.5 text-xs font-bold text-warning">Waiting for the customer to pay</span>;
  }
  return <ActionButtons orderId={o.id} actions={acts} />;
}

function Money({ o }: { o: Row }) {
  return (
    <span className="flex flex-col">
      <span className="text-xl font-extrabold">{formatNaira(o.total)}</span>
      <span className="text-xs text-muted">
        {o.status === "completed" ? `You earned ${formatNaira(earns(o))}` : `You receive ${formatNaira(earns(o))} after commission${o.escrow_status === "held" ? " · paid into escrow" : ""}`}
      </span>
    </span>
  );
}

function Featured({ o }: { o: Row }) {
  const addr = one(o.order_addresses);
  const extras = (o.order_lines ?? []).filter((l) => l.kind === "extra");
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-accent bg-surface p-5">
      <div className="flex flex-wrap justify-between gap-2.5">
        <div className="flex flex-col gap-1"><span className="text-[17px] font-bold">{title(o)}</span><span className="text-sm text-muted">Customer · {addr?.area ?? "Area shown after you accept"}</span></div>
        {o.accept_by && (
          <span className="flex items-center gap-1.5 self-start rounded-full bg-warning-bg px-2.5 py-1.5 text-[13px] font-bold text-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <Countdown until={o.accept_by} label="Respond in" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={chip}>{formatWhen(o.scheduled_at)}</span>
        {itemsText(o) && <span className={chip}>{itemsText(o)}</span>}
        {extras.map((x) => <span key={x.label} className={chip}>Add-on: {x.label}</span>)}
      </div>
      {o.notes && <p className="text-sm leading-normal text-text-2">“{o.notes}”</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bg-admin pt-3.5">
        <Money o={o} />
        <span className="flex flex-wrap gap-2"><Link href="/messages" className={btnGhost}>Message</Link><Actions o={o} /></span>
      </div>
    </article>
  );
}

function Compact({ o, note }: { o: Row; note?: string }) {
  const addr = one(o.order_addresses);
  return (
    <article className="flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-border bg-surface p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/provider/orders/${o.id}`} className="text-base font-bold hover:text-primary">{title(o)}</Link>
        <span className="text-sm text-muted">Customer · {addr?.area ?? "Area shown after you accept"} · {formatWhen(o.scheduled_at ?? o.created_at)}</span>
        {note && <span className="text-xs font-semibold text-warning">{note}</span>}
      </div>
      <span className="flex flex-wrap items-center gap-2">
        <span className="mr-1.5 flex flex-col items-end"><span className="text-[17px] font-extrabold">{formatNaira(o.total)}</span><span className="text-[11px] text-muted">{STATUS_LABEL[o.status]}</span></span>
        <Actions o={o} />
      </span>
    </article>
  );
}

function InProgress({ o, startedAt }: { o: Row; startedAt?: string }) {
  const addr = one(o.order_addresses);
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-extrabold tracking-[0.05em] text-warning">IN PROGRESS{startedAt ? ` · STARTED ${clockTime(startedAt).toUpperCase()}` : ""}</span>
        <Link href={`/provider/orders/${o.id}`} className="text-[17px] font-bold hover:text-primary">{title(o)}</Link>
        <span className="text-sm text-muted">Customer · {addr ? `${addr.address}${addr.area ? `, ${addr.area}` : ""}` : "—"}</span>
        {itemsText(o) && <span className="text-sm text-text-2">{itemsText(o)}</span>}
      </div>
      <Suspense fallback={null}><OrderMedia orderId={o.id} service={o.service} status={o.status} viewer="provider" /></Suspense>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-bg-admin pt-3.5">
        <Link href="/messages" className={btnGhost}>Message customer</Link>
        <Actions o={o} />
      </div>
    </article>
  );
}

/** The cards for one Orders tab. Loads only that tab's orders. */
export async function TabOrders({ providerId, service, tabId }: { providerId: string; service: "cleaning" | "laundry"; tabId: string }) {
  const tab = PROVIDER_TABS[service].find((t) => t.id === tabId) ?? PROVIDER_TABS[service][0];
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(COLUMNS).eq("provider_id", providerId).in("status", tab.statuses)
    .order(tab.id === "done" || tab.id === "closed" ? "created_at" : "scheduled_at", { ascending: tab.id !== "done" && tab.id !== "closed", nullsFirst: false }).limit(20);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">Nothing in “{tab.label}” right now.</p>;

  let started = new Map<string, string>();
  if (tab.id === "progress") {
    const { data: ev } = await supabase.from("order_events").select("order_id, created_at").in("order_id", rows.map((r) => r.id)).eq("status", "in_progress");
    started = new Map((ev ?? []).map((e) => [e.order_id, e.created_at]));
  }
  return (
    <div className="flex flex-col gap-4">
      {rows.map((o, i) =>
        tab.id === "new" ? (i === 0 ? <Featured key={o.id} o={o} /> : <Compact key={o.id} o={o} />)
        : tab.id === "progress" && o.service === "cleaning" ? <InProgress key={o.id} o={o} startedAt={started.get(o.id)} />
        : <Compact key={o.id} o={o} note={tab.id === "confirm" ? "Waiting for the customer to confirm, then your money is released" : undefined} />)}
    </div>
  );
}
