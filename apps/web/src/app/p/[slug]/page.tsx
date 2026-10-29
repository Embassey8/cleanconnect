import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  CLEANING_AREAS, DEFAULT_LAUNDRY_ITEMS, LAUNDRY_SERVICES, PROPERTY_TYPES, formatNaira,
} from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";

const BADGE: Record<string, string> = { cac: "CAC verified", nin: "NIN verified", bvn: "BVN verified" };

async function Profile({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const { slug } = await params;
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

  return (
    <>
      <header className="rounded-panel border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold">{p.display_name}</h1>
          {p.plan === "vip" && (
            <span className="rounded-full border border-vip-border bg-vip-bg px-3 py-1 text-xs font-bold text-vip">VIP</span>
          )}
        </div>
        <p className="mt-1 text-muted">
          {p.type === "business" ? "Business" : "Individual"} · {p.service === "laundry" ? "Laundry" : "House & commercial cleaning"}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {verified.map((b) => (
            <li key={b.kind} className="rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">✓ {BADGE[b.kind]}</li>
          ))}
        </ul>
        {p.areas.length > 0 && <p className="mt-3 text-sm text-text-2">Covers: {p.areas.join(", ")}</p>}
      </header>
      <section className="mt-6">
        <h2 className="mb-3 text-xl font-extrabold">Prices</h2>
        {p.service === "laundry" ? <LaundryPrices providerId={p.id} /> : <CleaningPrices providerId={p.id} />}
      </section>
    </>
  );
}

async function LaundryPrices({ providerId }: { providerId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("laundry_prices").select("item_id, service, price").eq("provider_id", providerId);
  const price = (i: string, s: string) => data?.find((r) => r.item_id === i && r.service === s)?.price ?? null;
  const items = DEFAULT_LAUNDRY_ITEMS.filter((i) => LAUNDRY_SERVICES.some((s) => price(i.id, s.id) != null));
  if (items.length === 0) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-muted">
          <th className="p-3">Item</th>{LAUNDRY_SERVICES.map((s) => <th key={s.id} className="p-3 text-right">{s.label}</th>)}
        </tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-bg-admin last:border-0">
              <th scope="row" className="p-3 text-left font-semibold">{i.name}</th>
              {LAUNDRY_SERVICES.map((s) => {
                const v = price(i.id, s.id);
                return <td key={s.id} className="p-3 text-right">{v == null ? "—" : formatNaira(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function CleaningPrices({ providerId }: { providerId: string }) {
  const supabase = await createClient();
  const [{ data }, { data: s }] = await Promise.all([
    supabase.from("cleaning_prices").select("property_type, area_id, price, offered").eq("provider_id", providerId).eq("offered", true),
    supabase.from("cleaning_settings").select("property_types, min_order").eq("provider_id", providerId).maybeSingle(),
  ]);
  const types = PROPERTY_TYPES.filter((t) => s?.property_types?.includes(t.id));
  if (!data?.length || types.length === 0) return <p className="text-muted">This provider hasn&apos;t published prices yet.</p>;
  return (
    <div className="space-y-4">
      {types.map((t) => {
        const rows = CLEANING_AREAS[t.id].filter((a) => data.some((r) => r.property_type === t.id && r.area_id === a.id));
        if (rows.length === 0) return null;
        return (
          <div key={t.id} className="rounded-card border border-border bg-surface p-4">
            <h3 className="font-extrabold">{t.label}</h3>
            <ul className="mt-2 divide-y divide-bg-admin text-sm">
              {rows.map((a) => {
                const r = data.find((x) => x.property_type === t.id && x.area_id === a.id)!;
                return <li key={a.id} className="flex justify-between py-2"><span>{a.name} <span className="text-muted">{a.unit}</span></span><span className="font-semibold">{formatNaira(r.price ?? 0)}</span></li>;
              })}
            </ul>
          </div>
        );
      })}
      {s?.min_order != null && <p className="text-sm text-muted">Minimum order {formatNaira(s.min_order)}.</p>}
    </div>
  );
}

export default function ProviderProfilePage(props: PageProps<"/p/[slug]">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Profile params={props.params} /></Suspense>
    </PublicShell>
  );
}
