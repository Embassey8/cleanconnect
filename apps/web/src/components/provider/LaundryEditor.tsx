"use client";

import { useActionState } from "react";
import { DEFAULT_LAUNDRY_ITEMS, LAUNDRY_SERVICES, type LaundryPriceList, type LaundrySettings } from "@cleanconnect/shared";
import { saveLaundry, type SaveState } from "@/app/provider/prices/actions";
import { SaveBar } from "./SaveBar";

const cell = "min-h-11 w-24 rounded-input border border-border px-2 text-right text-sm";

export function LaundryEditor({ prices, settings }: { prices: LaundryPriceList; settings: LaundrySettings }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveLaundry, {});
  return (
    <form action={action} className="space-y-6">
      <p className="text-sm text-text-2">Leave a price empty if you don&apos;t offer that service for an item. It will be hidden from customers.</p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="p-3">Item</th>
              {LAUNDRY_SERVICES.map((s) => <th key={s.id} className="p-3 text-right">{s.label} (₦)</th>)}
            </tr>
          </thead>
          <tbody>
            {DEFAULT_LAUNDRY_ITEMS.map((i) => (
              <tr key={i.id} className="border-b border-bg-admin last:border-0">
                <th scope="row" className="p-3 text-left font-semibold">{i.name}</th>
                {LAUNDRY_SERVICES.map((s) => (
                  <td key={s.id} className="p-2 text-right">
                    <input name={`p:${i.id}:${s.id}`} inputMode="numeric" aria-label={`${s.label} price for ${i.name}`}
                      defaultValue={prices[i.id]?.[s.id] ?? ""} className={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {([["expressPct", "Express surcharge (%)", settings.expressPct],
           ["deliveryFee", "Pickup & delivery fee (₦)", settings.deliveryFee],
           ["freeDeliveryOver", "Free delivery over (₦)", settings.freeDeliveryOver]] as const).map(([n, l, v]) => (
          <label key={n} className="block text-sm font-semibold">{l}
            <input name={n} inputMode="numeric" defaultValue={v} className="mt-1 min-h-11 w-full rounded-input border border-border px-3" />
          </label>
        ))}
      </div>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}
