import { Suspense } from "react";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { formatWhen } from "@/lib/time";
import { VipButtons } from "@/components/wallet/VipButtons";

const PERKS = [
  "Top placement in search results",
  "Featured on the homepage",
  "Promoted to high-value customers, including by email",
  "Gold VIP badge on your profile",
  "Priority support and faster payouts",
  "Performance stats: profile views, search appearances, bookings from VIP",
];

async function Vip() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const [{ data: settings }, { data: sub }] = await Promise.all([
    supabase.from("money_settings").select("vip_price, vip_period_days").single(),
    supabase.from("vip_subscriptions").select("current_period_end, auto_renew").eq("provider_id", p.id).eq("status", "active").maybeSingle(),
  ]);
  const active = p.plan === "vip" && !!sub;
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">VIP</h1>
        <p className="mt-1 text-text-2">{formatNaira(settings?.vip_price ?? 0)} every {settings?.vip_period_days ?? 30} days, paid from your wallet.</p>
      </div>
      <ul className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
        {PERKS.map((x) => <li key={x}>✓ {x}</li>)}
      </ul>
      {active && sub && (
        <p role="status" className="rounded-card bg-vip-bg px-4 py-3 text-sm font-semibold text-vip">
          You&apos;re a VIP provider until {formatWhen(sub.current_period_end)}.{" "}
          {sub.auto_renew ? "It renews automatically." : "It won't renew."}
        </p>
      )}
      {p.status !== "approved" && <p className="text-sm text-muted">VIP is available once your account is approved.</p>}
      {p.status === "approved" && <VipButtons providerId={p.id} active={active} renewing={!!sub?.auto_renew} />}
    </div>
  );
}

export default function ProviderVip() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Vip /></Suspense>;
}
