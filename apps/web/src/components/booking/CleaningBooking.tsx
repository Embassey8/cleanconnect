"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CLEANING_AREAS, CLEANING_EXTRAS, CLEANING_TYPE_LABELS, PROPERTY_TYPES, computeCleaning, formatNaira,
  type CleaningType, type Frequency, type PropertyType,
} from "@cleanconnect/shared";
import { bookCleaning, type BookState } from "@/app/p/actions";
import { DeliveryFields, Stepper, field } from "./Fields";

export interface CleaningBookingData {
  /** property -> area -> price (offered only) */
  prices: Record<string, Record<string, number>>;
  propertyTypes: PropertyType[];
  multipliers: Record<CleaningType, number>;
  minOrder: number;
}

const FREQS: { id: Frequency; label: string; note: string }[] = [
  { id: "once", label: "One-off", note: "single visit" },
  { id: "week", label: "Weekly", note: "10% off" },
  { id: "month", label: "Monthly", note: "5% off" },
];

export function CleaningBooking({ providerId, slug, providerName, data }: { providerId: string; slug: string; providerName: string; data: CleaningBookingData }) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookCleaning, {});
  const types = PROPERTY_TYPES.filter((p) => data.propertyTypes.includes(p.id) && Object.keys(data.prices[p.id] ?? {}).length > 0);
  const [property, setProperty] = useState<PropertyType>(types[0]?.id ?? "home");
  const [ctype, setCtype] = useState<CleaningType>("regular");
  const [freq, setFreq] = useState<Frequency>("once");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<string[]>([]);

  const areaPrices = useMemo(() => data.prices[property] ?? {}, [data.prices, property]);
  const t = useMemo(() => computeCleaning({
    propertyType: property, cleaningType: ctype, frequency: freq, areaPrices, qty, extras,
    multipliers: data.multipliers, minOrder: data.minOrder,
  }), [property, ctype, freq, areaPrices, qty, extras, data.multipliers, data.minOrder]);

  if (types.length === 0) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  const ptLabel = types.find((p) => p.id === property)?.label ?? "";
  const areas = CLEANING_AREAS[property].filter((a) => areaPrices[a.id] != null);
  const areaLines = areas.filter((a) => (qty[a.id] ?? 0) > 0).map((a) => ({ area: a.id, qty: qty[a.id] }));

  return (
    <form action={action} aria-labelledby="ccalc-h" className="space-y-4 rounded-panel border-[1.5px] border-primary bg-surface p-5 lg:sticky lg:top-4">
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="ctype" value={ctype} />
      <input type="hidden" name="frequency" value={freq} />
      <input type="hidden" name="areas" value={JSON.stringify(areaLines)} />
      {extras.map((x) => <input key={x} type="hidden" name="extras" value={x} />)}
      <div>
        <h2 id="ccalc-h" className="text-xl font-extrabold">Get your price</h2>
        <p className="text-sm text-muted">Prices set by {providerName}. Choose your space and the areas to clean.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold">1. What are we cleaning?</p>
        <div role="radiogroup" aria-label="Property type" className="grid grid-cols-2 gap-2">
          {types.map((p) => {
            const on = property === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on}
                onClick={() => { setProperty(p.id); setQty({}); }}
                className={`flex min-h-14 flex-col justify-center rounded-xl px-3 py-2 text-left ${on ? "border-2 border-primary bg-primary-tint" : "border border-border bg-surface"}`}>
                <span className={`text-sm ${on ? "font-extrabold" : "font-bold"}`}>{p.label}</span>
                <span className="text-[11px] text-muted">{p.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="block text-sm font-bold">2. Type of cleaning
        <select value={ctype} onChange={(e) => setCtype(e.target.value as CleaningType)} className={`${field} mt-1.5 font-medium`}>
          {(Object.keys(CLEANING_TYPE_LABELS) as CleaningType[]).map((c) => (
            <option key={c} value={c}>{CLEANING_TYPE_LABELS[c]}{data.multipliers[c] > 1 ? ` (×${data.multipliers[c]})` : ""}</option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1 text-sm font-bold">3. Areas to clean</p>
        <ul>
          {areas.map((a) => {
            const q = qty[a.id] ?? 0;
            return (
              <li key={a.id} className="flex items-center gap-2 border-b border-bg-admin py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-muted">{formatNaira(areaPrices[a.id])} {a.unit}</p>
                </div>
                <Stepper label={a.name} value={q} onChange={(n) => setQty((p) => ({ ...p, [a.id]: n }))} />
                <span className="w-16 text-right text-sm font-bold">{q ? formatNaira(q * areaPrices[a.id]) : "—"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">4. Extras</legend>
        {CLEANING_EXTRAS.map((x) => (
          <label key={x.id} className="flex min-h-9 items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-5 accent-primary" checked={extras.includes(x.id)}
              onChange={(e) => setExtras((p) => e.target.checked ? [...p, x.id] : p.filter((i) => i !== x.id))} />
            <span className="flex-1">{x.name}</span><span className="font-semibold text-text-2">+{formatNaira(x.price)}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-bold">5. How often?</p>
        <div role="radiogroup" aria-label="Frequency" className="grid grid-cols-3 gap-1 rounded-xl bg-bg p-1">
          {FREQS.map((f) => {
            const on = freq === f.id;
            return (
              <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => setFreq(f.id)}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg text-[13px] ${on ? "bg-primary font-bold text-white" : "font-semibold text-text-2"}`}>
                {f.label}
                <span className={`text-[10px] font-medium ${on ? "text-[#cdebe1]" : "text-muted"}`}>{f.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-bg p-4 text-[13px]">
        <div className="flex items-center justify-between">
          <strong className="text-sm">{ptLabel} · {t.areaCount} areas</strong>
          {t.areaCount > 0 && <button type="button" onClick={() => { setQty({}); setExtras([]); }} className="min-h-8 text-[13px] font-semibold text-danger">Clear</button>}
        </div>
        {t.areaCount === 0 ? <p className="text-muted">Add the areas you need cleaned to see your price.</p> : (
          <>
            {areas.filter((a) => (qty[a.id] ?? 0) > 0).map((a) => (
              <div key={a.id} className="flex justify-between"><span className="text-text-2">{qty[a.id]} × {a.name}</span><span className="font-semibold">{formatNaira(qty[a.id] * areaPrices[a.id])}</span></div>
            ))}
            <div className="flex justify-between border-t border-border pt-2"><span className="text-muted">Areas subtotal</span><span className="font-semibold">{formatNaira(t.areaSub)}</span></div>
            {t.typeExtra > 0 && <div className="flex justify-between"><span className="text-muted">{CLEANING_TYPE_LABELS[ctype]} (×{data.multipliers[ctype]})</span><span className="font-semibold">+{formatNaira(t.typeExtra)}</span></div>}
            {t.extrasSum > 0 && <div className="flex justify-between"><span className="text-muted">Extras</span><span className="font-semibold">+{formatNaira(t.extrasSum)}</span></div>}
            {t.discount > 0 && <div className="flex justify-between text-primary"><span>{FREQS.find((f) => f.id === freq)?.label} discount</span><span className="font-semibold">−{formatNaira(t.discount)}</span></div>}
            {t.minApplied && <p className="text-xs font-semibold text-warning">Minimum order is {formatNaira(data.minOrder)}</p>}
          </>
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-2.5">
          <span className="text-base font-extrabold">Total{freq !== "once" ? " per visit" : ""}</span>
          <span className="text-2xl font-extrabold">{formatNaira(t.areaCount === 0 ? 0 : t.total)}</span>
        </div>
      </div>

      <DeliveryFields />
      {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending || t.areaCount === 0} className="min-h-14 w-full rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-hover disabled:opacity-50">
        {pending ? "Sending…" : `Book · ${formatNaira(t.areaCount === 0 ? 0 : t.total)}`}
      </button>
      <p className="text-center text-xs leading-normal text-muted">You&apos;re not charged until the provider accepts. If the size differs on arrival, the new price is sent to you first.</p>
    </form>
  );
}
