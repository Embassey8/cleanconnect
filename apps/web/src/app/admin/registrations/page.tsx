import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";

async function Signups() {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, name, role, email, created_at").order("created_at", { ascending: false }).limit(50);
  return (
    <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface text-sm">
      {(data ?? []).map((u) => (
        <li key={u.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
          <span className="font-bold">{u.name || u.email || "Unnamed"}</span>
          <span className="capitalize text-text-2">{u.role} · {formatWhen(u.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Registrations() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Registrations &amp; logins</h1>
      <p className="mb-6 text-text-2">Latest sign-ups. Login history, failed attempts and lockouts need the auth provider&apos;s logs and aren&apos;t wired up yet.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Signups /></Suspense>
    </>
  );
}
