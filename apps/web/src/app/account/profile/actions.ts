"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileState { error?: string; ok?: string }

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (!name) return { error: "Please enter your name." };
  if (phone && !/^\+?[0-9\s-]{7,15}$/.test(phone)) return { error: "Enter a valid phone number." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims?.sub;
  if (!id) return { error: "Please sign in again." };
  const { error } = await supabase.from("users").update({ name, phone: phone || null }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/account", "layout");
  return { ok: "Profile saved." };
}
