import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatWhen } from "@/lib/time";
import { nextApplicationStage } from "@cleanconnect/shared";
import { ApplicationButtons } from "@/components/ops/Buttons";

const NEXT_LABEL: Record<string, string> = { inspection: "Book site inspection", interview: "Move to interview", offer: "Make offer", approved: "Approve as partner", hired: "Mark hired" };

async function Applications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_applications")
    .select("id, kind, business_name, position, phone, area, note, stage, rejection_reason, created_at, users(name, email)")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
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
