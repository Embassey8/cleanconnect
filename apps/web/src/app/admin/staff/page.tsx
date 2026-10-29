import { Suspense } from "react";
import { LocationsSection } from "@/components/admin/sections";
import { createClient } from "@/lib/supabase/server";

async function Employees() {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, name, admin_role").eq("role", "admin").order("name");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]">
      <h2 className="text-lg font-bold">Employees</h2>
      <ul className="divide-y divide-bg-admin text-sm">
        {(data ?? []).map((a) => <li key={a.id} className="flex justify-between py-3"><span className="font-bold">{a.name}</span><span className="capitalize text-text-2">{(a.admin_role ?? "super_admin").replace("_", " ")}</span></li>)}
      </ul>
    </section>
  );
}

export default function StaffPage() {
  return (
    <>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><LocationsSection /></Suspense>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Employees /></Suspense>
    </>
  );
}
