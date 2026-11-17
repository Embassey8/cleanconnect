"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { homeFor } from "@cleanconnect/shared";

export interface AuthState {
  error?: string;
  /** Set when the account exists but its email address still has to be confirmed. */
  confirmEmail?: string;
  /** Neutral message, e.g. "confirmation email sent again". */
  notice?: string;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const callbackUrl = (next: string | null) =>
  siteUrl() ? `${siteUrl()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}` : undefined;

/** Only allow same-site relative redirects. */
const safeNext = (n: FormDataEntryValue | null) =>
  typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : null;

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) {
    if (error.code === "email_not_confirmed") return { confirmEmail: String(form.get("email") ?? "").trim() };
    return { error: "Wrong email or password." };
  }
  const user = await getSessionUser();
  redirect(safeNext(form.get("next")) ?? (user ? homeFor(user) : "/"));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const next = safeNext(form.get("next"));
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: String(form.get("name") ?? "") }, emailRedirectTo: callbackUrl(next) },
  });
  if (error) {
    if (error.code === "over_email_send_rate_limit") return { error: "Too many emails were sent just now. Wait a minute and try again." };
    return { error: error.message };
  }
  // Email confirmation is on: there is no session until the link in the email is opened.
  if (!data.session) return { confirmEmail: email };
  redirect(next ?? "/account");
}

/** Send the confirmation email again. */
export async function resendConfirmation(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl(safeNext(form.get("next"))) } });
  if (error) {
    if (error.code === "over_email_send_rate_limit") return { confirmEmail: email, error: "Please wait a minute before asking for another email." };
    return { confirmEmail: email, error: "We couldn't send the email. Check the address and try again." };
  }
  return { confirmEmail: email, notice: "Sent again. It can take a minute to arrive." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
