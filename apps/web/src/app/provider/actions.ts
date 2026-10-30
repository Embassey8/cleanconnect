"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";

export interface ProviderFormState { error?: string; ok?: string }

function refresh() {
  revalidatePath("/provider", "layout");
  revalidatePath("/marketplace");
}

export async function saveAreas(_: ProviderFormState, form: FormData): Promise<ProviderFormState> {
  const p = await requireOwnProvider();
  const areas = String(form.get("areas") ?? "").split(",").map((a) => a.trim()).filter(Boolean).slice(0, 30);
  if (areas.length === 0) return { error: "Add at least one area you cover." };
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ areas }).eq("id", p.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: "Areas saved." };
}

export async function saveProfileName(_: ProviderFormState, form: FormData): Promise<ProviderFormState> {
  const p = await requireOwnProvider();
  const name = String(form.get("displayName") ?? "").trim();
  if (name.length < 2) return { error: "Enter your name or business name." };
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ display_name: name }).eq("id", p.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: "Saved." };
}

export async function addMember(_: ProviderFormState, form: FormData): Promise<ProviderFormState> {
  const p = await requireOwnProvider();
  const name = String(form.get("firstName") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Enter a first name." };
  const supabase = await createClient();
  const { error } = await supabase.from("provider_members").insert({ provider_id: p.id, first_name: name });
  if (error) return { error: error.message };
  refresh();
  return { ok: `${name} added.` };
}

export async function removeMember(id: string): Promise<{ error?: string }> {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { error } = await supabase.from("provider_members").delete().eq("id", id).eq("provider_id", p.id);
  if (error) return { error: error.message };
  refresh();
  return {};
}
