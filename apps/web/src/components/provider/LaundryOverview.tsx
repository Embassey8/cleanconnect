import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  DEFAULT_COMMISSION_RATE, DEFAULT_LAUNDRY_SETTINGS, LAUNDRY_SERVICES, availableActions, formatNaira, laundryDueAt, orderRef, quotedExpressPct,
  type LaundryPriceList, type LaundryService, type OrderStatus,
} from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import type { OwnProvider } from "@/lib/auth/provider";
import { clockTime, formatWhen, lagosDayRange } from "@/lib/time";
import { AvailabilityToggle, Countdown } from "@/components/partner/PartnerControls";
import { ActionButtons } from "@/components/orders/ActionButtons";
import { IntakePanel, type IntakeOrder } from "./IntakePanel";
import { InlineLaundryPrices } from "./InlineLaundryPrices";
import { StatusBanner } from "./StatusBanner";
import { WithdrawCard } from "./SideCards";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const SVC_LABEL: Record<string, string> = { dry: "Dry clean", wash: "Wash only", iron: "Ironing" };

interface Line { id: number; kind: string; item_id: string | null; service: string | null; label: string; qty: number; counted_qty: number | null; unit_price: number; tag: string | null; note: string | null }
interface Row {
  id: string; status: OrderStatus; total: number; subtotal: number; surcharge: number; scheduled_at: string | null; created_at: string; accept_by: string | null;
  is_express: boolean; escrow_status: string; proposed_total: number | null;
  order_addresses: { area: string | null } | { area: string | null }[] | null; order_lines: Line[] | null;
}

const COLUMNS: { id: string; label: string; statuses: OrderStatus[] }[] = [
  { id: "new", label: "New requests", statuses: ["requested"] },
  { id: "pickup", label: "Pickup scheduled", statuses: ["accepted", "pickup_scheduled"] },
  { id: "received", label: "Received & tagged", statuses: ["received", "awaiting_price_approval"] },
  { id: "cleaning", label: "Cleaning", statuses: ["cleaning"] },
  { id: "ironing", label: "Ironing", statuses: ["ironing"] },
  { id: "ready", label: "Ready / out for delivery", statuses: ["ready", "out_for_delivery", "delivered"] },
];
const OPEN = COLUMNS.flatMap((c) => c.statuses);
const IN_SHOP: OrderStatus[] = ["received", "awaiting_price_approval", "cleaning", "ironing", "ready"];

const laundryLines = (o: Row) => (o.order_lines ?? []).filter((l) => l.kind === "laundry");
const itemCount = (o: Row) => laundryLines(o).reduce((a, l) => a + (l.counted_qty ?? l.qty), 0);
const serviceText = (o: Row) => [...new Set(laundryLines(o).map((l) => SVC_LABEL[l.service ?? ""]).filter(Boolean))].join(", ") || "Laundry";
const tagRange = (o: Row) => {
  const t = laundryLines(o).map((l) => l.tag).filter((x): x is string => !!x);
  if (t.length === 0) return null;
  const nums = t.flatMap((x) => x.split("–").map((n) => parseInt(n, 10)));
  const pad = (n: number) => String(n).padStart(4, "0");
  return `${pad(Math.min(...nums))}–${pad(Math.max(...nums))}`;
};

function Card({ o, due, intakeHref }: { o: Row; due?: Date; intakeHref?: string }) {
  const area = one(o.order_addresses)?.area;
  const tags = tagRange(o);
  const acts = availableActions("laundry", o.status, "provider");
  const waitingPay = o.status === "requested" && o.escrow_status !== "held";
  const dueLabel = due ? clockTime(due.toISOString()) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/provider/orders/${o.id}`} className="text-sm font-bold hover:text-primary">{o.status === "requested" ? "Customer" : `#${orderRef("laundry", o.id)}`} · {itemCount(o)} items</Link>
        <span className="text-xs font-semibold text-muted">{formatNaira(o.total)}</span>
      </div>
      <span className="text-xs text-text-2">{serviceText(o)}{o.status === "requested" || o.status === "accepted" || o.status === "pickup_scheduled" ? ` · pickup ${o.scheduled_at ? formatWhen(o.scheduled_at).replace(/^.*?, /, "") : "to be arranged"}` : ""}{area ? ` · ${area}` : ""}</span>
      {tags && <span className="text-xs text-muted">Tag {tags}</span>}
      {o.is_express && <span className="w-fit rounded-md bg-warning-bg px-1.5 py-0.5 text-[11px] font-extrabold text-warning">EXPRESS{dueLabel ? ` · due ${dueLabel}` : ""}</span>}
      {!o.is_express && dueLabel && <span className="text-xs text-muted">Due {formatWhen(due!.toISOString()).split(",")[0]}</span>}
      {o.status === "requested" && o.accept_by && <span className="text-xs font-bold text-warning"><Countdown until={o.accept_by} label="Respond in" /></span>}
      {o.status === "awaiting_price_approval" && <span className="rounded-md bg-warning-bg px-1.5 py-1 text-xs font-semibold text-warning">Waiting for the customer to approve {o.proposed_total ? formatNaira(o.proposed_total) : "the new total"}</span>}
      {o.status === "out_for_delivery" && <span className="text-xs font-semibold text-carwash">Out for delivery</span>}
      {o.status === "delivered" && <span className="text-xs font-semibold text-primary">Delivered, waiting for the customer to confirm</span>}
      {o.status === "ready" && <span className="text-xs text-muted">Ready, customer notified</span>}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {waitingPay ? <span className="text-xs font-bold text-warning">Waiting for the customer to pay</span>
          : o.status === "received" && intakeHref ? <Link href={intakeHref} className="flex min-h-11 items-center rounded-input bg-primary px-3.5 text-sm font-bold text-white">Count items</Link>
          : <ActionButtons orderId={o.id} actions={acts} />}
      </div>
    </div>
  );
}

const tile = "flex flex-col gap-1 rounded-[14px] border border-border bg-surface p-4";
const wait = <div className="h-32 animate-pulse rounded-2xl bg-border/60" />;

export async function LaundryOverview({ p, searchParams }: { p: OwnProvider; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // today/week/due windows read the clock
  const sp = await searchParams;
  const svc = (["dry", "wash", "iron"] as const).find((s) => s === sp.svc);
  const supabase = await createClient();
  const [{ data }, { data: settingsRow }, { data: priceRows }, { data: st }] = await Promise.all([
    supabase.from("orders")
      .select("id, status, total, subtotal, surcharge, scheduled_at, created_at, accept_by, is_express, escrow_status, proposed_total, order_addresses(area), order_lines(id, kind, item_id, service, label, qty, counted_qty, unit_price, tag, note)")
      .eq("provider_id", p.id).in("status", OPEN).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(80),
    supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over, turnaround_hours, capacity_items").eq("provider_id", p.id).maybeSingle(),
    supabase.from("laundry_prices").select("item_id, service, price").eq("provider_id", p.id),
    supabase.from("provider_stats").select("rating_avg").eq("provider_id", p.id).maybeSingle(),
  ]);
  const all = (data ?? []) as unknown as Row[];
  const { data: ev } = all.length ? await supabase.from("order_events").select("order_id, created_at").in("order_id", all.map((o) => o.id)).eq("status", "received") : { data: [] };
  const receivedAt = new Map((ev ?? []).map((e) => [e.order_id, new Date(e.created_at)]));
  const turnaround = settingsRow?.turnaround_hours ?? 48;
  const dueOf = (o: Row) => (receivedAt.has(o.id) ? laundryDueAt(receivedAt.get(o.id)!, o.is_express, turnaround) : undefined);

  const rows = svc ? all.filter((o) => laundryLines(o).some((l) => l.service === svc)) : all;
  const { start, end } = lagosDayRange();
  const shop = all.filter((o) => IN_SHOP.includes(o.status));
  const itemsInShop = shop.reduce((a, o) => a + itemCount(o), 0);
  const pickups = all.filter((o) => ["accepted", "pickup_scheduled"].includes(o.status) && o.scheduled_at && o.scheduled_at >= start && o.scheduled_at <= end).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const dueToday = shop.filter((o) => { const d = dueOf(o); return d && d.toISOString() >= start && d.toISOString() <= end; });
  const capacity = settingsRow?.capacity_items ?? 100;
  const usedPct = Math.min(999, Math.round((itemsInShop / capacity) * 100));
  const awaitingDelivery = all.filter((o) => ["out_for_delivery", "delivered"].includes(o.status)).length;
  const rating = st?.rating_avg == null ? null : Number(st.rating_avg);
  const offered = LAUNDRY_SERVICES.filter((s) => (priceRows ?? []).some((r) => r.service === s.id && r.price != null)).map((s) => s.label).join(", ");

  // Intake: the chosen order, else the first one that has been received.
  const chosenId = typeof sp.intake === "string" ? sp.intake : undefined;
  const intakeRow = all.find((o) => o.id === chosenId && o.status === "received") ?? all.find((o) => o.status === "received");
  let intake: IntakeOrder | null = null;
  if (intakeRow) {
    const { data: next } = await supabase.rpc("my_next_tag", { p_provider: p.id });
    const express = quotedExpressPct(intakeRow.subtotal, intakeRow.surcharge);
    intake = {
      id: intakeRow.id, ref: orderRef("laundry", intakeRow.id), isExpress: intakeRow.is_express, expressPct: express || (settingsRow?.express_pct ?? DEFAULT_LAUNDRY_SETTINGS.expressPct),
      deliveryFee: settingsRow?.delivery_fee ?? DEFAULT_LAUNDRY_SETTINGS.deliveryFee, freeOver: settingsRow?.free_delivery_over ?? DEFAULT_LAUNDRY_SETTINGS.freeDeliveryOver,
      commissionPct: Math.round(DEFAULT_COMMISSION_RATE * 100), nextTag: (next as number | null) ?? 412,
      receivedLabel: receivedAt.has(intakeRow.id) ? clockTime(receivedAt.get(intakeRow.id)!.toISOString()) : "just now",
      dueLabel: dueOf(intakeRow) ? formatWhen(dueOf(intakeRow)!.toISOString()).replace(/^.*?, /, "") : "—",
      lines: laundryLines(intakeRow).map((l) => ({ id: l.id, name: l.label, service: l.service ?? "dry", booked: l.qty, unit: l.unit_price, note: l.note })),
    };
  }

  const prices: LaundryPriceList = {};
  for (const r of priceRows ?? []) (prices[r.item_id] ??= {})[r.service as LaundryService] = r.price;
  const svcChip = (id: string | undefined, label: string) => (
    <Link key={label} href={id ? `/provider?svc=${id}` : "/provider"} className={`flex min-h-10 items-center rounded-lg px-3.5 text-[13px] ${svc === id ? "bg-primary font-bold text-white" : "border border-border bg-surface"}`}>{label}</Link>
  );

  return (
    <>
      <StatusBanner status={p.status} reason={p.rejection_reason} />
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[26px] font-extrabold">{p.display_name}</h1>{p.plan === "vip" && <span className="rounded-md bg-vip-bg px-2 py-1 text-[11px] font-extrabold text-vip">VIP</span>}</div>
          <span className="text-sm text-muted">{p.type === "business" ? "Shop" : "Individual"}{offered ? ` · ${offered}` : ""}{rating !== null ? ` · ★ ${rating.toFixed(1)}` : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {p.status === "approved" && <Link href={`/p/${p.slug}`} className="flex min-h-11 items-center rounded-input border border-border bg-surface px-3.5 text-sm font-semibold">View public profile</Link>}
          <AvailabilityToggle on={p.accepting_jobs} tone="primary" onLabel="Open — accepting orders" offLabel="Closed — not taking new orders" />
        </div>
      </div>

      <section aria-label="Today at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}><span className="text-[13px] text-muted">Items in shop</span><span className="text-[26px] font-extrabold">{itemsInShop}</span><span className="text-xs text-muted">Across {shop.length} order{shop.length === 1 ? "" : "s"}</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Pickups today</span><span className="text-[26px] font-extrabold">{pickups.length}</span><span className="text-xs text-muted">{pickups[0] ? `Next at ${clockTime(pickups[0].scheduled_at!)}` : "None scheduled"}</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Due today</span><span className="text-[26px] font-extrabold">{dueToday.length}</span><span className="text-xs text-muted">{dueToday.filter((o) => o.is_express).length} express order{dueToday.filter((o) => o.is_express).length === 1 ? "" : "s"}</span></div>
        <div className={tile}><span className="text-[13px] text-muted">Capacity used</span><span className="text-[26px] font-extrabold">{usedPct}%</span><span className="text-xs text-muted">of {capacity} items</span></div>
      </section>

      <section aria-labelledby="board-h" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 id="board-h" className="text-xl font-extrabold">Orders board</h2>
          <div className="flex flex-wrap gap-1.5">{svcChip(undefined, "All services")}{svcChip("dry", "Dry clean")}{svcChip("wash", "Wash only")}{svcChip("iron", "Ironing")}</div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] grid-cols-6 gap-3">
            {COLUMNS.map((col) => {
              const list = rows.filter((o) => col.statuses.includes(o.status));
              return (
                <div key={col.id} className="flex flex-col gap-2.5 rounded-2xl bg-bg-admin p-2.5">
                  <span className="flex items-center justify-between px-1 text-[13px] font-bold">{col.label}<span className="rounded-full bg-surface px-2 py-0.5 text-xs">{list.length}</span></span>
                  {list.length === 0 ? <span className="px-1 py-3 text-xs text-muted">Nothing here</span> : list.map((o) => <Card key={o.id} o={o} due={dueOf(o)} intakeHref={`/provider?intake=${o.id}#intake`} />)}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col">
          {intake ? <IntakePanel key={intake.id} order={intake} /> : (
            <section id="intake" className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-extrabold">Item intake</h2>
              <p className="mt-1 text-sm text-muted">When you mark an order as received it appears here, so you can count the items, hand out tag numbers and confirm the price.</p>
            </section>
          )}
        </div>
        <div className="flex w-full flex-col gap-4 lg:max-w-[420px] lg:flex-1 lg:basis-80">
          <section aria-labelledby="pl-h" className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-primary bg-surface p-[18px]">
            <div className="flex flex-col gap-0.5"><h2 id="pl-h" className="text-base font-extrabold">Your price list</h2><span className="text-xs text-muted">Per item. Customers and the intake sheet use these prices.</span></div>
            <InlineLaundryPrices prices={prices} settings={settingsRow ? { expressPct: settingsRow.express_pct, deliveryFee: settingsRow.delivery_fee, freeDeliveryOver: settingsRow.free_delivery_over } : DEFAULT_LAUNDRY_SETTINGS} />
          </section>
          <Suspense fallback={wait}><WithdrawCard awaiting={awaitingDelivery} /></Suspense>
        </div>
      </div>
    </>
  );
}
