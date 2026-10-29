import { Suspense } from "react";
import Link from "next/link";
import { TERMINAL, type OrderStatus } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { OrderList, type OrderRow } from "@/components/orders/OrderList";
import { signOut } from "@/app/login/actions";

async function Orders() {
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, service, status, total, created_at, scheduled_at, providers(display_name)")
    .eq("customer_id", user!.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as OrderRow[];
  const active = rows.filter((o) => !TERMINAL.includes(o.status as OrderStatus));
  const past = rows.filter((o) => TERMINAL.includes(o.status as OrderStatus));
  return (
    <>
      <h2 className="mb-3 mt-6 text-lg font-extrabold">Ongoing</h2>
      <OrderList rows={active} base="/account/orders" empty="No ongoing orders. Find a provider to get started." />
      <h2 className="mb-3 mt-8 text-lg font-extrabold">Past orders</h2>
      <OrderList rows={past} base="/account/orders" empty="Nothing here yet." />
    </>
  );
}

export default function Account() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">My account</h1>
        <form action={signOut}><button className="min-h-11 px-3 text-sm font-semibold text-muted">Sign out</button></form>
      </div>
      <div className="mt-3 flex gap-3 text-sm font-semibold text-primary">
        <Link href="/marketplace">Find a provider</Link><Link href="/car-wash">Request a car wash</Link><Link href="/messages">Messages</Link><Link href="/account/wallet">Wallet</Link><Link href="/account/saved">Saved</Link><Link href="/support">Help</Link>
      </div>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}><Orders /></Suspense>
    </main>
  );
}
