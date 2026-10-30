import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { NameForm } from "@/components/provider/ProviderForms";

const KIND: Record<string, string> = { cac: "CAC registration", nin: "NIN", bvn: "BVN", selfie: "Face match" };
const STATUS: Record<string, { text: string; cls: string }> = {
  verified: { text: "Verified", cls: "bg-primary-tint text-primary" }, pending: { text: "Pending review", cls: "bg-warning-bg text-warning" },
  mismatch: { text: "Name mismatch", cls: "bg-danger-bg text-danger" }, failed: { text: "Failed", cls: "bg-danger-bg text-danger" },
};

async function Profile() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const { data: checks } = await supabase.from("verifications").select("kind, status").eq("provider_id", p.id);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-extrabold">Your profile</h2>
        <NameForm name={p.display_name} />
        {p.status === "approved" && <Link href={`/p/${p.slug}`} className="text-sm font-semibold text-primary">View your public profile →</Link>}
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-extrabold">Verification</h2>
        <p className="text-sm text-text-2">Customers only ever see the “verified” badges. Your ID numbers are never shown, and we keep just the last 4 digits.</p>
        <ul className="divide-y divide-bg-admin">
          {(checks ?? []).length === 0 && <li className="py-2 text-sm text-muted">No checks on file.</li>}
          {(checks ?? []).map((c) => {
            const s = STATUS[c.status] ?? STATUS.pending;
            return <li key={c.kind} className="flex items-center justify-between py-3 text-sm"><span className="font-semibold">{KIND[c.kind] ?? c.kind}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${s.cls}`}>{s.text}</span></li>;
          })}
        </ul>
        <p className="text-sm text-muted">Account status: <strong className="capitalize">{p.status}</strong></p>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Profile &amp; verification</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Profile /></Suspense>
    </>
  );
}
