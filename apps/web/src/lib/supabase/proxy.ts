import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTE_ACCESS } from "@cleanconnect/shared";

// Provider profiles stream, and with Cache Components a streamed response always starts with a 200, so a
// missing provider has to be rejected here, before rendering, to get a real 404. RLS only exposes approved,
// listed providers, so an anon read is the right visibility test. Fails open: the page still calls notFound().
const LISTED_TTL_MS = 30_000;
const listedCache = new Map<string, { listed: boolean; at: number }>();

async function providerIsListed(slug: string): Promise<boolean | null> {
  const hit = listedCache.get(slug);
  if (hit && Date.now() - hit.at < LISTED_TTL_MS) return hit.listed;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/providers?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const listed = ((await res.json()) as unknown[]).length > 0;
    if (listedCache.size > 500) listedCache.clear();
    listedCache.set(slug, { listed, at: Date.now() });
    return listed;
  } catch {
    return null;
  }
}

/** Refresh the Supabase session cookie and bounce signed-out visitors from private areas.
 *  Role checks happen in the layouts (requireRole); this is only the optimistic first gate. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const path = request.nextUrl.pathname;
  const profile = /^\/p\/([^/]+)\/?$/.exec(path);
  if (profile && (await providerIsListed(decodeURIComponent(profile[1]))) === false) {
    // "/not-found" matches no route, so Next renders app/not-found.tsx with a 404 status.
    return NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
  }
  const { data } = await supabase.auth.getClaims();
  const isPrivate = ROUTE_ACCESS.some(([p]) => path === p || path.startsWith(p + "/"));
  if (isPrivate && !data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
