"use client";

import { useState, useTransition } from "react";
import { markPayout, resolveDispute, runJobs } from "@/app/wallet/actions";

const base = "min-h-11 rounded-input px-4 text-sm font-bold disabled:opacity-60";

export function PayoutButtons({ payoutId }: { payoutId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (s: "paid" | "failed") => start(async () => setError((await markPayout(payoutId, s)).error));
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run("paid")} className={`${base} bg-primary text-white hover:bg-primary-hover`}>Mark paid</button>
        <button disabled={pending} onClick={() => run("failed")} className={`${base} border border-border bg-surface text-danger`}>Failed</button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function DisputeButtons({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (o: "release" | "refund") => {
    if (!confirm(o === "release" ? "Release the money to the provider?" : "Refund the customer?")) return;
    start(async () => setError((await resolveDispute(orderId, o)).error));
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run("release")} className={`${base} bg-primary text-white hover:bg-primary-hover`}>Pay provider</button>
        <button disabled={pending} onClick={() => run("refund")} className={`${base} border border-border bg-surface text-danger`}>Refund customer</button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function RunJobsButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="space-y-1">
      <button disabled={pending} onClick={() => start(async () => { const r = await runJobs(); setMsg(r.error ?? r.summary); })}
        className={`${base} border border-border bg-surface`}>
        {pending ? "Running…" : "Run scheduled jobs now"}
      </button>
      {msg && <p role="status" className="text-sm text-text-2">{msg}</p>}
    </div>
  );
}
