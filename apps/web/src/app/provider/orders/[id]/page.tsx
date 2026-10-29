import { Suspense } from "react";
import { OrderView } from "@/components/orders/OrderView";

async function Inner({ params }: { params: PageProps<"/provider/orders/[id]">["params"] }) {
  const { id } = await params;
  return <OrderView id={id} viewer="provider" />;
}

export default function ProviderOrderPage(props: PageProps<"/provider/orders/[id]">) {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner params={props.params} /></Suspense>;
}
