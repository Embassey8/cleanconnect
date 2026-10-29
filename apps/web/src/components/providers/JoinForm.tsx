"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { formatNaira, requiredChecks, type ProviderKind, type RegisterService } from "@cleanconnect/shared";
import { registerProvider, type JoinState } from "@/app/providers/join/actions";

const field = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-[15px] font-normal";
const choice = (on: boolean) => (on ? "border-2 border-primary bg-primary-tint-2" : "border border-border bg-surface");
const radio = "size-[18px] accent-primary";
type Service = RegisterService | "carwash";

const NEED = [
  ["House cleaning", "CAC certificate + RC/BN number", "NIN"],
  ["Laundry", "CAC certificate + RC/BN number", "BVN + NIN"],
  ["Car wash partner", "CAC + site inspection", "By invitation"],
];

export function JoinForm({ commissionPct, vipPrice }: { commissionPct: number; vipPrice: number }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(registerProvider, {});
  const [service, setService] = useState<Service>("cleaning");
  const [type, setType] = useState<ProviderKind>("individual");
  const [plan, setPlan] = useState<"standard" | "vip">("vip");
  const isWash = service === "carwash";
  const need = isWash ? [] : requiredChecks(type, service);
  const err = (k: string) => state.errors?.[k] && <span role="alert" className="text-xs font-normal text-danger">{state.errors[k]}</span>;
  const fs = "m-0 flex min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-surface p-6";
  const legend = "px-1.5 text-lg font-bold";

  return (
    <form action={action} className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
        <fieldset className={fs}>
          <legend className={legend}>1. What service do you offer?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {([["cleaning", "House cleaning", "Open to businesses and individuals. You set your price."],
               ["laundry", "Laundry", "Dry clean, wash only, ironing. Shops or individuals."],
               ["carwash", "Car wash partner", "Apply to join our hand-picked network. Prices set by CleanConnect."]] as const).map(([v, t, d]) => (
              <label key={v} className={`flex cursor-pointer flex-col gap-1.5 rounded-[14px] p-4 ${choice(service === v)}`}>
                <span className="flex items-center justify-between"><span className="text-base font-bold">{t}</span>
                  <input type="radio" name="service" value={v} checked={service === v} onChange={() => setService(v)} className={radio} /></span>
                <span className="text-[13px] leading-normal text-muted">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isWash ? (
          <div className="rounded-2xl border border-carwash/30 bg-carwash-bg p-6">
            <h2 className="text-lg font-bold text-carwash">Car wash partners join by application</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-2">
              We hand-pick partners: CAC verification and a site inspection, then jobs are assigned to you at fixed payouts, paid weekly. Tell us about your business and we&apos;ll be in touch.
            </p>
            <Link href="/apply?kind=partner" className="mt-4 inline-flex min-h-11 items-center rounded-input bg-carwash px-5 text-sm font-bold text-white">Apply as a car wash partner</Link>
          </div>
        ) : (
          <>
            <fieldset className={fs}>
              <legend className={legend}>2. Register as</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["business", "Business / shop", "Registered company. Verify with your CAC registration."],
                   ["individual", "Individual", "Working for yourself. Verify with your NIN (and BVN for laundry)."]] as const).map(([v, t, d]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-3.5 rounded-[14px] p-4 ${choice(type === v)}`}>
                    <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className={`${radio} mt-1`} />
                    <span className="flex flex-col gap-1"><span className="text-base font-bold">{t}</span><span className="text-[13px] leading-normal text-muted">{d}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={`${fs} gap-4`}>
              <legend className={legend}>3. Verify your identity</legend>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">{type === "business" ? "Business name" : "Full name (as on ID)"}
                  <input name="displayName" required autoComplete="name" className={field} />{err("displayName")}</label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">Phone number
                  <input name="phone" type="tel" autoComplete="tel" placeholder="+234" className={field} />{err("phone")}</label>
                {need.includes("cac") && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">CAC registration number (RC/BN)
                    <input name="cac" placeholder="RC1234567" className={field} />{err("cac")}</label>
                )}
                {need.includes("nin") && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">NIN (11 digits)
                    <input name="nin" inputMode="numeric" maxLength={11} placeholder="00000000000" className={field} />{err("nin")}</label>
                )}
                {need.includes("bvn") && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">BVN (11 digits) <span className="text-xs font-normal text-muted">Required for laundry individuals</span>
                    <input name="bvn" inputMode="numeric" maxLength={11} placeholder="00000000000" className={field} />{err("bvn")}</label>
                )}
              </div>
              {need.includes("selfie") && (
                <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-[#a9b7b2] p-5">
                  <span className="flex items-center gap-3">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B6B57" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
                    <span className="flex flex-col gap-0.5"><span className="text-[15px] font-bold">Selfie for face match</span><span className="text-[13px] text-muted">We compare it with your NIN record. You&apos;ll take it right after you submit.</span></span>
                  </span>
                  <span className="rounded-input border border-border px-3.5 py-2.5 text-sm font-semibold text-muted">Available after you submit</span>
                </div>
              )}
              <p className="text-xs text-muted">We keep only the last 4 digits of your ID numbers and never show them publicly.</p>
              <div className="flex flex-col gap-2.5 rounded-xl bg-bg p-4">
                <span className="text-sm font-bold">What you&apos;ll need</span>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] border-collapse text-sm">
                    <thead><tr className="text-left text-muted"><th className="p-2 font-semibold">Service</th><th className="p-2 font-semibold">Business / shop</th><th className="p-2 font-semibold">Individual</th></tr></thead>
                    <tbody>{NEED.map(([s, b, i]) => <tr key={s}><td className="border-t border-border p-2 font-semibold">{s}</td><td className="border-t border-border p-2">{b}</td><td className="border-t border-border p-2">{i}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </fieldset>

            <fieldset className={`${fs} gap-4`}>
              <legend className={legend}>4. Prices &amp; coverage</legend>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Areas you cover <span className="text-xs font-normal text-muted">Separate with commas</span>
                <input name="areas" placeholder="e.g. Lekki, Ajah, Victoria Island" className={field} />{err("areas")}</label>
              <p className="text-sm text-muted">You set your own prices from your dashboard once you submit, and they go live when we approve you.</p>
            </fieldset>

            {state.error && <p role="alert" className="rounded-input bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
            <div className="flex justify-end">
              <button disabled={pending} className="min-h-[50px] rounded-xl bg-primary px-6 text-[15px] font-bold text-white hover:bg-primary-hover disabled:opacity-60">
                {pending ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          </>
        )}
      </div>

      {!isWash && (
        <aside aria-labelledby="plans-h" className="flex w-full flex-col gap-4 lg:max-w-[400px] lg:flex-1 lg:basis-[340px]">
          <h2 id="plans-h" className="text-xl font-extrabold">Choose a plan</h2>
          <label className={`flex cursor-pointer flex-col gap-3 rounded-2xl bg-surface p-[22px] ${plan === "standard" ? "border-2 border-primary" : "border border-border"}`}>
            <span className="flex items-center justify-between"><span className="text-lg font-bold">Standard</span>
              <input type="radio" name="plan" value="standard" checked={plan === "standard"} onChange={() => setPlan("standard")} className={radio} /></span>
            <span className="text-[26px] font-extrabold">Free <span className="text-sm font-medium text-muted">+ {commissionPct}% per job</span></span>
            <ul className="flex list-disc flex-col gap-1.5 pl-[18px] text-sm text-text-2"><li>Listed in the marketplace</li><li>Chat with customers</li><li>Payouts to your bank</li></ul>
          </label>
          <label className="flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-accent bg-ink p-[22px] text-white">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2"><span className="text-lg font-bold">VIP</span><span className="rounded-md bg-accent px-2 py-1 text-[11px] font-extrabold text-ink">RECOMMENDED</span></span>
              <input type="radio" name="plan" value="vip" checked={plan === "vip"} onChange={() => setPlan("vip")} className="size-[18px] accent-accent" />
            </span>
            <span className="text-[26px] font-extrabold">{formatNaira(vipPrice)} <span className="text-sm font-medium text-[#c9d4d0]">/ month</span></span>
            <ul className="flex list-disc flex-col gap-2 pl-[18px] text-sm leading-normal text-[#e3ece8]">
              <li>Premium placement at the top of search results</li><li>Featured on the homepage</li>
              <li>Promoted to high-value customers on the website and by email</li><li>Gold VIP badge on your profile</li><li>Priority support and faster payouts</li>
            </ul>
          </label>
          <p className="text-[13px] leading-normal text-muted">
            {plan === "vip" ? "Nothing is charged now: VIP starts when you subscribe from your provider dashboard after approval, paid from your wallet. " : ""}
            You can upgrade or cancel VIP anytime.
          </p>
        </aside>
      )}
    </form>
  );
}
