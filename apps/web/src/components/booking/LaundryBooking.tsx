"use client";

import { useActionState, useMemo, useState } from "react";
import {
  DEFAULT_LAUNDRY_ITEMS, LAUNDRY_SERVICES, computeLaundry, formatNaira, qtyKey,
  type LaundryPriceList, type LaundryService, type LaundrySettings,
} from "@cleanconnect/shared";
import { bookLaundry, type BookState } from "@/app/p/actions";
import { DeliveryFields, Stepper } from "./Fields";

export function LaundryBooking({
  providerId, slug, providerName, prices, settings,
}: { providerId: string; slug: string; providerName: string; prices: LaundryPriceList; settings: LaundrySettings }) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookLaundry, {});
  const [svc, setSvc] = useState<LaundryService>("dry");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [express, setExpress] = useState(false);
  const t = useMemo(() => computeLaundry(prices, qty, express, settings), [prices, qty, express, settings]);

  const offered = (s: LaundryService) => DEFAULT_LAUNDRY_ITEMS.filter((i) => prices[i.id]?.[s] != null);
  const count = (s: LaundryService) => offered(s).reduce((n, i) => n + (qty[qtyKey(s, i.id)] ?? 0), 0);
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([k, q]) => {
    const [service, item] = k.split(":");
    return { item, service, qty: q };
  });
  const services = LAUNDRY_SERVICES.filter((s) => offered(s.id).length > 0);
  if (services.length === 0) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  const active = services.some((s) => s.id === svc) ? svc : services[0].id;

  return (
    <form action={action} aria-labelledby="calc-h" className="space-y-4 rounded-panel border-[1.5px] border-primary bg-surface p-5 lg:sticky lg:top-4">
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div>
        <h2 id="calc-h" className="text-xl font-extrabold">Build your order</h2>
        <p className="text-sm text-muted">Prices set by {providerName}. Pick a service, then add your clothes.</p>
      </div>
      <div role="tablist" aria-label="Service" className="flex gap-1 rounded-xl bg-bg p-1">
        {services.map((s) => {
          const on = active === s.id;
          const n = count(s.id);
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setSvc(s.id)}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-lg text-[13px] ${on ? "bg-primary font-bold text-white" : "font-semibold text-text-2"}`}>
              {s.label}
              <span className={`text-[10px] font-medium ${on ? "text-[#cdebe1]" : "text-muted"}`}>{n ? `${n} added` : "none yet"}</span>
            </button>
          );
        })}
      </div>
      <ul>
        {offered(active).map((i) => {
          const k = qtyKey(active, i.id);
          const unit = prices[i.id]![active]!;
          const q = qty[k] ?? 0;
          return (
            <li key={i.id} className="flex items-center gap-2 border-b border-bg-admin py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{i.name}</p>
                <p className="text-xs text-muted">{formatNaira(unit)} each</p>
              </div>
              <Stepper label={i.name} value={q} onChange={(n) => setQty((p) => ({ ...p, [k]: n }))} />
              <span className="w-16 text-right text-sm font-bold">{q ? formatNaira(q * unit) : "—"}</span>
            </li>
          );
        })}
      </ul>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5">
        <span className="flex-1"><span className="block text-sm font-bold">Express service</span><span className="block text-xs text-muted">+{settings.expressPct}% on cleaning</span></span>
        <input type="checkbox" name="express" checked={express} onChange={(e) => setExpress(e.target.checked)} className="size-5 accent-primary" />
      </label>
      <div className="space-y-2 rounded-2xl bg-bg p-4 text-[13px]">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Your basket · {t.itemCount} items</strong>
          {t.itemCount > 0 && <button type="button" onClick={() => { setQty({}); setExpress(false); }} className="min-h-8 text-[13px] font-semibold text-danger">Clear</button>}
        </div>
        {t.itemCount === 0 ? <p className="text-muted">Add clothes above to see your price.</p> : (
          <>
            {LAUNDRY_SERVICES.flatMap((s) => DEFAULT_LAUNDRY_ITEMS.map((i) => ({ s, i, q: qty[qtyKey(s.id, i.id)] ?? 0 }))).filter((x) => x.q > 0).map(({ s, i, q }) => (
              <div key={`${s.id}:${i.id}`} className="flex justify-between">
                <span className="text-text-2">{q} × {i.name} <span className="text-muted">· {s.label}</span></span>
                <span className="font-semibold">{formatNaira(q * (prices[i.id]?.[s.id] ?? 0))}</span>
              </div>
            ))}
            <div className="space-y-1 border-t border-border pt-2">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-semibold">{formatNaira(t.subtotal)}</span></div>
              {express && <div className="flex justify-between"><span className="text-muted">Express (+{settings.expressPct}%)</span><span className="font-semibold">+{formatNaira(t.express)}</span></div>}
              <div className="flex justify-between"><span className="text-muted">Pickup &amp; delivery</span><span className="font-semibold">{t.delivery === 0 ? "Free" : formatNaira(t.delivery)}</span></div>
              {t.freeDeliveryGap > 0 && <p className="text-xs text-primary">Add {formatNaira(t.freeDeliveryGap)} more for free pickup &amp; delivery</p>}
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-2.5">
          <span className="text-base font-extrabold">Estimated total</span>
          <span className="text-2xl font-extrabold">{formatNaira(t.itemCount === 0 ? 0 : t.total)}</span>
        </div>
      </div>
      <DeliveryFields />
      {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending || t.itemCount === 0} className="min-h-14 w-full rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-hover disabled:opacity-50">
        {pending ? "Sending…" : `Book pickup · ${formatNaira(t.itemCount === 0 ? 0 : t.total)}`}
      </button>
      <p className="text-center text-xs leading-normal text-muted">The shop counts your clothes at pickup and confirms the final price in the app before cleaning. You&apos;re not charged until the shop accepts.</p>
    </form>
  );
}
