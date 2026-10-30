import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { AddMemberForm, RemoveMemberButton } from "@/components/provider/ProviderForms";

async function Team() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { data } = await supabase.from("provider_members").select("id, first_name, nin_verified").eq("provider_id", p.id).order("created_at");
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-extrabold">Your team · {(data ?? []).length}</h2>
        <p className="text-sm text-text-2">Customers see first names and a verified badge on your profile. Staff are verified by CleanConnect.</p>
        {(data ?? []).length === 0 ? <p className="text-sm text-muted">No team members yet.</p> : (
          <ul className="divide-y divide-bg-admin">
            {(data ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm font-semibold">{m.first_name} <span className={m.nin_verified ? "font-semibold text-primary" : "font-normal text-muted"}>· {m.nin_verified ? "NIN verified" : "Verification pending"}</span></span>
                <RemoveMemberButton id={m.id} name={m.first_name} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-surface p-5"><AddMemberForm /></section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Team</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Team /></Suspense>
    </>
  );
}
