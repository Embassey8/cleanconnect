import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/shell/PublicShell";
import { MessagesShell } from "@/components/messages/MessagesShell";
import { getSessionUser } from "@/lib/auth/session";

async function Inbox() {
  if (!(await getSessionUser())) redirect("/login?next=%2Fmessages");
  return (
    <MessagesShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#fafbfa] p-10 text-center">
        <p className="text-lg font-bold">Select a conversation</p>
        <p className="max-w-xs text-sm text-muted">Pick a chat on the left, or open a provider&apos;s profile and tap Message to start one.</p>
      </div>
    </MessagesShell>
  );
}

export default function MessagesPage() {
  return (
    <PublicShell>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Inbox /></Suspense>
    </PublicShell>
  );
}
