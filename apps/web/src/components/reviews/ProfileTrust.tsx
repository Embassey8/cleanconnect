import Link from "next/link";
import { CATEGORY_LABEL, earnedBadges, ratingSummary, starsText } from "@cleanconnect/shared";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { signedUrls } from "@/lib/media";
import { PHASE_LABEL, type MediaPhase } from "@cleanconnect/shared";
import { SavePhotoButton } from "@/components/media/PhotoButtons";
import { ReviewCard, Stars, type ReviewItem } from "./ReviewStars";

export interface Stats {
  rating_count: number; rating_avg: number | null; c1: number; c2: number; c3: number; c4: number; c5: number;
  quality: number | null; punctuality: number | null; communication: number | null; value_score: number | null; jobs_completed: number;
}

export async function loadStats(providerId: string): Promise<Stats | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("provider_stats").select("*").eq("provider_id", providerId).maybeSingle();
  return data as Stats | null;
}

/** Rating, jobs and earned badges for the profile header. */
export async function ProfileStats({ providerId }: { providerId: string }) {
  const s = await loadStats(providerId);
  if (!s) return null;
  const badges = earnedBadges({ ratingAverage: s.rating_avg === null ? null : Number(s.rating_avg), ratingCount: s.rating_count, jobsCompleted: s.jobs_completed });
  return (
    <>
      <p className="mt-2 text-sm text-text-2">
        <strong>{starsText(s.rating_avg === null ? null : Number(s.rating_avg))}</strong>
        {s.rating_count > 0 && ` (${s.rating_count} review${s.rating_count === 1 ? "" : "s"})`} · {s.jobs_completed} job{s.jobs_completed === 1 ? "" : "s"} completed
      </p>
      {badges.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {badges.map((b) => <li key={b} className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-ink">{b}</li>)}
        </ul>
      )}
    </>
  );
}

export async function Gallery({ providerId, slug }: { providerId: string; slug: string }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  const { data } = await supabase.from("public_gallery").select("id, path, phase, taken_at, review_id").eq("provider_id", providerId).is("review_id", null).order("taken_at", { ascending: false }).limit(24);
  const photos = data ?? [];
  if (photos.length === 0) return null;
  const urls = await signedUrls(photos.map((p) => p.path));
  const { data: saved } = user ? await supabase.from("saved_media").select("media_id").eq("user_id", user.id) : { data: [] };
  const savedIds = new Set((saved ?? []).map((s) => s.media_id));
  return (
    <section aria-labelledby="gal-h" className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="gal-h" className="text-xl font-extrabold">Before &amp; after — real jobs</h2>
      <p className="mb-3 text-sm text-muted">Captured in the CleanConnect app only · tap ♡ to save</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.filter((p) => urls[p.path]).map((p) => (
          <li key={p.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[p.path]} alt={`${PHASE_LABEL[p.phase as MediaPhase]} photo`} loading="lazy" className="aspect-square w-full rounded-card object-cover" />
            <span className="absolute bottom-1 left-1 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">{PHASE_LABEL[p.phase as MediaPhase]}</span>
            <SavePhotoButton mediaId={p.id} slug={slug} saved={savedIds.has(p.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function Reviews({ providerId, slug, withPhotos }: { providerId: string; slug: string; withPhotos: boolean }) {
  const supabase = await createClient();
  const s = await loadStats(providerId);
  const { data } = await supabase
    .from("reviews").select("id, rating, quality, punctuality, communication, value_score, body, reply, created_at")
    .eq("provider_id", providerId).order("created_at", { ascending: false }).limit(30);
  const ids = (data ?? []).map((r) => r.id);
  const { data: media } = ids.length ? await supabase.from("public_gallery").select("id, path, review_id").in("review_id", ids) : { data: [] };
  const urls = await signedUrls((media ?? []).map((m) => m.path));
  let items: ReviewItem[] = (data ?? []).map((r) => ({
    ...r, photos: (media ?? []).filter((m) => m.review_id === r.id && urls[m.path]).map((m) => ({ id: m.id, url: urls[m.path] })),
  }));
  if (withPhotos) items = items.filter((r) => r.photos.length > 0);
  const sum = ratingSummary([s?.c1 ?? 0, s?.c2 ?? 0, s?.c3 ?? 0, s?.c4 ?? 0, s?.c5 ?? 0]);
  const cats: [keyof typeof CATEGORY_LABEL, number | null][] = [
    ["quality", s?.quality ?? null], ["punctuality", s?.punctuality ?? null], ["communication", s?.communication ?? null], ["value", s?.value_score ?? null],
  ];
  return (
    <section aria-labelledby="rev-h" className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="rev-h" className="mb-3 text-xl font-extrabold">Ratings &amp; reviews</h2>
      {sum.count === 0 ? <p className="rounded-input bg-bg p-4 text-muted">No reviews yet. Only customers with a completed order can review.</p> : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-3xl font-extrabold">{sum.average?.toFixed(1)} <Stars n={Math.round(sum.average ?? 0)} /></p>
              <ul className="mt-2 space-y-1 text-xs">
                {sum.distribution.map((d) => (
                  <li key={d.stars} className="flex items-center gap-2">
                    <span className="w-6">{d.stars}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-admin"><span className="block h-full bg-accent" style={{ width: `${d.percent}%` }} /></span>
                    <span className="w-6 text-right text-muted">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="grid grid-cols-2 content-start gap-2 text-sm">
              {cats.map(([k, v]) => <li key={k} className="rounded-input bg-bg px-3 py-2"><span className="text-muted">{CATEGORY_LABEL[k]}</span><br /><strong>{v === null ? "–" : Number(v).toFixed(1)}</strong></li>)}
            </ul>
          </div>
          <div className="mb-3 flex gap-3 text-sm font-semibold">
            <Link href={`/p/${slug}`} className={withPhotos ? "text-primary" : "text-ink"}>All</Link>
            <Link href={`/p/${slug}?photos=1`} className={withPhotos ? "text-ink" : "text-primary"}>With photos</Link>
          </div>
          {items.length === 0 ? <p className="rounded-card bg-surface p-6 text-muted">No reviews with photos yet.</p> : (
            <ul className="space-y-3">{items.map((r) => <li key={r.id}><ReviewCard r={r} /></li>)}</ul>
          )}
        </>
      )}
    </section>
  );
}

/** "Who might come" — first names and the NIN-verified badge only. */
export async function Team({ providerId }: { providerId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("provider_members").select("id, first_name, nin_verified").eq("provider_id", providerId).order("created_at");
  const members = data ?? [];
  if (members.length === 0) return null;
  return (
    <section aria-labelledby="team-h" className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="team-h" className="mb-3 text-xl font-extrabold">Who might come</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {members.map((m) => (
          <li key={m.id} className="flex flex-col items-center gap-1.5 rounded-2xl bg-bg p-3.5 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary-tint font-extrabold text-primary">{m.first_name.slice(0, 1).toUpperCase()}</span>
            <span className="text-sm font-bold">{m.first_name}</span>
            {m.nin_verified && <span className="text-[11px] font-bold text-primary">✓ NIN verified</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Policies({ laundry = false }: { laundry?: boolean }) {
  const box = "rounded-xl bg-bg p-3.5 text-sm leading-normal";
  return (
    <section aria-labelledby="pol-h" className="rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2 id="pol-h" className="mb-3 text-xl font-extrabold">Policies</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-primary-tint p-3.5 text-sm leading-normal"><strong>Payment held safely</strong><br /><span className="text-text-2">Released only after you confirm the job is done.</span></div>
        <div className={box}>{laundry ? <><strong>Item count on pickup</strong><br /><span className="text-text-2">The shop counts your items and confirms the price in the app before cleaning.</span></> : <><strong>Size check on arrival</strong><br /><span className="text-text-2">If rooms differ from your booking, the new price is sent to you for approval first.</span></>}</div>
        <div className={box}><strong>Cancellation</strong><br /><span className="text-text-2">{laundry ? "Cancel any time before the shop starts cleaning. Money held for the order goes back to your wallet." : "You can cancel before the provider accepts. Money held for the order goes back to your wallet."}</span></div>
        <div className={box}><strong>Problems</strong><br /><span className="text-text-2">Raise a ticket from your order and our team will step in.</span></div>
      </div>
      <Link href="/support" className="mt-3 inline-block py-1.5 text-[13px] text-muted">Report this profile</Link>
    </section>
  );
}
