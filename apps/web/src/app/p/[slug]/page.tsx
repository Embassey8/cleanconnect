import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DEFAULT_LAUNDRY_SETTINGS, type LaundryPriceList } from "@cleanconnect/shared";
import { LaundryBooking } from "@/components/booking/LaundryBooking";
import { CleaningBooking, type CleaningBookingData } from "@/components/booking/CleaningBooking";
import { startThread } from "@/app/p/actions";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";

const BADGE: Record<string, string> = { cac: "CAC verified", nin: "NIN verified", bvn: "BVN verified" };

async function Profile({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const { slug } = await params;
  const supabase = await createClient();
  // RLS only returns approved, marketplace-listed providers.
  const { data: p } = await supabase
    .from("providers")
    .select("id, slug, display_name, type, service, plan, areas")
    .eq("slug", slug)
    .maybeSingle();
  if (!p) notFound();

  const { data: badges } = await supabase.from("provider_badges").select("kind, verified").eq("provider_id", p.id);
  const verified = (badges ?? []).filter((b) => b.verified && BADGE[b.kind]);

  return (
    <>
      <header className="rounded-panel border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold">{p.display_name}</h1>
          {p.plan === "vip" && (
            <span className="rounded-full border border-vip-border bg-vip-bg px-3 py-1 text-xs font-bold text-vip">VIP</span>
          )}
        </div>
        <p className="mt-1 text-muted">
          {p.type === "business" ? "Business" : "Individual"} · {p.service === "laundry" ? "Laundry" : "House & commercial cleaning"}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {verified.map((b) => (
            <li key={b.kind} className="rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">✓ {BADGE[b.kind]}</li>
          ))}
        </ul>
        {p.areas.length > 0 && <p className="mt-3 text-sm text-text-2">Covers: {p.areas.join(", ")}</p>}
        <form action={startThread.bind(null, p.id, p.slug)} className="mt-4">
          <button className="min-h-11 rounded-input border border-border bg-surface px-5 text-sm font-bold hover:bg-primary-tint">Message</button>
        </form>
      </header>
      <section className="mt-6">
        <h2 className="mb-3 text-xl font-extrabold">{p.service === "laundry" ? "Order laundry" : "Get a price"}</h2>
        {p.service === "laundry" ? <LaundryPrices providerId={p.id} slug={p.slug} /> : <CleaningPrices providerId={p.id} slug={p.slug} />}
      </section>
    </>
  );
}

async function LaundryPrices({ providerId, slug }: { providerId: string; slug: string }) {
  const supabase = await createClient();
  const [{ data }, { data: st }] = await Promise.all([
    supabase.from("laundry_prices").select("item_id, service, price").eq("provider_id", providerId),
    supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over").eq("provider_id", providerId).maybeSingle(),
  ]);
  const prices: LaundryPriceList = {};
  for (const r of data ?? []) (prices[r.item_id] ??= {})[r.service as "dry" | "wash" | "iron"] = r.price;
  const settings = st
    ? { expressPct: st.express_pct, deliveryFee: st.delivery_fee, freeDeliveryOver: st.free_delivery_over }
    : DEFAULT_LAUNDRY_SETTINGS;
  return <LaundryBooking providerId={providerId} slug={slug} prices={prices} settings={settings} />;
}

async function CleaningPrices({ providerId, slug }: { providerId: string; slug: string }) {
  const supabase = await createClient();
  const [{ data }, { data: st }] = await Promise.all([
    supabase.from("cleaning_prices").select("property_type, area_id, price").eq("provider_id", providerId).eq("offered", true),
    supabase.from("cleaning_settings").select("property_types, mult_regular, mult_deep, mult_move, mult_post, min_order").eq("provider_id", providerId).maybeSingle(),
  ]);
  if (!st || !data?.length) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  const prices: CleaningBookingData["prices"] = {};
  for (const r of data) if (r.price != null) (prices[r.property_type] ??= {})[r.area_id] = r.price;
  return (
    <CleaningBooking providerId={providerId} slug={slug} data={{
      prices, propertyTypes: st.property_types, minOrder: st.min_order,
      multipliers: { regular: Number(st.mult_regular), deep: Number(st.mult_deep), move: Number(st.mult_move), post: Number(st.mult_post) },
    }} />
  );
}

export default function ProviderProfilePage(props: PageProps<"/p/[slug]">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Profile params={props.params} /></Suspense>
    </PublicShell>
  );
}
