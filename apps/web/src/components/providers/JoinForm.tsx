"use client";

import { useActionState, useState } from "react";
import { requiredChecks, type ProviderKind, type RegisterService } from "@cleanconnect/shared";
import { registerProvider, type JoinState } from "@/app/providers/join/actions";

const field = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";
const card = (on: boolean) =>
  `block cursor-pointer rounded-card border p-4 ${on ? "border-primary bg-primary-tint-2" : "border-border bg-surface"}`;

export function JoinForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(registerProvider, {});
  const [service, setService] = useState<RegisterService>("cleaning");
  const [type, setType] = useState<ProviderKind>("individual");
  const need = requiredChecks(type, service);
  const err = (k: string) => state.errors?.[k] && <p role="alert" className="mt-1 text-xs text-danger">{state.errors[k]}</p>;

  return (
    <form action={action} className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-extrabold">1. What service do you offer?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {([["cleaning", "House cleaning", "Open to businesses and individuals. You set your price."],
             ["laundry", "Laundry", "Dry clean, wash only, ironing. Shops or individuals."]] as const).map(([v, t, d]) => (
            <label key={v} className={card(service === v)}>
              <input type="radio" name="service" value={v} checked={service === v} onChange={() => setService(v)} className="sr-only" />
              <span className="font-bold">{t}</span><span className="mt-1 block text-sm text-muted">{d}</span>
            </label>
          ))}
          <div className="rounded-card border border-border bg-bg-admin p-4 opacity-80">
            <span className="font-bold">Car wash partner</span>
            <span className="mt-1 block text-sm text-muted">By application. Prices set by CleanConnect. Applications open soon.</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold">2. Register as</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["business", "Business / shop", "Registered company. Verify with your CAC registration."],
             ["individual", "Individual", "Working for yourself. Verify with your NIN (and BVN for laundry)."]] as const).map(([v, t, d]) => (
            <label key={v} className={card(type === v)}>
              <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
              <span className="font-bold">{t}</span><span className="mt-1 block text-sm text-muted">{d}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold">3. Verify your identity</h2>
        <label className="block text-sm font-semibold">{type === "business" ? "Business name" : "Full name (as on ID)"}
          <input name="displayName" required className={field} />{err("displayName")}
        </label>
        {need.includes("cac") && (
          <label className="block text-sm font-semibold">CAC registration number (RC/BN)
            <input name="cac" placeholder="RC1234567" className={field} />{err("cac")}
          </label>
        )}
        {need.includes("nin") && (
          <label className="block text-sm font-semibold">NIN (11 digits)
            <input name="nin" inputMode="numeric" maxLength={11} className={field} />{err("nin")}
          </label>
        )}
        {need.includes("bvn") && (
          <label className="block text-sm font-semibold">BVN (11 digits)
            <input name="bvn" inputMode="numeric" maxLength={11} className={field} />{err("bvn")}
          </label>
        )}
        {need.includes("selfie") && (
          <p className="rounded-input bg-primary-tint-2 p-3 text-sm text-text-2">
            Face match: you&apos;ll take a selfie in the CleanConnect app after you submit.
          </p>
        )}
        <p className="text-xs text-muted">We keep only the last 4 digits of your ID numbers and never show them publicly.</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold">4. Coverage</h2>
        <label className="block text-sm font-semibold">Areas you cover (comma separated)
          <input name="areas" placeholder="Lekki, Victoria Island, Ikoyi" className={field} />{err("areas")}
        </label>
        <p className="mt-2 text-sm text-muted">You&apos;ll set your prices from your dashboard once you submit.</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold">Choose a plan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={card(true)}>
            <input type="radio" name="plan" value="standard" defaultChecked className="sr-only" />
            <span className="font-bold">Standard</span>
            <span className="mt-1 block text-sm text-muted">Free + [x]% per job. Listed in the marketplace, chat, bank payouts.</span>
          </label>
          <label className="block cursor-pointer rounded-card border border-vip-border bg-vip-bg p-4">
            <input type="radio" name="plan" value="vip" className="sr-only" />
            <span className="font-bold text-vip">VIP · [₦ price] / month</span>
            <span className="mt-1 block text-sm text-vip">Top placement, homepage feature, VIP badge, priority support. You can upgrade from your dashboard after approval.</span>
          </label>
        </div>
      </section>

      {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="min-h-11 rounded-input bg-primary px-6 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
        {pending ? "Submitting…" : "Submit for approval"}
      </button>
    </form>
  );
}
