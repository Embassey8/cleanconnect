"use client";

import { useActionState } from "react";
import { fundWallet, withdraw, type MoneyState } from "@/app/wallet/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60";

function Feedback({ s }: { s: MoneyState }) {
  if (s.error) return <p role="alert" className="text-sm text-danger">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-primary">{s.ok}</p>;
  return null;
}

export function FundForm() {
  const [state, action, pending] = useActionState<MoneyState, FormData>(fundWallet, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="fund-amount">Amount (₦)</label>
      <input id="fund-amount" name="amount" inputMode="numeric" placeholder="10,000" className={input} required />
      <p className="text-xs text-muted">Test mode: no real money moves. Card, bank transfer and USSD arrive with the payment provider.</p>
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Adding…" : "Add money"}</button>
    </form>
  );
}

export function WithdrawForm() {
  const [state, action, pending] = useActionState<MoneyState, FormData>(withdraw, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="wd-amount">Amount (₦)</label>
      <input id="wd-amount" name="amount" inputMode="numeric" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="wd-bank">Bank</label>
      <input id="wd-bank" name="bank" autoComplete="off" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="wd-name">Account name</label>
      <input id="wd-name" name="accountName" autoComplete="off" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="wd-number">Account number</label>
      <input id="wd-number" name="accountNumber" inputMode="numeric" maxLength={10} autoComplete="off" className={input} required />
      <p className="text-xs text-muted">We only keep the last 4 digits of your account number.</p>
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Requesting…" : "Withdraw"}</button>
    </form>
  );
}
