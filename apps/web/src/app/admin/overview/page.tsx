import { Suspense } from "react";
import { connection } from "next/server";
import { ActivitySection, ApprovalsSection, ChatPanel, FinanceSection, JobsSection, Kpis, LocationsSection, RequestsSection, SupportSection, VipSection } from "@/components/admin/sections";
import { pickMonth } from "@/lib/time";

const wait = <p className="rounded-2xl bg-surface p-6 text-muted">Loading…</p>;

async function Overview({ searchParams }: { searchParams: PageProps<"/admin/overview">["searchParams"] }) {
  await connection(); // month picking reads the clock
  const month = pickMonth((await searchParams).month);
  return (
    <>
      <Suspense fallback={wait}><Kpis month={month} /></Suspense>
      <Suspense fallback={wait}><FinanceSection month={month} /></Suspense>
      <Suspense fallback={wait}><ApprovalsSection limit={5} basePath="/admin/overview" /></Suspense>
      <div className="flex flex-wrap items-stretch gap-5">
        <Suspense fallback={wait}><RequestsSection limit={4} /></Suspense>
        <Suspense fallback={wait}><ActivitySection /></Suspense>
      </div>
      <Suspense fallback={wait}><LocationsSection /></Suspense>
      <div className="flex flex-wrap items-stretch gap-5">
        <Suspense fallback={wait}><JobsSection /></Suspense>
        <Suspense fallback={wait}><VipSection limit={4} /></Suspense>
      </div>
      <div className="flex flex-wrap items-stretch gap-5">
        <Suspense fallback={wait}><SupportSection limit={5} /></Suspense>
        <Suspense fallback={wait}><ChatPanel /></Suspense>
      </div>
    </>
  );
}

export default function OverviewPage(props: PageProps<"/admin/overview">) {
  return <Suspense fallback={wait}><Overview searchParams={props.searchParams} /></Suspense>;
}
