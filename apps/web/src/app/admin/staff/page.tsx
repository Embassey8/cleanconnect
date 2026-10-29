import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

async function Staff() {
  const supabase = await createClient();
  const [{ data: providers }, { data: admins }] = await Promise.all([
    supabase.from("providers").select("service, areas").eq("status", "approved"),
    supabase.from("users").select("id, name, admin_role").eq("role", "admin"),
  ]);
  const byArea = new Map<string, { cleaning: number; laundry: number; carwash: number }>();
  for (const p of providers ?? []) {
    for (const a of p.areas.length ? p.areas : ["Unspecified"]) {
      const row = byArea.get(a) ?? { cleaning: 0, laundry: 0, carwash: 0 };
      row[p.service as "cleaning" | "laundry" | "carwash"]++;
      byArea.set(a, row);
    }
  }
  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h2 className="mb-2 font-extrabold">Providers by area</h2>
        {byArea.size === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No approved providers yet.</p> : (
          <table className="w-full rounded-card border border-border bg-surface text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3">Area</th><th className="p-3">Cleaning</th><th className="p-3">Laundry</th><th className="p-3">Car wash</th></tr></thead>
            <tbody>
              {[...byArea.entries()].sort().map(([area, c]) => (
                <tr key={area} className="border-t border-bg-admin"><td className="p-3 font-bold">{area}</td><td className="p-3">{c.cleaning}</td><td className="p-3">{c.laundry}</td><td className="p-3">{c.carwash}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Employees</h2>
        <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface text-sm">
          {(admins ?? []).map((a) => <li key={a.id} className="flex justify-between px-4 py-3"><span className="font-bold">{a.name}</span><span className="capitalize text-text-2">{(a.admin_role ?? "super_admin").replace("_", " ")}</span></li>)}
        </ul>
      </section>
    </div>
  );
}

export default function StaffPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Staff &amp; locations</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Staff /></Suspense>
    </>
  );
}
