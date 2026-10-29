import { Suspense } from "react";
import { ChatPanel, SupportSection } from "@/components/admin/sections";

export default function AdminSupport() {
  return (
    <div className="flex flex-wrap items-stretch gap-5">
      <Suspense fallback={<p className="text-muted">Loading…</p>}><SupportSection /></Suspense>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><ChatPanel /></Suspense>
    </div>
  );
}
