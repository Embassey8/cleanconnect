"use server";

import { redirect } from "next/navigation";
import { validateRegistration, type RegisterService, type ProviderKind } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";

export interface JoinState { errors?: Record<string, string>; error?: string }

export async function registerProvider(_: JoinState, form: FormData): Promise<JoinState> {
  const type = String(form.get("type")) as ProviderKind;
  const service = String(form.get("service")) as RegisterService;
  if (!["business", "individual"].includes(type) || !["cleaning", "laundry"].includes(service)) {
    return { error: "Choose a service and how you're registering." };
  }
  const areas = String(form.get("areas") ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  const input = {
    type, service, areas,
    displayName: String(form.get("displayName") ?? ""),
    cac: String(form.get("cac") ?? ""),
    nin: String(form.get("nin") ?? ""),
    bvn: String(form.get("bvn") ?? ""),
  };
  const errors = validateRegistration(input);
  const phone = String(form.get("phone") ?? "").trim();
  if (phone && !/^\+?[0-9\s-]{7,15}$/.test(phone)) errors.phone = "Enter a valid phone number.";
  if (Object.keys(errors).length) return { errors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_provider", {
    p_type: type, p_service: service, p_display_name: input.displayName, p_areas: areas,
    p_plan: form.get("plan") === "vip" ? "vip" : "standard",
    p_cac: type === "business" ? input.cac : null,
    p_nin: type === "individual" ? input.nin : null,
    p_bvn: type === "individual" && service === "laundry" ? input.bvn : null,
  });
  if (error) return { error: error.message };
  if (phone) {
    const { data: claims } = await supabase.auth.getClaims();
    const id = claims?.claims?.sub;
    if (id) await supabase.from("users").update({ phone }).eq("id", id);
  }
  redirect("/provider");
}
