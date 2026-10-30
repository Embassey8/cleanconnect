"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CLEANING_AREAS, PREVIEW_EXAMPLES, PROPERTY_TYPES, TYPICAL_AREA_PRICES, compactNaira, computeCleaning, formatNaira, nearbyRange, parseNaira, roundNaira,
  type PropertyType,
} from "@cleanconnect/shared";
import { saveCleaning, type SaveState } from "@/app/provider/prices/actions";
import type { CleaningData } from "./CleaningEditor";

const PLURAL: Record<PropertyType, string> = { home: "homes", office: "offices", school: "schools", shop: "shops" };
const MULTS = [["mult_deep", "Deep cleaning", "deep"], ["mult_move", "Move-in / move-out", "move"], ["mult_post", "Post-construction", "post"]] as const;

/**
 * Compact price editor from the design. Every property type's fields stay in the form (only the active type is
 * shown) so one "Publish" saves everything through the same server action as the full editor.
 */
export function InlinePrices({ data, commissionPct }: { data: CleaningData; commissionPct: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCleaning, {});
  const initial = useMemo(() => ({
    price: Object.fromEntries(Object.entries(data.prices).map(([k, v]) => [k, v.price == null ? "" : String(v.price)])) as Record<string, string>,
    offered: Object.fromEntries(Object.entries(data.prices).map(([k, v]) => [k, v.offered])) as Record<string, boolean>,
    types: Object.fromEntries(PROPERTY_TYPES.map((t) => [t.id, data.propertyTypes.includes(t.id)])) as Record<string, boolean>,
    mult: { deep: String(data.multipliers.deep), move: String(data.multipliers.move), post: String(data.multipliers.post) } as Record<string, string>,
    min: String(data.minOrder),
  }), [data]);
  const [pt, setPt] = useState<PropertyType>(data.propertyTypes[0] ?? "home");
  const [price, setPrice] = useState(initial.price);
  const [offered, setOffered] = useState(initial.offered);
  const [types, setTypes] = useState(initial.types);
  const [mult, setMult] = useState(initial.mult);
  const [min, setMin] = useState(initial.min);
  const initialSnapshot = useMemo(() => JSON.stringify(initial), [initial]);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const current = JSON.stringify({ price, offered, types, mult, min });
  // "Live" only after a successful publish of exactly what is on screen.
  const baseline = state.ok && submitted ? submitted : initialSnapshot;
  const dirty = current !== baseline;

  const areaPrices: Record<string, number | null> = {};
  for (const a of CLEANING_AREAS[pt]) {
    const v = parseNaira(price[`${pt}:${a.id}`] ?? "");
    areaPrices[a.id] = offered[`${pt}:${a.id}`] && typeof v === "number" ? v : null;
  }
  const mults = { regular: 1, deep: Number(mult.deep) || 1.6, move: Number(mult.move) || 1.8, post: Number(mult.post) || 2.2 };
  const ex = PREVIEW_EXAMPLES[pt];
  const minOrder = parseNaira(min) || 0;
  const calc = (cleaningType: "regular" | "deep") => computeCleaning({ propertyType: pt, cleaningType, frequency: "once", areaPrices, qty: ex.qty, extras: [], multipliers: mults, minOrder }).total;
  const regular = calc("regular");
  const deep = calc("deep");
  const off = !types[pt];

  const box = "flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1.5";
  return (
    <form action={async (fd) => { setSubmitted(current); await action(fd); }} className="flex flex-col gap-3">
      <div role="tablist" aria-label="Property type" className="grid grid-cols-4 gap-[3px] rounded-[10px] bg-bg p-[3px]">
        {PROPERTY_TYPES.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={pt === t.id} onClick={() => setPt(t.id)}
            className={`min-h-[38px] rounded-lg text-xs ${pt === t.id ? "bg-primary font-bold text-white" : "font-semibold text-text-2"}`}>{t.label}</button>
        ))}
      </div>
      {PROPERTY_TYPES.map((t) => (
        <div key={t.id} hidden={t.id !== pt} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" name={`ptype:${t.id}`} checked={types[t.id]} onChange={(e) => setTypes((s) => ({ ...s, [t.id]: e.target.checked }))} className="size-[18px] accent-primary" />
            I clean {PLURAL[t.id]}
          </label>
          <div className="flex flex-col">
            {CLEANING_AREAS[t.id].map((a) => {
              const k = `${t.id}:${a.id}`;
              const near = nearbyRange(TYPICAL_AREA_PRICES[t.id][a.id]);
              return (
                <div key={a.id} className="flex items-center gap-2 border-b border-bg-admin py-2">
                  <input type="checkbox" name={`offered:${k}`} aria-label={`Offer ${a.name}`} checked={!!offered[k]} onChange={(e) => setOffered((s) => ({ ...s, [k]: e.target.checked }))} className="size-[18px] accent-primary" />
                  <span className="flex min-w-0 flex-1 flex-col gap-px"><span className="text-[13px] font-semibold">{a.name}</span><span className="text-[11px] text-muted">{a.unit} · nearby {compactNaira(near.low)}–{compactNaira(near.high)}</span></span>
                  <label className={box}><span className="text-[13px] text-muted">₦</span><span className="sr-only">Price for {a.name}</span>
                    <input name={`price:${k}`} inputMode="numeric" value={price[k] ?? ""} onChange={(e) => setPrice((s) => ({ ...s, [k]: e.target.value }))} className="w-[70px] border-0 bg-transparent py-2 text-sm font-bold outline-none" /></label>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">Cleaning type multipliers</span>
        {MULTS.map(([name, label, key]) => (
          <label key={name} className="flex items-center justify-between text-[13px]"><span className="text-text-2">{label}</span>
            <span className={box}>×<input name={name} type="number" step="0.1" min="1" max="5" value={mult[key]} onChange={(e) => setMult((s) => ({ ...s, [key]: e.target.value }))} className="w-12 border-0 py-[7px] text-sm font-bold outline-none" /></span></label>
        ))}
        <label className="flex items-center justify-between text-[13px]"><span className="text-text-2">Minimum order</span>
          <span className={box}>₦<input name="minOrder" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="w-[70px] border-0 py-[7px] text-sm font-bold outline-none" /></span></label>
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3 text-[13px]">
        <span className="text-xs font-bold text-muted">CUSTOMER PREVIEW</span>
        <span className="text-text-2">Example: {ex.label}</span>
        <div className="flex justify-between"><span>Regular</span><strong>{off ? "Not offered" : formatNaira(regular)}</strong></div>
        <div className="flex justify-between"><span>Deep clean</span><strong>{off ? "Not offered" : formatNaira(deep)}</strong></div>
        <div className="flex justify-between"><span className="text-muted">You receive (regular, after {commissionPct}%)</span><strong className="text-primary">{off ? "—" : formatNaira(roundNaira(regular * (1 - commissionPct / 100)))}</strong></div>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {dirty
        ? <button disabled={pending} className="min-h-[46px] rounded-[10px] bg-primary text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">{pending ? "Publishing…" : "Publish new prices"}</button>
        : <span className="flex min-h-[46px] items-center justify-center rounded-[10px] bg-primary-tint text-sm font-bold text-primary">✓ Live on your profile</span>}
    </form>
  );
}
