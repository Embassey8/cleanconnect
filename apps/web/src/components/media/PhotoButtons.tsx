"use client";

import { useState, useTransition } from "react";
import { setPhotoPublic, toggleSavedPhoto, toggleSavedProvider } from "@/app/media/actions";

export function ShareToggle({ mediaId, isPublic, canShare }: { mediaId: string; isPublic: boolean; canShare: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (!canShare) return <p className="text-xs text-muted">{isPublic ? "Shared on profile" : "Private"}</p>;
  return (
    <div>
      <label className="flex min-h-11 items-center gap-2 text-xs">
        <input type="checkbox" checked={isPublic} disabled={pending}
          onChange={(e) => start(async () => setError((await setPhotoPublic(mediaId, e.target.checked)).error))} />
        Show on the provider&apos;s profile
      </label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function SavePhotoButton({ mediaId, slug, saved }: { mediaId: string; slug: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Remove from saved" : "Save photo"} disabled={pending}
      onClick={() => start(async () => { const r = await toggleSavedPhoto(mediaId, slug); if (r.saved !== undefined) setOn(r.saved); })}
      className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full bg-surface/90 text-lg">
      {on ? "♥" : "♡"}
    </button>
  );
}

export function SaveProviderButton({ providerId, slug, saved }: { providerId: string; slug: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-pressed={on} disabled={pending}
      onClick={() => start(async () => { const r = await toggleSavedProvider(providerId, slug); if (r.saved !== undefined) setOn(r.saved); })}
      className="min-h-11 rounded-input border border-border bg-surface px-5 text-sm font-bold hover:bg-primary-tint">
      {on ? "♥ Saved" : "♡ Save provider"}
    </button>
  );
}
