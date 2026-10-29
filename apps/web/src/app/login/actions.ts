"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { homeFor } from "@cleanconnect/shared";

export interface AuthState { error?: string }

/** Only allow same-site relative redirects. */
const safeNext = (n: FormDataEntryValue | null) =>
  typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : null;

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "Wrong email or password." };
  const user = await getSessionUser();
  redirect(safeNext(form.get("next")) ?? (user ? homeFor(user) : "/"));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? ""),
    password,
    options: { data: { name: String(form.get("name") ?? "") } },
  });
  if (error) return { error: error.message };
  redirect("/account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
