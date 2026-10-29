import { Suspense } from "react";
import Link from "next/link";
import { ChatPanel } from "@/components/admin/sections";

export default function AdminChat() {
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-sm text-text-2">Conversations with customers and providers come in as support tickets. This shows the most recently active one; <Link href="/admin/support" className="font-semibold text-primary">see all tickets</Link>.</p>
      <div className="flex"><Suspense fallback={<p className="text-muted">Loading…</p>}><ChatPanel /></Suspense></div>
    </div>
  );
}
