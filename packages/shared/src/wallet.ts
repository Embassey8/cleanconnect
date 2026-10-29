import { roundNaira } from "./pricing/money";

/** Placeholders until the BUILD_BRIEF §14 decisions are made; real values live in `money_settings`. */
export const DEFAULT_MONEY_SETTINGS = {
  autoConfirmHours: 48,
  vipPrice: 20000,
  vipPeriodDays: 30,
  minWithdrawal: 1000,
  minFunding: 100,
  maxFunding: 5_000_000,
  vipPayoutEtaHours: 24,
  standardPayoutEtaHours: 72,
} as const;

export interface CommissionInput {
  service: "laundry" | "cleaning" | "carwash";
  subtotal: number;
  surcharge: number;
  total: number;
  commissionRate: number;
}

/**
 * Platform commission for an order. Laundry: on the cleaning part only (items + express), never on
 * delivery. Cleaning: on the whole total. Car wash is platform revenue, so there is no commission.
 */
export function orderCommission(o: CommissionInput): number {
  if (o.service === "laundry") return roundNaira((o.subtotal + o.surcharge) * o.commissionRate);
  if (o.service === "cleaning") return roundNaira(o.total * o.commissionRate);
  return 0;
}

/** How escrowed money is split when the customer confirms completion. */
export function splitRelease(o: CommissionInput): { commission: number; providerCredit: number } {
  const commission = orderCommission(o);
  return { commission, providerCredit: o.total - commission };
}

export function payoutEtaHours(plan: "standard" | "vip"): number {
  return plan === "vip" ? DEFAULT_MONEY_SETTINGS.vipPayoutEtaHours : DEFAULT_MONEY_SETTINGS.standardPayoutEtaHours;
}

export type WithdrawCheck = { ok: true } | { ok: false; reason: string };

export function checkWithdrawal(amount: number, available: number, min: number = DEFAULT_MONEY_SETTINGS.minWithdrawal): WithdrawCheck {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole-naira amount." };
  if (amount < min) return { ok: false, reason: `Minimum withdrawal is ₦${min.toLocaleString("en-NG")}.` };
  if (amount > available) return { ok: false, reason: "That is more than your available balance." };
  return { ok: true };
}

export function checkFunding(
  amount: number,
  min: number = DEFAULT_MONEY_SETTINGS.minFunding,
  max: number = DEFAULT_MONEY_SETTINGS.maxFunding,
): WithdrawCheck {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Enter a whole-naira amount." };
  if (amount < min) return { ok: false, reason: `Minimum top-up is ₦${min.toLocaleString("en-NG")}.` };
  if (amount > max) return { ok: false, reason: `Maximum top-up is ₦${max.toLocaleString("en-NG")}.` };
  return { ok: true };
}

/** Naira still needed in the wallet to pay for an order (0 when already covered). */
export function shortfall(total: number, available: number): number {
  return Math.max(0, total - available);
}

export type LedgerKind =
  | "fund" | "withdraw" | "hold" | "release" | "refund"
  | "commission" | "payout" | "vip_fee" | "adjustment";

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  fund: "Wallet top-up",
  withdraw: "Withdrawal",
  hold: "Held for order",
  release: "Order payment",
  refund: "Refund",
  commission: "CleanConnect commission",
  payout: "Payout",
  vip_fee: "VIP subscription",
  adjustment: "Adjustment",
};

export type EscrowStatus = "unpaid" | "held" | "released" | "refunded";

/** Whether a provider may accept: money must be in escrow first (car wash is admin-assigned). */
export function canProviderAccept(service: CommissionInput["service"], escrow: EscrowStatus): boolean {
  return service === "carwash" || escrow === "held";
}

/** Date a VIP period ends, from a start date. */
export function vipPeriodEnd(start: Date, days: number = DEFAULT_MONEY_SETTINGS.vipPeriodDays): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

/** True when an order awaiting customer confirmation should auto-confirm. */
export function shouldAutoConfirm(
  since: Date,
  now: Date,
  hours: number = DEFAULT_MONEY_SETTINGS.autoConfirmHours,
): boolean {
  return now.getTime() - since.getTime() >= hours * 60 * 60 * 1000;
}
