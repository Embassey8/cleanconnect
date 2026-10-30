import { Suspense } from "react";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { PACKAGE, VEHICLE } from "@/lib/partner-ui";

const pkgs = ["exterior", "full", "detailing"] as const;
const vehs = ["saloon", "suv", "van", "pickup"] as const;

async function Rates() {
  const supabase = await createClient();
  const [{ data: rates }, { data: settings }] = await Promise.all([
    supabase.from("carwash_rates").select("package, vehicle, partner_payout"),
    supabase.from("carwash_settings").select("mobile_bonus").maybeSingle(),
  ]);
  const rate = (pk: string, v: string) => (rates ?? []).find((r) => r.package === pk && r.vehicle === v)?.partner_payout;
  return (
    <section aria-labelledby="pr-h" className="flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3"><h2 id="pr-h" className="text-lg font-extrabold">Your fixed payout per job</h2><span className="rounded-md bg-bg-admin px-2 py-1 text-[11px] font-bold text-text-2">Set by CleanConnect</span></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead><tr className="text-left text-muted"><th className="px-2 py-2 font-semibold">Package</th>{vehs.map((v) => <th key={v} className="px-2 py-2 font-semibold">{VEHICLE[v]}</th>)}</tr></thead>
          <tbody>{pkgs.map((pk) => (
            <tr key={pk}><td className="border-t border-bg-admin px-2 py-3 font-semibold">{PACKAGE[pk]}</td>
              {vehs.map((v) => <td key={v} className="border-t border-bg-admin px-2 py-3">{rate(pk, v) == null ? "—" : formatNaira(rate(pk, v)!)}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-sm text-text-2">+ {formatNaira(settings?.mobile_bonus ?? 0)} mobile call-out bonus on every job where you go to the customer. Payouts are released every Friday.</p>
    </section>
  );
}

export default function RatesPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Payout rates</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Rates /></Suspense>
    </>
  );
}
