"use client";

import { useState, useTransition } from "react";
import { reviewProvider } from "@/app/admin/approvals/actions";

export function ReviewButtons({ providerId }: { providerId: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  const run = (approve: boolean) =>
    start(async () => {
      const r = await reviewProvider(providerId, approve, reason);
      if (r.error) setError(r.error);
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => run(true)}
          className="min-h-11 rounded-input bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">Approve</button>
        <button disabled={pending} onClick={() => setRejecting((v) => !v)}
          className="min-h-11 rounded-input border border-border bg-surface px-4 text-sm font-bold text-danger">Reject</button>
      </div>
      {rejecting && (
        <div className="flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the provider)"
            className="min-h-11 flex-1 rounded-input border border-border px-3 text-sm" />
          <button disabled={pending || !reason.trim()} onClick={() => run(false)}
            className="min-h-11 rounded-input bg-danger px-4 text-sm font-bold text-white disabled:opacity-60">Confirm</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
