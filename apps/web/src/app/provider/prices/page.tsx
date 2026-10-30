import { Suspense } from "react";
import { DEFAULT_CLEANING_MULTIPLIERS, DEFAULT_LAUNDRY_SETTINGS, DEFAULT_MIN_ORDER, type LaundryPriceList, type PropertyType } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { InlineLaundryPrices } from "@/components/provider/InlineLaundryPrices";
import { CleaningEditor, type CleaningData } from "@/components/provider/CleaningEditor";

async function Editor() {
  const p = await requireOwnProvider();
  const supabase = await createClient();

  if (p.service === "laundry") {
    const [{ data: rows }, { data: s }] = await Promise.all([
      supabase.from("laundry_prices").select("item_id, service, price").eq("provider_id", p.id),
      supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over").eq("provider_id", p.id).maybeSingle(),
    ]);
    const prices: LaundryPriceList = {};
    for (const r of rows ?? []) (prices[r.item_id] ??= {})[r.service as "dry" | "wash" | "iron"] = r.price;
    return (
      <div className="max-w-xl rounded-2xl border-[1.5px] border-primary bg-surface p-5">
        <InlineLaundryPrices prices={prices} settings={s ? {
          expressPct: s.express_pct, deliveryFee: s.delivery_fee, freeDeliveryOver: s.free_delivery_over,
        } : DEFAULT_LAUNDRY_SETTINGS} />
      </div>
    );
  }

  const [{ data: rows }, { data: s }] = await Promise.all([
    supabase.from("cleaning_prices").select("property_type, area_id, price, offered").eq("provider_id", p.id),
    supabase.from("cleaning_settings").select("property_types, mult_deep, mult_move, mult_post, min_order").eq("provider_id", p.id).maybeSingle(),
  ]);
  const data: CleaningData = {
    prices: Object.fromEntries((rows ?? []).map((r) => [`${r.property_type}:${r.area_id}`, { price: r.price, offered: r.offered }])),
    propertyTypes: (s?.property_types ?? ["home"]) as PropertyType[],
    multipliers: s
      ? { deep: Number(s.mult_deep), move: Number(s.mult_move), post: Number(s.mult_post) }
      : { deep: DEFAULT_CLEANING_MULTIPLIERS.deep, move: DEFAULT_CLEANING_MULTIPLIERS.move, post: DEFAULT_CLEANING_MULTIPLIERS.post },
    minOrder: s?.min_order ?? DEFAULT_MIN_ORDER,
  };
  return <CleaningEditor data={data} />;
}

export default function ProviderPrices() {
  return (
    <>
      <h1 className="mb-1 text-[26px] font-extrabold">Prices</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Editor /></Suspense>
    </>
  );
}
