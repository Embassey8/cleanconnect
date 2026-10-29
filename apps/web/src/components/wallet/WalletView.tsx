import { LEDGER_KIND_LABEL, formatNaira, type LedgerKind } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";
import { FundForm, WithdrawForm } from "./WalletForms";

const PAYOUT_STYLE: Record<string, string> = {
  pending: "bg-warning-bg text-warning", paid: "bg-primary-tint text-primary", failed: "bg-danger-bg text-danger",
};

export async function WalletView() {
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user!.id).maybeSingle();
  if (!wallet) return <p className="text-muted">No wallet found.</p>;
  const [{ data: bal }, { data: entries }, { data: payouts }] = await Promise.all([
    supabase.from("wallet_balances").select("available, held").eq("wallet_id", wallet.id).maybeSingle(),
    supabase.from("ledger_entries").select("id, amount, kind, created_at").eq("wallet_id", wallet.id).eq("bucket", "available")
      .order("id", { ascending: false }).limit(40),
    supabase.from("payouts").select("id, amount, bank_name, account_last4, status, eta_hours, created_at")
      .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const available = bal?.available ?? 0;
  const held = bal?.held ?? 0;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-sm text-muted">Available</p>
          <p className="text-2xl font-extrabold">{formatNaira(available)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-sm text-muted">On hold for orders</p>
          <p className="text-2xl font-extrabold">{formatNaira(held)}</p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 font-extrabold">Add money</h2>
          <FundForm />
        </section>
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="mb-3 font-extrabold">Withdraw to bank</h2>
          <WithdrawForm />
        </section>
      </div>

      {(payouts ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 font-extrabold">Withdrawals</h2>
          <ul className="space-y-2">
            {(payouts ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-3 text-sm">
                <span>{formatNaira(p.amount)} to {p.bank_name} ····{p.account_last4}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">{formatWhen(p.created_at)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${PAYOUT_STYLE[p.status]}`}>
                    {p.status}{p.status === "pending" ? ` · within ${p.eta_hours}h` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-extrabold">History</h2>
        {(entries ?? []).length === 0
          ? <p className="rounded-card bg-surface p-6 text-muted">No transactions yet.</p>
          : (
            <ul className="divide-y divide-bg-admin rounded-card border border-border bg-surface">
              {(entries ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>{LEDGER_KIND_LABEL[e.kind as LedgerKind] ?? e.kind}<span className="ml-2 text-muted">{formatWhen(e.created_at)}</span></span>
                  <span className={`font-bold ${e.amount < 0 ? "text-text-2" : "text-primary"}`}>
                    {e.amount < 0 ? "−" : "+"}{formatNaira(Math.abs(e.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
