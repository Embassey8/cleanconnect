import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { CarWashForm } from "@/components/booking/CarWashForm";
import { createClient } from "@/lib/supabase/server";

async function Loader() {
  const supabase = await createClient();
  const [{ data: rates }, { data: s }] = await Promise.all([
    supabase.from("carwash_customer_prices").select("package, vehicle, customer_price"),
    supabase.from("carwash_settings").select("service_fee").maybeSingle(),
  ]);
  const map = Object.fromEntries((rates ?? []).map((r) => [`${r.package}:${r.vehicle}`, r.customer_price]));
  if (Object.keys(map).length === 0) return <p className="rounded-card bg-surface p-6 text-muted">Car wash prices are being set up. Please check back soon.</p>;
  return <CarWashForm rates={map} fee={s?.service_fee ?? 0} />;
}

export default function CarWashPage() {
  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">Car wash, handled</h1>
      <p className="mb-6 mt-2 max-w-2xl text-text-2">Tell us what you drive and where. CleanConnect assigns a vetted partner at a fixed price.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Loader /></Suspense>
      <p className="mt-8 text-sm text-text-2">Run a car wash? <a href="/apply?kind=partner" className="font-semibold text-primary">Apply to become a partner</a>.</p>
    </PublicShell>
  );
}
