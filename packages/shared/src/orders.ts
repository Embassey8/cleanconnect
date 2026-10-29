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
  carwash: [t("requested", "cancelled", "customer"), t("assigning", "cancelled", "customer")],
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
  completed: "Confirm completion", disputed: "Report a problem", cancelled: "Cancel order",
};
