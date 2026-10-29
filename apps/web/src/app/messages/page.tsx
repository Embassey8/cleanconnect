import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/shell/PublicShell";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/time";

async function Threads() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fmessages");
  const supabase = await createClient();
  const { data } = await supabase
    .from("threads").select("id, customer_id, last_message_at, providers(display_name)").order("last_message_at", { ascending: false });
  if (!data?.length) return <p className="rounded-card bg-surface p-6 text-muted">No conversations yet. Open a provider&apos;s profile and tap Message.</p>;
  return (
    <ul className="space-y-3">
      {data.map((t) => {
        const p = (Array.isArray(t.providers) ? t.providers[0] : t.providers) as { display_name: string } | null;
        return (
          <li key={t.id}>
            <Link href={`/messages/${t.id}`} className="flex min-h-11 items-center justify-between rounded-card border border-border bg-surface p-4 hover:border-primary">
              <span className="font-bold">{t.customer_id === user.id ? p?.display_name : "Customer"}</span>
              <span className="text-xs text-muted">{formatWhen(t.last_message_at)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function MessagesPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-extrabold">Messages</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Threads /></Suspense>
      </div>
    </PublicShell>
  );
}
