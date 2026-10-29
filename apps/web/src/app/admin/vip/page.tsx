import { Suspense } from "react";
import { VipSection } from "@/components/admin/sections";

export default function AdminVip() {
  return <div className="flex"><Suspense fallback={<p className="text-muted">Loading…</p>}><VipSection /></Suspense></div>;
}
