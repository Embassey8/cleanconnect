import type { ProviderService } from "./roles";

export type OrderService = ProviderService; // cleaning | laundry | carwash

export type OrderStatus =
  | "requested" | "accepted" | "declined" | "expired" | "upcoming" | "in_progress"
  | "awaiting_confirmation" | "completed" | "cancelled" | "disputed"
  | "pickup_scheduled" | "received" | "awaiting_price_approval" | "cleaning" | "ironing"
  | "ready" | "out_for_delivery" | "delivered"
  | "assigning" | "assigned" | "en_route" | "arrived" | "condition_checked" | "washing" | "awaiting_signoff";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  requested: "Waiting for provider", accepted: "Accepted", declined: "Declined", expired: "Expired",
  upcoming: "Upcoming", in_progress: "In progress", awaiting_confirmation: "Awaiting your confirmation",
  completed: "Completed", cancelled: "Cancelled", disputed: "Disputed",
  pickup_scheduled: "Pickup scheduled", received: "Received", awaiting_price_approval: "Awaiting your approval",
  cleaning: "Being cleaned", ironing: "Ironing", ready: "Ready", out_for_delivery: "Out for delivery",
  delivered: "Delivered", assigning: "Finding a partner", assigned: "Partner assigned", en_route: "On the way",
  arrived: "Arrived", condition_checked: "Condition checked", washing: "Washing", awaiting_signoff: "Awaiting sign-off",
};

/** The happy-path steps shown as a progress bar (BUILD_BRIEF §7). */
export const PROGRESS: Record<OrderService, OrderStatus[]> = {
  cleaning: ["requested", "accepted", "in_progress", "awaiting_confirmation", "completed"],
  laundry: ["requested", "accepted", "pickup_scheduled", "received", "cleaning", "ironing", "ready", "out_for_delivery", "delivered", "completed"],
  carwash: ["requested", "assigning", "assigned", "en_route", "arrived", "condition_checked", "washing", "awaiting_signoff", "completed"],
};

export const TERMINAL: OrderStatus[] = ["completed", "cancelled", "declined", "expired", "disputed"];

type Actor = "provider" | "customer";
interface Transition { from: OrderStatus; to: OrderStatus; actor: Actor }

const t = (from: OrderStatus, to: OrderStatus, actor: Actor): Transition => ({ from, to, actor });

/** Mirrors `order_transitions` in the database; the database is the authority. */
export const TRANSITIONS: Record<OrderService, Transition[]> = {
  cleaning: [
    t("requested", "accepted", "provider"), t("requested", "declined", "provider"),
    t("accepted", "in_progress", "provider"), t("in_progress", "awaiting_confirmation", "provider"),
    t("awaiting_confirmation", "completed", "customer"), t("awaiting_confirmation", "disputed", "customer"),
    t("requested", "cancelled", "customer"), t("accepted", "cancelled", "customer"),
  ],
  laundry: [
    t("requested", "accepted", "provider"), t("requested", "declined", "provider"),
    t("accepted", "pickup_scheduled", "provider"), t("pickup_scheduled", "received", "provider"),
    t("received", "cleaning", "provider"), t("received", "awaiting_price_approval", "provider"),
    t("awaiting_price_approval", "cleaning", "customer"),
    t("cleaning", "ironing", "provider"), t("cleaning", "ready", "provider"), t("ironing", "ready", "provider"),
    t("ready", "out_for_delivery", "provider"), t("out_for_delivery", "delivered", "provider"),
    t("delivered", "completed", "customer"), t("delivered", "disputed", "customer"),
    t("requested", "cancelled", "customer"), t("accepted", "cancelled", "customer"), t("pickup_scheduled", "cancelled", "customer"),
  ],
  // requested -> assigning is an admin assignment and assigning -> assigned is the partner's offer
  // response (it charges the customer), so neither is a plain transition.
  carwash: [
    t("requested", "cancelled", "customer"), t("assigning", "cancelled", "customer"), t("assigned", "cancelled", "customer"),
    t("assigned", "en_route", "provider"), t("en_route", "arrived", "provider"),
    t("arrived", "condition_checked", "provider"), t("condition_checked", "washing", "provider"),
    t("washing", "awaiting_signoff", "provider"),
    t("awaiting_signoff", "completed", "customer"), t("awaiting_signoff", "disputed", "customer"),
  ],
};

export const availableActions = (service: OrderService, status: OrderStatus, actor: Actor): OrderStatus[] =>
  TRANSITIONS[service].filter((x) => x.from === status && x.actor === actor).map((x) => x.to);

/** 0..1 along the happy path; unknown/terminal-off-path statuses give 0. */
export function progressFraction(service: OrderService, status: OrderStatus): number {
  const steps = PROGRESS[service];
  const i = steps.indexOf(status);
  return i < 0 ? 0 : i / (steps.length - 1);
}

/** Button text for the provider's next action. */
export const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept", declined: "Decline", in_progress: "Start job", awaiting_confirmation: "Mark finished",
  pickup_scheduled: "Schedule pickup", received: "Mark received", awaiting_price_approval: "Send new total for approval",
  cleaning: "Start cleaning", ironing: "Move to ironing", ready: "Mark ready",
  out_for_delivery: "Out for delivery", delivered: "Mark delivered",
  en_route: "I'm on my way", arrived: "I've arrived", condition_checked: "Condition checked",
  washing: "Start washing", awaiting_signoff: "Ask for sign-off",
  completed: "Confirm completion", disputed: "Report a problem", cancelled: "Cancel order",
};

/** Four-step summary shown on order cards (the full status list is on the order page). */
export const SUMMARY_STEPS: Record<OrderService, [string, string, string, string]> = {
  cleaning: ["Booked", "Confirmed", "In progress", "Completed"],
  laundry: ["Booked", "Picked up", "Cleaning", "Delivered"],
  carwash: ["Requested", "Partner assigned", "Washing", "Completed"],
};

const SUMMARY_INDEX: Record<OrderService, Partial<Record<OrderStatus, number>>> = {
  cleaning: { requested: 0, accepted: 1, upcoming: 1, in_progress: 2, awaiting_confirmation: 2 },
  laundry: {
    requested: 0, accepted: 0, pickup_scheduled: 1, received: 1, awaiting_price_approval: 1,
    cleaning: 2, ironing: 2, ready: 2, out_for_delivery: 3, delivered: 3,
  },
  carwash: {
    requested: 0, assigning: 0, assigned: 1, en_route: 1, arrived: 1, condition_checked: 2, washing: 2, awaiting_signoff: 2,
  },
};

/**
 * Index of the step currently in progress (0-3), 4 when everything is done, or null for orders that
 * ended without completing (cancelled, declined, expired, disputed).
 */
export function summaryStep(service: OrderService, status: OrderStatus): number | null {
  if (status === "completed") return 4;
  return SUMMARY_INDEX[service][status] ?? null;
}

/** Which summary step a status event belongs to, for showing timestamps under the steps. */
export function summaryStepOf(service: OrderService, status: OrderStatus): number | null {
  const i = summaryStep(service, status);
  return i === null ? null : Math.min(i, 3);
}

export const ORDER_PREFIX: Record<OrderService, string> = { cleaning: "HC", laundry: "LD", carwash: "CW" };

/** Short order reference like HC-3F9A2B. */
export const orderRef = (service: OrderService, id: string): string => `${ORDER_PREFIX[service]}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export type OrderTab = "ongoing" | "completed" | "cancelled";

export function orderTab(status: OrderStatus): OrderTab {
  if (status === "completed") return "completed";
  if (status === "cancelled" || status === "declined" || status === "expired") return "cancelled";
  return "ongoing"; // includes disputed: still unresolved
}
