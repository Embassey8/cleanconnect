import { Suspense } from "react";
import Link from "next/link";
import { OrderView } from "@/components/orders/OrderView";

async function Inner({ params }: { params: PageProps<"/partner/orders/[id]">["params"] }) {
  const { id } = await params;
  return <OrderView id={id} viewer="provider" />;
}

export default function PartnerOrderPage(props: PageProps<"/partner/orders/[id]">) {
  return (
    <div className="max-w-2xl">
      <Link href="/partner" className="mb-4 inline-block text-sm font-semibold text-primary">← Jobs</Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner params={props.params} /></Suspense>
    </div>
  );
}
