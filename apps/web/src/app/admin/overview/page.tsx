import { Suspense } from "react";
import { computeProfit, formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { RunJobsButton } from "@/components/admin/MoneyButtons";

interface Overview {
  customers: number; providers_business: number; providers_individual: number; partners: number; employees: number;
  pending_approvals: number; requests_to_assign: number; open_tickets: number; open_applications: number; orders_today: number;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-card border border-border bg-surface p-4"><p className="text-sm text-muted">{label}</p><p className="text-2xl font-extrabold">{value}</p></div>;
}

async function Stats() {
  const supabase = await createClient();
  const [{ data: o, error }, { data: f }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_finance", { p_month: new Date().toISOString().slice(0, 10) }),
  ]);
  if (error) return <p role="alert" className="text-danger">{error.message}</p>;
  const s = o as Overview;
  const p = f ? computeProfit({
    marketplaceCommission: f.marketplace_commission, carwashRevenue: f.carwash_revenue, vip: f.vip,
    advertising: f.advertising, partnerPayouts: f.partner_payouts, expenses: f.expenses,
  }) : null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customers" value={s.customers} />
        <Stat label="Shops" value={s.providers_business} />
        <Stat label="Individuals" value={s.providers_individual} />
        <Stat label="Car wash partners" value={s.partners} />
        <Stat label="Employees" value={s.employees} />
        <Stat label="Orders today" value={s.orders_today} />
        {p && <Stat label="Income this month" value={formatNaira(p.income)} />}
        {p && <Stat label={`Net profit (${p.margin}%)`} value={formatNaira(p.profit)} />}
      </div>
      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 font-extrabold">Needs attention</h2>
        <ul className="space-y-1 text-sm">
          <li>{s.pending_approvals} provider(s) awaiting approval</li>
          <li>{s.requests_to_assign} car wash request(s) to assign</li>
          <li>{s.open_tickets} open support ticket(s)</li>
          <li>{s.open_applications} open application(s)</li>
        </ul>
      </div>
      <RunJobsButton />
    </div>
  );
}

export default function Overview() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Overview</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Stats /></Suspense>
    </>
  );
}
