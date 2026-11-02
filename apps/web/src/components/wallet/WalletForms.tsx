"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { fundWallet, withdraw, type MoneyState } from "@/app/wallet/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60";

function Feedback({ s }: { s: MoneyState }) {
  if (s.error) return <p role="alert" className="text-sm text-danger">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-primary">{s.ok}</p>;
  return null;
}

export interface BankOption { name: string; code: string }

function PaymentNoticeInner() {
  const result = useSearchParams().get("payment");
  if (result === "success") return <p role="status" className="rounded-card bg-primary-tint p-3 text-sm font-semibold text-primary">Payment received. Your wallet has been topped up.</p>;
  if (result === "pending") return <p role="status" className="rounded-card bg-warning-bg p-3 text-sm font-semibold text-warning">We&apos;re still waiting for your bank to confirm the payment. Your balance updates as soon as it does.</p>;
  if (result === "failed") return <p role="alert" className="rounded-card bg-danger-bg p-3 text-sm font-semibold text-danger">The payment didn&apos;t go through. You haven&apos;t been charged.</p>;
  return null;
}

export function PaymentNotice() {
  return <Suspense><PaymentNoticeInner /></Suspense>;
}

export function FundForm({ live = false }: { live?: boolean }) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(fundWallet, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="fund-amount">Amount (₦)</label>
      <input id="fund-amount" name="amount" inputMode="numeric" placeholder="10,000" className={input} required />
      <p className="text-xs text-muted">
        {live ? "You'll pay securely with Paystack by card, bank transfer or USSD." : "Test mode: no real money moves."}
      </p>
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? (live ? "Opening Paystack…" : "Adding…") : live ? "Pay with Paystack" : "Add money"}</button>
    </form>
  );
}

export function WithdrawForm({ banks = [] }: { banks?: BankOption[] }) {
  const live = banks.length > 0;
  const [state, action, pending] = useActionState<MoneyState, FormData>(withdraw, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="wd-amount">Amount (₦)</label>
      <input id="wd-amount" name="amount" inputMode="numeric" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="wd-bank">Bank</label>
      {live ? (
        <select id="wd-bank" name="bank" className={input} required defaultValue="">
          <option value="" disabled>Choose your bank</option>
          {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
      ) : (
        <input id="wd-bank" name="bank" autoComplete="off" className={input} required />
      )}
      {!live && (
        <>
          <label className="block text-sm font-semibold" htmlFor="wd-name">Account name</label>
          <input id="wd-name" name="accountName" autoComplete="off" className={input} required />
        </>
      )}
      <label className="block text-sm font-semibold" htmlFor="wd-number">Account number</label>
      <input id="wd-number" name="accountNumber" inputMode="numeric" maxLength={10} autoComplete="off" className={input} required />
      <p className="text-xs text-muted">We only keep the last 4 digits of your account number.{live ? " We confirm the account name with your bank." : ""}</p>
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Requesting…" : "Withdraw"}</button>
    </form>
  );
}
