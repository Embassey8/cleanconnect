import { Suspense } from "react";
import { computeProfit, formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { FinanceForm } from "@/components/ops/Forms";
import { SettleButton } from "@/components/ops/Buttons";
import { formatWhen } from "@/lib/time";

const Row = ({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) => (
  <div className={`flex justify-between py-1 ${strong ? "border-t border-border pt-2 font-extrabold" : ""}`}><dt>{label}</dt><dd>{formatNaira(value)}</dd></div>
);

async function Income() {
  const supabase = await createClient();
  const { data: f, error } = await supabase.rpc("admin_finance", { p_month: new Date().toISOString().slice(0, 10) });
  if (error) return <p role="alert" className="text-danger">{error.message}</p>;
  const m = {
    marketplaceCommission: f.marketplace_commission, carwashRevenue: f.carwash_revenue, vip: f.vip,
    advertising: f.advertising, partnerPayouts: f.partner_payouts, expenses: f.expenses as Record<string, number>,
  };
  const p = computeProfit(m);
  const { data: entries } = await supabase.from("finance_entries").select("id, kind, category, amount, occurred_on, note").order("occurred_on", { ascending: false }).limit(15);
  return (
    <div className="max-w-2xl space-y-8">
      <dl className="rounded-card border border-border bg-surface p-4 text-sm">
        <Row label="Marketplace commission" value={m.marketplaceCommission} />
        <Row label="Car wash revenue" value={m.carwashRevenue} />
        <Row label="VIP subscriptions" value={m.vip} />
        <Row label="Advertising" value={m.advertising} />
        <Row label="Income" value={p.income} strong />
        <Row label="Partner payouts" value={m.partnerPayouts} />
        {Object.entries(m.expenses).map(([k, v]) => <Row key={k} label={`Expense: ${k}`} value={v} />)}
        <Row label="Costs" value={p.costs} strong />
        <Row label={`Net profit (${p.margin}% margin)`} value={p.profit} strong />
      </dl>
      <section>
        <h2 className="mb-2 font-extrabold">Add income or expense</h2>
        <FinanceForm />
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Partner payouts</h2>
        <p className="mb-2 text-sm text-text-2">Completed car wash payouts are released to partners every Friday. Until a scheduler is connected, pay them here.</p>
        <SettleButton />
      </section>
      {(entries ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 font-extrabold">Recent entries</h2>
          <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface text-sm">
            {(entries ?? []).map((e) => (
              <li key={e.id} className="flex justify-between px-4 py-2"><span className="capitalize">{e.kind}: {e.category}{e.note ? ` · ${e.note}` : ""} <span className="text-muted">{formatWhen(e.occurred_on)}</span></span><strong>{formatNaira(e.amount)}</strong></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function IncomePage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Income &amp; profit</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Income /></Suspense>
    </>
  );
}
