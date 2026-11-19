"use client";

import { useState, useTransition } from "react";
import { setCacCheck } from "@/app/admin/approvals/actions";

/** Manual CAC check: the admin looks the company up on the public CAC register, then records the result. */
export function CacCheck({ providerId, name, registeredName, last4, status, documentUrl, hasDocument }: {
  providerId: string; name: string; registeredName: string | null; last4: string | null; status: string; documentUrl: string | null; hasDocument: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const run = (result: "verified" | "mismatch") =>
    start(async () => {
      const r = await setCacCheck(providerId, result, note);
      if (r.error) setError(r.error);
    });

  if (status === "verified") return null;
  return (
    <div className="mt-2 space-y-2 rounded-input border border-border bg-bg p-3 text-[13px]">
      <p className="font-semibold">Check this company on the CAC register</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-2">
        <dt className="text-muted">Business name</dt><dd className="font-semibold">{name}</dd>
        <dt className="text-muted">As registered</dt><dd className="font-semibold">{registeredName ?? "—"}</dd>
        <dt className="text-muted">Number ends</dt><dd className="font-semibold">{last4 ?? "—"}</dd>
      </dl>
      {hasDocument ? (
        documentUrl ? (
          <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary">
            View the certificate ↗ <span className="ml-1 text-xs font-normal text-muted">(link works for 10 minutes)</span>
          </a>
        ) : <p className="text-warning">The certificate is on file but its link could not be made. Reload the page to try again.</p>
      ) : <p className="font-semibold text-danger">No certificate was uploaded, so this check can&apos;t be marked verified.</p>}
      <p className="text-text-2">
        Compare the certificate with the register: the registered name{registeredName ? <> (<strong>{registeredName}</strong>)</> : null} and the full number,
        which should end in <strong>{last4 ?? "—"}</strong>.
      </p>
      <a href="https://search.cac.gov.ng/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary">
        Open the CAC register ↗
      </a>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. RC number seen"
        aria-label="Note about the CAC check" className="min-h-11 w-full rounded-input border border-border bg-surface px-3 text-sm" />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || !hasDocument} onClick={() => run("verified")}
          className="min-h-11 rounded-input bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">Mark CAC verified</button>
        <button disabled={pending} onClick={() => run("mismatch")}
          className="min-h-11 rounded-input border border-border bg-surface px-4 text-sm font-bold text-danger disabled:opacity-60">Doesn&apos;t match</button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
