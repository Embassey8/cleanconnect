import { Suspense } from "react";
import Link from "next/link";
import { formatNaira } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";

interface Row {
  id: string; slug: string; display_name: string; type: string; service: string; plan: string;
  areas: string[]; min_price: number | null;
}

const input = "min-h-11 rounded-input border border-border bg-surface px-3 text-sm";

async function Results({ searchParams }: { searchParams: PageProps<"/marketplace">["searchParams"] }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const service = ["cleaning", "laundry"].includes(one("service")) ? one("service") : "";
  const type = ["business", "individual"].includes(one("type")) ? one("type") : "";
  const max = Number(one("max")) > 0 ? Number(one("max")) : null;
  const area = one("area").trim().toLowerCase();

  const supabase = await createClient();
  let q = supabase.from("provider_listing").select("id, slug, display_name, type, service, plan, areas, min_price").neq("service", "carwash").limit(200);
  if (service) q = q.eq("service", service);
  if (type) q = q.eq("type", type);
  if (max) q = q.lte("min_price", max);
  const { data, error } = await q;
  if (error) return <p role="alert" className="text-danger">Could not load providers: {error.message}</p>;

  let rows = (data ?? []) as Row[];
  if (area) rows = rows.filter((r) => r.areas.some((a) => a.toLowerCase().includes(area)));
  // VIP first, then cheapest starting price, then name
  rows.sort((a, b) =>
    Number(b.plan === "vip") - Number(a.plan === "vip") ||
    (a.min_price ?? Infinity) - (b.min_price ?? Infinity) ||
    a.display_name.localeCompare(b.display_name));

  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No providers match. Try widening your filters.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/p/${r.slug}`} className={`block h-full rounded-card border bg-surface p-4 hover:border-primary ${r.plan === "vip" ? "border-vip-border" : "border-border"}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold">{r.display_name}</h2>
              {r.plan === "vip" && <span className="rounded-full border border-vip-border bg-vip-bg px-2 py-0.5 text-xs font-bold text-vip">VIP</span>}
            </div>
            <p className="text-sm text-muted">
              {r.service === "laundry" ? "Laundry" : "Cleaning"} · {r.type === "business" ? "Business" : "Individual"}
            </p>
            {r.areas.length > 0 && <p className="mt-1 text-sm text-text-2">{r.areas.slice(0, 3).join(", ")}</p>}
            <p className="mt-3 font-bold text-primary">{r.min_price != null ? `From ${formatNaira(r.min_price)}` : "Prices coming soon"}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Marketplace(props: PageProps<"/marketplace">) {
  return (
    <PublicShell>
      <h1 className="mb-4 text-3xl font-extrabold">Find a provider</h1>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
        <label className="text-sm font-semibold">Service
          <select name="service" className={`${input} mt-1 block`}><option value="">All</option><option value="cleaning">House &amp; commercial cleaning</option><option value="laundry">Laundry</option></select>
        </label>
        <label className="text-sm font-semibold">Provider
          <select name="type" className={`${input} mt-1 block`}><option value="">Any</option><option value="business">Business</option><option value="individual">Individual</option></select>
        </label>
        <label className="text-sm font-semibold">Area
          <input name="area" placeholder="e.g. Lekki" className={`${input} mt-1 block`} />
        </label>
        <label className="text-sm font-semibold">Starting price up to (₦)
          <input name="max" inputMode="numeric" className={`${input} mt-1 block w-36`} />
        </label>
        <button className="min-h-11 rounded-input bg-accent px-5 text-sm font-bold text-ink">Search</button>
      </form>
      <p className="mb-4 text-sm text-muted">VIP providers are listed first. Ratings, distance and date filters arrive with reviews and maps.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Results searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}
