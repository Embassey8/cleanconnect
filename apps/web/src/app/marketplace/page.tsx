import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatNaira } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";
import { startThread } from "@/app/p/actions";

interface Row {
  id: string; slug: string; display_name: string; type: string; service: string; plan: string;
  areas: string[]; min_price: number | null; rating: number | null; reviews: number; checks: string[]; offers: string[];
}

const PAGE_SIZE = 10;
const BADGE: Record<string, string> = { cac: "CAC", nin: "NIN", bvn: "BVN" };
const TINTS = ["bg-primary-tint text-primary", "bg-laundry-bg text-laundry", "bg-carwash-bg text-carwash", "bg-vip-bg text-vip"];
const LAUNDRY_LABEL: Record<string, string> = { dry: "Dry clean", wash: "Wash only", iron: "Ironing" };
const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
const many = (sp: SP, k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[]) : typeof sp[k] === "string" ? [sp[k] as string] : []);

function href(sp: SP, patch: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v ? [v] : []) p.append(k, x);
  for (const [k, v] of Object.entries(patch)) { p.delete(k); if (v) p.set(k, v); }
  if (!("page" in patch)) p.delete("page");
  const s = p.toString();
  return s ? `/marketplace?${s}` : "/marketplace";
}

async function Results({ searchParams }: { searchParams: PageProps<"/marketplace">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  if (one(sp, "service") === "carwash") redirect("/car-wash");
  const service = ["cleaning", "laundry"].includes(one(sp, "service")) ? one(sp, "service") : "";
  const laundry = ["dry", "wash", "iron"].includes(one(sp, "laundry")) ? one(sp, "laundry") : "";
  const text = `${one(sp, "q")} ${one(sp, "area")}`.trim().toLowerCase();
  const min = Number(one(sp, "min")) > 0 ? Number(one(sp, "min")) : null;
  const max = Number(one(sp, "max")) > 0 ? Number(one(sp, "max")) : null;
  const types = many(sp, "type").filter((t) => t === "business" || t === "individual");
  const minRating = Number(one(sp, "rating")) > 0 ? Number(one(sp, "rating")) : null;
  const sort = ["price_asc", "price_desc", "rating"].includes(one(sp, "sort")) ? one(sp, "sort") : "recommended";
  const page = Math.max(1, Number(one(sp, "page")) || 1);

  const supabase = await createClient();
  let q = supabase.from("provider_listing").select("id, slug, display_name, type, service, plan, areas, min_price").neq("service", "carwash").limit(300);
  if (service) q = q.eq("service", service);
  if (types.length === 1) q = q.eq("type", types[0]);
  const { data, error } = await q;
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

  let rows: Row[] = base.map((r) => ({
    ...r, areas: r.areas as string[],
    rating: st.get(r.id)?.rating_avg == null ? null : Number(st.get(r.id)!.rating_avg), reviews: st.get(r.id)?.rating_count ?? 0,
    checks: [...new Set((badges ?? []).filter((b) => b.provider_id === r.id && b.verified).map((b) => BADGE[b.kind]).filter(Boolean))],
    offers: [...new Set((lp ?? []).filter((x) => x.provider_id === r.id).map((x) => LAUNDRY_LABEL[x.service]))],
  }));
  if (laundry) rows = rows.filter((r) => (lp ?? []).some((x) => x.provider_id === r.id && x.service === laundry));
  if (min) rows = rows.filter((r) => (r.min_price ?? 0) >= min);
  if (max) rows = rows.filter((r) => r.min_price !== null && r.min_price <= max);
  if (minRating) rows = rows.filter((r) => (r.rating ?? 0) >= minRating);
  if (text) rows = rows.filter((r) => `${r.display_name} ${r.areas.join(" ")} ${r.service}`.toLowerCase().includes(text) || (/laundry|iron|dry|wash/.test(text) && r.service === "laundry") || (text.includes("clean") && r.service === "cleaning"));
  rows.sort((a, b) => {
    if (sort === "price_asc") return (a.min_price ?? Infinity) - (b.min_price ?? Infinity);
    if (sort === "price_desc") return (b.min_price ?? -1) - (a.min_price ?? -1);
    if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    return Number(b.plan === "vip") - Number(a.plan === "vip") || (b.rating ?? 0) - (a.rating ?? 0) || (a.min_price ?? Infinity) - (b.min_price ?? Infinity) || a.display_name.localeCompare(b.display_name);
  });

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const label = laundry ? LAUNDRY_LABEL[laundry].toLowerCase() : service === "laundry" ? "laundry" : service === "cleaning" ? "house cleaning" : "cleaning and laundry";

  return (
    <>
      <p className="mb-4 text-sm text-muted" aria-live="polite">Showing {rows.length} {label} provider{rows.length === 1 ? "" : "s"}</p>
      {shown.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No providers match. Try widening your filters.</p> : (
        <ul className="space-y-4">
          {shown.map((r, i) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-4 rounded-[18px] border bg-surface p-5 ${r.plan === "vip" ? "border-vip-border" : "border-border"}`}>
              <span className={`flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${TINTS[i % TINTS.length]}`}>{r.display_name.slice(0, 1).toUpperCase()}</span>
              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold"><Link href={`/p/${r.slug}`} className="hover:text-primary">{r.display_name}</Link></h3>
                  {r.plan === "vip"
                    ? <span className="rounded-md bg-vip-bg px-2 py-1 text-[11px] font-extrabold tracking-wide text-vip">VIP · SPONSORED</span>
                    : r.checks.length > 0 && <span className="rounded-md bg-primary-tint px-2 py-1 text-[11px] font-bold text-primary">✓ Verified</span>}
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-2">
                  <span>{r.rating === null ? "No ratings yet" : `★ ${r.rating.toFixed(1)} (${r.reviews} review${r.reviews === 1 ? "" : "s"})`}</span>
                  <span>{r.type === "business" ? "Business" : "Individual"}{r.checks.length ? ` · ${r.checks.join(" + ")} verified` : ""}</span>
                  {r.areas.length > 0 && <span>{r.areas.slice(0, 3).join(", ")}</span>}
                </p>
                <p className="flex flex-wrap gap-2 text-xs font-semibold text-text-2">
                  <span className="rounded-full bg-bg px-2.5 py-1">{r.service === "laundry" ? "Laundry" : "House cleaning"}</span>
                  {r.offers.map((o) => <span key={o} className="rounded-full bg-bg px-2.5 py-1">{o}</span>)}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="text-xs text-muted">Starting from</span>
                <span className="text-xl font-extrabold">{r.min_price != null ? formatNaira(r.min_price) : "Soon"}</span>
                <div className="flex gap-2">
                  <form action={startThread.bind(null, r.id, r.slug)}><button className="min-h-11 rounded-input border border-border bg-surface px-4 text-sm font-bold hover:bg-primary-tint">Message</button></form>
                  <Link href={`/p/${r.slug}`} className="inline-flex min-h-11 items-center rounded-input bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">Book</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-2">
          {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
            <Link key={n} href={href(sp, { page: String(n) })} aria-current={n === page ? "page" : undefined}
              className={`flex size-11 items-center justify-center rounded-input border text-sm font-bold ${n === page ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}>{n}</Link>
          ))}
          {page < pages && <Link href={href(sp, { page: String(page + 1) })} className="flex min-h-11 items-center rounded-input border border-border bg-surface px-4 text-sm font-bold">Next</Link>}
        </nav>
      )}
    </>
  );
}

async function Page({ searchParams }: { searchParams: PageProps<"/marketplace">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  const active = one(sp, "service") === "laundry" ? (one(sp, "laundry") ? `l-${one(sp, "laundry")}` : "laundry") : one(sp, "service") === "cleaning" ? "cleaning" : "all";
  const tab = (key: string, text: string, patch: Record<string, string | null>) => (
    <Link key={key} role="tab" aria-selected={active === key} href={href(sp, patch)}
      className={`min-h-11 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold ${active === key ? "bg-primary text-white" : "border border-border bg-surface text-text-2 hover:bg-bg"}`}>{text}</Link>
  );
  const types = many(sp, "type");
  return (
    <>
      <h1 className="text-3xl font-extrabold">Find a cleaner or laundry provider</h1>
      <p className="mb-5 mt-1 text-text-2">Every provider sets their own price. Compare, message and book the one you like.</p>
      <div role="tablist" aria-label="Service" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {tab("all", "All", { service: null, laundry: null })}
        {tab("cleaning", "House cleaning", { service: "cleaning", laundry: null })}
        {tab("laundry", "Laundry", { service: "laundry", laundry: null })}
        {tab("l-dry", "Dry clean", { service: "laundry", laundry: "dry" })}
        {tab("l-wash", "Wash only", { service: "laundry", laundry: "wash" })}
        {tab("l-iron", "Ironing", { service: "laundry", laundry: "iron" })}
        <Link href="/car-wash" className="min-h-11 whitespace-nowrap rounded-full border border-carwash/30 bg-carwash-bg px-4 py-2.5 text-sm font-semibold text-carwash">Car wash → request from us</Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Filters" className="self-start rounded-card border border-border bg-surface p-4">
          <input type="checkbox" id="filters-toggle" className="peer sr-only" />
          <label htmlFor="filters-toggle" className="flex min-h-11 cursor-pointer items-center justify-between font-extrabold peer-focus-visible:outline lg:hidden">
            Filters <span aria-hidden="true">▾</span>
          </label>
          <form method="get" className="hidden space-y-5 pt-4 peer-checked:block lg:block lg:pt-0">
            {one(sp, "service") && <input type="hidden" name="service" value={one(sp, "service")} />}
            {one(sp, "laundry") && <input type="hidden" name="laundry" value={one(sp, "laundry")} />}
            <div className="flex items-center justify-between"><h2 className="font-extrabold max-lg:sr-only">Filters</h2><Link href="/marketplace" className="min-h-11 py-2.5 text-sm font-semibold text-primary">Clear all</Link></div>
            <fieldset><legend className="mb-2 text-sm font-bold">Starting price (₦)</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Min<input name="min" type="number" min={0} defaultValue={one(sp, "min")} placeholder="0" className={input} /></label>
                <label className="text-xs text-muted">Max<input name="max" type="number" min={0} defaultValue={one(sp, "max")} placeholder="Any" className={input} /></label>
              </div>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-bold">Provider type</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="type" value="business" defaultChecked={types.length === 0 || types.includes("business")} /> Business / shop <span className="text-muted">(CAC)</span></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="type" value="individual" defaultChecked={types.length === 0 || types.includes("individual")} /> Individual <span className="text-muted">(NIN/BVN)</span></label>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-bold">Minimum rating</legend>
              <div className="flex gap-2">
                {[["", "Any"], ["4", "4.0+"], ["4.5", "4.5+"]].map(([v, t]) => (
                  <label key={t} className="flex-1"><input type="radio" name="rating" value={v} defaultChecked={one(sp, "rating") === v} className="peer sr-only" />
                    <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-input border border-border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary-tint peer-checked:text-primary">{t}</span></label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted">Distance and date filters arrive with maps and provider calendars.</p>
            <input type="hidden" name="q" value={one(sp, "q")} />
            <button className="min-h-11 w-full rounded-input bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover">Apply filters</button>
          </form>
        </aside>
        <section aria-label="Results">
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            {["service", "laundry", "min", "max", "rating"].map((k) => one(sp, k) ? <input key={k} type="hidden" name={k} value={one(sp, k)} /> : null)}
            {types.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
            <label className="min-w-[220px] flex-1 text-sm font-semibold">Search providers
              <input type="search" name="q" defaultValue={one(sp, "q")} placeholder="Search by name, area or service" className={`${input} mt-1`} />
            </label>
            <label className="text-sm font-semibold">Sort by
              <select name="sort" defaultValue={one(sp, "sort") || "recommended"} className={`${input} mt-1`}>
                <option value="recommended">Recommended</option><option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option><option value="rating">Highest rated</option>
              </select>
            </label>
            <button className="min-h-11 rounded-input bg-accent px-5 text-sm font-bold text-ink">Search</button>
          </form>
          <Suspense fallback={<p className="text-muted">Loading…</p>}><Results searchParams={searchParams} /></Suspense>
        </section>
      </div>
    </>
  );
}

export default function Marketplace(props: PageProps<"/marketplace">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Page searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}
