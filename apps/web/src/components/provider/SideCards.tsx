import Link from "next/link";
import { DEFAULT_COMMISSION_RATE, DEFAULT_MIN_ORDER, DEFAULT_CLEANING_MULTIPLIERS, formatNaira, type PropertyType } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { requireOwnProvider } from "@/lib/auth/provider";
import { daysUntil, formatWhen } from "@/lib/time";
import { InlinePrices } from "./InlinePrices";
import type { CleaningData } from "./CleaningEditor";

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5";

export async function WithdrawCard({ awaiting }: { awaiting: number }) {
  const user = (await getSessionUser())!;
  const supabase = await createClient();
  const { data: w } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
  const { data: b } = w ? await supabase.from("wallet_balances").select("available, held").eq("wallet_id", w.id).maybeSingle() : { data: null };
  return (
    <section aria-labelledby="earn-h" className="flex flex-col gap-3 rounded-2xl bg-ink p-5 text-white">
      <h2 id="earn-h" className="text-sm font-semibold text-[#c9d4d0]">Available to withdraw</h2>
      <span className="-mt-1.5 text-[30px] font-extrabold">{formatNaira(b?.available ?? 0)}</span>
      <span className="text-[13px] text-[#c9d4d0]">{formatNaira(b?.held ?? 0)} held until customers confirm {awaiting} job{awaiting === 1 ? "" : "s"}</span>
      <Link href="/provider/wallet#withdraw" className="flex min-h-[46px] items-center justify-center rounded-input bg-accent text-[15px] font-bold text-ink">Withdraw to bank</Link>
    </section>
  );
}

export async function PricesCard() {
  const p = await requireOwnProvider();
  if (p.service !== "cleaning") {
    return (
      <section className={`${card} border-[1.5px] border-primary`}>
        <h2 className="text-base font-extrabold">Your prices</h2>
        <p className="text-xs text-muted">Customers see these on your profile and calculator.</p>
        <Link href="/provider/prices" className="flex min-h-11 items-center justify-center rounded-input bg-primary text-sm font-bold text-white">Edit prices</Link>
      </section>
    );
  }
  const supabase = await createClient();
  const [{ data: rows }, { data: s }] = await Promise.all([
    supabase.from("cleaning_prices").select("property_type, area_id, price, offered").eq("provider_id", p.id),
    supabase.from("cleaning_settings").select("property_types, mult_deep, mult_move, mult_post, min_order").eq("provider_id", p.id).maybeSingle(),
  ]);
  const data: CleaningData = {
    prices: Object.fromEntries((rows ?? []).map((r) => [`${r.property_type}:${r.area_id}`, { price: r.price, offered: r.offered }])),
    propertyTypes: (s?.property_types ?? ["home"]) as PropertyType[],
    multipliers: s ? { deep: Number(s.mult_deep), move: Number(s.mult_move), post: Number(s.mult_post) } : { deep: DEFAULT_CLEANING_MULTIPLIERS.deep, move: DEFAULT_CLEANING_MULTIPLIERS.move, post: DEFAULT_CLEANING_MULTIPLIERS.post },
    minOrder: s?.min_order ?? DEFAULT_MIN_ORDER,
  };
  return (
    <section aria-labelledby="pkg-h" className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-primary bg-surface p-[18px]">
      <div className="flex flex-col gap-0.5"><h2 id="pkg-h" className="text-base font-extrabold">Your prices</h2><span className="text-xs text-muted">Customers see these on your profile and calculator.</span></div>
      <InlinePrices data={data} commissionPct={Math.round(DEFAULT_COMMISSION_RATE * 100)} />
    </section>
  );
}

export async function TeamCard() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { data } = await supabase.from("provider_members").select("id, first_name, nin_verified").eq("provider_id", p.id).order("created_at").limit(4);
  const { count } = await supabase.from("provider_members").select("*", { count: "exact", head: true }).eq("provider_id", p.id);
  return (
    <section aria-labelledby="team-h" className={card}>
      <div className="flex items-center justify-between"><h2 id="team-h" className="text-base font-extrabold">Team{count ? ` · ${count} ${p.service === "laundry" ? "staff" : "cleaner"}${count === 1 ? "" : "s"}` : ""}</h2><Link href="/provider/team" className="py-2 text-sm font-semibold text-primary">Manage</Link></div>
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">Add your team so customers see who is coming.</p> : (data ?? []).map((m) => (
        <div key={m.id} className="flex justify-between text-sm"><span>{m.first_name}</span><span className={m.nin_verified ? "font-semibold text-primary" : "text-muted"}>{m.nin_verified ? "NIN verified" : "Verification pending"}</span></div>
      ))}
    </section>
  );
}

export async function VipCard() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  if (p.plan !== "vip") {
    return (
      <section className={`${card} border-vip-border`}>
        <h2 className="text-base font-extrabold text-vip">Go VIP</h2>
        <p className="text-sm text-text-2">Top placement in search, homepage feature and a gold badge.</p>
        <Link href="/provider/vip" className="flex min-h-11 items-center justify-center rounded-input bg-vip-bg text-sm font-bold text-vip">See VIP benefits</Link>
      </section>
    );
  }
  const [{ data: sub }, { data: st }] = await Promise.all([
    supabase.from("vip_subscriptions").select("current_period_end").eq("provider_id", p.id).eq("status", "active").maybeSingle(),
    supabase.from("provider_stats").select("rating_avg, rating_count, jobs_completed").eq("provider_id", p.id).maybeSingle(),
  ]);
  const tile = "flex flex-col rounded-[10px] bg-vip-bg p-2.5";
  return (
    <section aria-labelledby="vipp-h" className={`${card} border-vip-border`}>
      <div className="flex items-center justify-between"><h2 id="vipp-h" className="text-base font-extrabold text-vip">VIP performance</h2><span className="text-xs text-muted">{sub ? `Renews ${formatWhen(sub.current_period_end).split(",")[0]}` : ""}</span></div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={tile}><span className="text-lg font-extrabold">{st?.jobs_completed ?? 0}</span><span className="text-xs text-[#6b4600]">Jobs completed</span></div>
        <div className={tile}><span className="text-lg font-extrabold">{st?.rating_avg == null ? "—" : Number(st.rating_avg).toFixed(1)}</span><span className="text-xs text-[#6b4600]">Average rating</span></div>
        <div className={tile}><span className="text-lg font-extrabold">{st?.rating_count ?? 0}</span><span className="text-xs text-[#6b4600]">Reviews</span></div>
        <div className={tile}><span className="text-lg font-extrabold">{sub ? Math.max(0, daysUntil(sub.current_period_end)) : "—"}</span><span className="text-xs text-[#6b4600]">Days to renewal</span></div>
      </div>
      <p className="text-xs text-muted">Profile views, search appearances and email reach aren&apos;t tracked yet.</p>
    </section>
  );
}
