import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Landing point of the confirmation link in the signup email. Confirming the address already happened at
 *  Supabase; here we also try to sign the person straight in. If that isn't possible (link opened in another
 *  browser or app) they are sent to the sign-in page with a confirmation notice. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, origin));
  }
  const login = new URL("/login", origin);
  login.searchParams.set("confirmed", "1");
  if (safeNext !== "/account") login.searchParams.set("next", safeNext);
  return NextResponse.redirect(login);
}
