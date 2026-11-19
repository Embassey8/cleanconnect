import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { signedDocumentUrl } from "@/lib/kyc-documents";
import { nextApplicationStage } from "@cleanconnect/shared";
import { ApplicationButtons } from "@/components/ops/Buttons";

const NEXT_LABEL: Record<string, string> = { inspection: "Book site inspection", interview: "Move to interview", offer: "Make offer", approved: "Approve as partner", hired: "Mark hired" };

async function Applications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_applications")
    .select("id, kind, business_name, position, phone, area, note, stage, rejection_reason, created_at, cac_last4, cac_document, users(name, email)")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  // Short-lived links to the CAC certificates of open partner applications (service role, admin pages only).
  const docs = new Map<string, string | null>();
  await Promise.all(rows.filter((a) => a.cac_document && !["approved", "hired", "rejected"].includes(a.stage))
    .map(async (a) => { docs.set(a.id, await signedDocumentUrl(a.cac_document!)); }));
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No applications yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((a) => {
        const u = (Array.isArray(a.users) ? a.users[0] : a.users) as { name: string; email: string | null } | null;
        const closed = ["approved", "hired", "rejected"].includes(a.stage);
        const next = closed ? null : nextApplicationStage(a.kind as "partner" | "staff", a.stage);
        return (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <div>
              <p className="font-extrabold">{a.kind === "partner" ? a.business_name : a.position} <span className="font-normal text-muted">· {a.kind === "partner" ? "Car wash partner" : "Staff"}</span></p>
              <p className="text-sm text-text-2">{u?.name || "Applicant"} · {a.phone}{a.area ? ` · ${a.area}` : ""} · {formatWhen(a.created_at)}</p>
              {a.kind === "partner" && (
                <div className="mt-2 space-y-1 rounded-input bg-bg p-3 text-[13px] text-text-2">
                  <p><span className="text-muted">Registered name:</span> <strong>{a.business_name}</strong> · <span className="text-muted">number ends</span> <strong>{a.cac_last4 ?? "—"}</strong></p>
                  {a.cac_document
                    ? (docs.get(a.id)
                        ? <a href={docs.get(a.id)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary">View the CAC certificate ↗ <span className="ml-1 text-xs font-normal text-muted">(link works for 10 minutes)</span></a>
                        : !["approved", "hired", "rejected"].includes(a.stage) ? <p className="text-warning">The certificate is on file but its link could not be made. Reload to try again.</p> : <p className="text-muted">Certificate on file.</p>)
                    : <p className="font-semibold text-danger">No CAC certificate on file. This application can&apos;t be approved: reject it and ask them to re-apply.</p>}
                  <a href="https://search.cac.gov.ng/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary">Open the CAC register ↗</a>
                </div>
              )}
              {a.note && <p className="mt-1 text-sm text-text-2">{a.note}</p>}
              <p className="mt-1 text-sm font-bold capitalize text-primary">{a.stage}{a.rejection_reason ? `: ${a.rejection_reason}` : ""}</p>
            </div>
            {!closed && <ApplicationButtons id={a.id} next={next} nextLabel={next ? NEXT_LABEL[next] ?? "Next stage" : ""} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function ApplicationsPage() {
  return (
    <>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Applications /></Suspense>
    </>
  );
}
