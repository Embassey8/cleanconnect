import { Suspense } from "react";
import { connection } from "next/server";
import { FinanceSection, Kpis } from "@/components/admin/sections";
import { formatNaira } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { FinanceForm } from "@/components/ops/Forms";
import { SettleButton } from "@/components/ops/Buttons";
import { formatWhen, pickMonth } from "@/lib/time";

const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]";
const wait = <p className="rounded-2xl bg-surface p-6 text-muted">Loading…</p>;

async function Entries() {
  const supabase = await createClient();
  const { data } = await supabase.from("finance_entries").select("id, kind, category, amount, occurred_on, note").order("occurred_on", { ascending: false }).limit(15);
  if (!data?.length) return null;
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Recent entries</h2>
      <ul className="divide-y divide-bg-admin text-sm">
        {data.map((e) => (
          <li key={e.id} className="flex justify-between gap-3 py-2.5"><span className="capitalize">{e.kind}: {e.category}{e.note ? ` · ${e.note}` : ""} <span className="text-muted">{formatWhen(e.occurred_on)}</span></span><strong>{formatNaira(e.amount)}</strong></li>
        ))}
      </ul>
    </section>
  );
}

async function Income({ searchParams }: { searchParams: PageProps<"/admin/income">["searchParams"] }) {
  await connection(); // month picking reads the clock
  const month = pickMonth((await searchParams).month);
  return (
    <>
      <Suspense fallback={wait}><Kpis month={month} /></Suspense>
      <Suspense fallback={wait}><FinanceSection month={month} /></Suspense>
      <div className="flex flex-wrap items-start gap-5">
        <section className={`${card} flex-[1_1_380px]`}>
          <h2 className="text-lg font-bold">Add income or expense</h2>
          <FinanceForm />
        </section>
        <section className={`${card} flex-[1_1_380px]`}>
          <h2 className="text-lg font-bold">Partner payouts</h2>
          <p className="text-sm text-text-2">Completed car wash payouts are released to partners every Friday. Until a scheduler is connected, pay them here.</p>
          <SettleButton />
        </section>
      </div>
      <Suspense fallback={null}><Entries /></Suspense>
    </>
  );
}

export default function IncomePage(props: PageProps<"/admin/income">) {
  return <Suspense fallback={wait}><Income searchParams={props.searchParams} /></Suspense>;
}
