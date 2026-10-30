import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterListings, filtersFromParams, filtersToParams, paginate, parseQuery, type ListingRow } from "./marketplace";

const row = (o: Partial<ListingRow>): ListingRow => ({
  id: "x", slug: "x", display_name: "X", type: "business", service: "cleaning", plan: "standard",
  areas: [], min_price: 5000, rating: null, reviews: 0, checks: [], laundry: [], online: true, ...o,
});
const rows = [
  row({ id: "a", display_name: "Shine Cleaners", areas: ["Lekki"], min_price: 2500, rating: 4.8, plan: "vip" }),
  row({ id: "b", display_name: "Sparkle Laundry", service: "laundry", laundry: ["dry", "iron"], areas: ["Yaba"], min_price: 300 }),
  row({ id: "c", display_name: "Kemi Cleans", type: "individual", areas: ["Ikeja"], min_price: 4000, rating: 4.2 }),
];
const ids = (r: ListingRow[]) => r.map((x) => x.id);

describe("filterListings", () => {
  it("returns everything with no filters, VIP first", () => expect(ids(filterListings(rows, EMPTY_FILTERS))).toEqual(["a", "c", "b"]));
  it("filters by service and laundry sub-service", () => {
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, service: "laundry" }))).toEqual(["b"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, laundry: "iron" }))).toEqual(["b"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, laundry: "wash" }))).toEqual([]);
  });
  it("treats both provider types ticked as any", () => {
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, types: ["business", "individual"] }))).toHaveLength(3);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, types: ["individual"] }))).toEqual(["c"]);
  });
  it("filters by price range and drops unpriced providers from a max", () => {
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, min: 1000, max: 4000 }))).toEqual(["a", "c"]);
    expect(ids(filterListings([...rows, row({ id: "d", min_price: null })], { ...EMPTY_FILTERS, max: 99999 }))).not.toContain("d");
  });
  it("filters by minimum rating", () => expect(ids(filterListings(rows, { ...EMPTY_FILTERS, rating: 4.5 }))).toEqual(["a"]));
  it("searches name, area and service words", () => {
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, q: "lekki" }))).toEqual(["a"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, q: "ironing" }))).toEqual(["b"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, q: "deep cleaning" }))).toEqual(["a", "c"]);
  });
  it("sorts by price and rating", () => {
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, sort: "price_asc" }))).toEqual(["b", "a", "c"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, sort: "price_desc" }))).toEqual(["c", "a", "b"]);
    expect(ids(filterListings(rows, { ...EMPTY_FILTERS, sort: "rating" }))[0]).toBe("a");
  });
});

describe("paginate", () => {
  it("clamps the page", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(items, 3).items).toHaveLength(5);
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pages: 1 });
  });
});

describe("URL round trip", () => {
  it("keeps filters shareable and ignores junk", () => {
    const f = { ...EMPTY_FILTERS, service: "laundry" as const, laundry: "dry" as const, q: "yaba", max: 2000, types: ["individual" as const], sort: "price_asc" as const };
    const qs = filtersToParams(f, 2);
    const p = parseQuery(qs);
    expect(filtersFromParams(p.get, p.getAll)).toEqual(f);
    const bad = parseQuery("?service=boat&min=-5&type=alien&sort=zzz");
    expect(filtersFromParams(bad.get, bad.getAll)).toEqual(EMPTY_FILTERS);
  });
  it("encodes and decodes awkward search text", () => {
    const f = { ...EMPTY_FILTERS, q: "deep & clean, Lekki" };
    const p = parseQuery(filtersToParams(f, 1));
    expect(filtersFromParams(p.get, p.getAll).q).toBe("deep & clean, Lekki");
  });
});
