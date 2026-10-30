import { Suspense } from "react";
import { ratingSummary } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { requireOwnProvider } from "@/lib/auth/provider";
import { ReplyForm } from "@/components/reviews/ReviewForms";
import { ReviewCard, Stars } from "@/components/reviews/ReviewStars";

async function Reviews() {
  const p = await requireOwnProvider();
  const supabase = await createClient();
  const [{ data: st }, { data }] = await Promise.all([
    supabase.from("provider_stats").select("c1, c2, c3, c4, c5").eq("provider_id", p.id).maybeSingle(),
    supabase.from("reviews").select("id, rating, quality, punctuality, communication, value_score, body, reply, created_at").eq("provider_id", p.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const sum = ratingSummary([st?.c1 ?? 0, st?.c2 ?? 0, st?.c3 ?? 0, st?.c4 ?? 0, st?.c5 ?? 0]);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-surface p-5">
        <div><p className="text-[32px] font-extrabold">{sum.average === null ? "—" : sum.average.toFixed(1)}</p>{sum.average !== null && <Stars n={Math.round(sum.average)} />}<p className="text-sm text-muted">{sum.count} review{sum.count === 1 ? "" : "s"}</p></div>
        <ul className="min-w-[220px] flex-1 space-y-1 text-xs">
          {sum.distribution.map((d) => (
            <li key={d.stars} className="flex items-center gap-2"><span className="w-6">{d.stars}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-admin"><span className="block h-full bg-accent" style={{ width: `${d.percent}%` }} /></span><span className="w-6 text-right text-muted">{d.count}</span></li>
          ))}
        </ul>
      </section>
      {(data ?? []).length === 0 ? <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">No reviews yet. Customers can review a job once it&apos;s completed.</p> : (
        <ul className="space-y-3">
          {(data ?? []).map((r) => (
            <li key={r.id}><ReviewCard r={{ ...r, photos: [] }} actions={!r.reply ? <div className="mt-3"><ReplyForm reviewId={r.id} /></div> : undefined} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Reviews</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Reviews /></Suspense>
    </>
  );
}
