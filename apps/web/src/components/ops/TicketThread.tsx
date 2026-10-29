import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { ReplyForm } from "./Forms";

export async function TicketThread({ id, staff }: { id: string; staff: boolean }) {
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("id, subject, status, priority, category, order_id, created_by").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: msgs } = await supabase.from("ticket_messages").select("id, sender_id, body, internal, created_at").eq("ticket_id", id).order("id");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t.subject}</h1>
        <p className="text-sm text-muted capitalize">{t.category} · {t.status} · {t.priority} priority</p>
      </div>
      <ul className="space-y-3">
        {(msgs ?? []).map((m) => {
          const mine = m.sender_id === t.created_by;
          return (
            <li key={m.id} className={`rounded-card p-3 text-sm ${m.internal ? "border border-warning bg-warning-bg" : mine ? "bg-surface border border-border" : "bg-primary-tint"}`}>
              <p className="mb-1 text-xs font-bold text-muted">{m.internal ? "Internal note" : mine ? "Customer" : "CleanConnect support"} · {formatWhen(m.created_at)}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ul>
      {t.status === "resolved" && !staff && <p className="text-sm text-muted">This request is resolved. Reply below to reopen it.</p>}
      <ReplyForm ticketId={id} staff={staff} />
    </div>
  );
}
