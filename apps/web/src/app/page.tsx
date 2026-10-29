import { Suspense } from "react";
import Link from "next/link";
import { formatNaira, starsText } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";

const ICON = { fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const TRUST = [
  { text: "Every provider ID-verified (CAC, NIN, BVN)", d: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></> },
  { text: "Pay safely from your wallet", d: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /></> },
  { text: "Track every order live", d: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
];

const LAUNDRY = [
  { title: "Dry clean", text: "Suits, native wear, gowns and delicate fabrics.", bg: "bg-laundry-bg", stroke: "#6A3FA0",
    d: <><path d="M12 4a2 2 0 1 1 2 2c-1 0-2 .7-2 1.6V9" /><path d="M12 9l9 7H3z" /><path d="M3 16v2h18v-2" /></> },
  { title: "Wash only", text: "Wash and dry, folded and ready for pickup or delivery.", bg: "bg-carwash-bg", stroke: "#1F5FAE",
    d: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /><path d="M8 6h.01M11 6h.01" /></> },
  { title: "Ironing", text: "Crisp pressing for shirts, trousers and uniforms.", bg: "bg-vip-bg", stroke: "#8A5A00",
    d: <><path d="M3 17h18l-2-6a4 4 0 0 0-4-3H9" /><path d="M9 8V5h4" /><path d="M3 17l1-3h8" /></> },
];

const TINTS = [
  "bg-primary-tint text-primary", "bg-laundry-bg text-laundry", "bg-carwash-bg text-carwash",
];

interface Featured { id: string; slug: string; display_name: string; type: string; service: string; plan: string; min_price: number | null }

async function FeaturedProviders() {
  const supabase = await createClient();
  const { data } = await supabase.from("provider_listing").select("id, slug, display_name, type, service, plan, min_price").neq("service", "carwash").limit(60);
  const all = (data ?? []) as Featured[];
  if (all.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">Providers will appear here once they&apos;re approved.</p>;
  const ids = all.map((p) => p.id);
  const [{ data: stats }, { data: badges }] = await Promise.all([
    supabase.from("provider_stats").select("provider_id, rating_avg").in("provider_id", ids),
    supabase.from("provider_badges").select("provider_id, kind, verified").in("provider_id", ids),
  ]);
  const rating = new Map((stats ?? []).map((s) => [s.provider_id, s.rating_avg == null ? null : Number(s.rating_avg)]));
  const verified = (id: string) => (badges ?? []).filter((b) => b.provider_id === id && b.verified).map((b) => String(b.kind).toUpperCase());
  const picked = [...all]
    .sort((a, b) => Number(b.plan === "vip") - Number(a.plan === "vip") || (rating.get(b.id) ?? 0) - (rating.get(a.id) ?? 0) || (a.min_price ?? Infinity) - (b.min_price ?? Infinity))
    .slice(0, 3);
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {picked.map((p, i) => (
        <li key={p.id}>
          <Link href={`/p/${p.slug}`} className={`flex h-full flex-col gap-3 rounded-[18px] border bg-surface p-[22px] ${p.plan === "vip" ? "border-vip-border" : "border-border"} hover:border-primary`}>
            <div className="flex items-center gap-3">
              <span className={`flex size-12 items-center justify-center rounded-full font-extrabold ${TINTS[i % TINTS.length]}`}>{p.display_name.slice(0, 1).toUpperCase()}</span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-base font-bold">{p.display_name}</span>
                <span className="text-[13px] text-muted">{p.service === "laundry" ? "Laundry" : "House cleaning"} · {p.type === "business" ? "Business" : "Individual"}</span>
              </div>
              {p.plan === "vip" && <span className="rounded-md bg-vip-bg px-2 py-1 text-[11px] font-extrabold tracking-wide text-vip">VIP</span>}
            </div>
            <div className="flex justify-between text-sm text-text-2">
              <span>{starsText(rating.get(p.id) ?? null)}{verified(p.id).length ? ` · ${verified(p.id).join(" + ")} verified` : ""}</span>
              <span className="font-bold text-ink">{p.min_price != null ? `from ${formatNaira(p.min_price)}` : "Prices soon"}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const field = "flex flex-col gap-1 rounded-[10px] bg-bg px-3 py-2";
const label = "text-xs font-semibold text-muted";
const control = "border-0 bg-transparent py-0.5 text-base text-ink outline-none";

export default function Home() {
  return (
    <PublicShell bare>
      <section className="bg-primary text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-7 px-6 pb-16 pt-14 md:pt-[72px]">
          <div className="flex max-w-[760px] flex-col gap-3.5">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#cdebe1]">Cleaning · Car wash · Laundry</p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[52px]">Spotless homes, fresh clothes and clean cars — booked in minutes.</h1>
            <p className="text-lg leading-relaxed text-primary-tint">Request a managed car wash at our set price, or compare verified cleaners and laundry shops by price, rating and location.</p>
          </div>
          <form action="/marketplace" method="get" className="flex max-w-[980px] flex-wrap items-stretch gap-2.5 rounded-2xl bg-surface p-3">
            <label className={`${field} flex-[2_1_260px]`}>
              <span className={label}>What do you need?</span>
              <input type="search" name="q" placeholder="e.g. deep house cleaning, ironing…" className={control} />
            </label>
            <label className={`${field} flex-[1_1_180px]`}>
              <span className={label}>Service</span>
              <select name="service" className={control}>
                <option value="">All services</option><option value="carwash">Car wash</option><option value="cleaning">House cleaning</option>
                <option value="laundry">Laundry (dry clean, wash, ironing)</option>
              </select>
            </label>
            <label className={`${field} flex-[1_1_180px]`}>
              <span className={label}>Location</span>
              <input type="text" name="area" placeholder="Area or address" className={control} />
            </label>
            <button className="flex min-h-14 items-center justify-center gap-2 rounded-input bg-accent px-6 text-base font-bold text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              Search
            </button>
          </form>
          <ul className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-primary-tint">
            {TRUST.map((t) => (
              <li key={t.text} className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" stroke="#CDEBE1" {...ICON} strokeWidth={2}>{t.d}</svg>{t.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-6 pb-[72px] pt-14">
        <section aria-labelledby="svc-clean" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="svc-clean" className="text-[28px] font-extrabold tracking-tight">Cleaning &amp; washing</h2>
            <p className="text-base text-muted">Two ways to book: managed by us, or pick your own cleaner.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <article className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-7">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-14 items-center justify-center rounded-[14px] bg-carwash-bg">
                  <svg width="30" height="30" viewBox="0 0 24 24" stroke="#1F5FAE" {...ICON}><path d="M5 16V12l2-5h10l2 5v4" /><path d="M3 16h18v3H3z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /><path d="M5 12h14" /></svg>
                </span>
                <span className="rounded-full bg-carwash-bg px-2.5 py-1.5 text-xs font-bold text-carwash">Managed service</span>
              </div>
              <h3 className="text-[22px] font-bold">Car wash</h3>
              <p className="text-[15px] leading-relaxed text-muted">You request, we handle the rest. We set the price and hand-pick a trusted car wash partner near you.</p>
              <ul className="flex flex-col gap-2 text-sm text-text-2"><li>Fixed, upfront prices — no haggling</li><li>Exterior, interior or full detailing</li><li>At your location or drop-off</li></ul>
              <Link href="/car-wash" className="mt-auto inline-flex min-h-11 items-center self-start rounded-input bg-carwash px-5 text-[15px] font-semibold text-white">Request a car wash</Link>
            </article>
            <article className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-7">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-14 items-center justify-center rounded-[14px] bg-primary-tint">
                  <svg width="30" height="30" viewBox="0 0 24 24" stroke="#0B6B57" {...ICON}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
                </span>
                <span className="rounded-full bg-primary-tint px-2.5 py-1.5 text-xs font-bold text-primary">Marketplace</span>
              </div>
              <h3 className="text-[22px] font-bold">House cleaning</h3>
              <p className="text-[15px] leading-relaxed text-muted">Compare verified cleaning businesses and individual cleaners. Choose by price, rating and distance.</p>
              <ul className="flex flex-col gap-2 text-sm text-text-2"><li>Regular, deep and move-in/move-out cleaning</li><li>Businesses verified with CAC, individuals with NIN</li><li>Chat with your cleaner before you book</li></ul>
              <Link href="/marketplace?service=cleaning" className="mt-auto inline-flex min-h-11 items-center self-start rounded-input bg-primary px-5 text-[15px] font-semibold text-white">Browse cleaners</Link>
            </article>
          </div>
        </section>

        <section aria-labelledby="svc-laundry" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 id="svc-laundry" className="text-[28px] font-extrabold tracking-tight">Laundry</h2>
            <p className="text-base text-muted">Laundry shops and individuals set their own prices. Pick the one that suits you.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {LAUNDRY.map((l) => (
              <Link key={l.title} href="/marketplace?service=laundry" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-6 hover:border-primary">
                <span className={`flex size-12 items-center justify-center rounded-xl ${l.bg}`}><svg width="26" height="26" viewBox="0 0 24 24" stroke={l.stroke} {...ICON}>{l.d}</svg></span>
                <span className="text-xl font-bold">{l.title}</span>
                <span className="text-sm leading-relaxed text-muted">{l.text}</span>
                <span className="text-sm font-semibold text-primary">See laundry shops →</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="vip-feat" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h2 id="vip-feat" className="text-[28px] font-extrabold tracking-tight">Featured providers</h2>
              <p className="text-base text-muted">Top-rated VIP partners.</p>
            </div>
            <Link href="/marketplace" className="py-2.5 text-[15px] font-semibold text-primary">View all providers →</Link>
          </div>
          <Suspense fallback={<p className="text-muted">Loading…</p>}><FeaturedProviders /></Suspense>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-7 rounded-[22px] bg-ink p-10 text-white">
          <div className="flex flex-[1_1_480px] flex-col gap-2.5">
            <h2 className="text-[30px] font-extrabold">Earn with your cleaning skills</h2>
            <p className="text-base leading-relaxed text-[#c9d4d0]">Join as a shop (verify with CAC) or as an individual (verify with BVN and NIN). Upgrade to VIP for premium placement and promotion to high-value customers by web and email.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/providers/join" className="inline-flex min-h-11 items-center rounded-input bg-accent px-5 text-[15px] font-bold text-ink">Register as a provider</Link>
            <Link href="/providers/join" className="inline-flex min-h-11 items-center rounded-input border border-[#5b6b65] px-5 text-[15px] font-semibold text-white">See VIP benefits</Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
