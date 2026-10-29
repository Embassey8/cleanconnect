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

export function CleaningBooking({ providerId, slug, data }: { providerId: string; slug: string; data: CleaningBookingData }) {
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
  const areas = CLEANING_AREAS[property].filter((a) => areaPrices[a.id] != null);
  const areaLines = areas.filter((a) => (qty[a.id] ?? 0) > 0).map((a) => ({ area: a.id, qty: qty[a.id] }));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="ctype" value={ctype} />
      <input type="hidden" name="frequency" value={freq} />
      <input type="hidden" name="areas" value={JSON.stringify(areaLines)} />
      {extras.map((x) => <input key={x} type="hidden" name="extras" value={x} />)}
      <div className="space-y-5">
        <div role="tablist" aria-label="Property type" className="flex gap-2 overflow-x-auto">
          {types.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={property === p.id}
              onClick={() => { setProperty(p.id); setQty({}); }}
              className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm font-bold ${property === p.id ? "border-primary bg-primary-tint text-primary" : "border-border bg-surface"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="block text-sm font-semibold">Type of cleaning
          <select value={ctype} onChange={(e) => setCtype(e.target.value as CleaningType)} className={field}>
            {(Object.keys(CLEANING_TYPE_LABELS) as CleaningType[]).map((c) => (
              <option key={c} value={c}>{CLEANING_TYPE_LABELS[c]}{data.multipliers[c] > 1 ? ` (×${data.multipliers[c]})` : ""}</option>
            ))}
          </select>
        </label>
        <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface">
          {areas.map((a) => {
            const q = qty[a.id] ?? 0;
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3">
                <div><p className="font-semibold">{a.name}</p><p className="text-sm text-muted">{formatNaira(areaPrices[a.id])} {a.unit}</p></div>
                <Stepper label={a.name} value={q} onChange={(n) => setQty((p) => ({ ...p, [a.id]: n }))} />
              </li>
            );
          })}
        </ul>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Extras</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLEANING_EXTRAS.map((x) => (
              <label key={x.id} className="flex min-h-11 items-center gap-3 rounded-input border border-border bg-surface px-3 text-sm">
                <input type="checkbox" className="size-5 accent-primary" checked={extras.includes(x.id)}
                  onChange={(e) => setExtras((p) => e.target.checked ? [...p, x.id] : p.filter((i) => i !== x.id))} />
                <span className="flex-1">{x.name}</span><span className="text-muted">{formatNaira(x.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">How often?</legend>
          <div className="flex flex-wrap gap-2">
            {FREQS.map((f) => (
              <button key={f.id} type="button" aria-pressed={freq === f.id} onClick={() => setFreq(f.id)}
                className={`min-h-11 rounded-input border px-4 text-sm font-bold ${freq === f.id ? "border-primary bg-primary-tint-2 text-primary" : "border-border bg-surface"}`}>
                {f.label} <span className="font-normal text-muted">· {f.note}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <aside className="space-y-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
        <h3 className="font-extrabold">Your quote</h3>
        {t.areaCount === 0 ? <p className="text-sm text-muted">Add rooms or areas to see your price.</p> : (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Areas ({t.areaCount})</dt><dd>{formatNaira(t.areaSub)}</dd></div>
            {t.typeExtra > 0 && <div className="flex justify-between"><dt>{CLEANING_TYPE_LABELS[ctype]}</dt><dd>+{formatNaira(t.typeExtra)}</dd></div>}
            {t.extrasSum > 0 && <div className="flex justify-between"><dt>Extras</dt><dd>+{formatNaira(t.extrasSum)}</dd></div>}
            {t.discount > 0 && <div className="flex justify-between text-primary"><dt>Discount</dt><dd>−{formatNaira(t.discount)}</dd></div>}
            {t.minApplied && <p className="text-xs text-muted">Minimum order {formatNaira(data.minOrder)} applied.</p>}
            <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
              <dt>Total{freq !== "once" ? " per visit" : ""}</dt><dd>{formatNaira(t.total)}</dd>
            </div>
          </dl>
        )}
        <DeliveryFields />
        {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button disabled={pending || t.areaCount === 0} className="min-h-11 w-full rounded-input bg-primary font-bold text-white hover:bg-primary-hover disabled:opacity-50">
          {pending ? "Sending…" : "Send request"}
        </button>
        <p className="text-xs text-muted">You&apos;re not charged yet. The provider confirms the price on arrival if the size differs.</p>
      </aside>
    </form>
  );
}
