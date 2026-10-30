"use client";

import { useActionState, useState, useTransition } from "react";
import { addMember, removeMember, saveAreas, saveProfileName, type ProviderFormState } from "@/app/provider/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60";

function Feedback({ s }: { s: ProviderFormState }) {
  if (s.error) return <p role="alert" className="text-sm text-danger">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-primary">{s.ok}</p>;
  return null;
}

export function AreasForm({ areas }: { areas: string[] }) {
  const [state, action, pending] = useActionState<ProviderFormState, FormData>(saveAreas, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="areas">Areas you cover <span className="font-normal text-muted">(separate with commas)</span></label>
      <input id="areas" name="areas" defaultValue={areas.join(", ")} placeholder="Lekki, Victoria Island, Ikoyi" className={input} required />
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Save areas"}</button>
    </form>
  );
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<ProviderFormState, FormData>(saveProfileName, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="dn">Name shown to customers</label>
      <input id="dn" name="displayName" defaultValue={name} className={input} required />
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState<ProviderFormState, FormData>(addMember, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="fn">Add a team member (first name)</label>
      <div className="flex gap-2"><input id="fn" name="firstName" className={input} required /><button disabled={pending} className={btn}>{pending ? "Adding…" : "Add"}</button></div>
      <Feedback s={state} />
    </form>
  );
}

export function RemoveMemberButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex flex-col items-end">
      <button disabled={pending} onClick={() => { if (confirm(`Remove ${name} from your team?`)) start(async () => setError((await removeMember(id)).error)); }}
        className="min-h-11 rounded-input px-3 text-sm font-semibold text-danger disabled:opacity-60">Remove</button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}

import { saveDelivery, saveHours, type LaundryState } from "@/app/provider/laundry/actions";

function LFeedback({ s }: { s: LaundryState }) {
  if (s.error) return <p role="alert" className="text-sm text-danger">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-primary">{s.ok}</p>;
  return null;
}

export function DeliveryForm({ expressPct, deliveryFee, freeOver, turnaroundHours }: { expressPct: number; deliveryFee: number; freeOver: number; turnaroundHours: number }) {
  const [state, action, pending] = useActionState<LaundryState, FormData>(saveDelivery, {});
  const f = (name: string, label: string, value: number, hint?: string) => (
    <label className="block text-sm font-semibold">{label}{hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
      <input name={name} inputMode="numeric" defaultValue={value} className={`${input} mt-1`} required />
    </label>
  );
  return (
    <form action={action} className="space-y-3">
      {f("expressPct", "Express surcharge (%)", expressPct, "same-day orders")}
      {f("deliveryFee", "Pickup & delivery fee (₦)", deliveryFee)}
      {f("freeDeliveryOver", "Free pickup & delivery over (₦)", freeOver)}
      {f("turnaroundHours", "Standard turnaround (hours)", turnaroundHours, "express orders are due the same day")}
      <LFeedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function HoursForm({ capacity, hours }: { capacity: number; hours: string }) {
  const [state, action, pending] = useActionState<LaundryState, FormData>(saveHours, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="oh">Opening hours <span className="font-normal text-muted">(shown to you and your team)</span></label>
      <input id="oh" name="openingHours" defaultValue={hours} placeholder="Mon–Sat 8:00 am – 6:00 pm" className={input} />
      <label className="block text-sm font-semibold" htmlFor="cap">Daily capacity (items)</label>
      <input id="cap" name="capacityItems" inputMode="numeric" defaultValue={capacity} className={input} required />
      <LFeedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
