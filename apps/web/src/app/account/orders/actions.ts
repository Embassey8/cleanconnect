"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";

export async function advanceOrder(orderId: string, status: OrderStatus): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_order", { p_order: orderId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/account", "layout");
  revalidatePath("/provider", "layout");
  revalidatePath("/partner", "layout");
  return {};
}
