"use client";

import { useActionState } from "react";
import { CATEGORY_LABEL } from "@cleanconnect/shared";
import { createReview, replyToReview, type MediaState } from "@/app/media/actions";
import { CameraCapture } from "@/components/media/CameraCapture";

const input = "min-h-11 w-full rounded-input border border-border bg-surface px-3 text-base";
const btn = "min-h-11 rounded-input bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-60";

function Stars({ name, label, defaultValue = 5 }: { name: string; label: string; defaultValue?: number }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue} className="min-h-11 rounded-input border border-border bg-surface px-3">
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
      </select>
    </label>
  );
}

export function ReviewForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(createReview, {});
  if (state.reviewId) {
    return (
      <div className="space-y-3">
        <p role="status" className="font-semibold text-primary">{state.ok}</p>
        <p className="text-sm text-text-2">Want to add photos? They&apos;re shown with your review.</p>
        <CameraCapture orderId={orderId} reviewId={state.reviewId} phases={["general"]} label="Add a photo to your review" />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <Stars name="rating" label="Overall" />
      {(["quality", "punctuality", "communication", "value"] as const).map((k) => <Stars key={k} name={k} label={CATEGORY_LABEL[k]} />)}
      <label className="block text-sm font-semibold" htmlFor="rv-body">Tell others about it (optional)</label>
      <textarea id="rv-body" name="body" rows={3} maxLength={2000} className={`${input} py-2`} />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btn}>{pending ? "Posting…" : "Post review"}</button>
    </form>
  );
}

export function ReplyForm({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = useActionState<MediaState, FormData>(replyToReview.bind(null, reviewId), {});
  return (
    <form action={action} className="space-y-2">
      <label className="sr-only" htmlFor="reply">Public reply</label>
      <textarea id="reply" name="reply" rows={2} maxLength={1000} placeholder="Reply publicly" className={`${input} py-2`} required />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={btn}>{pending ? "Posting…" : "Reply"}</button>
    </form>
  );
}
