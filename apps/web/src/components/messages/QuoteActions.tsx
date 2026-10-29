"use client";

import { useActionState, useTransition } from "react";
import { acceptQuote, declineQuote, type MsgState } from "@/app/messages/actions";
import { DeliveryFields } from "@/components/booking/Fields";

export function QuoteActions({ messageId, threadId }: { messageId: number; threadId: string }) {
  const [state, action, pending] = useActionState<MsgState, FormData>(acceptQuote.bind(null, messageId), {});
  const [declining, startDecline] = useTransition();
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-primary">Accept this quote</summary>
      <form action={action} className="mt-2 space-y-3">
        <DeliveryFields />
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        <div className="flex gap-2">
          <button disabled={pending} className="min-h-11 rounded-input bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">Accept &amp; book</button>
          <button type="button" disabled={declining} onClick={() => startDecline(() => declineQuote(messageId, threadId))}
            className="min-h-11 rounded-input border border-border px-4 text-sm font-bold text-danger">Decline</button>
        </div>
      </form>
    </details>
  );
}
