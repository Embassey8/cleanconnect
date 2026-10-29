import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatNaira } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";
import { Composer } from "@/components/messages/Composer";
import { QuoteActions } from "@/components/messages/QuoteActions";

async function Thread({ params }: { params: PageProps<"/messages/[threadId]">["params"] }) {
  const { threadId } = await params;
  const user = await getSessionUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("threads").select("id, customer_id, provider_id, providers(display_name, service)").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const { data: msgs } = await supabase
    .from("messages").select("id, sender_id, kind, body, quote_amount, quote_status, order_id, created_at").eq("thread_id", threadId).order("id");

  const isCustomer = t.customer_id === user.id;
  const prov = (Array.isArray(t.providers) ? t.providers[0] : t.providers) as { display_name: string; service: string } | null;
  return (
    <>
      <h1 className="text-2xl font-extrabold">{isCustomer ? prov?.display_name : "Customer"}</h1>
      <ul className="my-6 space-y-3">
        {(msgs ?? []).length === 0 && <li className="text-muted">Say hello to start the conversation.</li>}
        {(msgs ?? []).map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <li key={m.id} className={`max-w-[85%] rounded-card p-3 text-sm ${mine ? "ml-auto bg-primary-tint" : "bg-surface border border-border"}`}>
              {m.kind === "quote" ? (
                <div>
                  <p className="text-xs font-bold uppercase text-muted">Quote</p>
                  <p className="text-xl font-extrabold">{formatNaira(m.quote_amount ?? 0)}</p>
                  {m.body && <p className="text-text-2">{m.body}</p>}
                  <p className="mt-1 text-xs font-bold capitalize text-muted">{m.quote_status}</p>
                  {m.quote_status === "accepted" && m.order_id && isCustomer && (
                    <Link href={`/account/orders/${m.order_id}`} className="text-sm font-semibold text-primary">View order</Link>
                  )}
                  {m.quote_status === "accepted" && m.order_id && !isCustomer && (
                    <Link href={`/provider/orders/${m.order_id}`} className="text-sm font-semibold text-primary">View order</Link>
                  )}
                  {m.quote_status === "open" && isCustomer && <QuoteActions messageId={m.id} threadId={threadId} />}
                </div>
              ) : <p>{m.body}</p>}
              <p className="mt-1 text-[11px] text-muted">{formatWhen(m.created_at)}</p>
            </li>
          );
        })}
      </ul>
      <Composer threadId={threadId} canQuote={!isCustomer && prov?.service === "cleaning"} />
      <p className="mt-4 text-xs text-muted">Refresh to see new messages. Live updates are coming.</p>
    </>
  );
}

export default function ThreadPage(props: PageProps<"/messages/[threadId]">) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl">
        <Link href="/messages" className="mb-3 inline-block text-sm font-semibold text-primary">← All messages</Link>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Thread params={props.params} /></Suspense>
      </div>
    </PublicShell>
  );
}
