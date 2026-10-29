import { Suspense } from "react";
import Link from "next/link";
import { formatNaira, orderRef, type OrderService } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";

const card = "flex flex-col gap-2 rounded-2xl border border-border bg-surface p-[22px]";

async function Results({ searchParams }: { searchParams: PageProps<"/admin/search">["searchParams"] }) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().replace(/[%,()]/g, "");
  if (q.length < 2) return <p className="rounded-2xl bg-surface p-6 text-muted">Type at least two characters in the search box above.</p>;
  const supabase = await createClient();
  const like = `%${q}%`;
  const [{ data: users }, { data: providers }, { data: orders }] = await Promise.all([
    supabase.from("users").select("id, name, email, role").or(`name.ilike.${like},email.ilike.${like}`).limit(10),
    supabase.from("providers").select("id, display_name, slug, service, status").ilike("display_name", like).limit(10),
    supabase.from("orders").select("id, service, status, total").limit(500),
  ]);
  const hits = (orders ?? []).filter((o) => o.id.replace(/-/g, "").startsWith(q.toLowerCase().replace(/^[a-z]{2}-/, "")) || orderRef(o.service as OrderService, o.id).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  const none = !(users?.length || providers?.length || hits.length);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {none && <p className="rounded-2xl bg-surface p-6 text-muted lg:col-span-3">No results for “{q}”.</p>}
      {(users?.length ?? 0) > 0 && <section className={card}><h2 className="text-lg font-bold">Users</h2><ul className="text-sm">{users!.map((u) => <li key={u.id} className="border-b border-bg-admin py-2 last:border-0"><span className="font-semibold">{u.name || u.email}</span> <span className="text-muted capitalize">· {u.role} · {u.email}</span></li>)}</ul></section>}
      {(providers?.length ?? 0) > 0 && <section className={card}><h2 className="text-lg font-bold">Providers</h2><ul className="text-sm">{providers!.map((p) => <li key={p.id} className="border-b border-bg-admin py-2 last:border-0"><Link href={`/p/${p.slug}`} className="font-semibold text-primary">{p.display_name}</Link> <span className="text-muted capitalize">· {p.service} · {p.status}</span></li>)}</ul></section>}
      {hits.length > 0 && <section className={card}><h2 className="text-lg font-bold">Orders</h2><ul className="text-sm">{hits.map((o) => <li key={o.id} className="border-b border-bg-admin py-2 last:border-0"><Link href={`/account/orders/${o.id}`} className="font-semibold text-primary">#{orderRef(o.service as OrderService, o.id)}</Link> <span className="text-muted capitalize">· {o.status.replace(/_/g, " ")} · {formatNaira(o.total)}</span></li>)}</ul></section>}
    </div>
  );
}

export default function AdminSearch(props: PageProps<"/admin/search">) {
  return <Suspense fallback={<p className="text-muted">Searching…</p>}><Results searchParams={props.searchParams} /></Suspense>;
}
