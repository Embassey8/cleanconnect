import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DEFAULT_LAUNDRY_SETTINGS, type LaundryPriceList } from "@cleanconnect/shared";
import { LaundryBooking } from "@/components/booking/LaundryBooking";
import { CleaningBooking, type CleaningBookingData } from "@/components/booking/CleaningBooking";
import { startThread } from "@/app/p/actions";
import { PublicShell } from "@/components/shell/PublicShell";
import { formatNaira, starsText } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import Link from "next/link";
import { Gallery, Policies, Reviews, Team, loadStats } from "@/components/reviews/ProfileTrust";
import { SaveProviderButton } from "@/components/media/PhotoButtons";

const BADGE: Record<string, string> = { cac: "CAC verified", nin: "NIN verified", bvn: "BVN verified" };

async function Profile({ params, searchParams }: { params: PageProps<"/p/[slug]">["params"]; searchParams: PageProps<"/p/[slug]">["searchParams"] }) {
  const { slug } = await params;
  const withPhotos = (await searchParams).photos === "1";
  const supabase = await createClient();
  // RLS only returns approved, marketplace-listed providers.
  const { data: p } = await supabase
    .from("providers")
    .select("id, slug, display_name, type, service, plan, areas")
    .eq("slug", slug)
    .maybeSingle();
  if (!p) notFound();

  const { data: badges } = await supabase.from("provider_badges").select("kind, verified").eq("provider_id", p.id);
  const verified = (badges ?? []).filter((b) => b.verified && BADGE[b.kind]);
  const user = await getSessionUser();
  const { data: savedRow } = user
    ? await supabase.from("saved_providers").select("provider_id").eq("user_id", user.id).eq("provider_id", p.id).maybeSingle()
    : { data: null };

  const stats = await loadStats(p.id);
  return <ProfileView p={p} verified={verified.map((b) => BADGE[b.kind])} stats={stats} saved={!!savedRow} withPhotos={withPhotos} />;
}

type ProviderRow = { service: string; id: string; slug: string; display_name: string; type: string; plan: string; areas: string[] };

function ProfileView({ p, verified, stats, saved, withPhotos }: {
  p: ProviderRow; verified: string[]; stats: Awaited<ReturnType<typeof loadStats>>; saved: boolean; withPhotos: boolean;
}) {
  const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold";
  const laundry = p.service === "laundry";
  const avg = stats?.rating_avg == null ? null : Number(stats.rating_avg);
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/marketplace" className="text-primary">Marketplace</Link> › <Link href={`/marketplace?service=${p.service}`} className="text-primary">{laundry ? "Laundry" : "House & commercial cleaning"}</Link> › {p.display_name}
      </nav>
      <section aria-label="Provider summary" className="flex flex-wrap items-center gap-5 rounded-panel border border-border bg-surface p-5 sm:p-6">
        <span className={`grid size-20 shrink-0 place-items-center rounded-3xl text-2xl font-extrabold ${laundry ? "bg-laundry-bg text-laundry" : "bg-primary-tint text-primary"} sm:size-24 sm:text-3xl`}>
          {p.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold sm:text-3xl">{p.display_name}</h1>
            {p.plan === "vip" && <span className="rounded-md bg-vip-bg px-2 py-1 text-[11px] font-extrabold text-vip">VIP</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {verified.map((v) => <span key={v} className={`${chip} bg-primary-tint text-primary`}>✓ {v}</span>)}
            <span className={`${chip} bg-bg text-text-2`}>{p.type === "business" ? "Business" : "Individual"}</span>
            {(stats?.jobs_completed ?? 0) > 0 && <span className={`${chip} bg-bg text-text-2`}>{stats!.jobs_completed} job{stats!.jobs_completed === 1 ? "" : "s"}</span>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-2">
            <span><strong className="text-ink">{starsText(avg)}</strong>{(stats?.rating_count ?? 0) > 0 && ` (${stats!.rating_count} review${stats!.rating_count === 1 ? "" : "s"})`}</span>
            {p.areas.length > 0 && <span>{p.areas.join(" · ")}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveProviderButton providerId={p.id} slug={p.slug} saved={saved} />
          <form action={startThread.bind(null, p.id, p.slug)}>
            <button className="min-h-12 rounded-xl border border-border bg-surface px-5 text-[15px] font-semibold hover:bg-primary-tint">Message</button>
          </form>
        </div>
      </section>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_34rem] flex-col gap-5">
          {laundry && <Suspense fallback={null}><LaundryAbout providerId={p.id} /></Suspense>}
          <Suspense fallback={null}><Gallery providerId={p.id} slug={p.slug} /></Suspense>
          {!laundry && <Suspense fallback={null}><Team providerId={p.id} /></Suspense>}
          <Suspense fallback={null}><Reviews providerId={p.id} slug={p.slug} withPhotos={withPhotos} /></Suspense>
          <Policies laundry={laundry} />
        </div>
        <div className="w-full min-w-0 flex-[1_1_24rem] lg:max-w-[28.75rem]">
          <Suspense fallback={<p className="text-muted">Loading prices…</p>}>
            {laundry ? <LaundryPrices providerId={p.id} slug={p.slug} name={p.display_name} /> : <CleaningPrices providerId={p.id} slug={p.slug} name={p.display_name} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function LaundryAbout({ providerId }: { providerId: string }) {
  const supabase = await createClient();
  const { data: st } = await supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over, opening_hours").eq("provider_id", providerId).maybeSingle();
  const s = st ? { expressPct: st.express_pct, deliveryFee: st.delivery_fee, freeDeliveryOver: st.free_delivery_over } : DEFAULT_LAUNDRY_SETTINGS;
  const facts: [string, string][] = [
    ["Express", `Same day · +${s.expressPct}%`],
    ["Pickup & delivery", `${formatNaira(s.deliveryFee)}${s.freeDeliveryOver ? ` · free over ${formatNaira(s.freeDeliveryOver)}` : ""}`],
  ];
  if (st?.opening_hours) facts.push(["Shop hours", st.opening_hours]);
  return (
    <section aria-labelledby="about-h" className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="about-h" className="mb-3 text-xl font-extrabold">About this shop</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-bg p-3.5"><dt className="text-xs text-muted">{k}</dt><dd className="text-sm font-bold">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

async function LaundryPrices({ providerId, slug, name }: { providerId: string; slug: string; name: string }) {
  const supabase = await createClient();
  const [{ data }, { data: st }] = await Promise.all([
    supabase.from("laundry_prices").select("item_id, service, price").eq("provider_id", providerId),
    supabase.from("laundry_settings").select("express_pct, delivery_fee, free_delivery_over").eq("provider_id", providerId).maybeSingle(),
  ]);
  const prices: LaundryPriceList = {};
  for (const r of data ?? []) (prices[r.item_id] ??= {})[r.service as "dry" | "wash" | "iron"] = r.price;
  const settings = st
    ? { expressPct: st.express_pct, deliveryFee: st.delivery_fee, freeDeliveryOver: st.free_delivery_over }
    : DEFAULT_LAUNDRY_SETTINGS;
  return <LaundryBooking providerId={providerId} slug={slug} providerName={name} prices={prices} settings={settings} />;
}

async function CleaningPrices({ providerId, slug, name }: { providerId: string; slug: string; name?: string }) {
  const supabase = await createClient();
  const [{ data }, { data: st }] = await Promise.all([
    supabase.from("cleaning_prices").select("property_type, area_id, price").eq("provider_id", providerId).eq("offered", true),
    supabase.from("cleaning_settings").select("property_types, mult_regular, mult_deep, mult_move, mult_post, min_order").eq("provider_id", providerId).maybeSingle(),
  ]);
  if (!st || !data?.length) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  const prices: CleaningBookingData["prices"] = {};
  for (const r of data) if (r.price != null) (prices[r.property_type] ??= {})[r.area_id] = r.price;
  return (
    <CleaningBooking providerId={providerId} slug={slug} providerName={name ?? "this provider"} data={{
      prices, propertyTypes: st.property_types, minOrder: st.min_order,
      multipliers: { regular: Number(st.mult_regular), deep: Number(st.mult_deep), move: Number(st.mult_move), post: Number(st.mult_post) },
    }} />
  );
}

export default function ProviderProfilePage(props: PageProps<"/p/[slug]">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Profile params={props.params} searchParams={props.searchParams} /></Suspense>
    </PublicShell>
  );
}
