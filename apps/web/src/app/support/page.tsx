import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/shell/PublicShell";
import { TicketForm } from "@/components/ops/Forms";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";

async function Support() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fsupport");
  const supabase = await createClient();
  const [{ data: tickets }, { data: orders }] = await Promise.all([
    supabase.from("support_tickets").select("id, subject, status, updated_at").eq("created_by", user.id).order("updated_at", { ascending: false }),
    supabase.from("orders").select("id, service, total, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <h1 className="mb-4 text-2xl font-extrabold">Help &amp; support</h1>
        <div className="rounded-card border border-border bg-surface p-4">
          <TicketForm orders={(orders ?? []).map((o) => ({ id: o.id, label: `${o.service} · ₦${o.total.toLocaleString("en-NG")} · ${formatWhen(o.created_at)}` }))} />
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-extrabold">Your requests</h2>
        {(tickets ?? []).length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No requests yet.</p> : (
          <ul className="space-y-2">
            {(tickets ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex min-h-11 items-center justify-between rounded-card border border-border bg-surface p-4 hover:border-primary">
                  <span className="font-bold">{t.subject}</span>
                  <span className="text-xs text-muted capitalize">{t.status === "pending" ? "Reply received" : t.status} · {formatWhen(t.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SupportPage() {
  return <PublicShell><Suspense fallback={<p className="text-muted">Loading…</p>}><Support /></Suspense></PublicShell>;
}
