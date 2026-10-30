import { Suspense } from "react";
import { requireOwnProvider } from "@/lib/auth/provider";
import { AvailabilityToggle } from "@/components/partner/PartnerControls";
import { AreasForm } from "@/components/provider/ProviderForms";

const card = "flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface p-5";

async function Areas() {
  const p = await requireOwnProvider();
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Taking jobs</h2>
        <p className="text-sm text-text-2">While you&apos;re offline, customers can still see your profile but can&apos;t send you new orders. Jobs you already accepted carry on.</p>
        <div><AvailabilityToggle on={p.accepting_jobs} tone="primary" onLabel="Online — taking jobs" offLabel="Offline — not taking new orders" /></div>
      </section>
      <section className={card}>
        <h2 className="text-lg font-extrabold">Areas you cover</h2>
        <p className="text-sm text-text-2">Customers filter by area, so list every neighbourhood you serve.</p>
        <AreasForm areas={p.areas} />
      </section>
    </>
  );
}

export default function AreasPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Availability &amp; areas</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Areas /></Suspense>
    </>
  );
}
