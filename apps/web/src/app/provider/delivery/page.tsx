import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DEFAULT_LAUNDRY_SETTINGS } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { AreasForm, DeliveryForm } from "@/components/provider/ProviderForms";

const card = "flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface p-5";

async function Delivery() {
  const p = await requireOwnProvider();
  if (p.service !== "laundry") redirect("/provider");
  const supabase = await createClient();
  const { data: s } = await supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over, turnaround_hours").eq("provider_id", p.id).maybeSingle();
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Express, pickup &amp; delivery</h2>
        <p className="text-sm text-text-2">Customers see these when they book, and the intake sheet uses them to recalculate the total.</p>
        <DeliveryForm expressPct={s?.express_pct ?? DEFAULT_LAUNDRY_SETTINGS.expressPct} deliveryFee={s?.delivery_fee ?? DEFAULT_LAUNDRY_SETTINGS.deliveryFee}
          freeOver={s?.free_delivery_over ?? DEFAULT_LAUNDRY_SETTINGS.freeDeliveryOver} turnaroundHours={s?.turnaround_hours ?? 48} />
      </section>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Areas you pick up from and deliver to</h2>
        <AreasForm areas={p.areas} />
      </section>
    </>
  );
}

export default function DeliveryPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Pickup &amp; delivery</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Delivery /></Suspense>
    </>
  );
}
