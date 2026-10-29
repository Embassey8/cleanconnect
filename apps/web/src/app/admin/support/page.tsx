import { Suspense } from "react";
import Link from "next/link";
import { TICKET_PRIORITY_ORDER } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";

const PRIO: Record<string, string> = { high: "bg-danger-bg text-danger", normal: "bg-bg-admin text-text-2", low: "bg-bg-admin text-muted" };

async function Tickets() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select("id, subject, status, priority, category, updated_at, users!support_tickets_created_by_fkey(name), assignee:users!support_tickets_assignee_id_fkey(name)")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []).sort((a, b) =>
    Number(a.status === "resolved") - Number(b.status === "resolved") ||
    TICKET_PRIORITY_ORDER[a.priority as keyof typeof TICKET_PRIORITY_ORDER] - TICKET_PRIORITY_ORDER[b.priority as keyof typeof TICKET_PRIORITY_ORDER]);
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No tickets.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const by = (Array.isArray(t.users) ? t.users[0] : t.users) as { name: string } | null;
        const asg = (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee) as { name: string } | null;
        return (
          <li key={t.id}>
            <Link href={`/admin/support/${t.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-4 hover:border-primary">
              <div>
                <p className="font-bold">{t.subject}</p>
                <p className="text-xs text-muted">{by?.name || "User"} · {t.category} · {formatWhen(t.updated_at)}{asg ? ` · ${asg.name}` : " · unassigned"}</p>
              </div>
              <div className="flex gap-2 text-xs font-bold capitalize">
                <span className={`rounded-full px-3 py-1 ${PRIO[t.priority]}`}>{t.priority}</span>
                <span className="rounded-full bg-primary-tint px-3 py-1 text-primary">{t.status}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminSupport() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Support &amp; help</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Tickets /></Suspense>
    </>
  );
}
