import { Suspense } from "react";
import { RequestsSection } from "@/components/admin/sections";

export default function RequestsPage() {
  return (
    <>
      <p className="-mt-2 text-sm text-text-2">Offer each car wash to a partner (best score first). They have 10 minutes to accept; the customer is charged when they do.</p>
      <div className="flex"><Suspense fallback={<p className="text-muted">Loading…</p>}><RequestsSection /></Suspense></div>
    </>
  );
}
