import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { TicketThread } from "@/components/ops/TicketThread";
import { TicketControls } from "@/components/ops/Buttons";

async function Inner({ params }: { params: PageProps<"/admin/support/[id]">["params"] }) {
  const { id } = await params;
  const me = await getSessionUser();
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("status, priority").eq("id", id).maybeSingle();
  return (
    <div className="max-w-2xl space-y-4">
      {t && <TicketControls id={id} status={t.status} priority={t.priority} me={me!.id} />}
      <TicketThread id={id} staff />
    </div>
  );
}

export default function AdminTicket(props: PageProps<"/admin/support/[id]">) {
  return (
    <>
      <Link href="/admin/support" className="mb-4 inline-block text-sm font-semibold text-primary">← Tickets</Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner params={props.params} /></Suspense>
    </>
  );
}
