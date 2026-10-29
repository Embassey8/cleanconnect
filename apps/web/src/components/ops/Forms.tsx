"use client";

import { useActionState } from "react";
import { addFinanceEntry, createTicket, replyTicket, submitApplication, type OpsState } from "@/app/ops/actions";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60";

function Feedback({ s }: { s: OpsState }) {
  if (s.error) return <p role="alert" className="text-sm text-danger">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-primary">{s.ok}</p>;
  return null;
}

export function ApplyForm({ kind }: { kind: "partner" | "staff" }) {
  const [state, action, pending] = useActionState<OpsState, FormData>(submitApplication, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      {kind === "partner"
        ? <><label className="block text-sm font-semibold" htmlFor="ap-name">Business name</label>
            <input id="ap-name" name="name" className={input} required /></>
        : <><label className="block text-sm font-semibold" htmlFor="ap-pos">Position</label>
            <input id="ap-pos" name="position" className={input} required /></>}
      <label className="block text-sm font-semibold" htmlFor="ap-phone">Phone</label>
      <input id="ap-phone" name="phone" inputMode="tel" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="ap-area">Area / city</label>
      <input id="ap-area" name="area" className={input} />
      <label className="block text-sm font-semibold" htmlFor="ap-note">Anything else we should know?</label>
      <textarea id="ap-note" name="note" rows={3} className={`${input} py-2`} />
      {kind === "partner" && <p className="text-xs text-muted">We&apos;ll arrange a site inspection and CAC check before approving you.</p>}
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Sending…" : "Apply"}</button>
    </form>
  );
}

export function TicketForm({ orders }: { orders: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<OpsState, FormData>(createTicket, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="t-cat">Topic</label>
      <select id="t-cat" name="category" className={input}>
        <option value="order">An order</option><option value="payment">Payments &amp; wallet</option>
        <option value="account">My account</option><option value="general">Something else</option>
      </select>
      {orders.length > 0 && (
        <>
          <label className="block text-sm font-semibold" htmlFor="t-order">Related order (optional)</label>
          <select id="t-order" name="order" className={input}>
            <option value="">None</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </>
      )}
      <label className="block text-sm font-semibold" htmlFor="t-subject">Subject</label>
      <input id="t-subject" name="subject" className={input} required />
      <label className="block text-sm font-semibold" htmlFor="t-body">How can we help?</label>
      <textarea id="t-body" name="body" rows={4} className={`${input} py-2`} required />
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Sending…" : "Contact support"}</button>
    </form>
  );
}

export function ReplyForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const [state, action, pending] = useActionState<OpsState, FormData>(replyTicket.bind(null, ticketId), {});
  return (
    <form action={action} className="space-y-2">
      <label className="sr-only" htmlFor="reply-body">Reply</label>
      <textarea id="reply-body" name="body" rows={3} className={`${input} py-2`} required />
      {staff && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="internal" /> Internal note (hidden from the customer)
        </label>
      )}
      <Feedback s={state} />
      <button disabled={pending} className={btn}>{pending ? "Sending…" : "Send"}</button>
    </form>
  );
}

export function FinanceForm() {
  const [state, action, pending] = useActionState<OpsState, FormData>(addFinanceEntry, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <select name="kind" className={input} aria-label="Type" defaultValue="expense">
        <option value="expense">Expense</option><option value="income">Income</option>
      </select>
      <select name="category" className={input} aria-label="Category" defaultValue="salaries">
        <option value="salaries">Salaries</option><option value="marketing">Marketing</option>
        <option value="payments">Payment fees</option><option value="operations">Operations</option>
        <option value="advertising">Advertising income</option>
      </select>
      <input name="amount" inputMode="numeric" placeholder="Amount (₦)" aria-label="Amount" className={input} required />
      <input name="on" type="date" aria-label="Date" className={input} />
      <input name="note" placeholder="Note" aria-label="Note" className={`${input} sm:col-span-2`} />
      <div className="sm:col-span-2"><Feedback s={state} /></div>
      <button disabled={pending} className={btn}>{pending ? "Adding…" : "Add entry"}</button>
    </form>
  );
}
