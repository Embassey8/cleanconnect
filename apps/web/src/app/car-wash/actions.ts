"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { lagosToIso } from "@/lib/time";

export interface WashState { error?: string }

export async function requestCarWash(_: WashState, form: FormData): Promise<WashState> {
  if (!(await getSessionUser())) redirect("/login?next=%2Fcar-wash");
  const supabase = await createClient();
  const date = String(form.get("date") ?? "");
  const window = String(form.get("window") ?? "08:00");
  const windowLabel: Record<string, string> = { "08:00": "8:00 – 10:00 am", "10:00": "10:00 am – 12:00 pm", "12:00": "12:00 – 2:00 pm", "14:00": "2:00 – 4:00 pm" };
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) && window in windowLabel ? `${date}T${window}` : "";
  const note = String(form.get("notes") ?? "").trim();
  const notes = [when ? `Time window: ${windowLabel[window]}` : null, note || null].filter(Boolean).join(" · ") || null;
  const { data, error } = await supabase.rpc("create_carwash_request", {
    p_package: String(form.get("package")), p_vehicle: String(form.get("vehicle")),
    p_mobile: form.get("mode") !== "dropoff",
    p_address: String(form.get("address") ?? ""), p_area: String(form.get("area") ?? "") || null,
    p_scheduled: lagosToIso(when), p_notes: notes,
  });
  if (error) return { error: error.message };
  redirect(`/account/orders/${data}`);
}
