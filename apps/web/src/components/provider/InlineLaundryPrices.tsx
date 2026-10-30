"use client";

import { useActionState, useMemo, useState } from "react";
import {
  DEFAULT_COMMISSION_RATE, DEFAULT_LAUNDRY_ITEMS, LAUNDRY_SERVICES, formatNaira, parseNaira, recomputeIntake, roundNaira,
  type LaundryPriceList, type LaundrySettings,
} from "@cleanconnect/shared";
import { saveLaundry, type SaveState } from "@/app/provider/prices/actions";

const EXAMPLE = [{ item: "shirt", svc: "dry", q: 5 }, { item: "native", svc: "dry", q: 2 }, { item: "trousers", svc: "iron", q: 4 }] as const;
const field = "flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5";

/** Price list from the design: item × service grid, express/delivery fees, live customer preview. */
export function InlineLaundryPrices({ prices, settings }: { prices: LaundryPriceList; settings: LaundrySettings }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveLaundry, {});
  const initial = useMemo(() => ({
    p: Object.fromEntries(DEFAULT_LAUNDRY_ITEMS.flatMap((i) => LAUNDRY_SERVICES.map((s) => [`${i.id}:${s.id}`, prices[i.id]?.[s.id] == null ? "" : String(prices[i.id]![s.id])]))) as Record<string, string>,
    expressPct: String(settings.expressPct), deliveryFee: String(settings.deliveryFee), freeOver: String(settings.freeDeliveryOver),
  }), [prices, settings]);
  const [p, setP] = useState(initial.p);
  const [pct, setPct] = useState(initial.expressPct);
  const [fee, setFee] = useState(initial.deliveryFee);
  const [free, setFree] = useState(initial.freeOver);
  const initialSnapshot = useMemo(() => JSON.stringify(initial), [initial]);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const current = JSON.stringify({ p, expressPct: pct, deliveryFee: fee, freeOver: free });
  const baseline = state.ok && submitted ? submitted : initialSnapshot;
  const dirty = current !== baseline;

  const num = (v: string) => (typeof parseNaira(v) === "number" ? (parseNaira(v) as number) : 0);
  const lines = EXAMPLE.map((x) => ({ unitPrice: num(p[`${x.item}:${x.svc}`] ?? ""), counted: x.q }));
  const o = { expressPct: 0, deliveryFee: num(fee), freeDeliveryOver: num(free) };
  const std = recomputeIntake(lines, o);
  const exp = recomputeIntake(lines, { ...o, expressPct: num(pct) });
  const earn = roundNaira(std.cleaning * (1 - DEFAULT_COMMISSION_RATE)) + std.delivery;
  const pctLabel = Math.round(DEFAULT_COMMISSION_RATE * 100);

  return (
    <form action={async (fd) => { setSubmitted(current); await action(fd); }} className="flex flex-col gap-3.5">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead><tr className="bg-bg text-left text-xs text-muted"><th className="px-3 py-2.5 font-semibold">Item</th>{LAUNDRY_SERVICES.map((s) => <th key={s.id} className="px-2 py-2.5 font-semibold">{s.label}</th>)}</tr></thead>
          <tbody>
            {DEFAULT_LAUNDRY_ITEMS.map((i) => (
              <tr key={i.id} className="border-t border-bg-admin">
                <th scope="row" className="px-3 py-2 text-left text-[13px] font-semibold">{i.name}</th>
                {LAUNDRY_SERVICES.map((s) => (
                  <td key={s.id} className="px-2 py-1.5">
                    <label className={field}><span className="text-[13px] text-muted">₦</span><span className="sr-only">{s.label} price for {i.name}</span>
                      <input name={`p:${i.id}:${s.id}`} inputMode="numeric" placeholder="—" value={p[`${i.id}:${s.id}`] ?? ""}
                        onChange={(e) => setP((x) => ({ ...x, [`${i.id}:${s.id}`]: e.target.value }))} className="w-[62px] border-0 bg-transparent py-2 text-sm font-bold outline-none" /></label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Leave a box empty if you don&apos;t offer that service. Customers and the intake sheet use these prices.</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">Express, pickup &amp; delivery</span>
        <label className="flex items-center justify-between text-[13px]"><span className="text-text-2">Express surcharge (same day)</span><span className={field}>+<input name="expressPct" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} className="w-12 border-0 py-[7px] text-sm font-bold outline-none" />%</span></label>
        <label className="flex items-center justify-between text-[13px]"><span className="text-text-2">Pickup &amp; delivery fee</span><span className={field}>₦<input name="deliveryFee" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} className="w-[70px] border-0 py-[7px] text-sm font-bold outline-none" /></span></label>
        <label className="flex items-center justify-between text-[13px]"><span className="text-text-2">Free delivery over</span><span className={field}>₦<input name="freeDeliveryOver" inputMode="numeric" value={free} onChange={(e) => setFree(e.target.value)} className="w-[70px] border-0 py-[7px] text-sm font-bold outline-none" /></span></label>
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3 text-[13px]">
        <span className="text-xs font-bold text-muted">CUSTOMER PREVIEW</span>
        <span className="text-text-2">Example: 5 shirts + 2 native wear dry cleaned, 4 trousers ironed</span>
        <div className="flex justify-between"><span>Standard</span><strong>{formatNaira(std.total)}</strong></div>
        <div className="flex justify-between"><span>Express</span><strong>{formatNaira(exp.total)}</strong></div>
        <div className="flex justify-between"><span className="text-muted">You receive (standard, after {pctLabel}%)</span><strong className="text-primary">{formatNaira(earn)}</strong></div>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {dirty
        ? <button disabled={pending} className="min-h-[46px] rounded-[10px] bg-primary text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">{pending ? "Publishing…" : "Publish new prices"}</button>
        : <span className="flex min-h-[46px] items-center justify-center rounded-[10px] bg-primary-tint text-sm font-bold text-primary">✓ Live on your profile</span>}
    </form>
  );
}
