import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { AvailabilityToggle } from "@/components/partner/PartnerControls";
import { HoursForm } from "@/components/provider/ProviderForms";

const card = "flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface p-5";

async function Hours() {
  const p = await requireOwnProvider();
  if (p.service !== "laundry") redirect("/provider");
  const supabase = await createClient();
  const { data: s } = await supabase.from("laundry_settings").select("capacity_items, opening_hours").eq("provider_id", p.id).maybeSingle();
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Accepting orders</h2>
        <p className="text-sm text-text-2">While you&apos;re closed, customers can still see your shop but can&apos;t send new orders. Orders already in your shop carry on.</p>
        <div><AvailabilityToggle on={p.accepting_jobs} tone="primary" onLabel="Open — accepting orders" offLabel="Closed — not taking new orders" /></div>
      </section>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Hours &amp; capacity</h2>
        <p className="text-sm text-text-2">Capacity is how many items your shop can handle in a day. The Orders board shows how much of it is in use.</p>
        <HoursForm capacity={s?.capacity_items ?? 100} hours={s?.opening_hours ?? ""} />
      </section>
    </>
  );
}

export default function HoursPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Opening hours &amp; capacity</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Hours /></Suspense>
    </>
  );
}
