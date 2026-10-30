"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { friendlyMoneyError } from "@/lib/money";

export async function advanceOrder(orderId: string, status: OrderStatus): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_order", { p_order: orderId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  revalidatePath("/partner", "layout");
  return {};
}

/** Customer answers a new total proposed after the shop counted their items. */
export async function respondPriceChange(orderId: string, approve: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_price_change", { p_order: orderId, p_approve: approve });
  if (error) return { error: friendlyMoneyError(error.message) };
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  return {};
}
