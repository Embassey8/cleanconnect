/** Ratings, review rules and earned badges (BUILD_BRIEF §5). Thresholds are placeholders. */

export interface CategoryScores { quality: number; punctuality: number; communication: number; value: number }

export const CATEGORY_LABEL: Record<keyof CategoryScores, string> = {
  quality: "Quality", punctuality: "On time", communication: "Communication", value: "Value",
};

export const isStar = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 5;

/** Overall rating used when the customer only fills in the category scores. */
export function overallFromCategories(c: CategoryScores): number {
  return Math.round((c.quality + c.punctuality + c.communication + c.value) / 4);
}

export interface RatingSummary {
  average: number | null;
  count: number;
  /** Share of reviews at each star level, 5 down to 1, as whole percentages. */
  distribution: { stars: number; count: number; percent: number }[];
}

/** `counts[0]` is the number of 1-star reviews ... `counts[4]` the number of 5-star reviews. */
export function ratingSummary(counts: [number, number, number, number, number]): RatingSummary {
  const count = counts.reduce((a, b) => a + b, 0);
  const average = count === 0 ? null : Math.round((counts.reduce((a, n, i) => a + n * (i + 1), 0) / count) * 10) / 10;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars, count: counts[stars - 1], percent: count === 0 ? 0 : Math.round((counts[stars - 1] / count) * 100),
  }));
  return { average, count, distribution };
}

export const TOP_RATED = { minAverage: 4.7, minReviews: 10 } as const;
export const ORDER_MILESTONES = [500, 100, 25] as const;

export interface BadgeInput { ratingAverage: number | null; ratingCount: number; jobsCompleted: number }

/** Earned badges shown on a profile. "Fast responder" needs reply-time tracking and is not awarded yet. */
export function earnedBadges(i: BadgeInput): string[] {
  const out: string[] = [];
  if (i.ratingAverage !== null && i.ratingAverage >= TOP_RATED.minAverage && i.ratingCount >= TOP_RATED.minReviews) out.push("Top rated");
  const m = ORDER_MILESTONES.find((n) => i.jobsCompleted >= n);
  if (m) out.push(`${m}+ orders`);
  return out;
}

export function starsText(n: number | null): string {
  return n === null ? "No ratings yet" : `${n.toFixed(1)} ★`;
}
