import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ReviewButtons } from "@/components/admin/ReviewButtons";

interface Row {
  id: string; display_name: string; type: string; service: string; plan: string;
  areas: string[]; created_at: string;
  verifications: { kind: string; status: string; provider_ref: string | null }[];
}

const KIND: Record<string, string> = { cac: "CAC", nin: "NIN", bvn: "BVN", selfie: "Face match" };
const STATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "bg-primary-tint text-primary" },
  pending: { label: "Pending", cls: "bg-warning-bg text-warning" },
  mismatch: { label: "Name mismatch", cls: "bg-danger-bg text-danger" },
  failed: { label: "Failed", cls: "bg-danger-bg text-danger" },
};

async function Queue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("id, display_name, type, service, plan, areas, created_at, verifications(kind, status, provider_ref)")
    .eq("status", "pending")
    .order("created_at");
  if (error) return <p role="alert" className="text-danger">Could not load the queue: {error.message}</p>;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return <p className="rounded-card bg-surface p-6 text-muted">No providers are waiting for approval.</p>;

  return (
    <ul className="space-y-4">
      {rows.map((p) => (
        <li key={p.id} className="rounded-card border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold">{p.display_name}</h2>
              <p className="text-sm text-muted">
                {p.type === "business" ? "Business / shop" : "Individual"} · {p.service} · {p.plan === "vip" ? "VIP" : "Standard"}
                {p.areas.length > 0 && ` · ${p.areas.join(", ")}`}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.verifications.map((v) => {
                  const s = STATUS[v.status] ?? STATUS.pending;
                  return (
                    <li key={v.kind} className={`rounded-full px-3 py-1 text-xs font-bold ${s.cls}`}>
                      {KIND[v.kind] ?? v.kind}: {s.label}{v.provider_ref ? ` (…${v.provider_ref})` : ""}
                    </li>
                  );
                })}
              </ul>
            </div>
            <ReviewButtons providerId={p.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ApprovalsPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Provider approvals</h1>
      <p className="mb-6 text-text-2">Providers are hidden from customers until you approve them.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Queue /></Suspense>
    </>
  );
}
