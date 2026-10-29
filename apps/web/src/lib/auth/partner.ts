import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "./session";

export interface OwnPartner {
  id: string; display_name: string; areas: string[];
  stats: { offersTotal: number; offersAccepted: number; jobsCompleted: number; onTimeJobs: number; rating: number | null; photoCompliance: number | null };
}

/** The signed-in car wash partner's own profile and score counters. */
export async function requireOwnPartner(): Promise<OwnPartner> {
  const user = await requireRole(["partner"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("providers")
    .select("id, display_name, areas, partner_scores(offers_total, offers_accepted, jobs_completed, on_time_jobs)")
    .eq("owner_id", user.id).eq("service", "carwash").maybeSingle();
  if (!data) redirect("/");
  const { data: q } = await supabase.from("partner_quality").select("rating_avg, jobs_completed, photo_jobs").eq("provider_id", data.id).maybeSingle();
  const s = (Array.isArray(data.partner_scores) ? data.partner_scores[0] : data.partner_scores) as
    { offers_total: number; offers_accepted: number; jobs_completed: number; on_time_jobs: number } | null;
  return {
    id: data.id, display_name: data.display_name, areas: data.areas,
    stats: { offersTotal: s?.offers_total ?? 0, offersAccepted: s?.offers_accepted ?? 0, jobsCompleted: s?.jobs_completed ?? 0, onTimeJobs: s?.on_time_jobs ?? 0,
      rating: q?.rating_avg == null ? null : Number(q.rating_avg),
      photoCompliance: q && q.jobs_completed > 0 ? q.photo_jobs / q.jobs_completed : null },
  };
}
