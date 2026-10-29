import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { OrderList, type OrderRow } from "@/components/orders/OrderList";

async function Orders() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, service, status, total, created_at, scheduled_at, providers(display_name)")
    .eq("provider_id", p.id)
    .order("created_at", { ascending: false });
  return <OrderList rows={(data ?? []) as OrderRow[]} base="/provider/orders" empty="No orders yet. Once you're approved, requests appear here." />;
}

export default function ProviderOrders() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-extrabold">Orders</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Orders /></Suspense>
    </>
  );
}
