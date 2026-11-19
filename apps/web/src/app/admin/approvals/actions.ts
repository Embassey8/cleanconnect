"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function reviewProvider(providerId: string, approve: boolean, reason?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_provider", {
    p_provider: providerId, p_approve: approve, p_reason: reason ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/approvals");
  return {};
}

/** Record the outcome of a manual CAC check (an admin looked the company up on the CAC register). */
export async function setCacCheck(providerId: string, status: "verified" | "mismatch", note?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_cac_check", { p_provider: providerId, p_status: status, p_note: note ?? null });
  if (error) return { error: error.message };
  revalidatePath("/admin/approvals");
  revalidatePath("/admin", "layout");
  return {};
}
