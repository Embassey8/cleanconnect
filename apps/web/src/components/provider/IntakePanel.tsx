"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTags, formatNaira, recomputeIntake, roundNaira, LAUNDRY_SERVICES } from "@cleanconnect/shared";
import { submitIntake } from "@/app/provider/laundry/actions";

export interface IntakeLine { id: number; name: string; service: string; booked: number; unit: number; note: string | null }
export interface IntakeOrder {
  id: string; ref: string; lines: IntakeLine[]; expressPct: number; deliveryFee: number; freeOver: number;
  isExpress: boolean; receivedLabel: string; dueLabel: string; nextTag: number; commissionPct: number;
}

const SVC = Object.fromEntries(LAUNDRY_SERVICES.map((s) => [s.id, s.label]));
const stepBtn = "grid size-9 place-items-center rounded-lg border border-border bg-surface text-base font-bold disabled:opacity-40";

/** Item intake sheet from the design: count what arrived; a different total must be approved by the customer. */
export function IntakePanel({ order }: { order: IntakeOrder }) {
  const router = useRouter();
  const booked = Object.fromEntries(order.lines.map((l) => [l.id, l.booked]));
  const [counts, setCounts] = useState<Record<number, number>>(booked);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const opts = { expressPct: order.isExpress ? order.expressPct : 0, deliveryFee: order.deliveryFee, freeDeliveryOver: order.freeOver };
  const calc = (c: Record<number, number>) => recomputeIntake(order.lines.map((l) => ({ unitPrice: l.unit, counted: c[l.id] ?? 0 })), opts);
  const was = calc(booked);
  const now = calc(counts);
  const diff = now.total - was.total;
  const changed = order.lines.some((l) => counts[l.id] !== l.booked);
  const tags = assignTags(order.lines.map((l) => counts[l.id] ?? 0), order.nextTag);
  const fee = roundNaira((now.cleaning * order.commissionPct) / 100);

  const set = (id: number, v: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(99, v)) }));
  const send = () => start(async () => {
    setError(undefined);
    const r = await submitIntake(order.id, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v])));
    if (r.error) setError(r.error); else router.refresh();
  });

  return (
    <section id="intake" aria-labelledby="det-h" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1"><h2 id="det-h" className="text-lg font-extrabold">#{order.ref} · Item intake</h2>
          <span className="text-sm text-muted">Customer · Received {order.receivedLabel}{order.isExpress ? ` · Express, due ${order.dueLabel}` : ` · due ${order.dueLabel}`}</span></div>
        <span className="rounded-full bg-warning-bg px-3 py-1.5 text-[13px] font-bold text-warning">Counting items</span>
      </div>
      <p className="text-sm leading-normal text-text-2">Customer booked <strong>{was.items} items</strong> · estimate <strong>{formatNaira(was.total)}</strong>. Count what you received. Prices come from your price list.</p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead><tr className="bg-bg text-left text-xs text-muted">{["Tags", "Item", "Service", "Booked", "Counted", "Unit", "Line"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {order.lines.map((l, i) => {
              const c = counts[l.id] ?? 0;
              const d = c - l.booked;
              return (
                <tr key={l.id} className="border-t border-bg-admin">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-muted">{tags[i]}</td>
                  <td className="px-3 py-2.5"><span className="block font-semibold">{l.name}</span>{l.note && <span className="text-xs text-muted">{l.note}</span>}</td>
                  <td className="px-3 py-2.5">{SVC[l.service] ?? l.service}</td>
                  <td className="px-3 py-2.5">{l.booked}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <button type="button" className={stepBtn} aria-label={`Remove one ${l.name}`} disabled={c === 0} onClick={() => set(l.id, c - 1)}>−</button>
                      <span className="w-6 text-center font-bold" aria-live="polite">{c}</span>
                      <button type="button" className={stepBtn} aria-label={`Add one ${l.name}`} onClick={() => set(l.id, c + 1)}>+</button>
                      {d !== 0 && <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${d > 0 ? "bg-warning-bg text-warning" : "bg-carwash-bg text-carwash"}`}>{d > 0 ? "+" : ""}{d}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{formatNaira(l.unit)}</td>
                  <td className="px-3 py-2.5 font-semibold">{c ? formatNaira(c * l.unit) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3.5 text-sm">
          <div className="flex justify-between"><span>Counted · {now.items} items</span><span>{formatNaira(now.sub)}</span></div>
          {order.isExpress && <div className="flex justify-between"><span>Express (+{order.expressPct}%)</span><span>{formatNaira(now.express)}</span></div>}
          <div className="flex justify-between"><span>Pickup &amp; delivery</span><span>{now.items === 0 ? "—" : now.delivery === 0 ? "Free" : formatNaira(now.delivery)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold"><span>Customer pays</span><span>{formatNaira(now.total)}</span></div>
          {changed && diff !== 0
            ? <span className="text-xs font-semibold text-warning">{diff > 0 ? "+" : "−"}{formatNaira(Math.abs(diff))} vs. booking. The customer must approve before cleaning.</span>
            : <span className="text-xs font-semibold text-primary">Matches the booking, so no approval is needed.</span>}
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-primary-tint-2 p-3.5 text-sm">
          <div className="flex justify-between"><span>Cleaning total</span><span>{formatNaira(now.cleaning)}</span></div>
          <div className="flex justify-between"><span className="text-muted">CleanConnect fee ({order.commissionPct}%)</span><span>−{formatNaira(fee)}</span></div>
          <div className="flex justify-between"><span>Delivery fee (yours)</span><span>{formatNaira(now.delivery)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold text-primary"><span>You receive</span><span>{formatNaira(now.cleaning - fee + now.delivery)}</span></div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-bg-admin pt-3.5">
        <button type="button" disabled={pending || !changed} onClick={() => setCounts(booked)} className="min-h-11 rounded-input border border-border px-4 text-sm font-semibold disabled:opacity-50">Reset to booking</button>
        <button type="button" disabled={pending || now.items === 0} onClick={send}
          className={`min-h-11 rounded-input px-5 text-sm font-bold text-white disabled:opacity-60 ${changed && diff !== 0 ? "bg-ink" : "bg-primary hover:bg-primary-hover"}`}>
          {pending ? "Sending…" : changed && diff !== 0 ? "Send new total for approval" : "Confirm & move to Cleaning"}
        </button>
      </div>
    </section>
  );
}
