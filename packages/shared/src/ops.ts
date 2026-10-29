/** Partner score, tiers and the monthly profit formula (BUILD_BRIEF §6.3 and §9). Placeholders until §14 is decided. */

export interface PartnerStats {
  offersTotal: number;
  offersAccepted: number;
  jobsCompleted: number;
  onTimeJobs: number;
  /** 0-5; null until reviews exist (Trust & media phase). */
  rating?: number | null;
  /** 0-1 share of jobs with the required photos; null until in-app capture exists. */
  photoCompliance?: number | null;
}

export const SCORE_WEIGHTS = { rating: 0.4, onTime: 0.25, acceptance: 0.2, photo: 0.15 } as const;
export const TIER_THRESHOLDS = { gold: 90, silver: 75 } as const;
export const MIN_JOBS_FOR_TIER = 5;

export type PartnerTier = "new" | "bronze" | "silver" | "gold";

/** 0-100, weighted over the components that have data; null when nothing is known yet. */
export function partnerScore(s: PartnerStats): number | null {
  const parts: [weight: number, value: number][] = [];
  if (s.rating != null) parts.push([SCORE_WEIGHTS.rating, s.rating / 5]);
  if (s.jobsCompleted > 0) parts.push([SCORE_WEIGHTS.onTime, s.onTimeJobs / s.jobsCompleted]);
  if (s.offersTotal > 0) parts.push([SCORE_WEIGHTS.acceptance, s.offersAccepted / s.offersTotal]);
  if (s.photoCompliance != null) parts.push([SCORE_WEIGHTS.photo, s.photoCompliance]);
  if (parts.length === 0) return null;
  const w = parts.reduce((a, [x]) => a + x, 0);
  return Math.round((parts.reduce((a, [x, v]) => a + x * v, 0) / w) * 100);
}

export function partnerTier(score: number | null, jobsCompleted: number): PartnerTier {
  if (score === null || jobsCompleted < MIN_JOBS_FOR_TIER) return "new";
  if (score >= TIER_THRESHOLDS.gold) return "gold";
  if (score >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

/** Best first; partners with no score yet go last. Ties keep their order. */
export function rankPartners<T extends { stats: PartnerStats }>(partners: T[]): T[] {
  const key = (p: T) => partnerScore(p.stats) ?? -1;
  return partners.map((p, i) => [p, i] as const).sort((a, b) => key(b[0]) - key(a[0]) || a[1] - b[1]).map(([p]) => p);
}

export interface MonthlyFinance {
  marketplaceCommission: number;
  carwashRevenue: number;
  vip: number;
  advertising: number;
  partnerPayouts: number;
  /** salaries, marketing, payments, operations, ... */
  expenses: Record<string, number>;
}

export function computeProfit(f: MonthlyFinance) {
  const income = f.marketplaceCommission + f.carwashRevenue + f.vip + f.advertising;
  const expenses = Object.values(f.expenses).reduce((a, b) => a + b, 0);
  const costs = f.partnerPayouts + expenses;
  const profit = income - costs;
  return { income, costs, profit, margin: income > 0 ? Math.round((profit / income) * 1000) / 10 : 0 };
}

export const APPLICATION_STAGES = {
  partner: ["applied", "inspection", "approved"],
  staff: ["applied", "interview", "offer", "hired"],
} as const;

/** Next stage in the pipeline, or null at the end. */
export function nextApplicationStage(kind: "partner" | "staff", stage: string): string | null {
  const steps: readonly string[] = APPLICATION_STAGES[kind];
  const i = steps.indexOf(stage);
  return i < 0 || i === steps.length - 1 ? null : steps[i + 1];
}

export const TICKET_PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;
