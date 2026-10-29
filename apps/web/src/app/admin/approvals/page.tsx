import { Suspense } from "react";
import { ApprovalsSection } from "@/components/admin/sections";

async function Inner({ searchParams }: { searchParams: PageProps<"/admin/approvals">["searchParams"] }) {
  const t = (await searchParams).type;
  return <ApprovalsSection type={typeof t === "string" ? t : "all"} />;
}

export default function ApprovalsPage(props: PageProps<"/admin/approvals">) {
  return (
    <>
      <p className="-mt-2 text-sm text-text-2">Providers are hidden from customers until you approve them.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Inner searchParams={props.searchParams} /></Suspense>
    </>
  );
}
