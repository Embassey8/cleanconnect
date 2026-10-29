import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "./session";

export interface OwnProvider {
  id: string; slug: string; display_name: string; service: "cleaning" | "laundry" | "carwash";
  type: "business" | "individual"; status: "pending" | "approved" | "rejected" | "suspended";
  plan: "standard" | "vip"; rejection_reason: string | null;
}

/** The signed-in provider's own profile, or redirect home if they have none. */
export async function requireOwnProvider(): Promise<OwnProvider> {
  const user = await requireRole(["provider"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("id, slug, display_name, service, type, status, plan, rejection_reason")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!data) redirect("/providers/join");
  return data as OwnProvider;
}
