import { Suspense } from "react";
import { PublicShell } from "@/components/shell/PublicShell";
import { ApplyForm } from "@/components/ops/Forms";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

async function Gate({ searchParams }: { searchParams: PageProps<"/apply">["searchParams"] }) {
  const { kind } = await searchParams;
  const k = kind === "staff" ? "staff" : "partner";
  if (!(await getSessionUser())) redirect(`/login?next=${encodeURIComponent(`/apply?kind=${k}`)}`);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold">{k === "partner" ? "Become a car wash partner" : "Join the CleanConnect team"}</h1>
      <p className="mb-6 mt-2 text-text-2">
        {k === "partner" ? "Partners receive jobs from CleanConnect at fixed payouts, paid weekly." : "Tell us about the role you're interested in."}
      </p>
      <ApplyForm kind={k} />
    </div>
  );
}

export default function ApplyPage(props: PageProps<"/apply">) {
  return <PublicShell><Suspense fallback={<p className="text-muted">Loading…</p>}><Gate searchParams={props.searchParams} /></Suspense></PublicShell>;
}
