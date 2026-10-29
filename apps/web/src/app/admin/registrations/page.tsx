import { Suspense } from "react";
import { connection } from "next/server";
import { ActivitySection, Kpis } from "@/components/admin/sections";
import { recentMonths } from "@/lib/time";

async function Top() {
  await connection();
  return <Kpis month={recentMonths(1)[0].key} />;
}

export default function Registrations() {
  return (
    <>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Top /></Suspense>
      <div className="flex"><Suspense fallback={<p className="text-muted">Loading…</p>}><ActivitySection limit={30} /></Suspense></div>
      <p className="text-sm text-muted">Login history, failed attempts and lockouts need the auth provider&apos;s logs and aren&apos;t wired up yet.</p>
    </>
  );
}
