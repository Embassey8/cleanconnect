"use client";

import { useActionState, useRef } from "react";
import { sendMessage, sendQuote, type MsgState } from "@/app/messages/actions";

const inp = "min-h-11 rounded-input border border-border bg-surface px-3 text-sm";

export function Composer({ threadId, canQuote }: { threadId: string; canQuote: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [mState, mAction, mPending] = useActionState<MsgState, FormData>(async (s, f) => {
    const r = await sendMessage(threadId, s, f); if (!r.error) formRef.current?.reset(); return r;
  }, {});
  const [qState, qAction, qPending] = useActionState<MsgState, FormData>(sendQuote.bind(null, threadId), {});
  return (
    <div className="space-y-3">
      <form ref={formRef} action={mAction} className="flex gap-2.5">
        <input name="body" required maxLength={2000} autoComplete="off" aria-label="Message" placeholder="Write a message…" className={`${inp} flex-1 text-[15px]`} />
        <button disabled={mPending} className="min-h-11 rounded-input bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-60">Send</button>
      </form>
      {mState.error && <p role="alert" className="text-sm text-danger">{mState.error}</p>}
      {canQuote && (
        <details className="rounded-card border border-border bg-surface p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Send a quote</summary>
          <form action={qAction} className="mt-2 flex flex-wrap gap-2">
            <input name="amount" inputMode="numeric" required placeholder="₦ amount" aria-label="Quote amount in naira" className={`${inp} w-32`} />
            <input name="description" placeholder="What's included" aria-label="Quote description" className={`${inp} flex-1`} />
            <button disabled={qPending} className="min-h-11 rounded-input bg-accent px-4 text-sm font-bold text-ink disabled:opacity-60">Send quote</button>
          </form>
          {qState.error && <p role="alert" className="mt-2 text-sm text-danger">{qState.error}</p>}
        </details>
      )}
    </div>
  );
}
