"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { lagosToIso } from "@/lib/time";

export interface BookState { error?: string }

async function needUser(next: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function bookLaundry(_: BookState, form: FormData): Promise<BookState> {
  const slug = String(form.get("slug"));
  await needUser(`/p/${slug}`);
  let lines: unknown;
  try { lines = JSON.parse(String(form.get("lines") ?? "[]")); } catch { return { error: "Something went wrong. Please try again." }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_laundry_order", {
    p_provider: String(form.get("providerId")), p_lines: lines, p_express: form.get("express") === "on",
    p_address: String(form.get("address") ?? ""), p_area: String(form.get("area") ?? "") || null,
    p_scheduled: lagosToIso(String(form.get("when") ?? "")),
  });
  if (error) return { error: error.message };
  redirect(`/account/orders/${data}`);
}

export async function bookCleaning(_: BookState, form: FormData): Promise<BookState> {
  const slug = String(form.get("slug"));
  await needUser(`/p/${slug}`);
  let areas: unknown;
  try { areas = JSON.parse(String(form.get("areas") ?? "[]")); } catch { return { error: "Something went wrong. Please try again." }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_cleaning_order", {
    p_provider: String(form.get("providerId")), p_property: String(form.get("property")), p_ctype: String(form.get("ctype")),
    p_frequency: String(form.get("frequency")), p_areas: areas, p_extras: form.getAll("extras").map(String),
    p_address: String(form.get("address") ?? ""), p_area: String(form.get("area") ?? "") || null,
    p_scheduled: lagosToIso(String(form.get("when") ?? "")),
  });
  if (error) return { error: error.message };
  redirect(`/account/orders/${data}`);
}

export async function startThread(providerId: string, slug: string) {
  await needUser(`/p/${slug}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_thread", { p_provider: providerId });
  if (error) redirect(`/p/${slug}`);
  redirect(`/messages/${data}`);
}
