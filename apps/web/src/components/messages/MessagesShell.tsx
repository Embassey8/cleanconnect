import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { listTime } from "@/lib/time";
import { formatNaira } from "@cleanconnect/shared";
import { ConversationList, type Conversation } from "./ConversationList";

const TONES = ["bg-primary-tint text-primary", "bg-laundry-bg text-laundry", "bg-carwash-bg text-carwash", "bg-vip-bg text-vip"];

/** Split view from the design: conversation list on the left, `children` (thread or empty state) on the right. */
export async function MessagesShell({ activeId, children }: { activeId?: string; children: React.ReactNode }) {
  const user = (await getSessionUser())!;
  const supabase = await createClient();
  const { data: threads } = await supabase
    .from("threads").select("id, customer_id, last_message_at, providers(display_name, service)").order("last_message_at", { ascending: false });
  const ids = (threads ?? []).map((t) => t.id);
  const { data: msgs } = ids.length
    ? await supabase.from("messages").select("thread_id, kind, body, quote_amount").in("thread_id", ids).order("id", { ascending: false }).limit(300)
    : { data: [] };
  const last = new Map<string, { kind: string; body: string; quote_amount: number | null }>();
  for (const m of msgs ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, m);

  const items: Conversation[] = (threads ?? []).map((t, i) => {
    const p = (Array.isArray(t.providers) ? t.providers[0] : t.providers) as { display_name: string; service: string } | null;
    const name = t.customer_id === user.id ? p?.display_name ?? "Provider" : "Customer";
    const m = last.get(t.id);
    return {
      id: t.id, name, initial: name.slice(0, 1).toUpperCase(), service: p?.service ?? "", time: listTime(t.last_message_at), tone: TONES[i % TONES.length],
      preview: !m ? "No messages yet" : m.kind === "quote" ? `Quote: ${formatNaira(m.quote_amount ?? 0)}${m.body ? ` · ${m.body}` : ""}` : m.body,
    };
  });

  return (
    <div className="flex min-h-[720px] overflow-hidden rounded-[18px] border border-border bg-surface">
      <section aria-label="Conversations" className={`${activeId ? "hidden lg:flex" : "flex"} w-full flex-col border-border lg:w-[340px] lg:shrink-0 lg:border-r`}>
        <ConversationList items={items} activeId={activeId} />
      </section>
      <section aria-label="Conversation" className={`${activeId ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {activeId && <Link href="/messages" className="flex min-h-11 items-center border-b border-border px-5 text-sm font-semibold text-primary lg:hidden">← All messages</Link>}
        {children}
      </section>
    </div>
  );
}
