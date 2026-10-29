"use client";

import { useActionState, useMemo, useState } from "react";
import {
  DEFAULT_LAUNDRY_ITEMS, LAUNDRY_SERVICES, computeLaundry, formatNaira, qtyKey,
  type LaundryPriceList, type LaundryService, type LaundrySettings,
} from "@cleanconnect/shared";
import { bookLaundry, type BookState } from "@/app/p/actions";
import { DeliveryFields, Stepper } from "./Fields";

export function LaundryBooking({
  providerId, slug, prices, settings,
}: { providerId: string; slug: string; prices: LaundryPriceList; settings: LaundrySettings }) {
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
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div>
        <div role="tablist" className="mb-3 flex gap-2 overflow-x-auto">
          {services.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={active === s.id} onClick={() => setSvc(s.id)}
              className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm font-bold ${active === s.id ? "border-primary bg-primary-tint text-primary" : "border-border bg-surface"}`}>
              {s.label} <span className="font-normal text-muted">· {count(s.id) ? `${count(s.id)} added` : "none yet"}</span>
            </button>
          ))}
        </div>
        <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface">
          {offered(active).map((i) => {
            const k = qtyKey(active, i.id);
            const unit = prices[i.id]![active]!;
            const q = qty[k] ?? 0;
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                <div><p className="font-semibold">{i.name}</p><p className="text-sm text-muted">{formatNaira(unit)} each</p></div>
                <div className="flex items-center gap-4">
                  <span className="w-20 text-right text-sm">{q ? formatNaira(q * unit) : "—"}</span>
                  <Stepper label={i.name} value={q} onChange={(n) => setQty((p) => ({ ...p, [k]: n }))} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="space-y-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
        <h3 className="font-extrabold">Your order</h3>
        {t.itemCount === 0 ? <p className="text-sm text-muted">Add items to see your total.</p> : (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Items ({t.itemCount})</dt><dd>{formatNaira(t.subtotal)}</dd></div>
            {express && <div className="flex justify-between"><dt>Express (+{settings.expressPct}%)</dt><dd>{formatNaira(t.express)}</dd></div>}
            <div className="flex justify-between"><dt>Pickup &amp; delivery</dt><dd>{t.delivery === 0 ? "Free" : formatNaira(t.delivery)}</dd></div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatNaira(t.total)}</dd></div>
            {t.freeDeliveryGap > 0 && <p className="pt-1 text-xs text-primary">Add {formatNaira(t.freeDeliveryGap)} more for free pickup &amp; delivery</p>}
          </dl>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="express" checked={express} onChange={(e) => setExpress(e.target.checked)} className="size-5 accent-primary" />
          Express service
        </label>
        <DeliveryFields />
        {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button disabled={pending || t.itemCount === 0} className="min-h-11 w-full rounded-input bg-primary font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {pending ? "Sending…" : "Send request"}
        </button>
        <p className="text-xs text-muted">You&apos;re not charged yet. Payment is held securely once the provider accepts (coming soon).</p>
      </aside>
    </form>
  );
}
