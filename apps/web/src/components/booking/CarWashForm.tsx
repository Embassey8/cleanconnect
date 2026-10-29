"use client";

import { useActionState, useState } from "react";
import { formatNaira } from "@cleanconnect/shared";
import { requestCarWash, type WashState } from "@/app/car-wash/actions";
import { DeliveryFields, field } from "./Fields";

const PACKAGES = [["exterior", "Exterior wash"], ["full", "Full wash"], ["detailing", "Detailing"]] as const;
const VEHICLES = [["saloon", "Saloon"], ["suv", "SUV / jeep"], ["van", "Bus / van"], ["pickup", "Pickup / truck"]] as const;

export function CarWashForm({ rates, fee }: { rates: Record<string, number>; fee: number }) {
  const [state, action, pending] = useActionState<WashState, FormData>(requestCarWash, {});
  const [pkg, setPkg] = useState("full");
  const [veh, setVeh] = useState("saloon");
  const price = rates[`${pkg}:${veh}`];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 font-extrabold">Package</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PACKAGES.map(([id, label]) => (
              <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-input border px-3 text-sm font-bold ${pkg === id ? "border-carwash bg-carwash-bg text-carwash" : "border-border bg-surface"}`}>
                <input type="radio" name="package" value={id} checked={pkg === id} onChange={() => setPkg(id)} className="sr-only" />{label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-extrabold">Vehicle</legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {VEHICLES.map(([id, label]) => (
              <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-input border px-3 text-sm font-bold ${veh === id ? "border-carwash bg-carwash-bg text-carwash" : "border-border bg-surface"}`}>
                <input type="radio" name="vehicle" value={id} checked={veh === id} onChange={() => setVeh(id)} className="sr-only" />{label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-extrabold">Where?</legend>
          <label className="mr-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="mode" value="mobile" defaultChecked className="accent-primary" /> Come to my location</label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="radio" name="mode" value="dropoff" className="accent-primary" /> I&apos;ll drop off</label>
        </fieldset>
        <label className="block text-sm font-semibold">Notes (optional)
          <textarea name="notes" rows={3} className={`${field} py-2`} placeholder="Gate code, parking, anything we should know" />
        </label>
      </div>
      <aside className="space-y-4 rounded-card border border-border bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
        <h3 className="font-extrabold">Your price</h3>
        {price == null ? <p className="text-sm text-muted">Not available for this vehicle yet.</p> : (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Wash</dt><dd>{formatNaira(price)}</dd></div>
            {fee > 0 && <div className="flex justify-between"><dt>Service fee</dt><dd>{formatNaira(fee)}</dd></div>}
            <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatNaira(price + fee)}</dd></div>
          </dl>
        )}
        <DeliveryFields />
        {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button disabled={pending || price == null} className="min-h-11 w-full rounded-input bg-carwash font-bold text-white disabled:opacity-50">
          {pending ? "Sending…" : "Request a car wash"}
        </button>
        <p className="text-xs text-muted">We assign a vetted partner. You&apos;re only charged once a partner is assigned.</p>
      </aside>
    </form>
  );
}
