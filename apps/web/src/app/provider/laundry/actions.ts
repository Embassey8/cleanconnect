"use server";

import { revalidatePath } from "next/cache";
import { parseNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";

export interface LaundryState { error?: string; ok?: string }

function refresh() {
  revalidatePath("/provider", "layout");
  revalidatePath("/account", "layout");
}

/** Shop counts the items it received. Returns where the order went: straight to cleaning, or waiting for the customer. */
export async function submitIntake(orderId: string, counts: Record<string, number>): Promise<{ error?: string; next?: "cleaning" | "awaiting_price_approval" }> {
  await requireOwnProvider();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_intake", { p_order: orderId, p_counts: counts });
  if (error) return { error: error.message };
  refresh();
  return { next: data as "cleaning" | "awaiting_price_approval" };
}

const whole = (v: FormDataEntryValue | null, label: string, min = 0): number | string => {
  const n = parseNaira(String(v ?? ""));
  return n == null || n < min ? `Enter a valid ${label}.` : n;
};

export async function saveDelivery(_: LaundryState, form: FormData): Promise<LaundryState> {
  const p = await requireOwnProvider();
  if (p.service !== "laundry") return { error: "Only laundry providers have delivery settings." };
  const pct = whole(form.get("expressPct"), "express surcharge");
  const fee = whole(form.get("deliveryFee"), "delivery fee");
  const free = whole(form.get("freeDeliveryOver"), "free-delivery amount");
  const hours = whole(form.get("turnaroundHours"), "turnaround (hours)", 1);
  for (const v of [pct, fee, free, hours]) if (typeof v === "string") return { error: v };
  if ((pct as number) > 200) return { error: "Express surcharge can't be above 200%." };
  const supabase = await createClient();
  const { error } = await supabase.from("laundry_settings").upsert({
    provider_id: p.id, express_pct: pct, delivery_fee: fee, free_delivery_over: free, turnaround_hours: hours,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Saved." };
}

export async function saveHours(_: LaundryState, form: FormData): Promise<LaundryState> {
  const p = await requireOwnProvider();
  if (p.service !== "laundry") return { error: "Only laundry providers have opening hours." };
  const cap = whole(form.get("capacityItems"), "daily capacity", 1);
  if (typeof cap === "string") return { error: cap };
  const hours = String(form.get("openingHours") ?? "").trim().slice(0, 120) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("laundry_settings").upsert({ provider_id: p.id, capacity_items: cap, opening_hours: hours });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Saved." };
}
