"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { formatNaira } from "@cleanconnect/shared";
import { requestCarWash, type WashState } from "@/app/car-wash/actions";
import { field } from "./Fields";

const VEHICLES = [["saloon", "Saloon / sedan"], ["suv", "SUV / jeep"], ["van", "Bus / van"], ["pickup", "Pickup / truck"]] as const;
const PACKAGES = [
  ["exterior", "Exterior wash", "Body wash, rims, tyre shine, windows."],
  ["full", "Full wash", "Exterior plus vacuum, dashboard and mats."],
  ["detailing", "Detailing", "Deep interior clean, seats, polish and wax."],
] as const;
const WINDOWS = [["08:00", "8:00 – 10:00 am"], ["10:00", "10:00 am – 12:00 pm"], ["12:00", "12:00 – 2:00 pm"], ["14:00", "2:00 – 4:00 pm"]] as const;

const choice = (on: boolean) =>
  on ? "border-2 border-carwash bg-[#f2f6fc] font-semibold" : "border border-border bg-surface";
const radio = "size-[18px] accent-carwash";

export function CarWashForm({ rates, fee, balance, minDate, signedIn }: {
  rates: Record<string, number>; fee: number; balance: number | null; minDate: string; signedIn: boolean;
}) {
  const [state, action, pending] = useActionState<WashState, FormData>(requestCarWash, {});
  const [veh, setVeh] = useState<string>("saloon");
  const [pkg, setPkg] = useState<string>("full");
  const [mode, setMode] = useState<"mobile" | "dropoff">("mobile");
  const price = rates[`${pkg}:${veh}`];
  const vehLabel = VEHICLES.find(([id]) => id === veh)![1];
  const pkgLabel = PACKAGES.find(([id]) => id === pkg)![1];

  return (
    <div className="flex flex-wrap items-start gap-6">
      <form id="wash" action={action} className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px]">
        <fieldset className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-6">
          <legend className="px-1.5 text-lg font-bold">1. Vehicle type</legend>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {VEHICLES.map(([id, label]) => (
              <label key={id} className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-xl px-4 text-[15px] ${choice(veh === id)}`}>
                <input type="radio" name="vehicle" value={id} checked={veh === id} onChange={() => setVeh(id)} className={radio} />{label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-6">
          <legend className="px-1.5 text-lg font-bold">2. Choose a package</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {PACKAGES.map(([id, label, text]) => {
              const p = rates[`${id}:${veh}`];
              return (
                <label key={id} className={`flex cursor-pointer flex-col gap-2 rounded-[14px] p-[18px] ${choice(pkg === id)}`}>
                  <span className="flex items-center justify-between"><span className="text-base font-bold">{label}</span>
                    <input type="radio" name="package" value={id} checked={pkg === id} onChange={() => setPkg(id)} className={radio} /></span>
                  <span className="text-[13px] leading-normal text-muted">{text}</span>
                  <span className="text-xl font-extrabold">{p == null ? <span className="text-sm font-semibold text-muted">Not available</span> : formatNaira(p)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
          <legend className="px-1.5 text-lg font-bold">3. Where and when</legend>
          <div className="flex flex-wrap gap-2.5">
            <label className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl px-4 text-[15px] ${choice(mode === "mobile")}`}>
              <input type="radio" name="mode" value="mobile" checked={mode === "mobile"} onChange={() => setMode("mobile")} className={radio} />Come to my location
            </label>
            <label className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl px-4 text-[15px] ${choice(mode === "dropoff")}`}>
              <input type="radio" name="mode" value="dropoff" checked={mode === "dropoff"} onChange={() => setMode("dropoff")} className={radio} />I&apos;ll drop off the car
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">{mode === "mobile" ? "Address" : "Your contact address"}
            <input name="address" required autoComplete="street-address" placeholder="House number, street, area" className={`${field} font-normal`} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Area <span className="font-normal text-muted">(helps us find a partner near you)</span>
            <input name="area" placeholder="e.g. Lekki Phase 1" className={`${field} font-normal`} />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Date
              <input name="date" type="date" required min={minDate} className={`${field} font-normal`} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Time window
              <select name="window" defaultValue="08:00" className={`${field} font-normal`}>
                {WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Notes for the team <span className="font-normal text-muted">(optional)</span>
            <textarea name="notes" rows={3} placeholder="Car colour, plate number, gate code…" className={`${field} h-auto py-3 font-normal`} />
          </label>
          <p className="text-xs text-muted">Partners only see your exact address after they accept the job.</p>
        </fieldset>
      </form>

      <aside aria-label="Request summary" className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-4 lg:max-w-[380px] lg:flex-1 lg:basis-80">
        <h2 className="text-lg font-bold">Summary</h2>
        <dl className="flex flex-col gap-2.5 text-[15px]">
          {[["Vehicle", vehLabel], ["Package", pkgLabel], ["Location", mode === "mobile" ? "At my address" : "Drop-off"], ["Service fee", fee > 0 ? formatNaira(fee) : "Included"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
          ))}
        </dl>
        <div className="flex items-baseline justify-between border-t border-border pt-3.5">
          <span className="text-base font-bold">Total</span>
          <span className="text-[26px] font-extrabold">{price == null ? "—" : formatNaira(price + fee)}</span>
        </div>
        <div className="flex gap-2.5 rounded-xl bg-[#f2f6fc] p-3.5 text-sm leading-normal text-[#23406b]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F5FAE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
          <span>We&apos;ll assign a vetted partner and send their details once confirmed.</span>
        </div>
        <div className="flex justify-between text-sm text-muted">
          <span>Pay from wallet</span>
          <span className="font-semibold text-ink">{balance === null ? <Link href="/login?next=%2Fcar-wash" className="text-primary">Sign in</Link> : `Balance ${formatNaira(balance)}`}</span>
        </div>
        {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button form="wash" disabled={pending || price == null}
          className="flex min-h-[52px] items-center justify-center rounded-xl bg-carwash text-base font-bold text-white disabled:opacity-50">
          {pending ? "Sending…" : signedIn ? "Send request" : "Sign in to send request"}
        </button>
        <p className="text-center text-[13px] text-muted">You&apos;re only charged when a partner is assigned.</p>
      </aside>
    </div>
  );
}
