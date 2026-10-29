import { Suspense } from "react";
import { OrderView } from "@/components/orders/OrderView";

async function Inner({ params }: { params: PageProps<"/account/orders/[id]">["params"] }) {
  const { id } = await params;
  return <OrderView id={id} viewer="customer" />;
}

export default function CustomerOrderPage(props: PageProps<"/account/orders/[id]">) {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner params={props.params} /></Suspense>
    </main>
  );
}
