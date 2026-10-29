import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { CarWashForm } from "@/components/booking/CarWashForm";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { lagosToday } from "@/lib/time";

const STEPS = ["You send a request", "We assign a hand-picked partner", "Track it and pay from your wallet"];

async function Loader() {
  const supabase = await createClient();
  const user = await getSessionUser();
  const [{ data: rates }, { data: s }, wallet] = await Promise.all([
    supabase.from("carwash_customer_prices").select("package, vehicle, customer_price"),
    supabase.from("carwash_settings").select("service_fee").maybeSingle(),
    user ? supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: bal } = wallet.data ? await supabase.from("wallet_balances").select("available").eq("wallet_id", wallet.data.id).maybeSingle() : { data: null };
  const map = Object.fromEntries((rates ?? []).map((r) => [`${r.package}:${r.vehicle}`, r.customer_price]));
  if (Object.keys(map).length === 0) return <p className="rounded-card bg-surface p-6 text-muted">Car wash prices are being set up. Please check back soon.</p>;
  return <CarWashForm rates={map} fee={s?.service_fee ?? 0} balance={user ? bal?.available ?? 0 : null} minDate={lagosToday()} signedIn={!!user} />;
}

export default function CarWashPage() {
  return (
    <PublicShell>
      <div className="flex flex-col gap-7 py-1">
        <div className="flex flex-col gap-2">
          <span className="self-start rounded-full bg-carwash-bg px-2.5 py-1.5 text-xs font-bold text-carwash">Managed by CleanConnect</span>
          <h1 className="text-[34px] font-extrabold tracking-tight">Request a car wash</h1>
          <p className="max-w-[720px] text-base text-muted">Choose a package at our fixed price. We hand-pick a vetted car wash partner close to you and keep you updated until it&apos;s done.</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-carwash text-sm font-bold text-white">{i + 1}</span>
              <span className="text-[15px] font-semibold">{s}</span>
            </li>
          ))}
        </ol>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Loader /></Suspense>
        <p className="text-sm text-text-2">Run a car wash? <a href="/apply?kind=partner" className="font-semibold text-primary">Apply to become a partner</a>.</p>
      </div>
    </PublicShell>
  );
}
