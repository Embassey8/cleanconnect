import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PROGRESS, STATUS_LABEL, availableActions, canProviderAccept, formatNaira, progressFraction,
  type EscrowStatus, type OrderService, type OrderStatus,
} from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { ActionButtons } from "./ActionButtons";
import { PayCard } from "./PayCard";

export async function OrderView({ id, viewer }: { id: string; viewer: "customer" | "provider" }) {
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("id, service, status, total, subtotal, surcharge, extras_total, discount, delivery_fee, scheduled_at, is_express, notes, created_at, accept_by, escrow_status, commission_amount, providers(display_name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: events }, { data: addr }] = await Promise.all([
    supabase.from("order_lines").select("id, label, qty, unit_price, kind").eq("order_id", id).order("id"),
    supabase.from("order_events").select("id, status, created_at").eq("order_id", id).order("id"),
    supabase.from("order_addresses").select("address, area").eq("order_id", id).maybeSingle(),
  ]);

  const service = o.service as OrderService;
  const status = o.status as OrderStatus;
  const steps = PROGRESS[service];
  const provider = (Array.isArray(o.providers) ? o.providers[0] : o.providers) as { display_name: string; slug: string } | null;
  const escrow = o.escrow_status as EscrowStatus;
  const unpaid = escrow === "unpaid";
  // Providers can only accept once the customer's money is in escrow.
  const actions = availableActions(service, status, viewer).filter(
    (a) => !(viewer === "provider" && a === "accepted" && !canProviderAccept(service, escrow)),
  );
  const canPay = viewer === "customer" && unpaid && ["requested", "assigning", "accepted"].includes(status);
  let available = 0;
  if (canPay) {
    const { data: bal } = await supabase.from("wallet_balances").select("available");
    available = (bal ?? []).reduce((sum, r) => sum + (r.available as number), 0);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted capitalize">{service} order · {provider?.display_name ?? "CleanConnect car wash"}</p>
        <h1 className="text-2xl font-extrabold">{STATUS_LABEL[status]}</h1>
      </div>

      {steps.includes(status) && (
        <div aria-label={`Progress: ${STATUS_LABEL[status]}`}>
          <div className="h-2 overflow-hidden rounded-full bg-bg-admin">
            <div className="h-full bg-primary" style={{ width: `${Math.round(progressFraction(service, status) * 100)}%` }} />
          </div>
          <ol className="mt-2 flex justify-between text-[11px] text-muted">
            {steps.map((s) => <li key={s} className={s === status ? "font-bold text-primary" : ""}>{STATUS_LABEL[s].split(" ")[0]}</li>)}
          </ol>
        </div>
      )}

      {canPay && <PayCard orderId={o.id} total={o.total} available={available} />}
      <ActionButtons orderId={o.id} actions={actions} />
      {viewer === "customer" && status === "requested" && service !== "carwash" && !unpaid && (
        <p className="text-sm text-muted">Paid. The provider has a few minutes to respond; you&apos;re refunded in full if they can&apos;t take it.</p>
      )}
      {viewer === "provider" && status === "requested" && unpaid && (
        <p className="text-sm text-muted">Waiting for the customer to pay. You can accept once their money is held.</p>
      )}
      {escrow === "held" && <p className="text-sm text-muted">{formatNaira(o.total)} is held in escrow until the job is confirmed.</p>}
      {escrow === "released" && viewer === "provider" && (
        <p className="text-sm font-semibold text-primary">
          Paid out: you earned {formatNaira(o.total - (o.commission_amount ?? 0))} after {formatNaira(o.commission_amount ?? 0)} commission.
        </p>
      )}
      {escrow === "refunded" && <p className="text-sm text-muted">{formatNaira(o.total)} was refunded to the customer&apos;s wallet.</p>}

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 font-extrabold">Details</h2>
        <ul className="divide-y divide-bg-admin text-sm">
          {(lines ?? []).map((l) => (
            <li key={l.id} className="flex justify-between py-2">
              <span>{l.qty} × {l.label}</span><span>{formatNaira(l.qty * l.unit_price)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {o.surcharge > 0 && <div className="flex justify-between"><dt>{o.is_express ? "Express" : "Cleaning type"}</dt><dd>+{formatNaira(o.surcharge)}</dd></div>}
          {o.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatNaira(o.discount)}</dd></div>}
          {o.delivery_fee > 0 && <div className="flex justify-between"><dt>{service === "carwash" ? "Service fee" : "Pickup & delivery"}</dt><dd>{formatNaira(o.delivery_fee)}</dd></div>}
          <div className="flex justify-between text-base font-extrabold"><dt>Total</dt><dd>{formatNaira(o.total)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-text-2">When: {formatWhen(o.scheduled_at)}</p>
        {addr
          ? <p className="text-sm text-text-2">Where: {addr.address}{addr.area ? `, ${addr.area}` : ""}</p>
          : viewer === "provider" && <p className="text-sm text-muted">The customer&apos;s address is shown after you accept.</p>}
      </section>

      {viewer === "customer" && provider && (
        <Link href={`/p/${provider.slug}`} className="inline-block text-sm font-semibold text-primary">View {provider.display_name}</Link>
      )}

      <section>
        <h2 className="mb-2 font-extrabold">History</h2>
        <ol className="space-y-1 text-sm text-text-2">
          {(events ?? []).map((e) => (
            <li key={e.id}>{STATUS_LABEL[e.status as OrderStatus]} · <span className="text-muted">{formatWhen(e.created_at)}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
