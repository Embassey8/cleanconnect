import { Suspense } from "react";
import { partnerScore, partnerTier, SCORE_WEIGHTS, TIER_THRESHOLDS, MIN_JOBS_FOR_TIER } from "@cleanconnect/shared";
import { requireOwnPartner } from "@/lib/auth/partner";

function Bar({ label, value, shown, weight }: { label: string; value: number | null; shown: string; weight: number }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between"><span>{label} <span className="text-xs text-muted">· {Math.round(weight * 100)}% of score</span></span><strong>{value === null ? "—" : shown}</strong></span>
      <span className="block h-2 rounded-full bg-bg-admin"><span className="block h-2 rounded-full bg-carwash" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span>
    </div>
  );
}

async function Score() {
  const p = await requireOwnPartner();
  const s = p.stats;
  const score = partnerScore(s);
  const tier = partnerTier(score, s.jobsCompleted);
  const onTime = s.jobsCompleted ? s.onTimeJobs / s.jobsCompleted : null;
  const accept = s.offersTotal ? s.offersAccepted / s.offersTotal : null;
  const pct = (v: number | null) => `${Math.round((v ?? 0) * 100)}%`;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-2xl bg-carwash p-5 text-white">
        <span className="text-sm text-[#d6e2f5]">Partner score</span>
        <span className="text-[32px] font-extrabold">{score === null ? "—" : `${score} / 100`}</span>
        <span className="text-sm text-[#d6e2f5]">{tier === "new" ? `Builds after ${MIN_JOBS_FOR_TIER} completed jobs (you have ${s.jobsCompleted})` : tier === "gold" ? "Gold tier · priority jobs" : `${tier[0].toUpperCase()}${tier.slice(1)} tier`}</span>
      </section>
      <section aria-labelledby="ps-h" className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5">
        <h2 id="ps-h" className="text-lg font-extrabold">Score breakdown</h2>
        <p className="text-sm text-muted">A higher score gets you more and better jobs.</p>
        <Bar label="Customer rating" weight={SCORE_WEIGHTS.rating} value={s.rating == null ? null : s.rating / 5} shown={s.rating == null ? "—" : `${s.rating.toFixed(1)} / 5`} />
        <Bar label="On-time arrival" weight={SCORE_WEIGHTS.onTime} value={onTime} shown={pct(onTime)} />
        <Bar label="Job acceptance" weight={SCORE_WEIGHTS.acceptance} value={accept} shown={pct(accept)} />
        <Bar label="Photo compliance" weight={SCORE_WEIGHTS.photo} value={s.photoCompliance ?? null} shown={pct(s.photoCompliance ?? null)} />
      </section>
      <p className="text-sm text-muted">Gold tier starts at {TIER_THRESHOLDS.gold}, Silver at {TIER_THRESHOLDS.silver}. Take before and after photos on every job and respond to offers quickly to keep your score up.</p>
    </div>
  );
}

export default function ScorePage() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold">Partner score</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Score /></Suspense>
    </>
  );
}
