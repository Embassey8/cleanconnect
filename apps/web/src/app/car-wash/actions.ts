"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { lagosToIso } from "@/lib/time";

export interface WashState { error?: string }

export async function requestCarWash(_: WashState, form: FormData): Promise<WashState> {
  if (!(await getSessionUser())) redirect("/login?next=%2Fcar-wash");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_carwash_request", {
    p_package: String(form.get("package")), p_vehicle: String(form.get("vehicle")),
    p_mobile: form.get("mode") !== "dropoff",
    p_address: String(form.get("address") ?? ""), p_area: String(form.get("area") ?? "") || null,
    p_scheduled: lagosToIso(String(form.get("when") ?? "")), p_notes: String(form.get("notes") ?? "") || null,
  });
  if (error) return { error: error.message };
  redirect(`/account/orders/${data}`);
}
