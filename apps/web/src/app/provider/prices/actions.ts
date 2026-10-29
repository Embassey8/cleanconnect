"use server";

import { revalidatePath } from "next/cache";
import { LAUNDRY_SERVICES, DEFAULT_LAUNDRY_ITEMS, CLEANING_AREAS, PROPERTY_TYPES, parseNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";

export interface SaveState { ok?: boolean; error?: string }

const num = (f: FormData, k: string, fallback: number) => {
  const v = parseNaira(String(f.get(k) ?? ""));
  return v == null ? fallback : v;
};

export async function saveLaundry(_: SaveState, form: FormData): Promise<SaveState> {
  const p = await requireOwnProvider();
  if (p.service !== "laundry") return { error: "Not a laundry provider." };
  const rows = [];
  for (const item of DEFAULT_LAUNDRY_ITEMS) {
    for (const s of LAUNDRY_SERVICES) {
      const price = parseNaira(String(form.get(`p:${item.id}:${s.id}`) ?? ""));
      if (price === undefined) return { error: `Check the ${s.label} price for ${item.name}.` };
      rows.push({ provider_id: p.id, item_id: item.id, service: s.id, price });
    }
  }
  const supabase = await createClient();
  const a = await supabase.from("laundry_prices").upsert(rows);
  if (a.error) return { error: a.error.message };
  const b = await supabase.from("laundry_settings").upsert({
    provider_id: p.id,
    express_pct: Math.min(200, num(form, "expressPct", 50)),
    delivery_fee: num(form, "deliveryFee", 1500),
    free_delivery_over: num(form, "freeDeliveryOver", 20000),
  });
  if (b.error) return { error: b.error.message };
  revalidatePath("/provider/prices");
  return { ok: true };
}

export async function saveCleaning(_: SaveState, form: FormData): Promise<SaveState> {
  const p = await requireOwnProvider();
  if (p.service !== "cleaning") return { error: "Not a cleaning provider." };
  const rows = [];
  for (const pt of PROPERTY_TYPES) {
    for (const a of CLEANING_AREAS[pt.id]) {
      const price = parseNaira(String(form.get(`price:${pt.id}:${a.id}`) ?? ""));
      if (price === undefined) return { error: `Check the price for ${a.name} (${pt.label}).` };
      const offered = form.get(`offered:${pt.id}:${a.id}`) === "on" && price != null;
      rows.push({ provider_id: p.id, property_type: pt.id, area_id: a.id, price, offered });
    }
  }
  const mult = (k: string, d: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n * 10) / 10 : d;
  };
  const types = PROPERTY_TYPES.filter((t) => form.get(`ptype:${t.id}`) === "on").map((t) => t.id);
  const supabase = await createClient();
  const a = await supabase.from("cleaning_prices").upsert(rows);
  if (a.error) return { error: a.error.message };
  const b = await supabase.from("cleaning_settings").upsert({
    provider_id: p.id,
    property_types: types,
    mult_regular: 1.0,
    mult_deep: mult("mult_deep", 1.6),
    mult_move: mult("mult_move", 1.8),
    mult_post: mult("mult_post", 2.2),
    min_order: num(form, "minOrder", 10000),
  });
  if (b.error) return { error: b.error.message };
  revalidatePath("/provider/prices");
  return { ok: true };
}
