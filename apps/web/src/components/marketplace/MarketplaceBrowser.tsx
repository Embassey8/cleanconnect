"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EMPTY_FILTERS, filterListings, filtersFromParams, filtersToParams, formatNaira, paginate, parseQuery,
  type ListingRow, type MarketplaceFilters, type MarketplaceSort,
} from "@cleanconnect/shared";
import { startThread } from "@/app/p/actions";

const TINTS = ["bg-primary-tint text-primary", "bg-laundry-bg text-laundry", "bg-carwash-bg text-carwash", "bg-vip-bg text-vip"];
const LAUNDRY_LABEL: Record<string, string> = { dry: "Dry clean", wash: "Wash only", iron: "Ironing" };
const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm";

const TABS: { key: string; label: string; f: Pick<MarketplaceFilters, "service" | "laundry"> }[] = [
  { key: "all", label: "All", f: { service: "", laundry: "" } },
  { key: "cleaning", label: "House cleaning", f: { service: "cleaning", laundry: "" } },
  { key: "laundry", label: "Laundry", f: { service: "laundry", laundry: "" } },
  { key: "dry", label: "Dry clean", f: { service: "laundry", laundry: "dry" } },
  { key: "wash", label: "Wash only", f: { service: "laundry", laundry: "wash" } },
  { key: "iron", label: "Ironing", f: { service: "laundry", laundry: "iron" } },
];

/**
 * All providers are loaded once; filtering, sorting and paging happen in the browser so results update on
 * every keystroke or click. The URL is kept in sync (without a navigation) so a search can be shared.
 */
export function MarketplaceBrowser({ rows, initialQuery }: { rows: ListingRow[]; initialQuery: string }) {
  const [state, setState] = useState(() => {
    const p = parseQuery(initialQuery);
    return { f: filtersFromParams(p.get, p.getAll), page: Math.max(1, Number(p.get("page")) || 1) };
  });
  const { f, page } = state;

  const update = (patch: Partial<MarketplaceFilters>, nextPage = 1) => {
    const next = { f: { ...f, ...patch }, page: nextPage };
    setState(next);
    const qs = filtersToParams(next.f, next.page);
    window.history.replaceState(null, "", qs ? `/marketplace?${qs}` : "/marketplace");
  };
  const goPage = (n: number) => update({}, n);

  const filtered = useMemo(() => filterListings(rows, f), [rows, f]);
  const view = paginate(filtered, page);
  const activeTab = TABS.find((t) => t.f.service === f.service && t.f.laundry === f.laundry)?.key;
  const label = f.laundry ? LAUNDRY_LABEL[f.laundry].toLowerCase() : f.service === "laundry" ? "laundry" : f.service === "cleaning" ? "house cleaning" : "cleaning and laundry";
  const typeOn = (t: "business" | "individual") => f.types.length === 0 || f.types.includes(t);
  const toggleType = (t: "business" | "individual") => {
    const both: ("business" | "individual")[] = ["business", "individual"];
    const current = f.types.length === 0 ? both : f.types;
    const next = current.includes(t) ? current.filter((x) => x !== t) : [...current, t];
    update({ types: next.length === 0 || next.length === 2 ? [] : next });
  };
  const num = (v: string) => (Number(v) > 0 ? Number(v) : null);

  return (
    <>
      <h1 className="text-3xl font-extrabold">Find a cleaner or laundry provider</h1>
      <p className="mb-5 mt-1 text-text-2">Every provider sets their own price. Compare, message and book the one you like.</p>
      <div role="tablist" aria-label="Service" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} onClick={() => update(t.f)}
            className={`min-h-11 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold ${activeTab === t.key ? "bg-primary text-white" : "border border-border bg-surface text-text-2 hover:bg-bg"}`}>{t.label}</button>
        ))}
        <Link href="/car-wash" className="min-h-11 whitespace-nowrap rounded-full border border-carwash/30 bg-carwash-bg px-4 py-2.5 text-sm font-semibold text-carwash">Car wash → request from us</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Filters" className="self-start rounded-card border border-border bg-surface p-4">
          <input type="checkbox" id="filters-toggle" className="peer sr-only" />
          <label htmlFor="filters-toggle" className="flex min-h-11 cursor-pointer items-center justify-between font-extrabold peer-focus-visible:outline lg:hidden">
            Filters <span aria-hidden="true">▾</span>
          </label>
          <div className="hidden space-y-5 pt-4 peer-checked:block lg:block lg:pt-0">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold max-lg:sr-only">Filters</h2>
              <button type="button" onClick={() => update({ ...EMPTY_FILTERS })} className="min-h-11 py-2.5 text-sm font-semibold text-primary">Clear all</button>
            </div>
            <fieldset><legend className="mb-2 text-sm font-bold">Starting price (₦)</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Min<input type="number" min={0} inputMode="numeric" value={f.min ?? ""} onChange={(e) => update({ min: num(e.target.value) })} placeholder="0" className={input} /></label>
                <label className="text-xs text-muted">Max<input type="number" min={0} inputMode="numeric" value={f.max ?? ""} onChange={(e) => update({ max: num(e.target.value) })} placeholder="Any" className={input} /></label>
              </div>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-bold">Provider type</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={typeOn("business")} onChange={() => toggleType("business")} /> Business / shop <span className="text-muted">(CAC)</span></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={typeOn("individual")} onChange={() => toggleType("individual")} /> Individual <span className="text-muted">(NIN/BVN)</span></label>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-bold">Minimum rating</legend>
              <div className="flex gap-2">
                {([[null, "Any"], [4, "4.0+"], [4.5, "4.5+"]] as const).map(([v, t]) => (
                  <label key={t} className="flex-1"><input type="radio" name="rating" checked={f.rating === v} onChange={() => update({ rating: v })} className="peer sr-only" />
                    <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-input border border-border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary-tint peer-checked:text-primary">{t}</span></label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted">Distance and date filters arrive with maps and provider calendars.</p>
          </div>
        </aside>

        <section aria-label="Results">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-sm font-semibold">Search providers
              <input type="search" value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="Search by name, area or service" className={`${input} mt-1`} />
            </label>
            <label className="text-sm font-semibold">Sort by
              <select value={f.sort} onChange={(e) => update({ sort: e.target.value as MarketplaceSort })} className={`${input} mt-1`}>
                <option value="recommended">Recommended</option><option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option><option value="rating">Highest rated</option>
              </select>
            </label>
          </div>
          <p className="mb-4 text-sm text-muted" aria-live="polite">Showing {filtered.length} {label} provider{filtered.length === 1 ? "" : "s"}</p>

          {view.items.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No providers match. Try widening your filters.</p> : (
            <ul className="space-y-4">
              {view.items.map((r, i) => (
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
                      {r.laundry.map((o) => <span key={o} className="rounded-full bg-bg px-2.5 py-1">{LAUNDRY_LABEL[o]}</span>)}
                      {!r.online && <span className="rounded-full bg-warning-bg px-2.5 py-1 text-warning">Not taking new orders right now</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="text-xs text-muted">Starting from</span>
                    <span className="text-xl font-extrabold">{r.min_price != null ? formatNaira(r.min_price) : "Soon"}</span>
                    <div className="flex gap-2">
                      <form action={startThread.bind(null, r.id, r.slug)}><button className="min-h-11 rounded-input border border-border bg-surface px-4 text-sm font-bold hover:bg-primary-tint">Message</button></form>
                      <Link href={`/p/${r.slug}`} className={`inline-flex min-h-11 items-center rounded-input px-4 text-sm font-bold ${r.online ? "bg-primary text-white hover:bg-primary-hover" : "border border-border bg-surface text-text-2"}`}>{r.online ? "Book" : "View"}</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {view.pages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-2">
              {Array.from({ length: view.pages }, (_, n) => n + 1).map((n) => (
                <button key={n} type="button" onClick={() => goPage(n)} aria-current={n === view.page ? "page" : undefined}
                  className={`flex size-11 items-center justify-center rounded-input border text-sm font-bold ${n === view.page ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}>{n}</button>
              ))}
              {view.page < view.pages && <button type="button" onClick={() => goPage(view.page + 1)} className="flex min-h-11 items-center rounded-input border border-border bg-surface px-4 text-sm font-bold">Next</button>}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
