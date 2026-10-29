"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="pf-name">Full name</label>
      <input id="pf-name" name="name" defaultValue={name} className={input} required />
      <label className="block text-sm font-semibold" htmlFor="pf-phone">Phone</label>
      <input id="pf-phone" name="phone" defaultValue={phone} inputMode="tel" className={input} />
      <label className="block text-sm font-semibold" htmlFor="pf-email">Email</label>
      <input id="pf-email" value={email} readOnly disabled className={`${input} bg-bg text-muted`} />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm font-semibold text-primary">{state.ok}</p>}
      <button disabled={pending} className="min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
