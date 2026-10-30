import { STATUS_LABEL, type OrderStatus } from "@cleanconnect/shared";

export const PACKAGE: Record<string, string> = { exterior: "Exterior", full: "Full wash", detailing: "Detailing" };
export const VEHICLE: Record<string, string> = { saloon: "Saloon", suv: "SUV", van: "Bus / van", pickup: "Pickup" };
export const ACTIVE: OrderStatus[] = ["assigned", "en_route", "arrived", "condition_checked", "washing", "awaiting_signoff"];

export const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export interface PartnerOrder {
  id: string; status: OrderStatus; total: number; scheduled_at: string | null; created_at: string; carwash_package: string | null; vehicle: string | null;
  is_mobile: boolean | null; notes: string | null; settled_at: string | null; escrow_status: string;
  order_addresses: { area: string | null } | { area: string | null }[] | null;
}

/** Columns every partner view needs for an order. */
export const ORDER_COLUMNS =
  "id, status, total, scheduled_at, created_at, carwash_package, vehicle, is_mobile, notes, settled_at, escrow_status, order_addresses(area)";

export const jobTitle = (o: PartnerOrder) =>
  `${PACKAGE[o.carwash_package ?? ""] ?? "Car wash"} · ${VEHICLE[o.vehicle ?? ""] ?? ""}`.replace(/ · $/, "");

export const jobWhere = (o: PartnerOrder) =>
  `${o.is_mobile ? "Mobile (at customer)" : "Drop-off at your site"}${one(o.order_addresses)?.area ? ` · ${one(o.order_addresses)!.area}` : ""}`;

export function statusChip(status: OrderStatus): { text: string; cls: string } {
  if (status === "completed") return { text: "Done", cls: "bg-primary-tint text-primary" };
  if (["arrived", "condition_checked", "washing"].includes(status)) return { text: "Washing", cls: "bg-warning-bg text-warning" };
  if (status === "awaiting_signoff") return { text: "Sign-off", cls: "bg-warning-bg text-warning" };
  if (status === "en_route") return { text: "En route", cls: "bg-carwash-bg text-carwash" };
  return { text: STATUS_LABEL[status], cls: "bg-bg-admin text-text-2" };
}
