import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { ListingRow } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { MarketplaceBrowser } from "@/components/marketplace/MarketplaceBrowser";
import { createClient } from "@/lib/supabase/server";

const BADGE: Record<string, string> = { cac: "CAC", nin: "NIN", bvn: "BVN" };

/** Loads every listed provider once; the browser component filters them instantly. */
async function Loader({ searchParams }: { searchParams: PageProps<"/marketplace">["searchParams"] }) {
  const sp = await searchParams;
  if (sp.service === "carwash") redirect("/car-wash");
  const initial = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v ? [v] : []) initial.append(k, x);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_listing").select("id, slug, display_name, type, service, plan, areas, min_price").neq("service", "carwash").limit(500);
  if (error) return <p role="alert" className="text-danger">Could not load providers: {error.message}</p>;
  const base = data ?? [];
  const ids = base.map((r) => r.id);
  const [{ data: stats }, { data: badges }, { data: lp }] = ids.length
    ? await Promise.all([
        supabase.from("provider_stats").select("provider_id, rating_avg, rating_count").in("provider_id", ids),
        supabase.from("provider_badges").select("provider_id, kind, verified").in("provider_id", ids),
        supabase.from("laundry_prices").select("provider_id, service").in("provider_id", ids).not("price", "is", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const st = new Map((stats ?? []).map((s) => [s.provider_id, s]));
  const rows: ListingRow[] = base.map((r) => ({
    id: r.id, slug: r.slug, display_name: r.display_name, type: r.type as ListingRow["type"], service: r.service as ListingRow["service"],
    plan: r.plan as ListingRow["plan"], areas: r.areas as string[], min_price: r.min_price,
    rating: st.get(r.id)?.rating_avg == null ? null : Number(st.get(r.id)!.rating_avg), reviews: st.get(r.id)?.rating_count ?? 0,
    checks: [...new Set((badges ?? []).filter((b) => b.provider_id === r.id && b.verified).map((b) => BADGE[b.kind]).filter(Boolean))],
    laundry: [...new Set((lp ?? []).filter((x) => x.provider_id === r.id).map((x) => x.service))],
  }));
  return <MarketplaceBrowser rows={rows} initialQuery={initial.toString()} />;
}

export default function Marketplace(props: PageProps<"/marketplace">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Loader searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}
