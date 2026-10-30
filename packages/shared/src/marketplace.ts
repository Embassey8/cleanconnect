/** Marketplace search: pure filter, sort and paging so web and mobile behave identically. */

export interface ListingRow {
  id: string;
  slug: string;
  display_name: string;
  type: "business" | "individual";
  service: "cleaning" | "laundry";
  plan: "standard" | "vip";
  areas: string[];
  min_price: number | null;
  rating: number | null;
  reviews: number;
  checks: string[];
  /** Laundry services with a price: dry, wash, iron. */
  laundry: string[];
  /** False while the provider has paused new orders. */
  online: boolean;
}

export type MarketplaceSort = "recommended" | "price_asc" | "price_desc" | "rating";

export interface MarketplaceFilters {
  service: "" | "cleaning" | "laundry";
  laundry: "" | "dry" | "wash" | "iron";
  q: string;
  min: number | null;
  max: number | null;
  types: ("business" | "individual")[];
  rating: number | null;
  sort: MarketplaceSort;
}

export const EMPTY_FILTERS: MarketplaceFilters = { service: "", laundry: "", q: "", min: null, max: null, types: [], rating: null, sort: "recommended" };

export const PAGE_SIZE = 10;

export function filterListings(rows: ListingRow[], f: MarketplaceFilters): ListingRow[] {
  const text = f.q.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (f.service && r.service !== f.service) return false;
    if (f.laundry && !r.laundry.includes(f.laundry)) return false;
    // Both type boxes ticked (or none) means "any".
    if (f.types.length === 1 && r.type !== f.types[0]) return false;
    if (f.min !== null && (r.min_price ?? 0) < f.min) return false;
    if (f.max !== null && (r.min_price === null || r.min_price > f.max)) return false;
    if (f.rating !== null && (r.rating ?? 0) < f.rating) return false;
    if (text) {
      const hay = `${r.display_name} ${r.areas.join(" ")} ${r.service}`.toLowerCase();
      const byService = (/laundry|iron|dry|wash/.test(text) && r.service === "laundry") || (text.includes("clean") && r.service === "cleaning");
      if (!hay.includes(text) && !byService) return false;
    }
    return true;
  });
  return out.sort((a, b) => {
    if (f.sort === "price_asc") return (a.min_price ?? Infinity) - (b.min_price ?? Infinity);
    if (f.sort === "price_desc") return (b.min_price ?? -1) - (a.min_price ?? -1);
    if (f.sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    return (
      Number(b.plan === "vip") - Number(a.plan === "vip") ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (a.min_price ?? Infinity) - (b.min_price ?? Infinity) ||
      a.display_name.localeCompare(b.display_name)
    );
  });
}

export function paginate<T>(items: T[], page: number, size: number = PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}

/** Parse URL search params into filters, ignoring anything invalid. */
export function filtersFromParams(get: (k: string) => string | null, getAll: (k: string) => string[]): MarketplaceFilters {
  const num = (k: string) => { const n = Number(get(k)); return n > 0 ? n : null; };
  const pick = <T extends string>(k: string, ok: readonly T[], fallback: T): T => { const v = get(k) as T | null; return v && ok.includes(v) ? v : fallback; };
  return {
    service: pick("service", ["", "cleaning", "laundry"] as const, ""),
    laundry: pick("laundry", ["", "dry", "wash", "iron"] as const, ""),
    q: `${get("q") ?? ""} ${get("area") ?? ""}`.trim(),
    min: num("min"), max: num("max"),
    types: getAll("type").filter((t): t is "business" | "individual" => t === "business" || t === "individual"),
    rating: num("rating"),
    sort: pick("sort", ["recommended", "price_asc", "price_desc", "rating"] as const, "recommended"),
  };
}

/** Query string for the filters (empty values omitted), used to keep the URL shareable. */
export function filtersToParams(f: MarketplaceFilters, page: number): string {
  const parts: string[] = [];
  const add = (k: string, v: string | number) => parts.push(`${k}=${encodeURIComponent(String(v))}`);
  if (f.service) add("service", f.service);
  if (f.laundry) add("laundry", f.laundry);
  if (f.q.trim()) add("q", f.q.trim());
  if (f.min !== null) add("min", f.min);
  if (f.max !== null) add("max", f.max);
  for (const t of f.types) add("type", t);
  if (f.rating !== null) add("rating", f.rating);
  if (f.sort !== "recommended") add("sort", f.sort);
  if (page > 1) add("page", page);
  return parts.join("&");
}

/** Minimal query-string reader (no DOM types, so this package stays platform-neutral). */
export function parseQuery(qs: string): { get: (k: string) => string | null; getAll: (k: string) => string[] } {
  const pairs = qs.replace(/^\?/, "").split("&").filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
    return i < 0 ? [dec(p), ""] as const : [dec(p.slice(0, i)), dec(p.slice(i + 1))] as const;
  });
  return {
    get: (k) => pairs.find(([key]) => key === k)?.[1] ?? null,
    getAll: (k) => pairs.filter(([key]) => key === k).map(([, v]) => v),
  };
}
