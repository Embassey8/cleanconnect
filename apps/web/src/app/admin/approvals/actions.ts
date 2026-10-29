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
