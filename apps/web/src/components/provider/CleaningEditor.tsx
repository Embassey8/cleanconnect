"use client";

import { useActionState } from "react";
import { CLEANING_AREAS, PROPERTY_TYPES, type PropertyType } from "@cleanconnect/shared";
import { saveCleaning, type SaveState } from "@/app/provider/prices/actions";
import { SaveBar } from "./SaveBar";

export interface CleaningData {
  /** `${propertyType}:${areaId}` -> price/offered */
  prices: Record<string, { price: number | null; offered: boolean }>;
  propertyTypes: PropertyType[];
  multipliers: { deep: number; move: number; post: number };
  minOrder: number;
}

const inp = "min-h-11 rounded-input border border-border px-2 text-sm";

export function CleaningEditor({ data }: { data: CleaningData }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCleaning, {});
  return (
    <form action={action} className="space-y-6">
      {PROPERTY_TYPES.map((pt) => (
        <section key={pt.id} className="rounded-card border border-border bg-surface p-4">
          <label className="flex min-h-11 items-center gap-3 font-extrabold">
            <input type="checkbox" name={`ptype:${pt.id}`} defaultChecked={data.propertyTypes.includes(pt.id)} className="size-5 accent-primary" />
            {pt.label} <span className="text-sm font-normal text-muted">{pt.sub}</span>
          </label>
          <ul className="mt-2 divide-y divide-bg-admin">
            {CLEANING_AREAS[pt.id].map((a) => {
              const cur = data.prices[`${pt.id}:${a.id}`];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                  <label className="flex min-h-11 flex-1 items-center gap-3 text-sm">
                    <input type="checkbox" name={`offered:${pt.id}:${a.id}`} defaultChecked={cur?.offered ?? false} className="size-5 accent-primary" />
                    <span className="font-semibold">{a.name}</span> <span className="text-muted">{a.unit}</span>
                  </label>
                  <input name={`price:${pt.id}:${a.id}`} inputMode="numeric" aria-label={`Price for ${a.name} (${pt.label}) in naira`}
                    defaultValue={cur?.price ?? ""} placeholder="₦" className={`${inp} w-28 text-right`} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 font-extrabold">Cleaning type multipliers</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <p className="text-sm"><span className="block font-semibold">Regular</span>×1.0 (fixed)</p>
          {([["mult_deep", "Deep", data.multipliers.deep], ["mult_move", "Move-in / out", data.multipliers.move], ["mult_post", "Post-construction", data.multipliers.post]] as const).map(([n, l, v]) => (
            <label key={n} className="block text-sm font-semibold">{l}
              <input name={n} type="number" step="0.1" min="1" max="5" defaultValue={v} className={`${inp} mt-1 w-full`} />
            </label>
          ))}
        </div>
        <label className="mt-4 block text-sm font-semibold">Minimum order (₦)
          <input name="minOrder" inputMode="numeric" defaultValue={data.minOrder} className={`${inp} mt-1 w-full max-w-xs`} />
        </label>
      </section>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}
