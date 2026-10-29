import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatNaira, starsText } from "@cleanconnect/shared";
import { PublicShell } from "@/components/shell/PublicShell";
import { MessagesShell } from "@/components/messages/MessagesShell";
import { Composer } from "@/components/messages/Composer";
import { QuoteActions } from "@/components/messages/QuoteActions";
import { ThreadEffects } from "@/components/messages/ThreadEffects";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { clockTime, dayKey, dayLabel } from "@/lib/time";

const CHECK: Record<string, string> = { cac: "CAC", nin: "NIN", bvn: "BVN" };
const QUOTE_STATUS: Record<string, string> = { accepted: "Accepted", declined: "Declined", open: "Waiting for your answer" };

async function Thread({ threadId }: { threadId: string }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/messages/${threadId}`)}`);
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("threads").select("id, customer_id, provider_id, providers(display_name, service, plan, slug)").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const isCustomer = t.customer_id === user.id;
  const prov = (Array.isArray(t.providers) ? t.providers[0] : t.providers) as { display_name: string; service: string; plan: string; slug: string } | null;

  const [{ data: msgs }, { data: stats }, { data: badges }, { data: listing }] = await Promise.all([
    supabase.from("messages").select("id, sender_id, kind, body, quote_amount, quote_status, order_id, created_at").eq("thread_id", threadId).order("id"),
    supabase.from("provider_stats").select("rating_avg, rating_count, jobs_completed").eq("provider_id", t.provider_id).maybeSingle(),
    supabase.from("provider_badges").select("kind, verified").eq("provider_id", t.provider_id),
    supabase.from("provider_listing").select("min_price").eq("id", t.provider_id).maybeSingle(),
  ]);
  const rows = msgs ?? [];
  const checks = [...new Set((badges ?? []).filter((b) => b.verified && CHECK[b.kind]).map((b) => CHECK[b.kind]))];
  const rating = stats?.rating_avg == null ? null : Number(stats.rating_avg);
  const name = isCustomer ? prov?.display_name ?? "Provider" : "Customer";
  const sub = [prov?.service === "laundry" ? "Laundry" : "House cleaning", checks.length ? `${checks.join(" + ")} verified` : null, rating !== null ? starsText(rating) : null].filter(Boolean).join(" · ");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-tint font-extrabold text-primary">{name.slice(0, 1).toUpperCase()}</span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="text-base font-bold">{name}</span>
              {isCustomer && prov?.plan === "vip" && <span className="rounded-md bg-vip-bg px-1.5 py-0.5 text-[11px] font-extrabold text-vip">VIP</span>}
            </span>
            {isCustomer && <span className="text-[13px] text-muted">{sub}</span>}
          </div>
        </div>
        {isCustomer && prov && (
          <div className="flex gap-2">
            <Link href={`/p/${prov.slug}`} className="flex min-h-11 items-center rounded-input border border-border px-3.5 text-sm font-semibold">View profile</Link>
            <Link href={`/p/${prov.slug}`} className="flex min-h-11 items-center rounded-input bg-primary px-4 text-sm font-semibold text-white">
              Book{listing?.min_price != null ? ` · from ${formatNaira(listing.min_price)}` : ""}
            </Link>
          </div>
        )}
      </div>

      <div className="flex max-h-[560px] min-h-[320px] flex-1 flex-col gap-3.5 overflow-y-auto bg-[#fafbfa] p-4 md:p-6">
        {rows.length === 0 && <p className="m-auto text-sm text-muted">Say hello to start the conversation.</p>}
        {rows.map((m, i) => {
          const mine = m.sender_id === user.id;
          const newDay = i === 0 || dayKey(rows[i - 1].created_at) !== dayKey(m.created_at);
          return (
            <div key={m.id} className="flex flex-col gap-3.5">
              {newDay && <span className="self-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">{dayLabel(m.created_at)}</span>}
              {m.kind === "quote" ? (
                <div className={`flex max-w-[90%] flex-col gap-2 rounded-[14px] border border-[#e1b65a] bg-surface p-4 md:max-w-[70%] ${mine ? "self-end" : "self-start"}`}>
                  <span className="text-xs font-bold tracking-wide text-vip">QUOTE</span>
                  {m.body && <span className="text-[15px] font-bold">{m.body}</span>}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xl font-extrabold">{formatNaira(m.quote_amount ?? 0)}</span>
                    <span className="text-xs font-bold text-muted">{m.quote_status === "open" && !isCustomer ? "Waiting for the customer" : QUOTE_STATUS[m.quote_status ?? ""]}</span>
                  </div>
                  {m.quote_status === "accepted" && m.order_id && (
                    <Link href={isCustomer ? `/account/orders/${m.order_id}` : `/provider/orders/${m.order_id}`} className="text-sm font-semibold text-primary">View order</Link>
                  )}
                  {m.quote_status === "open" && isCustomer && <QuoteActions messageId={m.id} threadId={threadId} />}
                  <span className="text-[11px] text-muted">{clockTime(m.created_at)}</span>
                </div>
              ) : (
                <div className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-normal md:max-w-[70%] ${
                  mine ? "self-end rounded-[16px_16px_4px_16px] bg-primary text-white" : "self-start rounded-[16px_16px_16px_4px] border border-border bg-surface"}`}>
                  {m.body}
                  <span className={`mt-1 block text-[11px] ${mine ? "text-primary-tint" : "text-muted"}`}>{clockTime(m.created_at)}</span>
                </div>
              )}
            </div>
          );
        })}
        <ThreadEffects count={rows.length} />
      </div>

      <div className="border-t border-border p-4 md:px-5">
        <Composer threadId={threadId} canQuote={!isCustomer && prov?.service === "cleaning"} />
      </div>
    </>
  );
}

async function Page({ params }: { params: PageProps<"/messages/[threadId]">["params"] }) {
  const { threadId } = await params;
  return (
    <MessagesShell activeId={threadId}>
      <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}><Thread threadId={threadId} /></Suspense>
    </MessagesShell>
  );
}

export default function ThreadPage(props: PageProps<"/messages/[threadId]">) {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Page params={props.params} /></Suspense>
    </PublicShell>
  );
}
