"use client";

import { useState, useTransition } from "react";
import { advanceApplication, assignCarwash, respondOffer, settlePartners, updateTicket } from "@/app/ops/actions";

const base = "min-h-11 rounded-input px-4 text-sm font-bold disabled:opacity-60";
const primary = `${base} bg-primary text-white hover:bg-primary-hover`;
const ghost = `${base} border border-border bg-surface text-danger`;

export function AssignControl({ orderId, partners }: { orderId: string; partners: { id: string; label: string }[] }) {
  const [partner, setPartner] = useState(partners[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (partners.length === 0) return <p className="text-sm text-muted">No approved partners yet.</p>;
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} aria-label="Partner"
          className="min-h-11 rounded-input border border-border bg-surface px-3 text-sm">
          {partners.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button disabled={pending} onClick={() => start(async () => setError((await assignCarwash(orderId, partner)).error))} className={primary}>
          Offer job
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function OfferButtons({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => start(async () => setError((await respondOffer(orderId, true)).error))} className={primary}>Accept job</button>
        <button disabled={pending} onClick={() => start(async () => setError((await respondOffer(orderId, false)).error))} className={ghost}>Decline</button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function ApplicationButtons({ id, next, nextLabel }: { id: string; next: string | null; nextLabel: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const run = (stage: string, r?: string) => start(async () => setError((await advanceApplication(id, stage, r)).error));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {next && <button disabled={pending} onClick={() => run(next)} className={primary}>{nextLabel}</button>}
        <button disabled={pending} onClick={() => setRejecting((v) => !v)} className={ghost}>Reject</button>
      </div>
      {rejecting && (
        <div className="flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason"
            className="min-h-11 flex-1 rounded-input border border-border px-3 text-sm" />
          <button disabled={pending || !reason.trim()} onClick={() => run("rejected", reason)} className={ghost}>Confirm</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TicketControls({ id, status, priority, me }: { id: string; status: string; priority: string; me: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const sel = "min-h-11 rounded-input border border-border bg-surface px-3 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select disabled={pending} value={status} aria-label="Status" className={sel}
        onChange={(e) => start(async () => setError((await updateTicket(id, e.target.value, null, null)).error))}>
        <option value="open">Open</option><option value="pending">Waiting on customer</option><option value="resolved">Resolved</option>
      </select>
      <select disabled={pending} value={priority} aria-label="Priority" className={sel}
        onChange={(e) => start(async () => setError((await updateTicket(id, null, e.target.value, null)).error))}>
        <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
      </select>
      <button disabled={pending} onClick={() => start(async () => setError((await updateTicket(id, null, null, me)).error))} className={`${base} border border-border bg-surface`}>
        Assign to me
      </button>
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}

export function SettleButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="space-y-1">
      <button disabled={pending} onClick={() => start(async () => { const r = await settlePartners(); setMsg(r.error ?? `Settled ${r.count} job payout(s).`); })}
        className={`${base} border border-border bg-surface`}>
        {pending ? "Paying…" : "Pay partners now"}
      </button>
      {msg && <p role="status" className="text-sm text-text-2">{msg}</p>}
    </div>
  );
}
