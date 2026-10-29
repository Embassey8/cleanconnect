import { Suspense } from "react";
import Link from "next/link";
import { PublicShell } from "@/components/shell/PublicShell";
import { TicketThread } from "@/components/ops/TicketThread";

async function Inner({ params }: { params: PageProps<"/support/[id]">["params"] }) {
  const { id } = await params;
  return <TicketThread id={id} staff={false} />;
}

export default function SupportThread(props: PageProps<"/support/[id]">) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl">
        <Link href="/support" className="mb-4 inline-block text-sm font-semibold text-primary">← Support</Link>
        <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner params={props.params} /></Suspense>
      </div>
    </PublicShell>
  );
}
