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
